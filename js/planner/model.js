/* Планувальник електрики квартири — модель (без DOM).
   Одиниці: сантиметри. Кімнати — прямокутники на плані (y вниз).
   Стіни кімнати обходяться за годинниковою стрілкою: N (верхня), E (права), S (нижня), W (ліва);
   якщо стояти в кімнаті обличчям до стіни, позиція pos рахується від лівого кута. */
(function () {
  "use strict";

  var WALLS = ["N", "E", "S", "W"];
  var WALL_NAME = { N: "верхня", E: "права", S: "нижня", W: "ліва" };
  var ROOM_TYPES = { room: "Кімната", kitchen: "Кухня", bath: "Ванна / санвузол", wc: "Туалет", hall: "Коридор", balcony: "Балкон / лоджія" };
  var ZONE_TOP = 15, ZONE_BOT = 30, END_RESERVE = 20, ADJ_TOL = 45;
  var CABLE_MAX = { 1.5: 10, 2.5: 16, 4: 25, 6: 32, 10: 40 };
  var SECTIONS = [1.5, 2.5, 4, 6, 10];
  var BREAKERS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63];
  var ENCLOSURES = [12, 18, 24, 36, 48, 54, 72];

  var KINDS = {
    socket: { name: "Розетка", surf: "wall", h: 30, cat: "socket", icon: "socket" },
    outlet: { name: "Вивід кабелю під техніку", surf: "wall", h: 60, cat: "power", icon: "outlet" },
    sw1:    { name: "Вимикач одноклавішний", surf: "wall", h: 90, cat: "switch", keys: 1, cores: 3 },
    sw2:    { name: "Вимикач двоклавішний", surf: "wall", h: 90, cat: "switch", keys: 2, cores: 4 },
    pass:   { name: "Прохідний вимикач", surf: "wall", h: 90, cat: "switch", keys: 1, cores: 4 },
    cross:  { name: "Перехресний вимикач", surf: "wall", h: 90, cat: "switch", keys: 1, cores: 5 },
    ceil:   { name: "Стельовий світильник", surf: "ceiling", cat: "light", power: 60 },
    spot:   { name: "Точковий світильник", surf: "ceiling", cat: "light", power: 7 },
    sconce: { name: "Бра", surf: "wall", h: 160, cat: "light", power: 40 },
    led:    { name: "LED-підсвітка (блок живлення)", surf: "wall", h: 140, cat: "light", power: 30 },
    fan:    { name: "Витяжний вентилятор", surf: "wall", h: 220, cat: "light", power: 15 },
    jbox:   { name: "Розподільча коробка", surf: "wall", h: -20, cat: "box" }
  };
  var PLANES = { wallTop: "Стіна, під стелею", wallBottom: "Стіна, над підлогою (~30 см)", ceilGrid: "По стелі, паралельно стінам (у гофрі)", ceiling: "По стелі навпрост (у гофрі)", floor: "По підлозі (у гофрі, під стяжку)" };
  function onCeil(pl) { return pl === "ceiling" || pl === "ceilGrid"; }
  // траса по стелі з поворотом під 90°: вибираємо кут, з яким менше проходів крізь стіни
  function gridRoute(p, a, b, hug) {
    function walk(pts) {
      var holes = [], out = 0, prev = null, len = 0, wsum = 0, wn = 0;
      for (var i = 0; i < pts.length - 1; i++) {
        var d = dist(pts[i], pts[i + 1]), n = Math.max(1, Math.ceil(d / 5)); len += d;
        for (var k = 0; k <= n; k++) {
          var x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k / n, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k / n, r = roomAt(p, x, y);
          if (!r) { out++; continue; }
          if (prev && r.id !== prev.id) holes.push({ from: prev.id, to: r.id, x: x, y: y });
          prev = r; wsum += Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y); wn++;
        }
      }
      // крок 5 см поза кімнатами = товща стіни; довгий відрізок поза квартирою майже заборонений
      return { pts: pts, holes: holes, score: holes.length * 20 + out * 10 + len * 0.05 + (hug && wn ? wsum / wn * 0.08 : 0), len: len, out: out };
    }
    if (Math.abs(a[0] - b[0]) < 1 || Math.abs(a[1] - b[1]) < 1) { var st = walk([a, b]); if (st.out < 30) return st; }
    var best = null;
    function tryP(pts) { var r = walk(pts.filter(function (q, i) { return i === 0 || dist(q, pts[i - 1]) > 0.5; })); if (!best || r.score < best.score) best = r; }
    tryP([a, [b[0], a[1]], b]); tryP([a, [a[0], b[1]], b]);
    if (best.out >= 30) p.rooms.forEach(function (r) {
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      tryP([a, [cx, a[1]], [cx, b[1]], b]); tryP([a, [a[0], cy], [b[0], cy], b]);
    });
    return best;
  }
  var GROUP_KINDS = { light: "Освітлення", socket: "Розетки", power: "Окрема лінія (техніка)" };

  // ---------- утиліти ----------
  function num(s) { return parseFloat(String(s).replace(",", ".")); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function nf(n, d) { return (+n).toLocaleString("uk-UA", { maximumFractionDigits: d == null ? 1 : d }); }
  function sec(s) { return String(s).replace(".", ","); }
  function cableName(section, cores) { return (cores <= 3 ? 3 : 5) + "×" + sec(section); }
  function uid(p, pre) { p.seq = (p.seq || 0) + 1; return pre + p.seq; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  // ---------- геометрія ----------
  function wallLen(r, w) { return w === "N" || w === "S" ? r.w : r.h; }
  function wallXY(r, w, pos) {
    if (w === "N") return [r.x + pos, r.y];
    if (w === "E") return [r.x + r.w, r.y + pos];
    if (w === "S") return [r.x + r.w - pos, r.y + r.h];
    return [r.x, r.y + r.h - pos];
  }
  function perimT(r, w, pos) {
    return { N: 0, E: r.w, S: r.w + r.h, W: 2 * r.w + r.h }[w] + pos;
  }
  function fromT(r, t) {
    var P = 2 * (r.w + r.h);
    t = ((t % P) + P) % P;
    if (t <= r.w) return { wall: "N", pos: t };
    if (t <= r.w + r.h) return { wall: "E", pos: t - r.w };
    if (t <= 2 * r.w + r.h) return { wall: "S", pos: t - r.w - r.h };
    return { wall: "W", pos: t - 2 * r.w - r.h };
  }
  function nearestWall(r, x, y) {
    var c = [
      { wall: "N", pos: x - r.x, d: Math.abs(y - r.y) },
      { wall: "E", pos: y - r.y, d: Math.abs(x - r.x - r.w) },
      { wall: "S", pos: r.x + r.w - x, d: Math.abs(y - r.y - r.h) },
      { wall: "W", pos: r.y + r.h - y, d: Math.abs(x - r.x) }
    ].sort(function (a, b) { return a.d - b.d; })[0];
    c.pos = Math.max(0, Math.min(wallLen(r, c.wall), c.pos));
    return c;
  }
  function roomAt(p, x, y) {
    for (var i = 0; i < p.rooms.length; i++) { var r = p.rooms[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r; }
    return null;
  }
  // спільна стіна двох кімнат: {w1, w2, a, b (діапазон уздовж осі), gap}
  function shared(r, q) {
    var o;
    function ov(a0, a1, b0, b1) { var a = Math.max(a0, b0), b = Math.min(a1, b1); return b - a >= 20 ? [a, b] : null; }
    if (Math.abs(r.x + r.w - q.x) <= ADJ_TOL && (o = ov(r.y, r.y + r.h, q.y, q.y + q.h))) return { w1: "E", w2: "W", axis: "y", a: o[0], b: o[1], gap: Math.abs(q.x - r.x - r.w), line1: r.x + r.w, line2: q.x };
    if (Math.abs(q.x + q.w - r.x) <= ADJ_TOL && (o = ov(r.y, r.y + r.h, q.y, q.y + q.h))) return { w1: "W", w2: "E", axis: "y", a: o[0], b: o[1], gap: Math.abs(r.x - q.x - q.w), line1: r.x, line2: q.x + q.w };
    if (Math.abs(r.y + r.h - q.y) <= ADJ_TOL && (o = ov(r.x, r.x + r.w, q.x, q.x + q.w))) return { w1: "S", w2: "N", axis: "x", a: o[0], b: o[1], gap: Math.abs(q.y - r.y - r.h), line1: r.y + r.h, line2: q.y };
    if (Math.abs(q.y + q.h - r.y) <= ADJ_TOL && (o = ov(r.x, r.x + r.w, q.x, q.x + q.w))) return { w1: "N", w2: "S", axis: "x", a: o[0], b: o[1], gap: Math.abs(r.y - q.y - q.h), line1: r.y, line2: q.y + q.h };
    return null;
  }
  function posOnWall(r, w, x, y) { return nearestWallFixed(r, w, x, y); }
  function nearestWallFixed(r, w, x, y) {
    if (w === "N") return x - r.x;
    if (w === "E") return y - r.y;
    if (w === "S") return r.x + r.w - x;
    return r.y + r.h - y;
  }
  // прорізи, видимі на стіні кімнати (власні + з сусідньої кімнати по той бік стіни)
  function openingsOn(p, room, wall) {
    var out = [];
    p.openings.forEach(function (o) {
      if (o.room === room.id && o.wall === wall) { out.push(o); return; }
      var other = byId(p.rooms, o.room);
      if (!other || other.id === room.id) return;
      var s = shared(other, room);
      if (!s || s.w1 !== o.wall || s.w2 !== wall) return;
      var a = wallXY(other, o.wall, o.pos), b = wallXY(other, o.wall, o.pos + o.width);
      var pa = nearestWallFixed(room, wall, a[0], a[1]), pb = nearestWallFixed(room, wall, b[0], b[1]);
      var lo = Math.min(pa, pb), hi = Math.max(pa, pb);
      if (hi <= 0 || lo >= wallLen(room, wall)) return;
      out.push({ id: o.id, room: room.id, wall: wall, kind: o.kind, pos: lo, width: hi - lo, height: o.height, sill: o.sill, mirror: true });
    });
    return out;
  }

  // ---------- проєкт ----------
  function blank() {
    return { v: 1, name: "Моя квартира", ceilH: 270, system: "TN-C-S", input: 40, relay: true, seq: 0,
      rooms: [], openings: [], points: [], groups: [], rcds: [], panel: null, over: {}, furn: [], ceilInset: 4 };
  }
  // ---------- меблі (прямокутники на плані, см; ht — висота, z — від підлоги) ----------
  var FURN = {
    bed: { n: "Ліжко", w: 160, d: 200, h: 50, c: "#8e7cc3" }, nightstand: { n: "Тумба приліжкова", w: 45, d: 40, h: 50, c: "#a58e6b" },
    wardrobe: { n: "Шафа", w: 180, d: 60, h: 240, c: "#a58e6b" }, sofa: { n: "Диван", w: 220, d: 95, h: 85, c: "#6d8fb3" },
    armchair: { n: "Крісло", w: 80, d: 80, h: 85, c: "#6d8fb3" }, table: { n: "Обідній стіл", w: 120, d: 80, h: 75, c: "#b38b5d" },
    desk: { n: "Робочий стіл", w: 140, d: 70, h: 75, c: "#b38b5d" }, tvstand: { n: "Тумба під ТВ", w: 160, d: 40, h: 50, c: "#a58e6b" },
    tv: { n: "Телевізор", w: 120, d: 8, h: 70, z: 100, c: "#333a44" }, kitchen: { n: "Кухня, нижні шафи", w: 240, d: 60, h: 90, c: "#c9a46a" },
    upper: { n: "Кухня, верхні шафи", w: 200, d: 35, h: 70, z: 150, c: "#c9a46a" }, fridge: { n: "Холодильник", w: 60, d: 65, h: 185, c: "#cfd6dd" },
    washer: { n: "Пральна машина", w: 60, d: 55, h: 85, c: "#cfd6dd" }, boiler: { n: "Газовий котел", w: 40, d: 32, h: 72, z: 140, c: "#e8e8e8" },
    sink: { n: "Тумба з умивальником", w: 80, d: 46, h: 85, c: "#9fc3d9" }, toilet: { n: "Унітаз", w: 38, d: 65, h: 40, c: "#e8e8e8" },
    shower: { n: "Душ / ванна", w: 90, d: 90, h: 200, c: "#9fc3d9" }, shelf: { n: "Стелаж / полиці", w: 100, d: 45, h: 220, c: "#a58e6b" }
  };
  function addFurn(p, kind, room, x, y, w, d, o) {
    var K = FURN[kind] || FURN.shelf; o = o || {}; p.furn = p.furn || [];
    var f = { id: uid(p, "f"), kind: kind, room: room && room.id || room, name: o.name || K.n, x: x, y: y, w: w, d: d, ht: o.ht || K.h, z: o.z != null ? o.z : (K.z || 0) };
    p.furn.push(f); return f;
  }
  // поставити меблі спиною до стіни; pos — центр уздовж стіни (той самий відлік, що й у точок)
  function furnAt(p, kind, room, wall, pos, o) {
    o = o || {}; var K = FURN[kind], len = o.w || K.w, dep = o.d || K.d, c = wallXY(room, wall, pos), x, y, w, d;
    if (wall === "N" || wall === "S") { x = c[0] - len / 2; w = len; d = dep; y = wall === "N" ? room.y : room.y + room.h - dep; }
    else { y = c[1] - len / 2; d = len; w = dep; x = wall === "W" ? room.x : room.x + room.w - dep; }
    return addFurn(p, kind, room, x, y, w, d, o);
  }
  function addRoom(p, name, type, x, y, w, h) { var r = { id: uid(p, "r"), name: name, type: type, x: x, y: y, w: w, h: h }; p.rooms.push(r); return r; }
  function addOpening(p, room, wall, kind, pos, width, height, sill) {
    var o = { id: uid(p, "o"), room: room.id, wall: wall, kind: kind, pos: pos, width: width, height: height || (kind === "door" ? 205 : 150), sill: kind === "window" ? (sill == null ? 85 : sill) : 0 };
    p.openings.push(o); return o;
  }
  function addPoint(p, kind, room, opt) {
    opt = opt || {};
    var K = KINDS[kind], pt = { id: uid(p, "t"), kind: kind, room: room.id, group: opt.group || null };
    if (K.surf === "wall") {
      pt.wall = opt.wall || "N"; pt.pos = opt.pos != null ? opt.pos : wallLen(room, pt.wall) / 2;
      pt.h = opt.h != null ? opt.h : (K.h < 0 ? p.ceilH + K.h : K.h);
    } else { pt.x = opt.x != null ? opt.x : room.x + room.w / 2; pt.y = opt.y != null ? opt.y : room.y + room.h / 2; }
    if (kind === "socket") pt.gang = opt.gang || 1;
    if (K.cat === "light") { pt.power = opt.power || K.power; pt.ctl = opt.ctl || []; }
    if (kind === "fan") pt.timer = opt.timer != null ? (opt.timer ? 1 : 0) : 1;
    if (kind === "socket" || kind === "outlet") pt.power = opt.power || 0;
    if (opt.label) pt.label = opt.label;
    p.points.push(pt); return pt;
  }
  function addGroup(p, o) {
    var g = { id: uid(p, "g"), name: o.name, kind: o.kind, curve: o.curve || (o.kind === "light" ? "B" : "C"), In: o.In, sec: o.sec,
      prot: o.prot || "none", rcd: o.rcd || null, dI: o.dI || 30, plane: o.plane || "wallTop" };
    p.groups.push(g); return g;
  }
  function addRcd(p, In, dI) { var q = { id: uid(p, "q"), In: In || 40, dI: dI || 30, type: "A" }; p.rcds.push(q); return q; }

  // ---------- шаблони ----------
  function template(kind) {
    var p = blank(), H, R, K, B, R2, D;
    if (kind === "studio") {
      p.name = "Студія ~30 м²";
      H = addRoom(p, "Коридор", "hall", 0, 0, 140, 300);
      B = addRoom(p, "Санвузол", "bath", 0, 300, 140, 200);
      R = addRoom(p, "Кімната", "room", 140, 0, 360, 500);
      K = addRoom(p, "Кухня-зона", "kitchen", 500, 0, 220, 500);
      addOpening(p, H, "N", "door", 25, 90); addOpening(p, H, "E", "door", 150, 80); addOpening(p, B, "N", "door", 35, 70);
      addOpening(p, R, "S", "window", 105, 150); addOpening(p, K, "S", "window", 50, 120);
      p.panel = { room: H.id, wall: "W", pos: 170, h: 150 };
    } else if (kind === "two") {
      p.name = "Двокімнатна ~55 м²";
      H = addRoom(p, "Коридор", "hall", 0, 0, 140, 700);
      R = addRoom(p, "Вітальня", "room", 140, 0, 420, 380);
      R2 = addRoom(p, "Спальня", "room", 140, 380, 420, 320);
      K = addRoom(p, "Кухня", "kitchen", 560, 0, 300, 300);
      B = addRoom(p, "Санвузол", "bath", 0, 700, 140, 200);
      addOpening(p, H, "N", "door", 25, 90); addOpening(p, R, "W", "door", 40, 80); addOpening(p, R2, "W", "door", 100, 80);
      addOpening(p, K, "W", "door", 30, 80); addOpening(p, B, "N", "door", 35, 70);
      addOpening(p, R, "N", "window", 135, 150); addOpening(p, R2, "S", "window", 135, 150); addOpening(p, K, "N", "window", 90, 120);
      p.panel = { room: H.id, wall: "W", pos: 450, h: 150 };
    } else {
      p.name = "Однокімнатна ~40 м²";
      H = addRoom(p, "Коридор", "hall", 0, 0, 140, 460);
      R = addRoom(p, "Кімната", "room", 140, 0, 420, 360);
      K = addRoom(p, "Кухня", "kitchen", 140, 360, 300, 280);
      B = addRoom(p, "Санвузол", "bath", 0, 460, 140, 180);
      addOpening(p, H, "N", "door", 25, 90); addOpening(p, R, "W", "door", 40, 80); addOpening(p, K, "W", "door", 180, 80);
      addOpening(p, B, "N", "door", 35, 70);
      addOpening(p, R, "N", "window", 135, 150); addOpening(p, K, "S", "window", 90, 120);
      p.panel = { room: H.id, wall: "W", pos: 300, h: 150 };
    }
    return p;
  }

  // ---------- проєкт з опису ----------
  function typeOf(name) {
    var s = name.toLowerCase();
    if (/кухн|kitchen/.test(s)) return "kitchen";
    if (/туалет|убир|wc|вбиральн/.test(s)) return "wc";
    if (/ванн|санвуз|с\/в|душ|bath/.test(s)) return "bath";
    if (/коридор|передпок|хол|тамбур|hall/.test(s)) return "hall";
    if (/балкон|лоджі/.test(s)) return "balcony";
    return "room";
  }
  function parseDescription(text) {
    var p = blank(), list = [], hm;
    if ((hm = /(стел|висот)[^\d]{0,20}(\d+(?:[.,]\d+)?)/i.exec(text))) {
      var hv = num(hm[2]); p.ceilH = hv < 10 ? Math.round(hv * 100) : Math.round(hv);
    }
    text.split(/[\n;]+/).forEach(function (line) {
      line = line.trim(); if (!line || /^(стел|висот)/i.test(line)) return;
      var m = /^(.*?)[\s:—–-]*(\d+(?:[.,]\d+)?)\s*(?:м|см)?\s*[x×хХ*]\s*(\d+(?:[.,]\d+)?)\s*(см|м)?/i.exec(line), w, h, name;
      if (m) { name = m[1]; w = num(m[2]); h = num(m[3]); var cm = m[4] === "см" || (w > 20 && h > 20); if (!cm) { w *= 100; h *= 100; } }
      else if ((m = /^(.*?)[\s:—–-]*(\d+(?:[.,]\d+)?)\s*(м2|м²|кв)/i.exec(line))) { name = m[1]; w = h = Math.sqrt(num(m[2])) * 100; }
      else return;
      name = name.replace(/[,:—–-]+$/, "").trim() || "Кімната";
      list.push({ name: name.charAt(0).toUpperCase() + name.slice(1), type: typeOf(name), w: Math.round(Math.max(w, h) / 5) * 5, h: Math.round(Math.min(w, h) / 5) * 5 });
    });
    if (!list.length) return null;
    layout(p, list);
    return p;
  }
  // розкладка: коридор — лівою колонкою, санвузли під ним, житлові — колонками праворуч
  function layout(p, list) {
    var halls = list.filter(function (r) { return r.type === "hall"; });
    var wet = list.filter(function (r) { return r.type === "bath" || r.type === "wc"; });
    var dry = list.filter(function (r) { return r.type === "room" || r.type === "kitchen"; });
    var balc = list.filter(function (r) { return r.type === "balcony"; });
    var x = 0, y = 0, hall = null;
    var totalDry = dry.reduce(function (s, r) { return s + r.h; }, 0);
    halls.forEach(function (h, i) {
      var sq = h.w === h.h, wid = sq ? 140 : Math.min(h.w, h.h), len = sq ? h.w * h.h / 140 : Math.max(h.w, h.h);
      if (i === 0 && sq) len = Math.max(len, Math.min(totalDry, len * 1.6));
      var r = addRoom(p, h.name, "hall", 0, y, wid, Math.round(len / 5) * 5); y += r.h; if (!hall) hall = r;
    });
    wet.forEach(function (b) { addRoom(p, b.name, b.type, 0, y, hall ? hall.w : b.h, b.w); y += b.w; });
    function rightEdge(y0, y1) {
      var e = 0; p.rooms.forEach(function (r) { if (r.y < y1 - 20 && r.y + r.h > y0 + 20) e = Math.max(e, r.x + r.w); }); return e;
    }
    var colH = Math.max(hall ? hall.h : 0, 500), cy = 0, col = 0;
    dry.forEach(function (d) {
      var w = d.w, h = d.h;
      if (cy > 0 && cy + h > colH + 50) { cy = 0; col++; }
      var x0 = rightEdge(cy, cy + h);
      addRoom(p, d.name, d.type, x0, cy, w, h); cy += h;
    });
    balc.forEach(function (b) { var bw = Math.max(b.w, b.h), bh = Math.min(b.w, b.h); addRoom(p, b.name, "balcony", rightEdge(0, bw), 0, bh, bw); });
    autoOpenings(p);
  }
  function autoOpenings(p) {
    var hall = p.rooms.filter(function (r) { return r.type === "hall"; })[0];
    var withDoor = {};
    function door(r, q) {
      var s = shared(r, q); if (!s) return false;
      var mid = (s.a + s.b) / 2, wd = r.type === "bath" || r.type === "wc" ? 70 : 80;
      var x = s.axis === "x" ? mid : (s.w1 === "E" ? r.x + r.w : r.x), y = s.axis === "y" ? mid : (s.w1 === "S" ? r.y + r.h : r.y);
      var pos = nearestWallFixed(r, s.w1, x, y) - wd / 2;
      if (s.b - s.a < wd + 30) return false;
      addOpening(p, r, s.w1, "door", Math.max(10, pos), wd); withDoor[r.id] = true; return true;
    }
    p.rooms.forEach(function (r) {
      if (r === hall) return;
      if (hall && door(r, hall)) return;
      for (var i = 0; i < p.rooms.length; i++) { var q = p.rooms[i]; if (q !== r && (withDoor[q.id] || q === hall) && door(r, q)) return; }
      for (i = 0; i < p.rooms.length; i++) { q = p.rooms[i]; if (q !== r && door(r, q)) return; }
    });
    p.rooms.forEach(function (r) {
      if (r.type === "hall" || r.type === "bath" || r.type === "wc") return;
      var free = WALLS.filter(function (w) { return !p.rooms.some(function (q) { var s = q !== r && shared(r, q); return s && s.w1 === w; }); });
      var w = free.indexOf("N") >= 0 ? "N" : free.indexOf("S") >= 0 ? "S" : free[0];
      if (!w) return;
      var L = wallLen(r, w), ww = r.type === "balcony" ? Math.min(L - 40, 200) : Math.min(150, L - 60);
      if (ww >= 60) addOpening(p, r, w, r.type === "balcony" ? "window" : "window", (L - ww) / 2, ww);
    });
    if (hall) {
      var freeH = WALLS.filter(function (w) { return !p.rooms.some(function (q) { var s = q !== hall && shared(hall, q); return s && s.w1 === w; }); });
      var ew = freeH.indexOf("N") >= 0 ? "N" : freeH[0] || "N";
      addOpening(p, hall, ew, "door", 20, Math.min(90, wallLen(hall, ew) - 30));
      var pw = ["W", "E", "S", "N"].filter(function (w) { return w !== ew; }).sort(function (a, b) { return wallLen(hall, b) - wallLen(hall, a); })[0];
      p.panel = { room: hall.id, wall: pw, pos: Math.min(60, wallLen(hall, pw) - 40), h: 150 };
      var pq = clearPos(p, hall, pw, p.panel.pos, 40); if (pq != null) p.panel.pos = pq;
    } else if (p.rooms.length) p.panel = { room: p.rooms[0].id, wall: "W", pos: 50, h: 150 };
  }

  // зсуває позицію, щоб точка шириною wd не потрапляла на проріз і була ≥15 см від країв прорізу та кутів
  function clearPos(p, room, wall, pos, wd, h) {
    var L = wallLen(room, wall), ops = openingsOn(p, room, wall), M = 15;
    function bad(x) {
      if (x - wd / 2 < M || x + wd / 2 > L - M) return true;
      return ops.some(function (o) {
        var lo = o.pos - M - wd / 2, hi = o.pos + o.width + M + wd / 2;
        if (x <= lo || x >= hi) return false;
        if (h == null) return true;
        return o.kind === "door" || h < o.sill + o.height + 15 || true;
      });
    }
    if (!bad(pos)) return pos;
    for (var d = 5; d < L; d += 5) { if (!bad(pos + d)) return pos + d; if (!bad(pos - d)) return pos - d; }
    return null;
  }
  // місце для точки: бажана стіна, інакше сусідні стіни біля кута
  function spot(p, room, wall, pos, wd, h) {
    var q = clearPos(p, room, wall, pos, wd, h);
    if (q != null) return { wall: wall, pos: q };
    var i = WALLS.indexOf(wall), nxt = WALLS[(i + 1) % 4], prv = WALLS[(i + 3) % 4];
    q = clearPos(p, room, nxt, 25, wd, h); if (q != null) return { wall: nxt, pos: q };
    q = clearPos(p, room, prv, wallLen(room, prv) - 25, wd, h); if (q != null) return { wall: prv, pos: q };
    for (var k = 0; k < 4; k++) { q = clearPos(p, room, WALLS[k], wallLen(room, WALLS[k]) / 2, wd, h); if (q != null) return { wall: WALLS[k], pos: q }; }
    return { wall: wall, pos: pos };
  }
  function at(p, kind, room, wall, pos, wd, opt) {
    var sp = spot(p, room, wall, pos, wd, opt && opt.h); opt = opt || {}; opt.wall = sp.wall; opt.pos = sp.pos;
    return addPoint(p, kind, room, opt);
  }

  // ---------- авторозстановка ----------
  function neighbourThroughDoor(p, room) {
    var ops = p.openings.filter(function (o) { return o.kind === "door"; }), best = null;
    p.rooms.forEach(function (q) {
      if (q === room || best) return;
      var s = shared(room, q); if (!s) return;
      var d = openingsOn(p, room, s.w1).filter(function (o) { return o.kind === "door"; })[0];
      if (d) best = { room: q, wall: s.w2, door: d, myWall: s.w1, s: s };
    });
    return best;
  }
  function firstDoor(p, room) {
    for (var i = 0; i < WALLS.length; i++) {
      var d = openingsOn(p, room, WALLS[i]).filter(function (o) { return o.kind === "door"; })[0];
      if (d) return { wall: WALLS[i], door: d };
    }
    return null;
  }

  function autoPlace(p) {
    p.points = []; p.groups = []; p.rcds = []; p.over = {};
    var Q1 = addRcd(p, 40, 30), Q2 = null;
    var light = addGroup(p, { name: "Освітлення", kind: "light", In: 10, sec: 1.5, prot: "rcd", rcd: Q1.id, curve: "B" });
    var roomSocketGroups = [];
    var hallRoom = p.rooms.filter(function (r) { return r.type === "hall"; })[0];

    p.rooms.forEach(function (r) {
      var fd = firstDoor(p, r), wet = r.type === "bath" || r.type === "wc", pa = null, pb = null;
      // розподільча коробка і вимикач біля дверей
      var swRoom = r, swWall, swPos, dpos, dwid;
      if (fd) { swWall = fd.wall; dpos = fd.door.pos; dwid = fd.door.width; swPos = dpos + dwid + 15 + 4; }
      else { swWall = "N"; swPos = 20; dpos = 0; dwid = 0; }
      if (wet) {
        var nb = neighbourThroughDoor(p, r);
        if (nb) {
          var a = wallXY(r, nb.myWall, nb.door.pos + nb.door.width), b = wallXY(r, nb.myWall, nb.door.pos);
          var pa = nearestWallFixed(nb.room, nb.wall, a[0], a[1]), pb = nearestWallFixed(nb.room, nb.wall, b[0], b[1]);
          swRoom = nb.room; swWall = nb.wall; swPos = Math.max(pa, pb) + 19;
        }
      }
      var L = wallLen(swRoom, swWall);
      if (swPos > L - 15) swPos = Math.max(15, Math.min(pa != null ? Math.min(pa, pb) - 19 : dpos - 19, L - 15));
      var box = at(p, "jbox", r, fd ? fd.wall : "N", fd ? Math.min(dpos + dwid + 25, wallLen(r, fd.wall) - 20) : 30, 10, { group: light.id });
      var lights = [];
      var long = Math.max(r.w, r.h);
      if (r.type === "hall" && long >= 400) {
        var n = Math.max(2, Math.round(long / 250)), lw = r.w >= r.h;
        var s1 = at(p, "pass", swRoom, swWall, swPos, 10, { group: light.id,  });
        var farWall = lw ? (swWall === "W" ? "E" : "W") : (swWall === "N" ? "S" : "N");
        if (farWall === swWall) farWall = lw ? "E" : "S";
        var s2 = at(p, "pass", r, lw ? "N" : "E", lw ? r.w - 40 : r.h - 40, 10, { group: light.id,  });
        for (var i = 0; i < n; i++) {
          lights.push(addPoint(p, "ceil", r, { group: light.id, x: lw ? r.x + r.w * (i + 0.5) / n : r.x + r.w / 2, y: lw ? r.y + r.h / 2 : r.y + r.h * (i + 0.5) / n, power: 40, ctl: [{ sw: s1.id, key: 1 }, { sw: s2.id, key: 1 }] }));
        }
      } else if (r.type === "kitchen") {
        var k2 = at(p, "sw2", swRoom, swWall, swPos, 10, { group: light.id,  });
        lights.push(addPoint(p, "ceil", r, { group: light.id, power: 60, ctl: [{ sw: k2.id, key: 1 }] }));
      } else {
        var s = at(p, "sw1", swRoom, swWall, swPos, 10, { group: light.id,  });
        lights.push(addPoint(p, "ceil", r, { group: light.id, power: r.type === "room" ? 100 : 40, ctl: [{ sw: s.id, key: 1 }] }));
      }

      // розетки
      if (r.type === "room") {
        var g = addGroup(p, { name: "Розетки: " + r.name, kind: "socket", In: 16, sec: 2.5, prot: "rcd", rcd: Q1.id });
        roomSocketGroups.push(g);
        WALLS.forEach(function (w) {
          var Lw = wallLen(r, w), ops = openingsOn(p, r, w), doors = ops.filter(function (o) { return o.kind === "door"; });
          if (doors.length) {
            var d = doors[0], pp = d.pos > 60 ? d.pos - 40 : d.pos + d.width + 50;
            at(p, "socket", r, w, pp, 10, { group: g.id, gang: 1 });
            return;
          }
          var cnt = Lw >= 500 ? 2 : 1;
          for (var k = 0; k < cnt; k++) at(p, "socket", r, w, Lw * (k + 1) / (cnt + 1), 10, { group: g.id, gang: 2 });
        });
      } else if (r.type === "kitchen") {
        if (!Q2) Q2 = addRcd(p, 40, 30);
        var walls = WALLS.filter(function (w) { return !openingsOn(p, r, w).some(function (o) { return o.kind === "door"; }); })
          .sort(function (a, b) { return wallLen(r, b) - wallLen(r, a); });
        var ww = walls[0] || "N", Lk = wallLen(r, ww);
        var gw = addGroup(p, { name: "Кухня: робоча зона", kind: "socket", In: 16, sec: 2.5, prot: "rcd", rcd: Q2.id });
        var gk = addGroup(p, { name: "Кухня: холодильник, посудомийна, витяжка", kind: "socket", In: 16, sec: 2.5, prot: "rcd", rcd: Q2.id });
        var go = addGroup(p, { name: "Духова шафа", kind: "power", In: 16, sec: 2.5, prot: "rcd", rcd: Q2.id });
        var gp = addGroup(p, { name: "Варильна поверхня", kind: "power", In: 32, sec: 6, prot: "none" });
        at(p, "socket", r, ww, Lk * 0.3, 15, { group: gw.id, h: 110, gang: 2, power: 2000, label: "над стільницею" });
        at(p, "socket", r, ww, Lk * 0.75, 15, { group: gw.id, h: 110, gang: 2, power: 1200, label: "над стільницею" });
        at(p, "socket", r, ww, 30, 10, { group: gk.id, h: 30, gang: 1, power: 200, label: "холодильник" });
        at(p, "socket", r, ww, Lk * 0.3 + 60, 10, { group: gk.id, h: 30, gang: 1, power: 2000, label: "посудомийна машина" });
        at(p, "socket", r, ww, Lk * 0.55, 10, { group: gk.id, h: 210, gang: 1, power: 200, label: "витяжка" });
        at(p, "outlet", r, ww, Lk * 0.55, 15, { group: gp.id, h: 60, power: 7000, label: "варильна поверхня" });
        at(p, "socket", r, ww, Lk * 0.55 + 40, 10, { group: go.id, h: 30, gang: 1, power: 3500, label: "духова шафа" });
        at(p, "led", r, ww, Lk * 0.5, 10, { group: light.id, h: 140, power: 30, ctl: [{ sw: k2.id, key: 2 }] });
      } else if (r.type === "bath") {
        var wallB = WALLS.filter(function (w) { return !openingsOn(p, r, w).length; }).sort(function (a, b) { return wallLen(r, b) - wallLen(r, a); });
        var wb = wallB[0] || "E", wb2 = wallB[1] || wb, Lb = wallLen(r, wb);
        var gwm = addGroup(p, { name: "Пральна машина", kind: "socket", In: 16, sec: 2.5, prot: "rcbo", dI: 10 });
        var gbo = addGroup(p, { name: "Бойлер", kind: "power", In: 16, sec: 2.5, prot: "rcbo", dI: 10 });
        at(p, "socket", r, wb, Lb * 0.3, 10, { group: gwm.id, h: 100, gang: 1, power: 2200, label: "пральна машина, IP44" });
        at(p, "socket", r, wb, Lb * 0.75, 10, { group: gwm.id, h: 110, gang: 1, label: "фен, IP44, поза зонами 0–2", power: 1200 });
        at(p, "outlet", r, wb2, wallLen(r, wb2) / 2, 10, { group: gbo.id, h: 180, power: 2000, label: "бойлер" });
      }
    });
    // розетки коридору — у групу першої кімнати (або власну)
    if (hallRoom) {
      var hg = roomSocketGroups[0] || addGroup(p, { name: "Розетки: коридор", kind: "socket", In: 16, sec: 2.5, prot: "rcd", rcd: Q1.id });
      var hw = WALLS.filter(function (w) { return !openingsOn(p, hallRoom, w).length; }).sort(function (a, b) { return wallLen(hallRoom, b) - wallLen(hallRoom, a); })[0] || "E";
      at(p, "socket", hallRoom, hw, 60, 10, { group: hg.id, gang: 1, label: "пилосос, зарядки" });
    }
    if (p.rcds.length === 2 && !p.groups.some(function (g) { return g.rcd === Q2.id; })) p.rcds.pop();
    return p;
  }

  // ---------- кінцеві точки трас ----------
  function endpoint(p, ref) {
    var r, e;
    if (ref === "panel") {
      var pn = p.panel; if (!pn) return null; r = byId(p.rooms, pn.room); if (!r) return null;
      var xy = wallXY(r, pn.wall, pn.pos);
      return { ref: ref, room: r, wall: pn.wall, pos: pn.pos, h: pn.h + 25, x: xy[0], y: xy[1], ceiling: false };
    }
    var pt = byId(p.points, ref); if (!pt) return null;
    r = byId(p.rooms, pt.room); if (!r) return null;
    if (KINDS[pt.kind].surf === "wall") {
      xy = wallXY(r, pt.wall, pt.pos);
      return { ref: ref, room: r, wall: pt.wall, pos: pt.pos, h: pt.h, x: xy[0], y: xy[1], ceiling: false };
    }
    var nw = nearestWall(r, pt.x, pt.y);
    e = { ref: ref, room: r, wall: nw.wall, pos: nw.pos, h: p.ceilH, x: pt.x, y: pt.y, ceiling: true, attach: nw.d };
    return e;
  }

  // пошук шляху кімнатами (BFS по суміжності)
  function roomPath(p, a, b) {
    if (a === b) return [a];
    var prev = {}, q = [a], seen = {}; seen[a.id] = true;
    while (q.length) {
      var r = q.shift();
      for (var i = 0; i < p.rooms.length; i++) {
        var n = p.rooms[i];
        if (seen[n.id] || !shared(r, n)) continue;
        seen[n.id] = true; prev[n.id] = r; q.push(n);
        if (n === b) { var path = [b]; while (path[0] !== a) path.unshift(prev[path[0].id]); return path; }
      }
    }
    return null;
  }
  function perimLeg(r, t1, t2, z, pieces) {
    var P = 2 * (r.w + r.h), d = ((t2 - t1) % P + P) % P, dir = 1;
    if (d > P / 2) { d = P - d; dir = -1; }
    var t = t1, left = d;
    while (left > 1e-6) {
      var cur = fromT(r, t + dir * 1e-6), L = wallLen(r, cur.wall), start = fromT(r, t);
      var sp = start.wall === cur.wall ? start.pos : (dir > 0 ? 0 : L);
      var room = dir > 0 ? L - sp : sp, step = Math.min(room, left);
      pieces.push({ room: r.id, wall: cur.wall, z: z, p0: sp, p1: sp + dir * step });
      t += dir * step; left -= step;
      if (step < 1e-6) break;
    }
    return d;
  }
  function wallRoute(p, ea, eb, z) {
    var path = roomPath(p, ea.room, eb.room), pieces = [], len = 0, holes = [];
    if (!path) return null;
    var t = perimT(ea.room, ea.wall, ea.pos);
    for (var i = 0; i < path.length; i++) {
      var r = path[i];
      if (i === path.length - 1) { len += perimLeg(r, t, perimT(r, eb.wall, eb.pos), z, pieces); break; }
      var n = path[i + 1], s = shared(r, n), mid = (s.a + s.b) / 2;
      var x = s.axis === "x" ? mid : s.line1, y = s.axis === "y" ? mid : s.line1;
      // прохід крізь стіну ставимо ближче до поточної точки, але не ближче 20 см до кутів
      var cur = wallXY(r, fromT(r, t).wall, fromT(r, t).pos);
      if (s.axis === "x") x = Math.max(s.a + 20, Math.min(s.b - 20, cur[0])); else y = Math.max(s.a + 20, Math.min(s.b - 20, cur[1]));
      var tOut = perimT(r, s.w1, nearestWallFixed(r, s.w1, x, y));
      len += perimLeg(r, t, tOut, z, pieces) + s.gap;
      var x2 = s.axis === "x" ? x : s.line2, y2 = s.axis === "y" ? y : s.line2;
      holes.push({ from: r.id, to: n.id, x: x, y: y, z: z, gap: s.gap });
      t = perimT(n, s.w2, nearestWallFixed(n, s.w2, x2, y2));
    }
    return { len: len, pieces: pieces, holes: holes };
  }

  function segment(p, aRef, bRef, plane, section, cores, gid, role) {
    var ea = endpoint(p, aRef), eb = endpoint(p, bRef);
    if (!ea || !eb) return null;
    var C = p.ceilH, seg = { key: aRef + ">" + bRef, a: aRef, b: bRef, group: gid, plane: plane, sec: section, cores: cores, cable: cableName(section, cores), role: role, verts: [], pieces: [], line: null, holes: [] };
    var horiz = 0, drops = 0;
    if (plane === "wallTop" || plane === "wallBottom") {
      var z = plane === "wallTop" ? C - ZONE_TOP : ZONE_BOT;
      var wr = wallRoute(p, ea, eb, z);
      if (!wr) { seg.error = "Кімнати не суміжні — немає шляху по стінах"; wr = { len: dist([ea.x, ea.y], [eb.x, eb.y]), pieces: [], holes: [] }; }
      horiz = wr.len; seg.pieces = wr.pieces; seg.holes = wr.holes;
      [ea, eb].forEach(function (e) {
        if (e.ceiling) { drops += (C - z) + e.attach; seg.verts.push({ room: e.room.id, wall: e.wall, pos: e.pos, z0: z, z1: C }); seg.ceilStub = (seg.ceilStub || []).concat([[e.x, e.y, e.room, e.wall, e.pos]]); }
        else { drops += Math.abs(z - e.h); seg.verts.push({ room: e.room.id, wall: e.wall, pos: e.pos, z0: Math.min(z, e.h), z1: Math.max(z, e.h) }); }
      });
    } else if (plane === "ceilGrid") {
      // від стіни кабель виходить на стелю; відступ від стіни — налаштування проєкту (типово впритул, у куті стеля–стіна, як роблять забудовники)
      var INS = p.ceilInset != null ? +p.ceilInset : 4, NRM = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] };
      var ins = function (e) { var n = !e.ceiling && e.wall && NRM[e.wall]; return n ? [e.x + n[0] * INS, e.y + n[1] * INS] : [e.x, e.y]; };
      var ia = ins(ea), ib = ins(eb), gr = gridRoute(p, ia, ib, INS < 10), gp = gr.pts.slice();
      if (ia[0] !== ea.x || ia[1] !== ea.y) gp.unshift([ea.x, ea.y]);
      if (ib[0] !== eb.x || ib[1] !== eb.y) gp.push([eb.x, eb.y]);
      var mp = [gp[0]];
      for (var mi = 1; mi < gp.length; mi++) {
        var q0 = mp[mp.length - 1], q1 = gp[mi], q2 = gp[mi + 1];
        if (dist(q0, q1) < 0.5) continue;
        if (q2 && ((Math.abs(q0[0] - q1[0]) < 0.5 && Math.abs(q1[0] - q2[0]) < 0.5) || (Math.abs(q0[1] - q1[1]) < 0.5 && Math.abs(q1[1] - q2[1]) < 0.5))) continue;
        mp.push(q1);
      }
      horiz = 0; for (mi = 0; mi < mp.length - 1; mi++) horiz += dist(mp[mi], mp[mi + 1]);
      seg.line = mp; seg.holes = gr.holes.map(function (o) { return { from: o.from, to: o.to, x: o.x, y: o.y, z: C }; });
      [ea, eb].forEach(function (e) { if (!e.ceiling) { drops += C - e.h; seg.verts.push({ room: e.room.id, wall: e.wall, pos: e.pos, z0: e.h, z1: C }); } });
    } else {
      horiz = dist([ea.x, ea.y], [eb.x, eb.y]); seg.line = [[ea.x, ea.y], [eb.x, eb.y]];
      [ea, eb].forEach(function (e) {
        if (plane === "ceiling") { if (!e.ceiling) { drops += C - e.h; seg.verts.push({ room: e.room.id, wall: e.wall, pos: e.pos, z0: e.h, z1: C }); } }
        else if (e.ceiling) { drops += C + e.attach; seg.verts.push({ room: e.room.id, wall: e.wall, pos: e.pos, z0: 0, z1: C }); }
        else { drops += e.h; seg.verts.push({ room: e.room.id, wall: e.wall, pos: e.pos, z0: 0, z1: e.h }); }
      });
    }
    seg.horiz = horiz; seg.drops = drops; seg.len = horiz + drops;
    return seg;
  }

  function nnChain(p, startRef, refs) {
    var out = [], cur = endpoint(p, startRef), left = refs.slice();
    while (left.length && cur) {
      var best = 0, bd = Infinity;
      left.forEach(function (r, i) { var e = endpoint(p, r); if (!e) return; var d = dist([cur.x, cur.y], [e.x, e.y]) + (e.room === cur.room ? 0 : 150); if (d < bd) { bd = d; best = i; } });
      var nx = left.splice(best, 1)[0]; out.push(nx); cur = endpoint(p, nx);
    }
    return out;
  }

  // ---------- траси всіх груп ----------
  function routes(p) {
    var segs = [];
    if (!p.panel) return segs;
    function plane(g, key) { return p.over[key] || g.plane; }
    function add(a, b, g, cores, role) {
      var s = segment(p, a, b, plane(g, a + ">" + b), g.sec, cores, g.id, role);
      if (s) segs.push(s);
    }
    p.groups.forEach(function (g) {
      var pts = p.points.filter(function (t) { return t.group === g.id; });
      if (!pts.length) return;
      if (g.kind !== "light") {
        var chain = nnChain(p, "panel", pts.map(function (t) { return t.id; })), prev = "panel";
        chain.forEach(function (id) { add(prev, id, g, 3, "feed"); prev = id; });
        return;
      }
      var boxes = pts.filter(function (t) { return t.kind === "jbox"; }).map(function (t) { return t.id; });
      var bchain = nnChain(p, "panel", boxes), pv = "panel";
      bchain.forEach(function (id) { add(pv, id, g, 3, "feed"); pv = id; });
      function hub(t) {
        var same = pts.filter(function (b) { return b.kind === "jbox" && b.room === t.room; })[0];
        if (same) return same.id;
        var e = endpoint(p, t.id), best = null, bd = Infinity;
        boxes.forEach(function (b) { var eb = endpoint(p, b), d = dist([e.x, e.y], [eb.x, eb.y]); if (d < bd) { bd = d; best = b; } });
        return best || "panel";
      }
      var swHub = {};
      pts.filter(function (t) { return KINDS[t.kind].cat === "switch"; }).forEach(function (t) {
        // вимикач ставлять у кімнаті, світло якої він вмикає: коробка — тієї кімнати
        var lit = pts.filter(function (l) { return (l.ctl || []).some(function (c) { return c.sw === t.id; }); })[0];
        swHub[t.id] = lit ? hub(lit) : hub(t);
        add(swHub[t.id], t.id, g, KINDS[t.kind].cores, "switch");
      });
      // світильник живиться з тієї коробки, куди прийшов кабель його вимикача — інакше вимкнена фаза до нього не дійде
      function lightHub(t) { var c = (t.ctl || []).filter(function (x) { return swHub[x.sw]; })[0]; return c ? swHub[c.sw] : hub(t); }
      var sets = {};
      pts.filter(function (t) { return KINDS[t.kind].cat === "light"; }).forEach(function (t) {
        var sig = lightHub(t) + "|" + (t.ctl || []).map(function (c) { return c.sw + ":" + c.key; }).sort().join(",");
        (sets[sig] = sets[sig] || []).push(t);
      });
      Object.keys(sets).forEach(function (sig) {
        var list = sets[sig], h = sig.split("|")[0], lines = switchedLines(p, list[0]);
        var ch = nnChain(p, h, list.map(function (t) { return t.id; })), pr = h;
        var perm = list.some(function (t) { return t.kind === "fan" && t.timer; }) ? 1 : 0;
        ch.forEach(function (id) { add(pr, id, g, lines + 2 + perm, "light"); pr = id; });
      });
    });
    return segs;
  }
  // скільки комутованих фазних жил іде до світильника
  function switchedLines(p, light) {
    var ctl = light.ctl || [];
    if (!ctl.length) return 1;
    var multi = ctl.length >= 2 && ctl.every(function (c) { var s = byId(p.points, c.sw); return s && (s.kind === "pass" || s.kind === "cross"); });
    if (multi) return 1;
    var keys = {}; ctl.forEach(function (c) { keys[c.sw + ":" + c.key] = 1; });
    return Object.keys(keys).length;
  }

  // ---------- перевірки ----------
  function issues(p, segs) {
    var out = [];
    function E(msg, ref) { out.push({ lvl: "error", msg: msg, ref: ref }); }
    function W(msg, ref) { out.push({ lvl: "warn", msg: msg, ref: ref }); }
    segs = segs || routes(p);
    if (!p.rooms.length) { E("Немає жодної кімнати."); return out; }
    if (!p.panel || !byId(p.rooms, p.panel.room)) E("Не вказано місце щита.");
    p.groups.forEach(function (g) {
      var pts = p.points.filter(function (t) { return t.group === g.id; }), max = CABLE_MAX[g.sec];
      if (!pts.length) W("Група «" + g.name + "» порожня — видали її або признач точки.", g.id);
      if (max != null && g.In > max) E("«" + g.name + "»: автомат " + g.curve + g.In + " завеликий для кабелю " + sec(g.sec) + " мм² (для схованої мідної проводки — не більше " + max + " А).", g.id);
      if (g.kind === "light" && g.sec < 1.5) E("«" + g.name + "»: для освітлення переріз не менше 1,5 мм².", g.id);
      if (g.kind === "socket" && g.sec < 2.5) E("«" + g.name + "»: для розеток переріз не менше 2,5 мм².", g.id);
      var wet = pts.some(function (t) { var r = byId(p.rooms, t.room); return r && (r.type === "bath" || r.type === "wc") && KINDS[t.kind].cat !== "switch"; });
      var hasRcd = g.prot === "rcbo" || (g.prot === "rcd" && byId(p.rcds, g.rcd));
      var dI = g.prot === "rcbo" ? g.dI : g.prot === "rcd" && byId(p.rcds, g.rcd) ? byId(p.rcds, g.rcd).dI : null;
      if (wet && !hasRcd) E("«" + g.name + "» живить санвузол: усі кола ванної мають бути захищені ПЗВ (≤ 30 мА, на окремі лінії часто 10 мА).", g.id);
      if (wet && hasRcd && dI > 30) E("«" + g.name + "»: для санвузла ПЗВ має бути ≤ 30 мА.", g.id);
      if (g.kind === "socket" && !hasRcd) W("«" + g.name + "»: розеткові групи, як правило, захищають ПЗВ 30 мА.", g.id);
      var P = pts.reduce(function (s, t) { return s + (t.power || 0); }, 0);
      if (P > 230 * g.In) W("«" + g.name + "»: сумарна потужність приладів " + nf(P / 1000, 1) + " кВт більша за " + nf(230 * g.In / 1000, 1) + " кВт, що тримає автомат " + g.In + " А — якщо вони працюватимуть одночасно, розділи групу.", g.id);
      pts.filter(function (t) { return t.kind === "outlet"; }).forEach(function (t) {
        if ((t.power || 0) > 230 * g.In) E("«" + (t.label || "Техніка") + "» " + nf(t.power / 1000, 1) + " кВт не вміщається в автомат " + g.In + " А групи «" + g.name + "».", t.id);
      });
      var posts = pts.reduce(function (s, t) { return s + (t.kind === "socket" ? t.gang : 0); }, 0);
      if (g.kind === "socket" && posts > 10) W("«" + g.name + "»: " + posts + " постів розеток на одній групі — зазвичай групу ділять (одна на кімнату або на дві невеликі).", g.id);
      if (g.In >= p.input) E("«" + g.name + "»: автомат групи " + g.In + " А не менший за ввідний " + p.input + " А — порушується селективність.", g.id);
      if (g.prot === "rcd" && byId(p.rcds, g.rcd) && byId(p.rcds, g.rcd).In < g.In) E("«" + g.name + "»: номінал ПЗВ менший за автомат групи.", g.id);
    });
    p.rcds.forEach(function (q, i) {
      var gs = p.groups.filter(function (g) { return g.prot === "rcd" && g.rcd === q.id; });
      if (!gs.length) W("ПЗВ " + (i + 1) + " нічого не захищає.", q.id);
    });
    p.points.forEach(function (t) {
      var K = KINDS[t.kind], r = byId(p.rooms, t.room), nm = K.name + (t.label ? " (" + t.label + ")" : "") + (r ? " — " + r.name : "");
      if (!r) { E(nm + ": кімнату видалено.", t.id); return; }
      if (!t.group || !byId(p.groups, t.group)) E(nm + ": не призначено групу.", t.id);
      if (K.cat === "light") {
        if (!(t.ctl || []).length) W(nm + ": світильник не прив'язаний до вимикача.", t.id);
        var sw = (t.ctl || []).map(function (c) { return byId(p.points, c.sw); });
        if (sw.some(function (s) { return !s; })) E(nm + ": вимикач, що керує світильником, видалено.", t.id);
        else if (sw.length === 1 && (sw[0].kind === "pass" || sw[0].kind === "cross")) E(nm + ": один прохідний чи перехресний вимикач не працює сам — потрібні два прохідні (і перехресні між ними) або звичайний вимикач.", t.id);
        else if (sw.length >= 2) {
          var np = sw.filter(function (s) { return s.kind === "pass"; }).length, nc = sw.filter(function (s) { return s.kind === "cross"; }).length;
          if (np !== 2 || np + nc !== sw.length) E(nm + ": керування з кількох місць — це рівно 2 прохідні вимикачі і будь-яка кількість перехресних між ними.", t.id);
        }
        (t.ctl || []).forEach(function (c) { var s = byId(p.points, c.sw); if (s && KINDS[s.kind].keys < c.key) E(nm + ": у вимикача немає клавіші " + c.key + ".", t.id); if (s && s.group !== t.group) W(nm + ": світильник і його вимикач у різних групах.", t.id); });
      }
      if (K.cat === "switch") {
        var used = p.points.some(function (l) { return (l.ctl || []).some(function (c) { return c.sw === t.id; }); });
        if (!used) W(nm + ": вимикач нічим не керує.", t.id);
        if (r.type === "bath" || r.type === "wc") W(nm + ": вимикачі санвузла зазвичай виносять за двері, у коридор.", t.id);
      }
      if (K.surf === "wall") {
        var L = wallLen(r, t.wall);
        if (t.pos < 10 || t.pos > L - 10) W(nm + ": ближче 10 см до кута — незручно штробити і ставити рамку.", t.id);
        if (t.h > p.ceilH - 5 || t.h < 5) E(nm + ": висота " + t.h + " см поза межами стіни.", t.id);
        openingsOn(p, r, t.wall).forEach(function (o) {
          var inX = t.pos > o.pos - 5 && t.pos < o.pos + o.width + 5, z0 = o.kind === "door" ? 0 : o.sill, z1 = z0 + o.height;
          if (inX && t.h >= z0 - 5 && t.h <= z1 + 5) E(nm + ": потрапляє на " + (o.kind === "door" ? "дверний проріз" : "вікно") + ".", t.id);
          else if (t.pos > o.pos - 10 && t.pos < o.pos + o.width + 10) W(nm + ": ближче 10 см до " + (o.kind === "door" ? "дверей" : "вікна") + " — укосом і лиштвою закриє рамку, і спуск кабелю пройде впритул до прорізу.", t.id);
        });
      }
    });
    segs.forEach(function (s) {
      if (s.error) E(s.error + " (" + labelRef(p, s.a) + " → " + labelRef(p, s.b) + ").", s.b);
      s.verts.forEach(function (v) {
        var r = byId(p.rooms, v.room);
        openingsOn(p, r, v.wall).forEach(function (o) {
          var z0 = o.kind === "door" ? 0 : o.sill, z1 = z0 + o.height;
          if (v.pos > o.pos - 5 && v.pos < o.pos + o.width + 5 && v.z1 > z0 && v.z0 < z1) W("Спуск кабелю до «" + labelRef(p, s.b) + "» проходить через " + (o.kind === "door" ? "двері" : "вікно") + " — зміни площину прокладання або посунь точку.", s.b);
        });
      });
    });
    return out;
  }

  function labelRef(p, ref) {
    if (ref === "panel") return "Щит";
    var t = byId(p.points, ref); if (!t) return "?";
    var r = byId(p.rooms, t.room);
    return tagOf(p, t) + " " + KINDS[t.kind].name + (t.label ? " (" + t.label + ")" : "") + (r ? ", " + r.name : "");
  }
  // позначення як на схемах: SA — вимикачі, EL — світильники, XS — розетки, XT — виводи, KR — коробки
  var TAGS = { switch: "SA", light: "EL", socket: "XS", power: "XT", box: "KR" };
  function tagOf(p, t) {
    var cat = KINDS[t.kind].cat, n = 0;
    for (var i = 0; i < p.points.length; i++) { if (KINDS[p.points[i].kind].cat === cat) n++; if (p.points[i] === t) break; }
    return TAGS[cat] + n;
  }

  // ---------- щит ----------
  function panel(p) {
    var dev = [], n = { qf: 0, qd: 0, qfd: 0 };
    dev.push({ tag: "QF0", name: "Ввідний автомат", spec: "2P C" + p.input, mod: 2 });
    if (p.relay) dev.push({ tag: "KV1", name: "Реле напруги", spec: p.input + " А (або більше)", mod: 2 });
    var gnum = {};
    p.groups.forEach(function (g, i) { gnum[g.id] = i + 1; });
    p.rcds.forEach(function (q) {
      var gs = p.groups.filter(function (g) { return g.prot === "rcd" && g.rcd === q.id; });
      if (!gs.length) return;
      n.qd++;
      dev.push({ tag: "QD" + n.qd, name: "ПЗВ", spec: "2P " + q.In + " А " + q.dI + " мА тип " + q.type, mod: 2, rcd: q.id });
      gs.forEach(function (g) { n.qf++; dev.push({ tag: "QF" + n.qf, name: "Гр." + gnum[g.id] + " " + g.name, spec: g.curve + g.In + ", " + cableName(g.sec, 3), mod: 1, group: g.id, under: "QD" + n.qd }); });
    });
    p.groups.forEach(function (g) {
      if (g.prot === "rcbo") { n.qfd++; dev.push({ tag: "QFD" + n.qfd, name: "Гр." + gnum[g.id] + " " + g.name, spec: "дифавтомат " + g.curve + g.In + " " + g.dI + " мА, " + cableName(g.sec, 3), mod: 2, group: g.id }); }
      else if (g.prot === "none" || (g.prot === "rcd" && !byId(p.rcds, g.rcd))) { n.qf++; dev.push({ tag: "QF" + n.qf, name: "Гр." + gnum[g.id] + " " + g.name, spec: g.curve + g.In + ", " + cableName(g.sec, 3), mod: 1, group: g.id }); }
    });
    var mods = dev.reduce(function (s, d) { return s + d.mod; }, 0), need = Math.ceil(mods * 1.25), enc = ENCLOSURES.filter(function (e) { return e >= need; })[0] || 72;
    var perRow = enc === 54 || enc === 72 ? 18 : 12, rows = [], row = [], used = 0;
    dev.forEach(function (d) { if (used + d.mod > perRow) { rows.push(row); row = []; used = 0; } row.push(d); used += d.mod; });
    if (row.length) rows.push(row);
    return { devices: dev, modules: mods, need: need, enclosure: enc, perRow: perRow, rows: rows, gnum: gnum };
  }

  // ---------- специфікація ----------
  function spec(p, segs) {
    segs = segs || routes(p);
    var cables = {}, tubes = {}, items = [], clips = {};
    segs.forEach(function (s) {
      var L = (s.len + 2 * END_RESERVE) / 100;
      cables[s.cable] = (cables[s.cable] || 0) + L;
      if (onCeil(s.plane) || s.plane === "floor") { var d = s.sec >= 4 || s.cores > 3 ? "25" : "20"; tubes[d] = (tubes[d] || 0) + L; clips[d] = (clips[d] || 0) + Math.ceil(s.len / (onCeil(s.plane) ? 40 : 50)) + 2 + (s.line ? s.line.length - 2 : 0) * 2; }
    });
    var cab = Object.keys(cables).sort().map(function (k) { return { name: "Кабель ВВГнг-LS " + k + " мм²", qty: Math.ceil(cables[k] * 1.1), unit: "м", note: "з запасом 10 % і по " + END_RESERVE + " см на кожне під'єднання" }; });
    var tub = Object.keys(tubes).map(function (k) { return { name: "Гофротруба ПВХ d" + k + " мм", qty: Math.ceil(tubes[k] * 1.1), unit: "м", note: "для трас по стелі / підлозі" }; });
    Object.keys(clips).forEach(function (k) { tub.push({ name: "Кліпса-тримач для гофри d" + k + " + дюбель 6×40 з шурупом", qty: Math.ceil(clips[k] * 1.1), unit: "шт", note: "по стелі крок 30–40 см, по підлозі ~50 см, плюс біля кожного повороту й кінця" }); });
    var cnt = function (f) { return p.points.filter(f).length; };
    var posts = p.points.reduce(function (s, t) { return s + (t.kind === "socket" ? t.gang : 0); }, 0);
    var frames = {}; p.points.forEach(function (t) { if (t.kind === "socket" && t.gang > 1) frames[t.gang] = (frames[t.gang] || 0) + 1; });
    var sw = cnt(function (t) { return KINDS[t.kind].cat === "switch"; });
    var wallOut = cnt(function (t) { return t.kind === "outlet" || t.kind === "sconce" || t.kind === "led" || t.kind === "fan"; });
    items.push({ name: "Підрозетник глибокий (60 мм) для розеток", qty: posts, unit: "шт", note: "на кожен пост; багатопостові — з'єднувані" });
    items.push({ name: "Підрозетник для вимикачів", qty: sw, unit: "шт" });
    if (wallOut) items.push({ name: "Підрозетник під вивід кабелю / бра / блок живлення", qty: wallOut, unit: "шт" });
    items.push({ name: "Розподільча коробка (настінна, під штукатурку)", qty: cnt(function (t) { return t.kind === "jbox"; }), unit: "шт" });
    var wago = 0;
    p.points.filter(function (t) { return t.kind === "jbox"; }).forEach(function (b) {
      var lines = segs.filter(function (s) { return s.a === b.id; }).length;
      wago += 3 + lines;
    });
    if (wago) items.push({ name: "Клеми WAGO (221) для коробок", qty: Math.ceil(wago * 1.2), unit: "шт", note: "орієнтовно: N, PE, L + по одній на кожну відгалужену лінію, +20 %" });
    var ch = [];
    ch.push({ name: "Механізм розетки з заземленням", qty: posts, unit: "шт", note: "у ванній — IP44" });
    Object.keys(frames).forEach(function (g) { ch.push({ name: "Рамка на " + g + " пости", qty: frames[g], unit: "шт" }); });
    ["sw1", "sw2", "pass", "cross"].forEach(function (k) { var c = cnt(function (t) { return t.kind === k; }); if (c) ch.push({ name: "Механізм: " + KINDS[k].name.toLowerCase(), qty: c, unit: "шт" }); });
    var lights = cnt(function (t) { return KINDS[t.kind].cat === "light"; });
    if (lights) ch.push({ name: "Світильники (за дизайном)", qty: lights, unit: "шт", note: "LED-підсвітка — з блоком живлення із запасом 20–30 %" });
    var pn = panel(p), pd = pn.devices.map(function (d) { return { name: d.tag + " · " + d.name, qty: 1, unit: "шт", note: d.spec }; });
    pd.push({ name: "Корпус щита", qty: 1, unit: "шт", note: pn.enclosure + " модулів (апарати займають " + pn.modules + ", запас 20–30 %)" });
    pd.push({ name: "Шини N і PE, гребінчаста шина, DIN-рейки", qty: 1, unit: "компл.", note: "N — окремо під кожне ПЗВ" });
    pd.push({ name: "Наконечники НШВИ і маркування груп", qty: 1, unit: "компл." });
    var total = segs.reduce(function (s, x) { return s + x.len; }, 0) / 100;
    return { cables: cab, tubes: tub, boxes: items, finish: ch, panel: pd, totalM: total, panelInfo: pn };
  }

  // ---------- таблиця станів для керування з кількох місць (через розв'язувач конструктора) ----------
  function truthTable(p, light) {
    var B = typeof window !== "undefined" && window.BUILDER && window.BUILDER._test;
    var sws = (light.ctl || []).map(function (c) { return byId(p.points, c.sw); }).filter(Boolean);
    var pass = sws.filter(function (s) { return s.kind === "pass"; }), cross = sws.filter(function (s) { return s.kind === "cross"; });
    if (!B || pass.length !== 2 || pass.length + cross.length !== sws.length) return null;
    var c = B.fresh(null), T = B.addPart, P = B.pinsOf;
    var ac = T(c, "ac", 0, 4, 230, 1), s1 = T(c, "spdt", 4, 4), X = 10, xs = [];
    cross.forEach(function () { xs.push(T(c, "cross", X, 4)); X += 6; });
    var s2 = T(c, "spdt", X + 6, 4, 0, 2), lamp = T(c, "lamp", X + 10, 4, 60, 1);
    function w(a, ai, b, bi) { var u = P(a)[ai], v = P(b)[bi]; c.wires.push([u[0], u[1], v[0], v[1]]); }
    w(ac, 0, s1, 0); var prevA = [s1, 1], prevB = [s1, 2];
    xs.forEach(function (x) { w(prevA[0], prevA[1], x, 0); w(prevB[0], prevB[1], x, 1); prevA = [x, 2]; prevB = [x, 3]; });
    w(prevA[0], prevA[1], s2, 2); w(prevB[0], prevB[1], s2, 1); w(s2, 0, lamp, 0); w(lamp, 1, ac, 1);
    var order = [s1].concat(xs, [s2]), names = [pass[0]].concat(cross, [pass[1]]);
    var st = B.allStates(c), map = st.sws.map(function (s) { return order.indexOf(s); });
    var rows = st.list.map(function (s) {
      var bits = []; map.forEach(function (oi, i) { bits[oi] = (s.mask >> i) & 1; });
      return { states: bits, lit: s.r.ok && s.r.parts[lamp.id].lit > 0.5 };
    });
    var ok = B.checkMultiWay(c, 2, cross.length).every(function (i) { return i[0]; });
    return { names: names.map(function (s) { return labelRef(p, s.id); }), rows: rows, ok: ok };
  }

  // ---------- покроковий план робіт ----------
  function steps(p) {
    var segs = routes(p), sp = spec(p, segs), pn = sp.panelInfo, iss = issues(p, segs);
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var S = [];
    function step(id, title, html, lessons) { S.push({ id: id, title: title, html: html, lessons: lessons || [] }); }
    var errs = iss.filter(function (i) { return i.lvl === "error"; }).length;

    step("safety", "Безпека і хто що робить",
      "<p>Усі роботи з проводкою — лише на знеструмленій мережі: вимкни ввідний автомат, повісь табличку «Не вмикати», перевір відсутність напруги двополюсним покажчиком на кожному провіднику.</p>" +
      "<div class='warn'>Роботи у поверховому щиті і підключення вводу квартири виконує оператор системи розподілу або уповноважена особа. Твоя частина — усе, що після ввідного автомата квартирного щита.</div>" +
      "<p>Перед закриттям штроб і перед першим увімкненням — вимір опору ізоляції мегаомметром (див. крок перевірки). Якщо немає досвіду — запроси електрика хоча б на перевірку.</p>", [["m01", "l1"], ["r1", "l1"]]);

    step("survey", "Обстеж вихідні умови",
      "<ul><li>Система заземлення: у проєкті — <b>" + esc(p.system) + "</b>. Переконайся, що в поверховому щиті є окремий PE (жовто-зелений) провідник або шина.</li>" +
      "<li>Дозволена потужність і переріз вводу: під ввідний автомат <b>C" + p.input + "</b> ввід, як правило, мідь не менше 10 мм².</li>" +
      "<li>Висота стелі: <b>" + p.ceilH + " см</b> (від чистової підлоги). Познач майбутні рівні: стяжка, плитка, натяжна стеля — висоти точок у плані рахуються від чистової підлоги.</li>" +
      "<li>Матеріал стін: у панельних будинках не можна робити горизонтальні штроби в несучих стінах і штроби в плитах перекриття — тоді обирай траси по стелі або підлозі в гофрі.</li></ul>", [["r1", "l2"], ["m12", "l1"]]);

    step("project", "Заверши проєкт",
      errs ? "<div class='warn'>У проєкті " + errs + " помилок — виправ їх у вкладці «Групи і щит» перед закупівлею.</div>" : "<div class='tip'>Помилок у проєкті немає.</div>" +
      "<p>Перевір розстановку з меблями: де ліжко, стіл, телевізор, кухонний гарнітур (висота стільниці, мийка — розетки не ближче ~30 см по горизонталі від мийки і не над варильною поверхнею), бойлер, пральна машина.</p>",
      [["r1", "l3"]]);

    step("buy", "Закупи матеріали",
      "<p>Специфікація — у вкладці «Матеріали». Кабель: " + sp.cables.map(function (c) { return esc(c.name.replace("Кабель ВВГнг-LS ", "")) + " — " + c.qty + " м"; }).join(", ") + ". Щит на " + pn.enclosure + " модулів.</p>" +
      "<p>Купуй мідний кабель з негорючою оболонкою (ВВГнг-LS), перевір переріз жили мікрометром або за вагою бухти — «худий» кабель трапляється часто.</p>", [["r1", "l4"], ["m05", "l4"]]);

    // розмітка по кімнатах
    var mark = "";
    p.rooms.forEach(function (r) {
      var rows = "";
      WALLS.forEach(function (w) {
        p.points.filter(function (t) { return t.room === r.id && KINDS[t.kind].surf === "wall" && t.wall === w; })
          .sort(function (a, b) { return a.pos - b.pos; })
          .forEach(function (t) { rows += "<tr><td>" + WALL_NAME[w] + "</td><td>" + esc(KINDS[t.kind].name + (t.kind === "socket" && t.gang > 1 ? " ×" + t.gang : "") + (t.label ? " — " + t.label : "")) + "</td><td>" + Math.round(t.pos) + "</td><td>" + Math.round(t.h) + "</td></tr>"; });
      });
      p.points.filter(function (t) { return t.room === r.id && KINDS[t.kind].surf === "ceiling"; }).forEach(function (t) {
        rows += "<tr><td>стеля</td><td>" + esc(KINDS[t.kind].name) + "</td><td colspan='2'>" + Math.round(t.x - r.x) + " см від лівої стіни, " + Math.round(t.y - r.y) + " см від верхньої</td></tr>";
      });
      if (p.panel && p.panel.room === r.id) rows += "<tr><td>" + WALL_NAME[p.panel.wall] + "</td><td><b>Щит</b> (низ корпусу)</td><td>" + Math.round(p.panel.pos) + "</td><td>" + p.panel.h + "</td></tr>";
      if (rows) mark += "<h4>" + esc(r.name) + "</h4><table><tr><th>Стіна</th><th>Точка</th><th>Від лівого кута, см</th><th>Висота, см</th></tr>" + rows + "</table>";
    });
    step("mark", "Розміть точки на стінах і стелі",
      "<p>Відстань — по стіні від <b>лівого кута</b>, якщо стояти в кімнаті обличчям до стіни; висота — від чистової підлоги до центру точки. Креслення кожної стіни — у вкладці «Стіни».</p>" + mark +
      "<p>Під рамки на кілька постів — міжосьова відстань, як правило, 71 мм (уточни під серію механізмів).</p>", [["r1", "l5"]]);

    var planes = {};
    segs.forEach(function (s) { planes[s.plane] = true; });
    step("routes", "Розміть траси",
      "<ul>" + (planes.wallTop ? "<li>Траси по стіні під стелею — горизонталь на " + ZONE_TOP + " см нижче стелі, від неї вертикальні спуски до точок.</li>" : "") +
      (planes.wallBottom ? "<li>Траси над підлогою — горизонталь на висоті ~" + ZONE_BOT + " см, через підрозетники.</li>" : "") +
      (planes.ceiling || planes.ceilGrid ? "<li>Траси по стелі — у гофрі, кліпсами на дюбелях 6×40 до плити: крок 30–40 см, біля повороту, коробки й виводу — 10 см від краю. Лише під натяжну чи гіпсокартонну стелю, не в штробі плити.</li>" : "") +
      (planes.floor ? "<li>Траси по підлозі — у гофрі під стяжку, з фото і розмірами до заливки.</li>" : "") +
      "<li>Тільки горизонталі й вертикалі, без діагоналей; вертикалі — не ближче ~10–15 см від кутів, дверей і вікон.</li><li>Позначай траси фарбою прямо на стіні — так їх легко сфотографувати.</li></ul>", [["r1", "l5"]]);

    step("chase", "Штроблення і отвори",
      "<p>Штроборіз з пилососом, глибина штроби — щоб над кабелем лишилось не менше ~10 мм штукатурки (під один 3×2,5 — приблизно 20–25 мм). Отвори під підрозетники — коронкою 68 мм. Проходи крізь стіни між кімнатами: " +
      segs.reduce(function (n, s) { return n + s.holes.length; }, 0) + " шт.</p>", [["r1", "l5"]]);

    step("boxes", "Встанови підрозетники, коробки і корпус щита",
      "<p>Підрозетників: " + sp.boxes.filter(function (b) { return /Підрозетник/.test(b.name); }).map(function (b) { return b.qty; }).reduce(function (a, b) { return a + b; }, 0) +
      ", розподільчих коробок: " + p.points.filter(function (t) { return t.kind === "jbox"; }).length + ". Виставляй урівень з майбутньою чистовою поверхнею, по рівню. Корпус щита на " + pn.enclosure + " модулів — низ на висоті " + (p.panel ? p.panel.h : 150) + " см.</p>", [["r1", "l6"]]);

    var gn = pn.gnum, runs = "";
    p.groups.forEach(function (g) {
      var gs = segs.filter(function (s) { return s.group === g.id; });
      if (!gs.length) return;
      var tot = gs.reduce(function (s, x) { return s + x.len; }, 0) / 100;
      runs += "<h4>Гр." + gn[g.id] + " " + esc(g.name) + " — " + nf(tot) + " м</h4><table><tr><th>Від</th><th>До</th><th>Кабель</th><th>Як</th><th>Довжина, м</th></tr>" +
        gs.map(function (s) { return "<tr><td>" + esc(labelRef(p, s.a)) + "</td><td>" + esc(labelRef(p, s.b)) + "</td><td>" + s.cable + "</td><td>" + PLANES[s.plane] + "</td><td>" + nf((s.len + 2 * END_RESERVE) / 100) + "</td></tr>"; }).join("") + "</table>";
    });
    step("cable", "Прокладай кабель група за групою",
      "<p>Кожну лінію — цілим шматком без з'єднань у штробі. На обох кінцях лиши ~15–20 см і одразу підпиши номер групи маркером або біркою. Довжини нижче вже з цим запасом.</p>" + runs, [["r1", "l6"]]);

    var tt = "";
    p.points.filter(function (t) { return KINDS[t.kind].cat === "light" && (t.ctl || []).length >= 2; }).forEach(function (t) {
      var key = (t.ctl || []).map(function (c) { return c.sw; }).join(",");
      if (tt.indexOf("data-k='" + key + "'") >= 0) return;
      var tb = truthTable(p, t);
      if (!tb) return;
      tt += "<div data-k='" + key + "'><p><b>" + esc(labelRef(p, t.id)) + "</b> — " + (tb.ok ? "схема перевірена розрахунком ✓" : "схема не працює ✗") + "</p><table><tr>" + tb.names.map(function (n, i) { return "<th>S" + (i + 1) + "</th>"; }).join("") + "<th>Світло</th></tr>" +
        tb.rows.map(function (r) { return "<tr>" + r.states.map(function (s) { return "<td>" + (s + 1) + "</td>"; }).join("") + "<td>" + (r.lit ? "горить" : "—") + "</td></tr>"; }).join("") + "</table><p class='muted'>" + tb.names.map(function (n, i) { return "S" + (i + 1) + " — " + esc(n); }).join("; ") + "</p></div>";
    });
    step("boxes-wire", "З'єднання в розподільчих коробках",
      "<ul><li>Колір жил: коричневий (або інший, крім синього і жовто-зеленого) — фаза L, синій — нуль N, жовто-зелений — PE. Жовто-зелений ніколи не використовуй як фазу чи нуль.</li>" +
      "<li>Вимикач розриває <b>фазу</b>: до вимикача приходить L, від вимикача до світильника — L'. Нуль і PE йдуть від коробки до світильника напряму.</li>" +
      "<li>Прохідні: фаза — на загальний вивід першого, два «перекидні» провідники між вимикачами (через перехресні, якщо є), від загального виводу другого — до світильника.</li>" +
      "<li>З'єднання — клемами WAGO або гільзами під опресування, без скруток.</li></ul>" + tt, [["m07", "l1"], ["m07", "l2"], ["m06", "l2"]]);

    step("test", "Прозвонка і вимір ізоляції до закриття штроб",
      "<ul><li>Прозвони кожну лінію: жили не перебиті, маркування збігається з кінцями.</li><li>Мегаомметром виміряй опір ізоляції між L–N, L–PE, N–PE кожного кабелю (від'єднаними від усього). Мінімальна вимога, як правило, 0,5 МОм; на новому кабелі зазвичай сотні МОм — менше означає пошкодження.</li>" +
      "<li><b>Сфотографуй усі стіни з трасами і рулеткою</b> до штукатурки — це твоя виконавча схема на майбутнє.</li></ul>", [["m05", "l3"], ["r2", "l4"]]);

    step("plaster", "Закрий штроби",
      "<p>Кабель закріпи гіпсом/алебастром «маяками» кожні 30–50 см, потім закрий штробу повністю. Кінці в підрозетниках сховай, щоб їх не заштукатурили.</p>", [["r1", "l6"]]);

    var rowsH = pn.rows.map(function (row, i) {
      return "<tr><td>Ряд " + (i + 1) + "</td><td>" + row.map(function (d) { return "<b>" + d.tag + "</b> " + esc(d.spec); }).join(" · ") + "</td></tr>";
    }).join("");
    step("panel", "Збери щит",
      "<p>Корпус " + pn.enclosure + " модулів, апарати займають " + pn.modules + " модулів. Порядок на DIN-рейках:</p><table>" + rowsH + "</table>" +
      "<ul><li>Під кожне ПЗВ — своя шина N: нулі груп під ПЗВ підключаються тільки до N після цього ПЗВ.</li><li>PE — на загальну шину PE, не через ПЗВ.</li><li>Гнучкі перемички — з наконечниками НШВИ; момент затягування — за паспортом апарата.</li><li>Підпиши кожен автомат: номер групи і що живить.</li></ul>", [["r2", "l1"], ["m08", "l5"]]);

    step("connect", "Підключення вводу",
      "<div class='warn'>Підключення ввідного кабелю до мережі будинку — тільки оператор системи розподілу або уповноважена особа. Перед цим усі автомати в щиті вимкнені.</div>", [["r2", "l1"]]);

    step("finish", "Чистовий монтаж після оздоблення",
      "<ul><li>Розетки: L і N — на робочі клеми, PE — на заземлювальний контакт. Двері, що відчиняються, не мають перекривати вимикач.</li><li>Вимикачі: L — на вхідну клему, L' — на вихід.</li><li>Світильники: металеві корпуси — з PE. LED-стрічка — через блок живлення в доступному місці.</li><li>Техніка: варильна поверхня — на окрему лінію 3×6, бойлер — через вивід кабелю.</li></ul>", [["r2", "l3"], ["m06", "l4"]]);

    var checks = p.groups.map(function (g) {
      return "<li>Гр." + gn[g.id] + " " + esc(g.name) + ": " + (g.prot === "none" ? "напруга на всіх точках" : "напруга на всіх точках, кнопка ТЕСТ на " + (g.prot === "rcbo" ? "дифавтоматі" : "ПЗВ") + " вимикає лінію") + (g.kind === "light" ? ", кожен вимикач вмикає своє світло і розриває фазу (перевір покажчиком на патроні при вимкненому світлі)" : ", тестер розеток показує правильну полярність і наявність PE") + ".</li>";
    }).join("");
    step("final", "Перевір і здай мережу", "<ol>" + checks + "</ol><p>Збережи фото трас, схему щита і цей план — вони знадобляться при ремонті і для наступних власників.</p>", [["r2", "l4"], ["r2", "l5"]]);
    return S;
  }

  // ---------- серіалізація ----------
  function normalize(p) {
    var b = blank(), noFurn = p.furn == null;
    Object.keys(b).forEach(function (k) { if (p[k] == null) p[k] = b[k]; });
    var max = 0;
    if (noFurn && api.homeFurn) api.homeFurn(p);
    ["rooms", "openings", "points", "groups", "rcds", "furn"].forEach(function (k) { p[k].forEach(function (x) { var n = parseInt(String(x.id).replace(/\D/g, ""), 10); if (n > max) max = n; }); });
    p.seq = Math.max(p.seq || 0, max);
    return p;
  }

  var api = {
    WALLS: WALLS, WALL_NAME: WALL_NAME, ROOM_TYPES: ROOM_TYPES, KINDS: KINDS, PLANES: PLANES, GROUP_KINDS: GROUP_KINDS, SECTIONS: SECTIONS, BREAKERS: BREAKERS,
    CABLE_MAX: CABLE_MAX, ZONE_TOP: ZONE_TOP, ZONE_BOT: ZONE_BOT,
    FURN: FURN, addFurn: addFurn, furnAt: furnAt,
    blank: blank, template: template, parseDescription: parseDescription, autoPlace: autoPlace, normalize: normalize,
    addRoom: addRoom, addOpening: addOpening, addPoint: addPoint, addGroup: addGroup, addRcd: addRcd,
    wallLen: wallLen, wallXY: wallXY, nearestWall: nearestWall, roomAt: roomAt, openingsOn: openingsOn, shared: shared, byId: byId,
    routes: routes, issues: issues, panel: panel, spec: spec, steps: steps, truthTable: truthTable, labelRef: labelRef, tagOf: tagOf, endpoint: endpoint, cableName: cableName, nf: nf
  };
  window.PLAN = api;
})();
