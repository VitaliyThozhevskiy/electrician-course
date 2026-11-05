/* Планувальник: що з чим з'єднувати — жили кабелів, клеми WAGO в коробках, клеми механізмів і щита.
   Кольори — типові для ВВГнг: 3 жили — коричнева, синя, жовто-зелена; 5 жил — коричнева, чорна, сіра, синя, жовто-зелена. */
(function () {
  "use strict";
  var P = window.PLAN;
  var C = { br: "коричнева", bk: "чорна", gr: "сіра", bl: "синя", yg: "жовто-зелена" };
  var HEX = { br: "#8b4a1c", bk: "#222", gr: "#8a8a8a", bl: "#1f6fd1", yg: "#7ba51a" };

  // жили сегмента: [{f: функція, c: колір, use: true/false, mark: "..."}]
  function cores(p, s) {
    var t = s.role, b = P.byId(p.points, s.b);
    if (t === "feed") return [{ f: "L", c: "br" }, { f: "N", c: "bl" }, { f: "PE", c: "yg" }];
    if (t === "light") {
      var lines = lightLines(p, b);
      if (lines.length <= 1) return [{ f: "L'", c: "br", line: lines[0] }, { f: "N", c: "bl" }, { f: "PE", c: "yg" }];
      return [{ f: "L1'", c: "br", line: lines[0] }, { f: "L2'", c: "bk", line: lines[1] }, { f: "N", c: "bl" }, { f: "PE", c: "yg" }, { f: "резерв", c: "gr", use: false }];
    }
    if (t === "switch") {
      if (b.kind === "sw1") return [{ f: "L", c: "br" }, { f: "L'", c: "bl", mark: "познач коричневою ізоляцією на обох кінцях — це фаза" }, { f: "PE", c: "yg", use: false }];
      if (b.kind === "sw2") return [{ f: "L", c: "br" }, { f: "L1'", c: "bk" }, { f: "L2'", c: "gr" }, { f: "—", c: "bl", use: false }, { f: "PE", c: "yg", use: false }];
      if (b.kind === "pass") return [{ f: "COM", c: "br" }, { f: "T1", c: "bk" }, { f: "T2", c: "gr" }, { f: "—", c: "bl", use: false }, { f: "PE", c: "yg", use: false }];
      if (b.kind === "cross") return [{ f: "IN1", c: "bk" }, { f: "IN2", c: "gr" }, { f: "OUT1", c: "br" }, { f: "OUT2", c: "bl", mark: "познач ізоляцією — тут не нуль" }, { f: "PE", c: "yg", use: false }];
    }
    return [];
  }
  // комутовані лінії, що живлять світильник: [{sw, key}] або [{multi: [ids]}]
  function lightLines(p, l) {
    var ctl = (l && l.ctl) || [];
    if (ctl.length >= 2 && ctl.every(function (c) { var s = P.byId(p.points, c.sw); return s && (s.kind === "pass" || s.kind === "cross"); }))
      return [{ multi: ctl.map(function (c) { return c.sw; }) }];
    var seen = {}, out = [];
    ctl.forEach(function (c) { var k = c.sw + ":" + c.key; if (!seen[k]) { seen[k] = 1; out.push({ sw: c.sw, key: c.key }); } });
    return out.length ? out : [null];
  }
  function sameLine(a, b) {
    if (!a || !b) return false;
    if (a.multi || b.multi) return !!(a.multi && b.multi) && a.multi.slice().sort().join() === b.multi.slice().sort().join();
    return a.sw === b.sw && a.key === b.key;
  }
  function who(p, s, here) { return P.labelRef(p, s.a === here ? s.b : s.a); }
  function wire(p, s, here, core) { return { from: who(p, s, here), cable: s.cable, core: core.f, color: core.c, mark: core.mark }; }

  function connections(p, segs) {
    segs = segs || P.routes(p);
    var boxes = [], pts = {}, panel = [];
    function at(id) { return { inc: segs.filter(function (s) { return s.b === id; }), out: segs.filter(function (s) { return s.a === id; }) }; }
    function core(p2, s, f) { return cores(p2, s).filter(function (c) { return c.f === f; })[0]; }

    p.points.filter(function (t) { return t.kind === "jbox"; }).forEach(function (b) {
      var x = at(b.id), joins = [], unused = [];
      var feeds = x.inc.concat(x.out.filter(function (s) { return s.role === "feed"; }));
      var lights = x.out.filter(function (s) { return s.role === "light"; }), sws = x.out.filter(function (s) { return s.role === "switch"; });
      function J(title, list, note) { list = list.filter(Boolean); if (list.length) joins.push({ title: title, wires: list, wago: list.length, note: note }); }
      J("N — нуль", feeds.map(function (s) { return wire(p, s, b.id, core(p, s, "N")); }).concat(lights.map(function (s) { return wire(p, s, b.id, core(p, s, "N")); })));
      J("PE — захисний провідник", feeds.map(function (s) { return wire(p, s, b.id, core(p, s, "PE")); }).concat(lights.map(function (s) { return wire(p, s, b.id, core(p, s, "PE")); })));
      var Lw = feeds.map(function (s) { return wire(p, s, b.id, core(p, s, "L")); });
      sws.forEach(function (s) {
        var sp = P.byId(p.points, s.b);
        if (sp.kind === "sw1" || sp.kind === "sw2") Lw.push(wire(p, s, b.id, core(p, s, "L")));
      });
      // перші прохідні в кожному наборі отримують фазу на COM
      var multiSets = {};
      lights.forEach(function (s) {
        lightLines(p, P.byId(p.points, s.b)).forEach(function (ln) { if (ln && ln.multi) multiSets[ln.multi.slice().sort().join()] = ln.multi; });
      });
      Object.keys(multiSets).forEach(function (k) {
        var ids = multiSets[k], pass = ids.filter(function (id) { var t = P.byId(p.points, id); return t && t.kind === "pass"; });
        var sA = sws.filter(function (s) { return s.b === pass[0]; })[0];
        if (sA) Lw.push(wire(p, sA, b.id, core(p, sA, "COM")));
      });
      J("L — фаза", Lw, "фаза від щита йде далі тільки на вимикачі — не на світильники");
      // звичайні вимикачі: L' клавіші → світильники
      sws.forEach(function (s) {
        var sp = P.byId(p.points, s.b);
        if (sp.kind !== "sw1" && sp.kind !== "sw2") return;
        for (var k = 1; k <= P.KINDS[sp.kind].keys; k++) {
          var f = sp.kind === "sw1" ? "L'" : "L" + k + "'", list = [wire(p, s, b.id, core(p, s, f))];
          lights.forEach(function (ls) {
            cores(p, ls).forEach(function (c) { if (c.line && sameLine(c.line, { sw: sp.id, key: k })) list.push(wire(p, ls, b.id, c)); });
          });
          if (list.length > 1) J((sp.kind === "sw2" ? "Клавіша " + k : "Вимкнена фаза") + " — " + P.labelRef(p, sp.id), list, "вимикач розриває фазу: на світильник іде L'");
          else unused.push(P.labelRef(p, sp.id) + ": жила " + f + " нікуди не йде — до клавіші не прив'язано світильник");
        }
      });
      // прохідні / перехресні: ланцюжок перекидних провідників
      Object.keys(multiSets).forEach(function (k) {
        var ids = multiSets[k];
        var pass = ids.filter(function (id) { return P.byId(p.points, id).kind === "pass"; }), cross = ids.filter(function (id) { return P.byId(p.points, id).kind === "cross"; });
        if (pass.length !== 2) return;
        var seg = function (id) { return sws.filter(function (s) { return s.b === id; })[0]; };
        var chain = [pass[0]].concat(cross, [pass[1]]);
        for (var i = 0; i < chain.length - 1; i++) {
          var a = seg(chain[i]), c = seg(chain[i + 1]);
          if (!a || !c) continue;
          var aIsPass = i === 0, cIsPass = i + 1 === chain.length - 1;
          var a1 = aIsPass ? "T1" : "OUT1", a2 = aIsPass ? "T2" : "OUT2", c1 = cIsPass ? "T1" : "IN1", c2 = cIsPass ? "T2" : "IN2";
          J("Перекидний 1: " + P.labelRef(p, chain[i]) + " → " + P.labelRef(p, chain[i + 1]), [wire(p, a, b.id, core(p, a, a1)), wire(p, c, b.id, core(p, c, c1))]);
          J("Перекидний 2: " + P.labelRef(p, chain[i]) + " → " + P.labelRef(p, chain[i + 1]), [wire(p, a, b.id, core(p, a, a2)), wire(p, c, b.id, core(p, c, c2))]);
        }
        var last = seg(pass[1]);
        if (last) {
          var list = [wire(p, last, b.id, core(p, last, "COM"))];
          lights.forEach(function (ls) { cores(p, ls).forEach(function (c) { if (c.line && c.line.multi && sameLine(c.line, { multi: ids })) list.push(wire(p, ls, b.id, c)); }); });
          J("Вимкнена фаза з другого прохідного → світильники", list, "COM першого прохідного — на фазу L, COM другого — на світильник");
        }
      });
      segs.forEach(function (s) {
        if (s.a !== b.id && s.b !== b.id) return;
        cores(p, s).forEach(function (c) { if (c.use === false) unused.push("Кабель " + s.cable + " (" + who(p, s, b.id) + "): " + C[c.c] + " жила не використовується — заізолюй і загни в коробці"); });
      });
      boxes.push({ id: b.id, label: P.labelRef(p, b.id), joins: joins, unused: unused });
    });

    p.points.forEach(function (t) {
      if (t.kind === "jbox") return;
      var x = at(t.id), K = P.KINDS[t.kind], lines = [];
      var cab = x.inc.concat(x.out);
      if (!cab.length) { pts[t.id] = ["Точка не під'єднана — признач їй групу."]; return; }
      if (K.cat === "switch") {
        var s = x.inc[0], cs = cores(p, s);
        var term = { sw1: { "L": "вхідна клема L", "L'": "вихідна клема (1 або ↓)" }, sw2: { "L": "загальна клема L", "L1'": "клема 1 (перша клавіша)", "L2'": "клема 2 (друга клавіша)" },
          pass: { COM: "загальна клема COM (L)", T1: "перекидна клема 1", T2: "перекидна клема 2" }, cross: { IN1: "вхідна пара — клема 1", IN2: "вхідна пара — клема 2", OUT1: "вихідна пара — клема 1", OUT2: "вихідна пара — клема 2" } }[t.kind];
        cs.forEach(function (c) { lines.push({ color: c.c, text: c.use === false ? C[c.c] + " — не використовується, заізолюй" : C[c.c] + " (" + c.f + ") → " + term[c.f] + (c.mark ? "; " + c.mark : "") }); });
      } else if (K.cat === "light") {
        var inc = x.inc[0], cl = cores(p, inc);
        cl.forEach(function (c) { if (c.use === false) return; lines.push({ color: c.c, text: C[c.c] + " (" + c.f + ") → " + (c.f === "N" ? "клема N" : c.f === "PE" ? "клема заземлення ⏚ / корпус" : c.f === "L1'" ? "лінія L1 (перша група ламп)" : c.f === "L2'" ? "лінія L2 (друга група ламп)" : "клема L") }); });
        if (x.out.length) lines.push({ text: "Далі ланцюг до «" + who(p, x.out[0], t.id) + "»: кожну жилу вхідного і вихідного кабелю з'єднай WAGO на 3 (вхід + вихід + відвід на світильник)." });
        if (t.kind === "led") lines.push({ text: "230 В — на вхід блока живлення; стрічка — на вихід 12/24 В з дотриманням + і −. Блок — у доступному місці." });
      } else {
        if (cab.length >= 2) lines.push({ text: "Тут два кабелі (вхід і вихід на наступну розетку). Кожну жилу з'єднай «косичкою»: WAGO на 3 — вхід + вихід + короткий відвід на механізм. Не передавай живлення через клеми самої розетки." });
        [{ c: "br", f: "L", d: "робоча клема (будь-яка з двох)" }, { c: "bl", f: "N", d: "друга робоча клема" }, { c: "yg", f: "PE", d: "заземлювальні вуса / клема ⏚" }].forEach(function (c) { lines.push({ color: c.c, text: C[c.c] + " (" + c.f + ") → " + (t.kind === "outlet" ? "клемник приладу / виводу кабелю, " + c.f : c.d) }); });
      }
      pts[t.id] = lines;
    });

    var pn = P.panel(p);
    pn.devices.forEach(function (d) {
      if (!d.group) return;
      var g = P.byId(p.groups, d.group);
      var nBus = d.under ? "шина N після ПЗВ " + d.under : d.tag.indexOf("QFD") === 0 ? "вихідна клема N дифавтомата " + d.tag : "загальна шина N (після ввідного, не під ПЗВ)";
      panel.push({ tag: d.tag, group: g.name, lines: [
        { color: "br", text: "коричнева (L) → нижня (вихідна) клема " + d.tag },
        { color: "bl", text: "синя (N) → " + nBus },
        { color: "yg", text: "жовто-зелена (PE) → шина PE" }] });
    });
    return { boxes: boxes, points: pts, panel: panel, colors: C, hex: HEX };
  }

  P.cores = cores;
  P.connections = connections;
  P.COLORS = C; P.COLOR_HEX = HEX;
})();
