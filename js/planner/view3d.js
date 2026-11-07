/* Планувальник: 3D-вид без бібліотек — стіни, точки на своїй висоті, кабелі з вертикальними спусками.
   Два режими: «уся квартира» (обертання навколо) і «зсередини кімнати» (стоїш у центрі й крутиш головою).
   Тягни — обертати, колесо / два пальці — масштаб, Shift або права кнопка — зсув, клік по точці — вибрати. */
(function () {
  "use strict";
  var P = window.PLAN;
  var cams = {}; // кут камери для кожного режиму/кімнати зберігається між перемальовуваннями

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function view3d(canvas, scene, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1, W = 0, H = 0;
    var b = scene.bounds, C = scene.ceilH, inside = !!scene.eye, NEAR = inside ? 8 : 20;
    function fresh() {
      return inside ? { yaw: scene.eye.yaw || 0, pitch: -0.3, zoom: 1, eye: scene.eye.p.slice() }
        : { yaw: -0.6, pitch: 0.95, dist: 1.7 * Math.max(b.w, b.h), cx: b.x + b.w / 2, cy: b.y + b.h / 2, zoom: 1 };
    }
    var cam = cams[scene.key] || (cams[scene.key] = fresh());
    var proj2 = [], segHits = [];

    function size() {
      var r = canvas.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // світові координати: x, −y (план — y донизу), z угору
    var E, F, R, U, FOC;
    function setup() {
      var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      F = [sy * cp, cy * cp, -sp]; R = [cy, -sy, 0]; U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
      if (inside) { E = [cam.eye[0], -cam.eye[1], cam.eye[2]]; FOC = Math.min(W, H * 1.4) * 0.42 * cam.zoom; }
      else { var T = [cam.cx, -cam.cy, C / 2]; E = [T[0] - F[0] * cam.dist, T[1] - F[1] * cam.dist, T[2] - F[2] * cam.dist]; FOC = Math.min(W, H) / (Math.max(b.w, b.h) * 1.15) * cam.dist * cam.zoom; }
    }
    function toCam(p) { var v = sub([p[0], -p[1], p[2]], E); return [dot(v, R), -dot(v, U), dot(v, F)]; }
    function scr(c) { return [W / 2 + c[0] * FOC / c[2], H / 2 + c[1] * FOC / c[2], c[2]]; }
    function cut(a, c) { var t = (NEAR - a[2]) / (c[2] - a[2]); return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, NEAR]; }
    function clipPoly(pts) {
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], c = pts[(i + 1) % pts.length], ai = a[2] >= NEAR, ci = c[2] >= NEAR;
        if (ai) out.push(a);
        if (ai !== ci) out.push(cut(a, c));
      }
      return out;
    }
    function clipLine(pts) { // → масив шматків полілінії перед камерою
      var parts = [], cur = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i];
        if (i > 0) {
          var pv = pts[i - 1], pin = pv[2] >= NEAR, ain = a[2] >= NEAR;
          if (pin && !ain) { cur.push(cut(pv, a)); parts.push(cur); cur = []; }
          else if (!pin && ain) { cur = [cut(pv, a)]; }
        }
        if (a[2] >= NEAR) cur.push(a);
      }
      if (cur.length > 1) parts.push(cur);
      return parts.filter(function (x) { return x.length > 1; });
    }
    function offs(q, o) { // зсув полілінії на екрані перпендикулярно до напрямку
      return q.map(function (p, i) {
        var a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        return [p[0] - dy / L * o, p[1] + dx / L * o];
      });
    }
    function path(q, close) { ctx.beginPath(); q.forEach(function (x, i) { if (i) ctx.lineTo(x[0], x[1]); else ctx.moveTo(x[0], x[1]); }); if (close) ctx.closePath(); }
    function render() {
      setup();
      var st = getComputedStyle(canvas), fg = st.getPropertyValue("--text").trim() || "#ddd", bg = st.getPropertyValue("--bg").trim() || "#111";
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      var polys = scene.polys.map(function (pg) {
        var c = clipPoly(pg.pts.map(toCam)); if (c.length < 3) return null;
        return { q: c.map(scr), d: c.reduce(function (s, x) { return s + x[2]; }, 0) / c.length, pg: pg };
      }).filter(Boolean).sort(function (a, b) { return b.d - a.d; });
      polys.forEach(function (o) {
        path(o.q, true);
        if (o.pg.fill) { ctx.globalAlpha = o.pg.alpha == null ? 1 : o.pg.alpha; ctx.fillStyle = o.pg.fill; ctx.fill(); }
        if (o.pg.stroke) { ctx.globalAlpha = o.pg.salpha == null ? 0.5 : o.pg.salpha; ctx.strokeStyle = o.pg.stroke === "fg" ? fg : o.pg.stroke; ctx.lineWidth = o.pg.lw || 1; ctx.stroke(); }
      });
      ctx.globalAlpha = 1; ctx.lineCap = "round"; ctx.lineJoin = "round"; segHits = [];
      scene.lines.forEach(function (l) {
        clipLine(l.pts.map(toCam)).forEach(function (part) {
          var q = part.map(scr);
          if (l.key) segHits.push({ q: q, key: l.key });
          if (l.cores) { // кабель «у розрізі»: кожна жила своїм кольором
            var n = l.cores.length, cw = inside ? 2.6 : 2.1, A0 = l.alpha == null ? 1 : l.alpha;
            ctx.setLineDash([]); path(q); ctx.globalAlpha = A0; ctx.strokeStyle = "#1b1f25"; ctx.lineWidth = n * cw + 4; ctx.stroke();
            l.cores.forEach(function (c, i) { path(offs(q, (i - (n - 1) / 2) * cw)); ctx.strokeStyle = c; ctx.lineWidth = cw - 0.4; ctx.stroke(); });
            return;
          }
          if (l.casing) { path(q); ctx.globalAlpha = (l.alpha == null ? 1 : l.alpha) * 0.8; ctx.strokeStyle = bg; ctx.lineWidth = (l.w || 2) + 3; ctx.setLineDash([]); ctx.stroke(); }
          path(q); ctx.globalAlpha = l.alpha == null ? 1 : l.alpha; ctx.strokeStyle = l.color === "fg" ? fg : l.color; ctx.lineWidth = l.w || 2; ctx.setLineDash(l.dash || []); ctx.stroke();
        });
      });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      proj2 = scene.dots.map(function (d) { var c = toCam(d.p); return c[2] >= NEAR ? { q: scr(c), d: d } : null; }).filter(Boolean).sort(function (a, b) { return b.q[2] - a.q[2]; });
      var selBox = null;
      proj2.forEach(function (o) {
        var d = o.d, r = d.r || 5, x = o.q[0], y = o.q[1];
        if (inside) r = Math.max(4, Math.min(14, r * 300 / o.q[2] * 1.6));
        ctx.globalAlpha = d.alpha == null ? 1 : d.alpha;
        if (d.glow) { ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 7); ctx.fillStyle = "rgba(255,213,74,.35)"; ctx.fill(); }
        ctx.beginPath(); if (d.shape === "sq") ctx.rect(x - r, y - r, 2 * r, 2 * r); else ctx.arc(x, y, r, 0, 7);
        ctx.fillStyle = d.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = bg; ctx.stroke();
        if (d.sel) { ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.strokeStyle = "#ff8c3c"; ctx.lineWidth = 2.5; ctx.stroke(); }
        if (d.sel && d.coord) { selBox = { d: d, x: x, y: y, r: r }; }
        else if (d.tag && (inside || scene.focus || d.sel)) { ctx.globalAlpha = 0.85; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = fg; ctx.fillText(d.tag, x + r + 3, y - r); }
      });
      ctx.globalAlpha = 1;
      // підписи: кімнати, стіни, отвори з кількістю кабелів
      scene.labels.forEach(function (t) {
        var c = toCam(t.p); if (c[2] < NEAR) return; var q = scr(c);
        ctx.font = (t.big ? "700 13px" : t.small ? "600 10.5px" : "600 12px") + " system-ui, sans-serif"; ctx.textAlign = "center";
        if (t.pill) {
          var w = ctx.measureText(t.text).width + 12, hh = t.small ? 16 : 20;
          ctx.globalAlpha = t.alpha || 0.92; ctx.fillStyle = t.pill; ctx.beginPath(); ctx.rect(q[0] - w / 2, q[1] - hh / 2 - 1, w, hh); ctx.fill();
          if (t.border) { ctx.strokeStyle = t.border; ctx.lineWidth = 1.5; ctx.stroke(); }
          ctx.globalAlpha = 1; ctx.fillStyle = t.tcol || "#fff"; ctx.fillText(t.text, q[0], q[1] + (t.small ? 3 : 4));
        } else { ctx.globalAlpha = t.alpha || 0.7; ctx.fillStyle = t.color || fg; ctx.fillText(t.text, q[0], q[1]); }
      });
      if (selBox) { var d = selBox.d, x = selBox.x, y = selBox.y, r = selBox.r;
          ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "left";
          var t1 = d.tag || "", w1 = Math.max(ctx.measureText(t1).width, ctx.measureText(d.coord).width) + 14, bx = Math.min(x + r + 6, W - w1 - 4), by = Math.max(4, y - r - 36);
          ctx.globalAlpha = 0.93; ctx.fillStyle = "#1b1f25"; ctx.fillRect(bx, by, w1, 38); ctx.strokeStyle = "#ff8c3c"; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, w1, 38);
          ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.fillText(t1, bx + 7, by + 15); ctx.fillStyle = "#ffcf8a"; ctx.font = "12px system-ui, sans-serif"; ctx.fillText(d.coord, bx + 7, by + 31);
        }
      ctx.globalAlpha = 1;
    }
    var ptrs = {}, start = null, moved = false, pinch0 = 0;
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    canvas.addEventListener("pointerdown", function (e) {
      ptrs[e.pointerId] = [e.clientX, e.clientY]; try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      start = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; moved = false;
      var ids = Object.keys(ptrs); if (ids.length === 2) { var a = ptrs[ids[0]], c = ptrs[ids[1]]; pinch0 = Math.hypot(a[0] - c[0], a[1] - c[1]); }
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!ptrs[e.pointerId] || !start) return;
      var last = ptrs[e.pointerId], dx = e.clientX - last[0], dy = e.clientY - last[1];
      ptrs[e.pointerId] = [e.clientX, e.clientY];
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 4) moved = true;
      var ids = Object.keys(ptrs);
      if (ids.length === 2) { var a = ptrs[ids[0]], c = ptrs[ids[1]], d = Math.hypot(a[0] - c[0], a[1] - c[1]); if (pinch0) cam.zoom = Math.max(0.3, Math.min(8, cam.zoom * d / pinch0)); pinch0 = d; render(); return; }
      if (inside) {
        if (start.pan) { var k = 1.5, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw); var mx = -dx * cy + dy * sy, mY = dx * sy + dy * cy; cam.eye[0] += mx * k; cam.eye[1] -= mY * k; }
        else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch - dy * 0.006)); }
      } else if (start.pan) {
        var k2 = Math.max(b.w, b.h) / (Math.min(W, H) * cam.zoom), cy2 = Math.cos(cam.yaw), sy2 = Math.sin(cam.yaw), ps = Math.max(0.3, Math.sin(cam.pitch));
        var mx = -dx * k2, my = dy * k2 / ps;
        cam.cx += mx * cy2 + my * sy2; cam.cy += mx * sy2 - my * cy2;
      } else { cam.yaw += dx * 0.008; cam.pitch = Math.max(0.05, Math.min(1.5707, cam.pitch + dy * 0.008)); }
      render();
    });
    function up(e) {
      delete ptrs[e.pointerId];
      if (!Object.keys(ptrs).length) pinch0 = 0;
      if (start && !moved && opts.onPick) {
        var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 16;
        proj2.forEach(function (o) { var d = Math.hypot(o.q[0] - x, o.q[1] - y); if (d <= bd) { bd = d; best = o.d; } });
        var sk = null, sd = 7;
        if (!best) segHits.forEach(function (h) {
          for (var i = 0; i < h.q.length - 1; i++) {
            var a = h.q[i], c = h.q[i + 1], vx = c[0] - a[0], vy = c[1] - a[1], L2 = vx * vx + vy * vy, t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L2)) : 0;
            var d = Math.hypot(a[0] + vx * t - x, a[1] + vy * t - y); if (d < sd) { sd = d; sk = h.key; }
          }
        });
        opts.onPick(best ? best.id : null, sk);
      }
      start = null;
    }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; start = null; });
    canvas.addEventListener("wheel", function (e) { e.preventDefault(); cam.zoom = Math.max(0.3, Math.min(8, cam.zoom * (e.deltaY > 0 ? 0.88 : 1.14))); render(); }, { passive: false });
    window.addEventListener("resize", function () { if (canvas.isConnected) { size(); render(); } });
    size(); render();
    return {
      reset: function (top) { cam = cams[scene.key] = fresh(); if (top) { if (inside) cam.pitch = 1.45; else { cam.yaw = 0; cam.pitch = 1.5707; } } render(); },
      turn: function (yaw) { cam.yaw = yaw; cam.pitch = inside ? -0.1 : cam.pitch; render(); },
      render: render
    };
  }

  // сцена з проєкту. opt: { lanes, hk, colorOf(seg), dotOf(point), selId, room (зсередини), holes: [{x,y,text,color}] }
  function buildScene(p, segs, opt) {
    opt = opt || {};
    var C = p.ceilH, polys = [], lines = [], dots = [], labels = [], xs = [], ys = [], focus = opt.room ? P.byId(p.rooms, opt.room) : null;
    var WN = { N: "верхня", E: "права", S: "нижня", W: "ліва" };
    p.rooms.forEach(function (r) {
      xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h);
      var me = !focus || focus.id === r.id;
      if (focus && !me) return;
      polys.push({ pts: [[r.x, r.y, 0], [r.x + r.w, r.y, 0], [r.x + r.w, r.y + r.h, 0], [r.x, r.y + r.h, 0]], fill: r.type === "bath" || r.type === "wc" ? "#2b4a6b" : "#5a4632", alpha: focus ? 0.55 : 0.35, stroke: "fg", salpha: 0.5 });
      if (focus) polys.push({ pts: [[r.x, r.y, C], [r.x + r.w, r.y, C], [r.x + r.w, r.y + r.h, C], [r.x, r.y + r.h, C]], fill: "#ffffff", alpha: 0.04, stroke: "fg", salpha: 0.35 });
      ["N", "E", "S", "W"].forEach(function (w) {
        var L = P.wallLen(r, w), a = P.wallXY(r, w, 0), e = P.wallXY(r, w, L);
        polys.push({ pts: [[a[0], a[1], 0], [e[0], e[1], 0], [e[0], e[1], C], [a[0], a[1], C]], fill: "#9aa4b0", alpha: focus ? 0.13 : 0.07, stroke: "fg", salpha: focus ? 0.4 : 0.18 });
        P.openingsOn(p, r, w).forEach(function (o) {
          if (o.mirror && !focus) return;
          var q0 = P.wallXY(r, w, o.pos), q1 = P.wallXY(r, w, o.pos + o.width), z0 = o.sill || 0, z1 = z0 + (o.height || 200);
          lines.push({ pts: [[q0[0], q0[1], z0], [q0[0], q0[1], z1], [q1[0], q1[1], z1], [q1[0], q1[1], z0]].concat(o.kind === "window" ? [[q0[0], q0[1], z0]] : []), color: o.kind === "window" ? "#6fb0ff" : "#c9a36b", w: 2, alpha: 0.9 });
        });
        if (focus) { var m = P.wallXY(r, w, L / 2); labels.push({ p: [m[0], m[1], 30], text: WN[w] + " стіна", alpha: 0.55 }); }
      });
      if (!focus) labels.push({ p: [r.x + r.w / 2, r.y + r.h / 2, 0], text: r.name });
    });
    var bounds = { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys) }; bounds.w = Math.max.apply(null, xs) - bounds.x; bounds.h = Math.max.apply(null, ys) - bounds.y;
    function wxy(rid, w, pos) { var r = typeof rid === "object" ? rid : P.byId(p.rooms, rid); return r ? P.wallXY(r, w, pos) : [0, 0]; }
    // меблі — напівпрозорі коробки
    if (opt.furn !== false) (p.furn || []).forEach(function (f) {
      if (focus && !(f.x < focus.x + focus.w && f.x + f.w > focus.x && f.y < focus.y + focus.h && f.y + f.d > focus.y)) return;
      var K = (P.FURN && P.FURN[f.kind]) || {}, c = K.c || "#a58e6b", z0 = f.z || 0, z1 = z0 + (f.ht || 50), x0 = f.x, x1 = f.x + f.w, y0 = f.y, y1 = f.y + f.d, A = focus ? 0.5 : 0.4;
      polys.push({ pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], fill: c, alpha: A, stroke: "fg", salpha: 0.3 });
      [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]].forEach(function (e) {
        polys.push({ pts: [[e[0][0], e[0][1], z0], [e[1][0], e[1][1], z0], [e[1][0], e[1][1], z1], [e[0][0], e[0][1], z1]], fill: c, alpha: A * 0.75, stroke: "fg", salpha: 0.25 });
      });
      if (focus) labels.push({ p: [(x0 + x1) / 2, (y0 + y1) / 2, z1 + 3], text: f.name.split(",")[0], alpha: 0.65, small: true });
    });
    var ZC = C - 4;
    segs.forEach(function (s) {
      if (focus && opt.roomKeys && !opt.roomKeys[s.key]) return; // у кімнаті — лише її кабелі
      var fade = opt.hk && !opt.hk[s.key], on = opt.hk && !fade;
      var col = opt.colorOf ? opt.colorOf(s) : "#f80", A = fade ? (focus ? 0.35 : 0.15) : 1, Wd = on ? 3.4 : 2.2, cores = on && opt.coresOf ? opt.coresOf(s) : null, parts = [];
      function L(pts, dash) { parts.push(pts); lines.push({ pts: pts, color: col, w: Wd, alpha: A, dash: dash, casing: true, key: s.key, cores: cores }); }
      (s.verts || []).forEach(function (v) { if (!v.room) return; var q = wxy(v.room, v.wall, v.pos); L([[q[0], q[1], v.z0], [q[0], q[1], v.z1]]); });
      (s.pieces || []).forEach(function (pc) { var a = wxy(pc.room, pc.wall, pc.p0), e = wxy(pc.room, pc.wall, pc.p1); L([[a[0], a[1], pc.z], [e[0], e[1], pc.z]]); });
      if (s.line) { var z = s.plane === "floor" ? 3 : ZC, ln = (opt.lanes && opt.lanes[s.key]) || s.line; L(ln.map(function (q) { return [q[0], q[1], z]; }), s.plane === "floor" ? [2, 5] : null); }
      (s.ceilStub || []).forEach(function (cs) { var a = wxy(cs[2], cs[3], cs[4]); L([[a[0], a[1], ZC], [cs[0], cs[1], ZC]]); });
      // підпис кабелю посередині найдовшого шматка: переріз і звідки → куди
      if (opt.segLabel && (focus ? !fade : on) && parts.length) {
        var best = null, bl = -1;
        parts.forEach(function (pp) { var l = 0; for (var i = 0; i < pp.length - 1; i++) l += Math.hypot(pp[i + 1][0] - pp[i][0], pp[i + 1][1] - pp[i][1], pp[i + 1][2] - pp[i][2]); if (l > bl) { bl = l; best = pp; } });
        var half = bl / 2, acc = 0, mp = best[0];
        for (var j = 0; j < best.length - 1; j++) { var a = best[j], e = best[j + 1], sl = Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]); if (acc + sl >= half) { var tt = sl ? (half - acc) / sl : 0; mp = [a[0] + (e[0] - a[0]) * tt, a[1] + (e[1] - a[1]) * tt, a[2] + (e[2] - a[2]) * tt]; break; } acc += sl; }
        labels.push({ p: mp, text: opt.segLabel(s), pill: "rgba(20,24,30,.86)", tcol: col, border: col, small: true, alpha: on ? 1 : 0.88 });
      }
    });
    p.points.forEach(function (t) {
      var r = P.byId(p.rooms, t.room); if (!r) return;
      if (focus && t.room !== focus.id && !(opt.keepIds && opt.keepIds[t.id])) return;
      var pos = P.KINDS[t.kind].surf === "wall" ? (function () { var q = P.wallXY(r, t.wall, t.pos); return [q[0], q[1], t.h]; })() : [t.x, t.y, C];
      var d = opt.dotOf ? opt.dotOf(t) : {};
      dots.push({ id: t.id, p: pos, color: d.color || "#fff", r: d.r || 5, shape: d.shape, glow: d.glow, alpha: d.alpha, tag: d.tag, coord: d.coord, sel: t.id === opt.selId });
    });
    if (p.panel) { var pr = P.byId(p.rooms, p.panel.room); if (pr && (!focus || focus.id === pr.id)) { var q2 = P.wallXY(pr, p.panel.wall, p.panel.pos); dots.push({ id: "panel", p: [q2[0], q2[1], p.panel.h + 25], color: "#ff8c3c", r: 8, shape: "sq", tag: "Щит", sel: opt.selId === "panel" }); } }
    (opt.holes || []).forEach(function (o) {
      (o.pts || []).forEach(function (q) { labels.push({ p: [q[0], q[1], C - 6], text: "●", color: o.color || "#e74c3c", alpha: 1 }); });
      labels.push({ p: [o.x, o.y, C - 26], text: o.text, pill: o.color || "#c0392b", big: true });
    });
    // розміри до вибраної точки: від кутів і від підлоги (на стіні) або від стін (на стелі)
    var sp = opt.selId && opt.selId !== "panel" ? P.byId(p.points, opt.selId) : null, spr = sp && P.byId(p.rooms, sp.room);
    if (spr && (!focus || spr.id === focus.id)) {
      var dim = function (a, b, txt) { lines.push({ pts: [a, b], color: "fg", w: 1.4, dash: [6, 4], alpha: 0.95 }); labels.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], text: txt, pill: "#1f6feb", small: true }); };
      if (P.KINDS[sp.kind].surf === "wall") {
        var WLn = P.wallLen(spr, sp.wall), c0 = P.wallXY(spr, sp.wall, 0), c1 = P.wallXY(spr, sp.wall, WLn), qq = P.wallXY(spr, sp.wall, sp.pos);
        dim([c0[0], c0[1], 2], [qq[0], qq[1], 2], P.nf(sp.pos) + " см"); dim([qq[0], qq[1], 2], [c1[0], c1[1], 2], P.nf(WLn - sp.pos) + " см"); dim([qq[0], qq[1], 2], [qq[0], qq[1], sp.h], "h " + P.nf(sp.h));
      } else {
        dim([spr.x, sp.y, C - 1], [sp.x, sp.y, C - 1], P.nf(sp.x - spr.x) + " см"); dim([sp.x, spr.y, C - 1], [sp.x, sp.y, C - 1], P.nf(sp.y - spr.y) + " см");
      }
    }
    var eye = null;
    if (focus && opt.orbit) { var mg = Math.max(focus.w, focus.h) * 0.3; bounds = { x: focus.x - mg, y: focus.y - mg, w: focus.w + 2 * mg, h: focus.h + 2 * mg }; }
    else if (focus) {
      // стаємо в центрі кімнати на висоті очей і дивимося на стіну з найбільшою кількістю кабелів
      var yaw = 0, best = -1;
      (opt.holes || []).forEach(function (o) { if (o.n > best) { best = o.n; yaw = Math.atan2(o.x - (focus.x + focus.w / 2), -(o.y - (focus.y + focus.h / 2))); } });
      eye = { p: [focus.x + focus.w / 2, focus.y + focus.h / 2, 160], yaw: yaw };
    }
    return { polys: polys, lines: lines, dots: dots, labels: labels, bounds: bounds, ceilH: C, eye: eye, focus: !!focus,
      key: (focus ? (opt.orbit ? "orb:" : "room:") + focus.id : "all") + "|" + p.rooms.map(function (r) { return r.id + r.x + r.y + r.w + r.h; }).join() };
  }

  P.view3d = view3d;
  P.scene3d = buildScene;
})();
