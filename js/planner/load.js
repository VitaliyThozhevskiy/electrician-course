/* Планувальник: навантаження груп, падіння напруги, каталог приладів, кондиціонер. */
(function () {
  "use strict";
  var P = window.PLAN, RHO = 0.0175, U = 230;

  // типова споживана потужність; для точного розрахунку бери паспорт приладу
  var DEVICES = [
    { id: "", name: "— без конкретного приладу —", P: 0 },
    { id: "kettle", name: "Електрочайник", P: 2000, h: 110 },
    { id: "micro", name: "Мікрохвильовка", P: 1200, h: 110 },
    { id: "coffee", name: "Кавоварка", P: 1300, h: 110 },
    { id: "fridge", name: "Холодильник", P: 200, h: 30 },
    { id: "dish", name: "Посудомийна машина", P: 2000, h: 30 },
    { id: "wash", name: "Пральна машина", P: 2200, h: 100 },
    { id: "dryer", name: "Сушильна машина", P: 2500, h: 100 },
    { id: "oven", name: "Духова шафа", P: 3500, h: 30 },
    { id: "hob", name: "Варильна поверхня (індукція)", P: 7000, h: 60, outlet: true },
    { id: "boiler", name: "Бойлер", P: 2000, h: 180, outlet: true },
    { id: "iron", name: "Праска", P: 2200, h: 90 },
    { id: "vac", name: "Пилосос", P: 1500, h: 30 },
    { id: "heater", name: "Обігрівач", P: 2000, h: 30 },
    { id: "floor", name: "Тепла підлога (терморегулятор)", P: 1500, h: 90, outlet: true },
    { id: "tv", name: "Телевізор + приставка", P: 200, h: 110 },
    { id: "pc", name: "Комп'ютер + монітор", P: 500, h: 30 },
    { id: "hair", name: "Фен", P: 1800, h: 110 },
    { id: "towel", name: "Рушникосушка", P: 400, h: 60, outlet: true },
    { id: "hood", name: "Витяжка", P: 200, h: 210 },
    { id: "ac7", name: "Кондиціонер «07» (~2,0 кВт холоду)", P: 700, h: -30, outlet: true, ac: true },
    { id: "ac9", name: "Кондиціонер «09» (~2,6 кВт холоду)", P: 850, h: -30, outlet: true, ac: true },
    { id: "ac12", name: "Кондиціонер «12» (~3,5 кВт холоду)", P: 1100, h: -30, outlet: true, ac: true },
    { id: "ac18", name: "Кондиціонер «18» (~5,3 кВт холоду)", P: 1700, h: -30, outlet: true, ac: true },
    { id: "ac24", name: "Кондиціонер «24» (~7 кВт холоду)", P: 2300, h: -30, outlet: true, ac: true }
  ];
  function device(id) { for (var i = 0; i < DEVICES.length; i++) if (DEVICES[i].id === id) return DEVICES[i]; return null; }
  // площа кімнати → орієнтовний типорозмір кондиціонера (~100 Вт холоду на м² при стелі до ~2,8 м)
  function acFor(room) {
    var kw = room.w * room.h / 10000 * 0.1;
    return kw <= 2.1 ? "ac7" : kw <= 2.7 ? "ac9" : kw <= 3.6 ? "ac12" : kw <= 5.4 ? "ac18" : "ac24";
  }

  // навантаження груп
  function load(p, segs) {
    segs = segs || P.routes(p);
    return p.groups.map(function (g) {
      var pts = p.points.filter(function (t) { return t.group === g.id; });
      var Ptot = pts.reduce(function (s, t) { return s + (t.power || 0); }, 0);
      var I = Ptot / U, pct = g.In ? I / g.In : 0;
      // відстань по кабелю від щита до кожної точки (дерево трас)
      var gs = segs.filter(function (s) { return s.group === g.id; }), dist = { panel: 0 }, changed = true, guard = 0;
      while (changed && guard++ < 200) { changed = false; gs.forEach(function (s) { if (dist[s.a] != null && dist[s.b] == null) { dist[s.b] = dist[s.a] + s.len; changed = true; } }); }
      var far = 0, farId = null; Object.keys(dist).forEach(function (k) { if (k !== "panel" && dist[k] > far) { far = dist[k]; farId = k; } });
      var L = far / 100, dU = 2 * I * L * RHO / g.sec, dUpct = dU / U * 100;
      var maxI = P.CABLE_MAX[g.sec] || 0;
      var biggest = pts.reduce(function (m, t) { return (t.power || 0) > m ? t.power : m; }, 0);
      return { g: g, pts: pts, P: Ptot, I: I, pct: pct, L: L, far: farId, dU: dU, dUpct: dUpct, maxI: maxI, biggest: biggest,
        lights: pts.filter(function (t) { return P.KINDS[t.kind].cat === "light"; }).length };
    });
  }
  // підбір автомата і перерізу під потужність окремої лінії
  function suggest(Pw) {
    var I = Pw / U, In = [10, 16, 20, 25, 32, 40].filter(function (b) { return b >= I * 1.05; })[0] || 40;
    var sec = In <= 10 ? 1.5 : In <= 16 ? 2.5 : In <= 25 ? 4 : In <= 32 ? 6 : 10;
    if (In === 20) { In = 25; sec = 4; }
    return { I: I, In: In, sec: sec };
  }
  // додати кондиціонер у кімнату: вивід під стелею + окрема лінія
  function addAC(p, room, devId) {
    var d = device(devId || acFor(room)), wall = "N", best = -1;
    P.WALLS.forEach(function (w) { var L = P.wallLen(room, w), free = !P.openingsOn(p, room, w).some(function (o) { return o.kind === "door"; }); if (free && L > best) { best = L; wall = w; } });
    var pos = Math.min(40, P.wallLen(room, wall) / 4);
    // типово — окрема лінія 3×2,5 з C16; для великих моделей — за розрахунком
    var s = d.P * 1.3 > 230 * 16 ? suggest(d.P * 1.3) : { In: 16, sec: 2.5 };
    var g = P.addGroup(p, { name: "Кондиціонер — " + room.name, kind: "power", In: s.In, sec: s.sec, prot: "rcbo", dI: 30 });
    var t = P.addPoint(p, "outlet", room, { wall: wall, pos: pos, h: p.ceilH - 30, group: g.id, power: d.P, label: d.name.replace(/ \(.*/, "") });
    t.device = d.id;
    return t;
  }

  // додаткові перевірки навантаження — дописуються до P.issues
  var baseIssues = P.issues;
  P.issues = function (p, segs) {
    var out = baseIssues(p, segs);
    load(p, segs).forEach(function (x) {
      if (x.P > 0 && x.dUpct > 5) out.push({ lvl: "warn", msg: "«" + x.g.name + "»: при повному навантаженні падіння напруги до найдальшої точки ≈ " + P.nf(x.dUpct, 1) + " % (" + P.nf(x.L, 1) + " м кабелю " + String(x.g.sec).replace(".", ",") + " мм²). Зазвичай намагаються вкластися в кілька відсотків — розглянь більший переріз або коротшу трасу.", ref: x.g.id, hint: "load" });
      var acs = x.pts.filter(function (t) { var d = device(t.device); return d && d.ac; });
      if (acs.length && x.pts.length > acs.length) out.push({ lvl: "warn", msg: "«" + x.g.name + "»: кондиціонер у спільній групі з іншими точками — зазвичай під нього роблять окрему лінію.", ref: acs[0].id, hint: "ac" });
    });
    return out;
  };

  var baseSteps = P.steps;
  P.steps = function (p) {
    var st = baseSteps(p), L = load(p), rows = L.filter(function (x) { return x.pts.length; }).map(function (x) {
      return "<tr><td>" + x.g.name.replace(/[<>&]/g, "") + "</td><td>" + P.nf(x.P / 1000, 2) + " кВт</td><td>" + P.nf(x.I, 1) + " А</td><td>" + x.g.curve + x.g.In + " (" + Math.round(x.pct * 100) + " %)</td><td>" + P.nf(x.dUpct, 1) + " %</td></tr>";
    }).join("");
    var i = st.findIndex(function (s) { return s.id === "project"; });
    st.splice(i + 1, 0, { id: "load", title: "Перевір навантаження груп",
      html: "<p>Для кожної групи: сумарна потужність приладів, струм I = P / 230, завантаження автомата і падіння напруги до найдальшої точки (ΔU = 2·I·L·0,0175 / S). Якщо завантаження понад 100 % — прилади не можна вмикати одночасно, групу ділять.</p><table><tr><th>Група</th><th>P</th><th>I</th><th>Автомат</th><th>ΔU</th></tr>" + rows + "</table><p>Потужність бери з паспорта приладу (табличка ззаду). Для кондиціонера — <b>споживана</b> електрична потужність, а не холодопродуктивність.</p>",
      lessons: [["r1", "l3"], ["m08", "l4"]] });
    return st;
  };

  P.DEVICES = DEVICES; P.device = device; P.acFor = acFor; P.load = load; P.suggest = suggest; P.addAC = addAC;
})();
