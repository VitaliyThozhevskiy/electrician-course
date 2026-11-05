/* Конструктор схем: збирання і розрахунок простих кіл прямо на сайті.
   Без зовнішніх бібліотек. Розв'язувач — метод вузлових потенціалів (MNA).
   Змінна напруга 230 В рахується як діюче значення для активних навантажень. */
(function () {
  "use strict";

  var G = 20;            // крок сітки, px
  var W = 40, H = 22;    // розмір поля в клітинках
  var GMIN = 1e-9;       // мала провідність на землю для «висячих» вузлів

  // ---------- типи елементів ----------
  // pins — виводи в клітинках (без повороту); val — параметр, що редагується
  var TYPES = {
    dc:    { name: "Джерело постійної напруги", pre: "GB", pins: [[0, 0], [3, 0]], val: { k: "U", unit: "В", def: 12 } },
    ac:    { name: "Мережа ~230 В (L, N)", pre: "XS", pins: [[0, 0], [3, 0]], val: { k: "U", unit: "В", def: 230 } },
    res:   { name: "Резистор", pre: "R", pins: [[0, 0], [3, 0]], val: { k: "R", unit: "Ом", def: 100 } },
    lamp:  { name: "Лампа", pre: "EL", pins: [[0, 0], [3, 0]], val: { k: "P", unit: "Вт", def: 60 }, nom: 230 },
    sw:    { name: "Вимикач", pre: "SA", pins: [[0, 0], [3, 0]], sw: 2 },
    spdt:  { name: "Прохідний перемикач", pre: "SA", pins: [[0, 0], [3, -1], [3, 1]], sw: 2 },
    cross: { name: "Перехресний перемикач", pre: "SA", pins: [[0, -1], [0, 1], [3, -1], [3, 1]], sw: 2 },
    amm:   { name: "Амперметр", pre: "PA", pins: [[0, 0], [3, 0]] },
    volt:  { name: "Вольтметр", pre: "PV", pins: [[0, 0], [3, 0]] }
  };
  var ORDER = ["dc", "ac", "res", "lamp", "sw", "spdt", "cross", "amm", "volt"];
  var SHORT = { dc: "Джерело =", ac: "Мережа ~", res: "Резистор", lamp: "Лампа", sw: "Вимикач", spdt: "Прохідний", cross: "Перехресний", amm: "Амперметр", volt: "Вольтметр" };

  function rot(p, r) {
    var x = p[0], y = p[1];
    for (var i = 0; i < (r || 0); i++) { var t = x; x = -y; y = t; }
    return [x, y];
  }
  function pinsOf(part) {
    return TYPES[part.type].pins.map(function (p) { var q = rot(p, part.r); return [part.x + q[0], part.y + q[1]]; });
  }
  // які пари виводів з'єднує перемикач у поточному стані
  function contacts(part) {
    var s = part.state || 0;
    if (part.type === "sw") return s ? [[0, 1]] : [];
    if (part.type === "spdt") return s ? [[0, 2]] : [[0, 1]];
    if (part.type === "cross") return s ? [[0, 3], [1, 2]] : [[0, 2], [1, 3]];
    return [];
  }

  // ---------- розв'язувач ----------
  function key(p) { return p[0] + "," + p[1]; }
  function onSeg(p, w) {
    var x = p[0], y = p[1];
    if ((x - w[0]) * (w[3] - w[1]) !== (y - w[1]) * (w[2] - w[0])) return false;
    return x >= Math.min(w[0], w[2]) && x <= Math.max(w[0], w[2]) && y >= Math.min(w[1], w[3]) && y <= Math.max(w[1], w[3]);
  }

  function solve(c) {
    var parent = {};
    function f(k) { if (parent[k] == null) parent[k] = k; while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; }
    function u(a, b) { a = f(a); b = f(b); if (a !== b) parent[a] = b; }

    var pts = [];
    c.parts.forEach(function (p) { pinsOf(p).forEach(function (q) { pts.push(q); f(key(q)); }); });
    c.wires.forEach(function (w) { pts.push([w[0], w[1]], [w[2], w[3]]); u(w[0] + "," + w[1], w[2] + "," + w[3]); });
    // точка, що лежить на дроті, з'єднана з ним
    pts.forEach(function (p) { c.wires.forEach(function (w) { if (onSeg(p, w)) u(key(p), w[0] + "," + w[1]); }); });
    c.parts.forEach(function (p) {
      var ps = pinsOf(p);
      contacts(p).forEach(function (pr) { u(key(ps[pr[0]]), key(ps[pr[1]])); });
    });

    // вузли
    var nodeOf = {}, n = 0;
    function node(q) { var r = f(key(q)); if (nodeOf[r] == null) nodeOf[r] = n++; return nodeOf[r]; }
    var el = c.parts.map(function (p) { return { p: p, n: pinsOf(p).map(node) }; });
    var src = el.filter(function (e) { return e.p.type === "dc" || e.p.type === "ac"; });
    var gnd = src.length ? src[0].n[1] : 0;

    var res = { ok: true, error: null, V: [], parts: {}, nodeOfPoint: function (q) { var r = f(key(q)); return nodeOf[r] == null ? -1 : nodeOf[r]; }, gnd: gnd };

    // коротке замикання джерела напряму
    for (var i = 0; i < src.length; i++) {
      if (src[i].n[0] === src[i].n[1] && +src[i].p.val !== 0) {
        res.ok = false; res.error = "Коротке замикання: виводи джерела " + src[i].p.name + " з'єднані напряму. У реальній мережі спрацює автомат."; return res;
      }
    }

    var idx = [], m = 0;               // індекс вузла в матриці (без землі)
    for (var k = 0; k < n; k++) idx[k] = k === gnd ? -1 : m++;
    var vs = el.filter(function (e) { return (e.p.type === "dc" || e.p.type === "ac" || e.p.type === "amm") && e.n[0] !== e.n[1]; });
    var N = m + vs.length;
    var A = [], b = [];
    for (i = 0; i < N; i++) { A.push(new Array(N).fill(0)); b.push(0); }
    for (k = 0; k < n; k++) if (idx[k] >= 0) A[idx[k]][idx[k]] += GMIN;

    function stampG(a, c2, g) {
      var x = idx[a], y = idx[c2];
      if (x >= 0) A[x][x] += g;
      if (y >= 0) A[y][y] += g;
      if (x >= 0 && y >= 0) { A[x][y] -= g; A[y][x] -= g; }
    }
    el.forEach(function (e) {
      if (e.p.type === "res") stampG(e.n[0], e.n[1], 1 / Math.max(+e.p.val, 1e-6));
      if (e.p.type === "lamp") stampG(e.n[0], e.n[1], Math.max(+e.p.val, 1e-6) / (TYPES.lamp.nom * TYPES.lamp.nom));
    });
    vs.forEach(function (e, j) {
      var r = m + j, x = idx[e.n[0]], y = idx[e.n[1]];
      if (x >= 0) { A[x][r] += 1; A[r][x] += 1; }
      if (y >= 0) { A[y][r] -= 1; A[r][y] -= 1; }
      b[r] = e.p.type === "amm" ? 0 : +e.p.val;
    });

    var X = gauss(A, b);
    if (!X) {
      res.ok = false;
      res.error = "Коротке замикання: джерело закорочене через амперметр або інше джерело. Амперметр вмикають послідовно з навантаженням, не паралельно.";
      return res;
    }
    for (k = 0; k < n; k++) res.V[k] = idx[k] < 0 ? 0 : X[idx[k]];
    // вузол «прив'язаний», якщо до нього під'єднано щось, крім вольтметра
    var anchored = {};
    el.forEach(function (e) { if (e.p.type !== "volt") e.n.forEach(function (k2) { anchored[k2] = true; }); });
    var vsI = {};
    vs.forEach(function (e, j) { vsI[e.p.id] = X[m + j]; });

    el.forEach(function (e) {
      var p = e.p, V = res.V, out = {};
      if (e.n.length === 2) out.U = V[e.n[0]] - V[e.n[1]];
      if (p.type === "res") out.I = out.U / Math.max(+p.val, 1e-6);
      if (p.type === "lamp") { var R = TYPES.lamp.nom * TYPES.lamp.nom / Math.max(+p.val, 1e-6); out.I = out.U / R; out.P = out.U * out.U / R; out.lit = out.P / Math.max(+p.val, 1e-6); }
      if (p.type === "dc" || p.type === "ac") out.I = vsI[p.id] != null ? -vsI[p.id] : 0;
      if (p.type === "amm") { out.I = vsI[p.id] != null ? vsI[p.id] : 0; out.shorted = e.n[0] === e.n[1]; }
      if (p.type === "volt") {
        out.floating = !anchored[e.n[0]] || !anchored[e.n[1]];
        out.U = out.floating ? 0 : V[e.n[0]] - V[e.n[1]];
      }
      out.nodes = e.n;
      res.parts[p.id] = out;
    });
    return res;
  }

  function gauss(A, b) {
    var n = b.length, i, j, k;
    A = A.map(function (r) { return r.slice(); }); b = b.slice();
    for (i = 0; i < n; i++) {
      var p = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      if (Math.abs(A[p][i]) < 1e-12) return null;
      var t = A[i]; A[i] = A[p]; A[p] = t; t = b[i]; b[i] = b[p]; b[p] = t;
      for (j = i + 1; j < n; j++) {
        var fct = A[j][i] / A[i][i];
        if (!fct) continue;
        for (k = i; k < n; k++) A[j][k] -= fct * A[i][k];
        b[j] -= fct * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (k = i + 1; k < n; k++) s -= A[i][k] * x[k];
      x[i] = s / A[i][i];
    }
    return x;
  }

  // ---------- автоперевірки для завдань ----------
  function ofType(c, t) { return c.parts.filter(function (p) { return t.indexOf(p.type) >= 0; }); }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol || 0.02) * Math.max(Math.abs(a), Math.abs(b), 1e-9); }

  // перебирає всі положення перемикачів; повертає [{states, r}]
  function allStates(c) {
    var sws = ofType(c, ["sw", "spdt", "cross"]), out = [];
    var keep = sws.map(function (s) { return s.state || 0; });
    for (var mask = 0; mask < (1 << sws.length); mask++) {
      sws.forEach(function (s, i) { s.state = (mask >> i) & 1; });
      out.push({ mask: mask, r: solve(c) });
    }
    sws.forEach(function (s, i) { s.state = keep[i]; });
    return { sws: sws, list: out };
  }

  function checkMultiWay(c, nSpdt, nCross) {
    var ac = ofType(c, ["ac"]), lamps = ofType(c, ["lamp"]), spdt = ofType(c, ["spdt"]), cross = ofType(c, ["cross"]);
    var items = [];
    var have = ac.length >= 1 && lamps.length >= 1 && spdt.length >= nSpdt && cross.length >= nCross;
    items.push([have, "Є мережа ~230 В, лампа, " + nSpdt + " прохідні" + (nCross ? " і " + nCross + " перехресний" : "") + " перемикачі"]);
    if (!have) return items;
    var lamp = lamps[0], st = allStates(c), combos = st.list.length;
    var noShort = st.list.every(function (s) { return s.r.ok; });
    items.push([noShort, "Немає короткого замикання в жодному з " + combos + " положень"]);
    if (!noShort) return items;
    function lit(s) { return s.r.parts[lamp.id].lit > 0.5; }
    var anyLit = st.list.some(lit);
    items.push([anyLit, "Лампа світиться хоча б в одному положенні"]);
    var toggles = st.list.every(function (s) {
      return st.sws.every(function (_, i) { return lit(st.list[s.mask ^ (1 << i)]) !== lit(s); });
    });
    items.push([toggles && anyLit, "Будь-який перемикач вмикає і вимикає лампу незалежно від інших (перевірено всі положення: " + combos + ")"]);
    // фаза: коли лампа не світить, на її виводах не має бути фази
    var acSrc = ac[0];
    var phaseCut = st.list.every(function (s) {
      if (lit(s)) return true;
      var nN = s.r.parts[acSrc.id].nodes[1], ln = s.r.parts[lamp.id].nodes;
      return ln.every(function (k) { return Math.abs(s.r.V[k] - s.r.V[nN]) < 50; });
    });
    items.push([phaseCut, "Перемикачі розривають фазу L, а не нуль N (у вимкненому стані на лампі немає фази)"]);
    return items;
  }

  function meters(c, r, srcI) {
    var amm = ofType(c, ["amm"]).filter(function (a) { return near(Math.abs(r.parts[a.id].I), Math.abs(srcI)); });
    return amm.length > 0;
  }

  function checkSeries(c) {
    var dc = ofType(c, ["dc"]), rs = ofType(c, ["res"]), items = [];
    var have = dc.length >= 1 && rs.length >= 2;
    items.push([have, "Є джерело постійної напруги і щонайменше два резистори"]);
    if (!have) return items;
    var r = solve(c);
    items.push([r.ok, "Немає короткого замикання"]);
    if (!r.ok) return items;
    var I = r.parts[dc[0].id].I;
    var ser = Math.abs(I) > 1e-6 && rs.every(function (x) { return near(Math.abs(r.parts[x.id].I), Math.abs(I)); });
    items.push([ser, "Резистори з'єднані послідовно: через кожен тече весь струм джерела"]);
    items.push([meters(c, r, I), "Амперметр увімкнено в коло послідовно і він показує струм джерела"]);
    var vm = ofType(c, ["volt"]);
    var allV = rs.every(function (x) {
      var u = Math.abs(r.parts[x.id].U);
      return u > 1e-6 && vm.some(function (v) { return near(Math.abs(r.parts[v.id].U), u); });
    });
    items.push([allV, "На кожному резисторі стоїть вольтметр (паралельно резистору)"]);
    return items;
  }

  function checkParallel(c) {
    var dc = ofType(c, ["dc"]), rs = ofType(c, ["res"]), items = [];
    var have = dc.length >= 1 && rs.length >= 2;
    items.push([have, "Є джерело постійної напруги і щонайменше два резистори"]);
    if (!have) return items;
    var r = solve(c);
    items.push([r.ok, "Немає короткого замикання"]);
    if (!r.ok) return items;
    var U = +dc[0].val, I = r.parts[dc[0].id].I;
    var par = rs.every(function (x) { return near(Math.abs(r.parts[x.id].U), U); });
    items.push([par, "Усі резистори підключені паралельно: на кожному повна напруга джерела"]);
    items.push([meters(c, r, I), "Амперметр показує загальний струм джерела"]);
    return items;
  }

  function P(type, x, y, val, r) { return { type: type, x: x, y: y, r: r || 0, val: val }; }
  var PRESETS = {
    "m02/p1": { parts: [P("dc", 4, 10, 12, 1), P("res", 12, 4, 100), P("res", 22, 4, 200), P("amm", 22, 17), P("volt", 12, 9), P("volt", 22, 9)], check: checkSeries,
      note: "Склади послідовне коло з амперметром і вольтметрами, потім натисни «Перевірити». Після цього зміни R2 на 500 Ом і порівняй показання." },
    "m02/p2": { parts: [P("dc", 4, 10, 12, 1), P("res", 16, 6, 100, 1), P("res", 24, 6, 300, 1), P("amm", 10, 16)], check: checkParallel,
      note: "Підключи резистори паралельно джерелу, а амперметр — у загальний провід. Потім додай третій резистор 50 Ом." },
    "m04/p4": { parts: [P("ac", 3, 10, 230, 1), P("spdt", 10, 6), P("spdt", 22, 6, 0, 2), P("lamp", 30, 14, 60, 1)], check: function (c) { return checkMultiWay(c, 2, 0); },
      note: "Збери схему прохідних вимикачів. Клікни на перемикач, щоб перемкнути його. Перевірка перебере всі 4 положення." },
    "m07/p1": { parts: [P("ac", 3, 10, 230, 1), P("spdt", 10, 6), P("spdt", 22, 6, 0, 2), P("lamp", 30, 14, 60, 1)], check: function (c) { return checkMultiWay(c, 2, 0); },
      note: "Світильник з двох місць: фаза L — на загальний вивід першого перемикача, лампа — від загального виводу другого до N." },
    "m07/p2": { parts: [P("ac", 3, 10, 230, 1), P("spdt", 8, 6), P("cross", 17, 6), P("spdt", 28, 6, 0, 2), P("lamp", 35, 14, 60, 1)], check: function (c) { return checkMultiWay(c, 2, 1); },
      note: "Три місця керування: прохідний — перехресний — прохідний. Перевірка перебере всі 8 положень." },
    "m07/p5": { parts: [P("ac", 3, 10, 230, 1), P("sw", 12, 6), P("sw", 12, 12), P("lamp", 26, 9, 12, 1)],
      note: "Датчик руху тут моделюй звичайним вимикачем (його контакт L → L'). Подумай, як з'єднати його з ручним вимикачем." }
  };

  // ---------- стан ----------
  function fresh(preset) {
    var c = { parts: [], wires: [], seq: {} };
    (preset ? preset.parts : []).forEach(function (p) { addPart(c, p.type, p.x, p.y, p.val, p.r); });
    return c;
  }
  function addPart(c, type, x, y, val, r) {
    var T = TYPES[type];
    c.seq[T.pre] = (c.seq[T.pre] || 0) + 1;
    var p = { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: type, x: x, y: y, r: r || 0, state: 0,
      val: val != null ? val : (T.val ? T.val.def : 0), name: T.pre + c.seq[T.pre] };
    if (type === "ac") p.name = "XS" + c.seq[T.pre];
    c.parts.push(p);
    return p;
  }
  function storeKey(k) { return "ec-builder:" + k; }
  function loadC(k) {
    try { var s = JSON.parse(localStorage.getItem(storeKey(k))); if (s && s.parts && s.wires) { s.seq = s.seq || {}; return s; } } catch (e) {}
    return null;
  }
  function saveC(k, c) { try { localStorage.setItem(storeKey(k), JSON.stringify(c)); } catch (e) {} }

  // ---------- формат ----------
  function fmt(n, unit) {
    if (!isFinite(n)) return "—";
    var a = Math.abs(n), s;
    if (unit === "А" && a > 0 && a < 1) return (n * 1000).toLocaleString("uk-UA", { maximumFractionDigits: a < 0.01 ? 2 : 1 }) + " мА";
    s = n.toLocaleString("uk-UA", { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
    return s + " " + unit;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }

  // ---------- малювання ----------
  function drawBody(p, rr) {
    var t = p.type, s = p.state || 0, h = "";
    function L(x1, y1, x2, y2, extra) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' + (extra || "") + "/>"; }
    function upright(txt, x, y, size) {
      return '<text x="' + x + '" y="' + y + '" transform="rotate(' + (-p.r * 90) + " " + x + " " + y + ')" text-anchor="middle" dominant-baseline="central" class="bld-sym"' + (size ? ' style="font-size:' + size + 'px"' : "") + ">" + txt + "</text>";
    }
    if (t === "res") h = L(0, 0, 15, 0) + '<rect x="15" y="-6" width="30" height="12" rx="1"/>' + L(45, 0, 60, 0);
    else if (t === "lamp") {
      var lit = rr && rr.lit ? Math.min(1, rr.lit) : 0;
      h = L(0, 0, 18, 0) + L(42, 0, 60, 0) +
        (lit > 0.05 ? '<circle cx="30" cy="0" r="' + (14 + 8 * lit) + '" class="bld-glow" style="opacity:' + (0.25 + 0.5 * lit).toFixed(2) + '"/>' : "") +
        '<circle cx="30" cy="0" r="12" class="bld-bulb' + (lit > 0.5 ? " on" : "") + '"/>' + L(21.5, -8.5, 38.5, 8.5) + L(21.5, 8.5, 38.5, -8.5);
    } else if (t === "dc") h = L(0, 0, 26, 0) + L(26, -13, 26, 13, ' style="stroke-width:2.5"') + L(34, -7, 34, 7, ' style="stroke-width:5"') + L(34, 0, 60, 0) + upright("+", 18, -10, 13) + upright("−", 42, -10, 13);
    else if (t === "ac") h = L(0, 0, 18, 0) + '<circle cx="30" cy="0" r="12"/><path d="M22 0 q4 -9 8 0 t8 0"/>' + L(42, 0, 60, 0) + upright("L", 6, -10, 11) + upright("N", 54, -10, 11);
    else if (t === "amm" || t === "volt") h = L(0, 0, 18, 0) + '<circle cx="30" cy="0" r="12"/>' + L(42, 0, 60, 0) + upright(t === "amm" ? "A" : "V", 30, 0, 13);
    else if (t === "sw") h = L(0, 0, 18, 0) + L(42, 0, 60, 0) + (s ? L(18, 0, 42, 0, ' class="bld-lever"') : L(18, 0, 40, -14, ' class="bld-lever"')) + '<circle cx="18" cy="0" r="2.5" class="bld-dot"/><circle cx="42" cy="0" r="2.5" class="bld-dot"/>';
    else if (t === "spdt") h = L(0, 0, 18, 0) + L(42, -20, 60, -20) + L(42, 20, 60, 20) + L(18, 0, 42, s ? 20 : -20, ' class="bld-lever"') +
      '<circle cx="18" cy="0" r="2.5" class="bld-dot"/><circle cx="42" cy="-20" r="2.5" class="bld-dot"/><circle cx="42" cy="20" r="2.5" class="bld-dot"/>';
    else if (t === "cross") h = L(0, -20, 15, -20) + L(0, 20, 15, 20) + L(45, -20, 60, -20) + L(45, 20, 60, 20) + '<rect x="12" y="-28" width="36" height="56" rx="3" class="bld-box"/>' +
      (s ? L(15, -20, 45, 20, ' class="bld-lever"') + L(15, 20, 45, -20, ' class="bld-lever"') : L(15, -20, 45, -20, ' class="bld-lever"') + L(15, 20, 45, 20, ' class="bld-lever"'));
    return h;
  }
  function bbox(p) {
    var ys = TYPES[p.type].pins.map(function (q) { return q[1]; });
    var y0 = Math.min.apply(null, ys) - 1, y1 = Math.max.apply(null, ys) + 1;
    var cs = [[0, y0], [3, y0], [0, y1], [3, y1]].map(function (q) { var r = rot(q, p.r); return [p.x + r[0], p.y + r[1]]; });
    var xs = cs.map(function (q) { return q[0]; }), yy = cs.map(function (q) { return q[1]; });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, yy), y1: Math.max.apply(null, yy) };
  }
  function labelOf(p, rr) {
    var T = TYPES[p.type], s = p.name;
    if (p.type === "res") s += " " + fmt(+p.val, "Ом");
    else if (p.type === "lamp") s += " " + fmt(+p.val, "Вт");
    else if (p.type === "dc") s += " " + fmt(+p.val, "В");
    else if (p.type === "ac") s += " ~" + fmt(+p.val, "В");
    if (rr) {
      if (p.type === "amm") s += " = " + (rr.shorted ? "—" : fmt(Math.abs(rr.I), "А"));
      if (p.type === "volt") s += " = " + (rr.floating ? "—" : fmt(Math.abs(rr.U), "В"));
    }
    return T ? s : "";
  }

  // ---------- віджет ----------
  function mount(el, opts) {
    opts = opts || {};
    var k = opts.key || "sandbox", preset = PRESETS[k] || null;
    var c = loadC(k) || fresh(preset);
    var mode = "move", sel = null, wireStart = null, hover = null, drag = null, lastRes = null;

    el.classList.add("bld");
    el.innerHTML =
      (preset && preset.note ? '<p class="bld-note">' + esc(preset.note) + "</p>" : "") +
      '<div class="bld-bar" role="toolbar">' +
        '<span class="bld-grp"><button type="button" data-mode="move" title="Переміщати елементи, клік по перемикачу — перемкнути">✥ Рух</button>' +
        '<button type="button" data-mode="wire" title="Клік по точці — початок, ще клік — кінець дроту. Esc — завершити">╱ Дріт</button>' +
        '<button type="button" data-mode="del" title="Клік по елементу або дроту — видалити">✕ Видалити</button></span>' +
        '<span class="bld-grp">' + ORDER.map(function (t) { return '<button type="button" data-add="' + t + '" title="Додати: ' + esc(TYPES[t].name) + '">+ ' + SHORT[t] + "</button>"; }).join("") + "</span>" +
      "</div>" +
      '<div class="bld-stage"><svg class="bld-svg" viewBox="0 0 ' + W * G + " " + H * G + '" role="img" aria-label="Поле для збирання схеми"></svg></div>' +
      '<div class="bld-side"><div class="bld-sel"></div><div class="bld-status" aria-live="polite"></div></div>' +
      '<div class="bld-foot">' +
        (preset && preset.check ? '<button type="button" class="btn small" data-act="check">Перевірити схему</button>' : "") +
        '<button type="button" class="btn ghost small" data-act="reset">' + (preset ? "Почати заново" : "Очистити поле") + "</button>" +
        '<span class="bld-hint">Змінна напруга рахується як діюче значення для активного навантаження.</span>' +
      "</div>" +
      '<div class="bld-result" hidden></div>';

    var svg = el.querySelector(".bld-svg"), selBox = el.querySelector(".bld-sel"), status = el.querySelector(".bld-status"), result = el.querySelector(".bld-result");

    function persist() { saveC(k, c); }
    function find(id) { for (var i = 0; i < c.parts.length; i++) if (c.parts[i].id === id) return c.parts[i]; return null; }

    function draw() {
      var r = lastRes = solve(c);
      var h = '<g class="bld-grid">';
      for (var x = 1; x < W; x++) for (var y = 1; y < H; y++) h += '<circle cx="' + x * G + '" cy="' + y * G + '" r="1"/>';
      h += "</g>";

      // скільки з'єднань у точці — для «крапок» на розгалуженнях
      var deg = {};
      function inc(q) { var kk = key(q); deg[kk] = (deg[kk] || 0) + 1; }
      c.parts.forEach(function (p) { pinsOf(p).forEach(inc); });
      c.wires.forEach(function (w) { inc([w[0], w[1]]); inc([w[2], w[3]]); });

      var acSrc = c.parts.filter(function (p) { return p.type === "ac"; })[0];
      function wireClass(w) {
        if (!r.ok || !acSrc) return "";
        var nd = r.nodeOfPoint([w[0], w[1]]);
        if (nd < 0) return "";
        var v = r.V[nd] - r.V[r.parts[acSrc.id].nodes[1]];
        return Math.abs(v) > +acSrc.val * 0.5 ? " live" : "";
      }
      c.wires.forEach(function (w, i) {
        var a = 'x1="' + w[0] * G + '" y1="' + w[1] * G + '" x2="' + w[2] * G + '" y2="' + w[3] * G + '"';
        h += '<g data-wid="' + i + '"><line ' + a + ' class="bld-hit"/><line ' + a + ' class="bld-wire' + wireClass(w) + '"/></g>';
      });
      Object.keys(deg).forEach(function (kk) {
        if (deg[kk] >= 3) { var q = kk.split(","); h += '<circle cx="' + q[0] * G + '" cy="' + q[1] * G + '" r="3.5" class="bld-junc"/>'; }
      });

      c.parts.forEach(function (p) {
        var rr = r.ok ? r.parts[p.id] : null, bb = bbox(p);
        h += '<g data-pid="' + p.id + '" class="bld-part' + (TYPES[p.type].sw ? " switchable" : "") + '">';
        if (sel === p.id) h += '<rect class="bld-selbox" x="' + (bb.x0 * G - 4) + '" y="' + (bb.y0 * G - 4) + '" width="' + ((bb.x1 - bb.x0) * G + 8) + '" height="' + ((bb.y1 - bb.y0) * G + 8) + '" rx="6"/>';
        h += '<rect class="bld-hitbox" x="' + bb.x0 * G + '" y="' + bb.y0 * G + '" width="' + (bb.x1 - bb.x0) * G + '" height="' + (bb.y1 - bb.y0) * G + '"/>';
        h += '<g class="bld-body" transform="translate(' + p.x * G + " " + p.y * G + ") rotate(" + p.r * 90 + ')">' + drawBody(p, rr) + "</g>";
        var vert = p.r % 2 === 1, lx = vert ? bb.x1 * G + 4 : (bb.x0 + bb.x1) / 2 * G, ly = vert ? (bb.y0 + bb.y1) / 2 * G : bb.y0 * G - 3;
        h += '<text class="bld-label" x="' + lx + '" y="' + ly + '" text-anchor="' + (vert ? "start" : "middle") + '"' + (vert ? ' dominant-baseline="central"' : "") + ">" + esc(labelOf(p, rr)) + "</text>";
        pinsOf(p).forEach(function (q, i) {
          var cls = p.type === "ac" ? (i === 0 ? " l" : " n") : "";
          h += '<circle cx="' + q[0] * G + '" cy="' + q[1] * G + '" r="3" class="bld-pin' + cls + '"/>';
        });
        h += "</g>";
      });

      if (mode === "wire" && wireStart && hover) {
        route(wireStart, hover).forEach(function (w) {
          h += '<line x1="' + w[0] * G + '" y1="' + w[1] * G + '" x2="' + w[2] * G + '" y2="' + w[3] * G + '" class="bld-wire preview"/>';
        });
      }
      if (mode === "wire" && wireStart) h += '<circle cx="' + wireStart[0] * G + '" cy="' + wireStart[1] * G + '" r="5" class="bld-start"/>';
      if (mode === "wire" && hover) h += '<circle cx="' + hover[0] * G + '" cy="' + hover[1] * G + '" r="4" class="bld-cursor"/>';
      svg.innerHTML = h;
      svg.classList.toggle("wiring", mode === "wire");
      svg.classList.toggle("deleting", mode === "del");

      el.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.toggle("on", b.dataset.mode === mode); b.setAttribute("aria-pressed", b.dataset.mode === mode); });
      drawSel(r);
      drawStatus(r);
    }

    function drawStatus(r) {
      if (!r.ok) { status.className = "bld-status bad"; status.textContent = "⚠ " + r.error; return; }
      var srcs = c.parts.filter(function (p) { return p.type === "dc" || p.type === "ac"; });
      if (!c.parts.length) { status.className = "bld-status"; status.textContent = "Додай елементи кнопками зверху, потім з'єднай їх дротами (режим «Дріт»)."; return; }
      if (!srcs.length) { status.className = "bld-status"; status.textContent = "Додай джерело живлення."; return; }
      status.className = "bld-status";
      status.innerHTML = srcs.map(function (s) {
        var I = r.parts[s.id].I;
        return "<b>" + esc(s.name) + "</b>: струм " + fmt(Math.abs(I), "А") + ", потужність " + fmt(Math.abs(I * s.val), "Вт");
      }).join("<br>");
    }

    function drawSel(r) {
      var p = sel && find(sel);
      if (!p) { selBox.innerHTML = '<span class="bld-muted">Клікни на елемент, щоб змінити його параметри.</span>'; return; }
      var T = TYPES[p.type], rr = r.ok ? r.parts[p.id] : null, h = "<b>" + esc(p.name) + "</b> · " + esc(T.name);
      if (T.val) h += '<label class="bld-val">' + T.val.k + ' <input type="text" inputmode="decimal" value="' + esc(String(p.val).replace(".", ",")) + '" data-val> ' + T.val.unit + "</label>";
      if (rr) {
        var bits = [];
        if (rr.U != null && p.type !== "volt") bits.push("U = " + fmt(Math.abs(rr.U), "В"));
        if (rr.I != null) bits.push("I = " + fmt(Math.abs(rr.I), "А"));
        if (p.type === "res") bits.push("P = " + fmt(Math.abs(rr.U * rr.I), "Вт"));
        if (p.type === "lamp") bits.push("P = " + fmt(rr.P, "Вт") + (rr.lit > 0.5 ? " — світить" : " — не світить"));
        if (p.type === "volt") bits.push("U = " + fmt(Math.abs(rr.U), "В"));
        if (bits.length) h += '<div class="bld-read">' + bits.join(" · ") + "</div>";
      }
      h += '<div class="bld-acts">' + (T.sw ? '<button type="button" class="btn small" data-act="toggle">Перемкнути</button>' : "") +
        '<button type="button" class="btn ghost small" data-act="rot">↻ Повернути</button><button type="button" class="btn ghost small" data-act="delsel">Видалити</button></div>';
      selBox.innerHTML = h;
      var inp = selBox.querySelector("[data-val]");
      if (inp) inp.onchange = function () {
        var v = parseFloat(String(inp.value).replace(",", "."));
        if (!isFinite(v) || v < 0 || (p.type !== "dc" && p.type !== "ac" && v === 0)) { inp.value = String(p.val).replace(".", ","); return; }
        p.val = v; persist(); draw();
      };
    }

    // дріт «буквою Г»: спочатку по горизонталі, потім по вертикалі
    function route(a, b) {
      if (a[0] === b[0] || a[1] === b[1]) return [[a[0], a[1], b[0], b[1]]];
      return [[a[0], a[1], b[0], a[1]], [b[0], a[1], b[0], b[1]]];
    }
    function isConn(q) {
      var kk = key(q);
      return c.parts.some(function (p) { return pinsOf(p).some(function (x) { return key(x) === kk; }); }) ||
        c.wires.some(function (w) { return onSeg(q, w); });
    }

    function pt(e) {
      var m = svg.getScreenCTM();
      if (!m) return [0, 0];
      var s = svg.createSVGPoint(); s.x = e.clientX; s.y = e.clientY;
      var q = s.matrixTransform(m.inverse());
      return [q.x / G, q.y / G];
    }
    function snap(q) { return [Math.max(0, Math.min(W, Math.round(q[0]))), Math.max(0, Math.min(H, Math.round(q[1])))]; }

    svg.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      var q = pt(e), pg = e.target.closest("[data-pid]"), wg = e.target.closest("[data-wid]");
      if (mode === "wire") {
        var s = snap(q);
        if (!wireStart) { wireStart = s; }
        else if (key(s) === key(wireStart)) { wireStart = null; }
        else {
          var endsOnSomething = isConn(s);
          route(wireStart, s).forEach(function (w) { c.wires.push(w); });
          wireStart = endsOnSomething ? null : s;
          persist();
        }
        draw(); e.preventDefault(); return;
      }
      if (mode === "del") {
        if (pg) { c.parts = c.parts.filter(function (p) { return p.id !== pg.dataset.pid; }); if (sel === pg.dataset.pid) sel = null; }
        else if (wg) c.wires.splice(+wg.dataset.wid, 1);
        persist(); draw(); return;
      }
      if (pg) {
        var p = find(pg.dataset.pid);
        drag = { p: p, dx: q[0] - p.x, dy: q[1] - p.y, moved: false, id: e.pointerId };
        try { svg.setPointerCapture(e.pointerId); } catch (er) {}
        e.preventDefault();
      } else { sel = null; draw(); }
    });
    svg.addEventListener("pointermove", function (e) {
      var q = pt(e);
      if (mode === "wire") {
        var s = snap(q);
        if (!hover || key(hover) !== key(s)) { hover = s; draw(); }
        return;
      }
      if (drag) {
        var nx = Math.round(q[0] - drag.dx), ny = Math.round(q[1] - drag.dy);
        if (nx !== drag.p.x || ny !== drag.p.y) {
          var ox = drag.p.x, oy = drag.p.y;
          drag.p.x = nx; drag.p.y = ny;
          var bb = bbox(drag.p);
          if (bb.x0 < 0 || bb.y0 < 0 || bb.x1 > W || bb.y1 > H) { drag.p.x = ox; drag.p.y = oy; return; }
          // кінці дротів, що були на виводах елемента, їдуть разом з ним
          var oldPins = pinsOf({ type: drag.p.type, x: ox, y: oy, r: drag.p.r }).map(key), ddx = nx - ox, ddy = ny - oy;
          c.wires.forEach(function (w) {
            if (oldPins.indexOf(w[0] + "," + w[1]) >= 0) { w[0] += ddx; w[1] += ddy; }
            if (oldPins.indexOf(w[2] + "," + w[3]) >= 0) { w[2] += ddx; w[3] += ddy; }
          });
          drag.moved = true; sel = drag.p.id; draw();
        }
      }
    });
    function endDrag() {
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.moved) {
        if (TYPES[d.p.type].sw) d.p.state = d.p.state ? 0 : 1;
        sel = d.p.id;
      }
      persist(); draw();
    }
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", function () { drag = null; });
    svg.addEventListener("pointerleave", function () { if (mode === "wire" && hover) { hover = null; draw(); } });
    svg.addEventListener("contextmenu", function (e) { if (mode === "wire") { e.preventDefault(); wireStart = null; draw(); } });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { wireStart = null; draw(); }
      if ((e.key === "Delete" || e.key === "Backspace") && sel && e.target.tagName !== "INPUT") { c.parts = c.parts.filter(function (p) { return p.id !== sel; }); sel = null; persist(); draw(); }
      if ((e.key === "r" || e.key === "к") && sel && e.target.tagName !== "INPUT") rotateSel();
    });
    el.tabIndex = -1;

    function rotateSel() {
      var p = find(sel); if (!p) return;
      var or = p.r; p.r = (p.r + 1) % 4;
      var bb = bbox(p);
      if (bb.x0 < 0 || bb.y0 < 0 || bb.x1 > W || bb.y1 > H) p.r = or;
      persist(); draw();
    }

    el.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || !el.contains(b)) return;
      if (b.dataset.mode) { mode = b.dataset.mode; wireStart = null; hover = null; draw(); return; }
      if (b.dataset.add) {
        var spot = freeSpot(b.dataset.add);
        var p = addPart(c, b.dataset.add, spot[0], spot[1]);
        sel = p.id; mode = "move"; persist(); draw(); return;
      }
      var a = b.dataset.act;
      if (a === "toggle") { var s = find(sel); if (s) { s.state = s.state ? 0 : 1; persist(); draw(); } }
      if (a === "rot") rotateSel();
      if (a === "delsel") { c.parts = c.parts.filter(function (p) { return p.id !== sel; }); sel = null; persist(); draw(); }
      if (a === "reset") {
        if (!confirm(preset ? "Почати завдання заново? Зібрана схема зникне." : "Очистити поле?")) return;
        c = fresh(preset); sel = null; wireStart = null; persist(); result.hidden = true; draw();
      }
      if (a === "check") runCheck();
    });

    function freeSpot(type) {
      for (var y = 3; y < H - 2; y += 4) for (var x = 3; x < W - 4; x += 5) {
        var probe = { type: type, x: x, y: y, r: 0 }, b = bbox(probe);
        var clash = c.parts.some(function (p) { var o = bbox(p); return !(b.x1 + 1 <= o.x0 || o.x1 + 1 <= b.x0 || b.y1 + 1 <= o.y0 || o.y1 + 1 <= b.y0); });
        if (!clash) return [x, y];
      }
      return [3, 3];
    }

    function runCheck() {
      var items = preset.check(c), pass = items.every(function (i) { return i[0]; });
      result.hidden = false;
      result.className = "bld-result " + (pass ? "ok" : "bad");
      result.innerHTML = "<b>" + (pass ? "✓ Схема працює правильно" : "Схема ще не готова") + "</b><ul>" +
        items.map(function (i) { return '<li class="' + (i[0] ? "ok" : "bad") + '">' + (i[0] ? "✓ " : "✗ ") + esc(i[1]) + "</li>"; }).join("") + "</ul>";
      draw();
      if (pass && opts.onPass) opts.onPass();
    }

    draw();
    return { get: function () { return c; } };
  }

  // ---------- окрема сторінка ----------
  function render() {
    return '<div class="crumbs"><a href="#/">Головна</a> / Конструктор схем</div><h1>Конструктор схем</h1>' +
      '<p class="lead">Збирай кола з джерел, резисторів, ламп, вимикачів і вимірювальних приладів — сайт одразу рахує струми й напруги. ' +
      "Клік по перемикачу перемикає його, проводи під фазою підсвічуються.</p>" +
      '<div class="card"><ol class="steps bld-howto"><li>Додай елементи кнопками «+».</li><li>Перейди в режим «Дріт»: клік по виводу — початок, клік по іншому виводу — кінець.</li>' +
      "<li>Клікни на елемент, щоб змінити опір, напругу чи потужність, повернути або видалити його.</li></ol></div>" +
      '<div class="bld-host"></div>' +
      '<div class="note">Це навчальна модель з ідеальними проводами і приладами. Вона показує логіку схеми, але не замінює вимірювань у реальній мережі.</div>';
  }
  function bind(root) { var host = root.querySelector(".bld-host"); if (host) mount(host, { key: "sandbox" }); }

  window.BUILDER = { render: render, bind: bind, mount: mount, has: function (k) { return !!PRESETS[k]; },
    _test: { solve: solve, fresh: fresh, addPart: addPart, PRESETS: PRESETS, checkMultiWay: checkMultiWay, checkSeries: checkSeries, checkParallel: checkParallel, pinsOf: pinsOf, allStates: allStates } };
})();
