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
    var proj2 = [];

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
      ctx.globalAlpha = 1; ctx.lineCap = "round"; ctx.lineJoin = "round";
      scene.lines.forEach(function (l) {
        clipLine(l.pts.map(toCam)).forEach(function (part) {
          var q = part.map(scr);
          if (l.casing) { path(q); ctx.globalAlpha = (l.alpha == null ? 1 : l.alpha) * 0.8; ctx.strokeStyle = bg; ctx.lineWidth = (l.w || 2) + 3; ctx.setLineDash([]); ctx.stroke(); }
          path(q); ctx.globalAlpha = l.alpha == null ? 1 : l.alpha; ctx.strokeStyle = l.color === "fg" ? fg : l.color; ctx.lineWidth = l.w || 2; ctx.setLineDash(l.dash || []); ctx.stroke();
        });
      });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      proj2 = scene.dots.map(function (d) { var c = toCam(d.p); return c[2] >= NEAR ? { q: scr(c), d: d } : null; }).filter(Boolean).sort(function (a, b) { return b.q[2] - a.q[2]; });
      proj2.forEach(function (o) {
        var d = o.d, r = d.r || 5, x = o.q[0], y = o.q[1];
        if (inside) r = Math.max(4, Math.min(14, r * 300 / o.q[2] * 1.6));
        ctx.globalAlpha = d.alpha == null ? 1 : d.alpha;
        if (d.glow) { ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 7); ctx.fillStyle = "rgba(255,213,74,.35)"; ctx.fill(); }
        ctx.beginPath(); if (d.shape === "sq") ctx.rect(x - r, y - r, 2 * r, 2 * r); else ctx.arc(x, y, r, 0, 7);
        ctx.fillStyle = d.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = bg; ctx.stroke();
        if (d.sel) { ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.strokeStyle = "#ff8c3c"; ctx.lineWidth = 2.5; ctx.stroke(); }
        if (d.tag && (inside || d.sel)) { ctx.globalAlpha = 0.85; ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = fg; ctx.fillText(d.tag, x + r + 3, y - r); }
      });
      ctx.globalAlpha = 1;
      // підписи: кімнати, стіни, отвори з кількістю кабелів
      scene.labels.forEach(function (t) {
        var c = toCam(t.p); if (c[2] < NEAR) return; var q = scr(c);
        ctx.font = (t.big ? "700 13px" : "600 12px") + " system-ui, sans-serif"; ctx.textAlign = "center";
        if (t.pill) {
          var w = ctx.measureText(t.text).width + 12;
          ctx.globalAlpha = 0.92; ctx.fillStyle = t.pill; ctx.beginPath(); ctx.rect(q[0] - w / 2, q[1] - 11, w, 20); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.fillText(t.text, q[0], q[1] + 4);
        } else { ctx.globalAlpha = t.alpha || 0.7; ctx.fillStyle = fg; ctx.fillText(t.text, q[0], q[1]); }
      });
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
        opts.onPick(best ? best.id : null);
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
    var ZC = C - 4;
    segs.forEach(function (s) {
      var fade = opt.hk && !opt.hk[s.key];
      if (focus && fade) return; // зсередини — лише кабелі цієї кімнати
      var col = opt.colorOf ? opt.colorOf(s) : "#f80", A = fade ? 0.1 : 1, Wd = opt.hk && !fade ? 3.2 : 2.2;
      function L(pts, dash) { lines.push({ pts: pts, color: col, w: Wd, alpha: A, dash: dash, casing: true }); }
      (s.verts || []).forEach(function (v) { if (!v.room) return; var q = wxy(v.room, v.wall, v.pos); L([[q[0], q[1], v.z0], [q[0], q[1], v.z1]]); });
      (s.pieces || []).forEach(function (pc) { var a = wxy(pc.room, pc.wall, pc.p0), e = wxy(pc.room, pc.wall, pc.p1); L([[a[0], a[1], pc.z], [e[0], e[1], pc.z]]); });
      if (s.line) { var z = s.plane === "floor" ? 3 : ZC, ln = (opt.lanes && opt.lanes[s.key]) || s.line; L(ln.map(function (q) { return [q[0], q[1], z]; }), s.plane === "floor" ? [2, 5] : null); }
      (s.ceilStub || []).forEach(function (cs) { var a = wxy(cs[2], cs[3], cs[4]); L([[a[0], a[1], ZC], [cs[0], cs[1], ZC]]); });
    });
    p.points.forEach(function (t) {
      var r = P.byId(p.rooms, t.room); if (!r) return;
      if (focus && t.room !== focus.id && !(opt.keepIds && opt.keepIds[t.id])) return;
      var pos = P.KINDS[t.kind].surf === "wall" ? (function () { var q = P.wallXY(r, t.wall, t.pos); return [q[0], q[1], t.h]; })() : [t.x, t.y, C];
      var d = opt.dotOf ? opt.dotOf(t) : {};
      dots.push({ id: t.id, p: pos, color: d.color || "#fff", r: d.r || 5, shape: d.shape, glow: d.glow, alpha: d.alpha, tag: d.tag, sel: t.id === opt.selId });
    });
    if (p.panel) { var pr = P.byId(p.rooms, p.panel.room); if (pr && (!focus || focus.id === pr.id)) { var q2 = P.wallXY(pr, p.panel.wall, p.panel.pos); dots.push({ id: "panel", p: [q2[0], q2[1], p.panel.h + 25], color: "#ff8c3c", r: 8, shape: "sq", tag: "Щит", sel: opt.selId === "panel" }); } }
    (opt.holes || []).forEach(function (o) { labels.push({ p: [o.x, o.y, C - 22], text: o.text, pill: o.color || "#c0392b", big: true }); });
    var eye = null;
    if (focus && opt.orbit) { var mg = Math.max(focus.w, focus.h) * 0.3; bounds = { x: focus.x - mg, y: focus.y - mg, w: focus.w + 2 * mg, h: focus.h + 2 * mg }; }
    else if (focus) {
      // стаємо в центрі кімнати на висоті очей і дивимося на стіну з найбільшою кількістю кабелів
      var yaw = 0, best = -1;
      (opt.holes || []).forEach(function (o) { if (o.n > best) { best = o.n; yaw = Math.atan2(o.x - (focus.x + focus.w / 2), -(o.y - (focus.y + focus.h / 2))); } });
      eye = { p: [focus.x + focus.w / 2, focus.y + focus.h / 2, 160], yaw: yaw };
    }
    return { polys: polys, lines: lines, dots: dots, labels: labels, bounds: bounds, ceilH: C, eye: eye,
      key: (focus ? (opt.orbit ? "orb:" : "room:") + focus.id : "all") + "|" + p.rooms.map(function (r) { return r.id + r.x + r.y + r.w + r.h; }).join() };
  }

  P.view3d = view3d;
  P.scene3d = buildScene;
})();
