/* Планувальник електрики квартири — інтерфейс. Маршрут #/planner. */
(function () {
  "use strict";
  var P = window.PLAN;
  var KEY = "ec-planner", PKEY = "ec-planner-photo", SKEY = "ec-planner-ui";
  var COLORS = ["#c2560f", "#1f6fd1", "#1f7a46", "#8e44ad", "#b3261e", "#0f8b8d", "#a0522d", "#6b7f00", "#d6336c", "#5c6b7a", "#e67700", "#2b8a3e"];
  var TABS = [["flat", "Квартира"], ["plan", "План і стеля"], ["walls", "Стіни"], ["groups", "Групи і щит"], ["wiring", "З'єднання"], ["spec", "Матеріали"], ["steps", "План робіт"]];
  var WALL_KINDS = ["socket", "outlet", "sw1", "sw2", "pass", "cross", "sconce", "led", "fan", "jbox"];
  var CEIL_KINDS = ["ceil", "spot"];
  var SHORT = { socket: "Розетка", outlet: "Вивід під техніку", sw1: "Вимикач", sw2: "Вимикач 2-кл.", pass: "Прохідний", cross: "Перехресний", sconce: "Бра", led: "LED-підсвітка", fan: "Вентилятор", jbox: "Коробка", ceil: "Світильник", spot: "Точковий" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function num(v) { return parseFloat(String(v).replace(",", ".")); }
  function snap(v, s) { s = s || 5; return Math.round(v / s) * s; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lessonTitle(m, l) {
    var c = window.COURSE || [];
    for (var i = 0; i < c.length; i++) if (c[i].id === m) for (var j = 0; j < c[i].lessons.length; j++) if (c[i].lessons[j].id === l) return c[i].lessons[j].title;
    return m + "/" + l;
  }
  function lessonLinks(ls) {
    return (ls || []).map(function (l) { return '<a class="pl-lesson" href="#/m/' + l[0] + "/l/" + l[1] + '">📖 ' + esc(lessonTitle(l[0], l[1])) + "</a>"; }).join(" ");
  }
  function hint(key, open) {
    var h = P.HINTS[key]; if (!h) return "";
    return '<details class="pl-hint"' + (open ? " open" : "") + "><summary>💡 Чому так: " + esc(h.t) + "</summary>" + h.h + '<div class="pl-links">' + lessonLinks(h.l) + "</div></details>";
  }

  // ---------- стан ----------
  var proj = null, photo = null, ui = { tab: "flat", layer: "ceiling", tool: "select", tour: -1, wallRoom: null, wall: "N", showRoutes: true, gfilter: "" }, live = { on: false, sw: {}, brk: {} }, multi = [];
  var sel = null, view = null, wview = null, host = null, saveT = null, calib = null, drawRect = null;
  function load() {
    try { var s = JSON.parse(lsGet(KEY)); if (s && s.rooms) proj = P.normalize(s); } catch (e) {}
    try { photo = JSON.parse(lsGet(PKEY)); } catch (e) {}
    try { var u = JSON.parse(lsGet(SKEY)); if (u) for (var k in u) ui[k] = u[k]; } catch (e) {}
    if (!proj && P.template) { proj = P.normalize(P.template("home")); ui.tab = "plan"; }
    ui.tool = "select";
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { if (proj) lsSet(KEY, JSON.stringify(proj)); lsSet(SKEY, JSON.stringify({ tab: ui.tab, layer: ui.layer, tour: ui.tour, wallRoom: ui.wallRoom, wall: ui.wall, showRoutes: ui.showRoutes })); }, 150);
  }
  function setProj(p) { proj = P.normalize(p); sel = null; view = null; save(); }

  // ---------- кеш розрахунків ----------
  var cache = null;
  function calc() {
    if (cache) return cache;
    var segs = P.routes(proj);
    cache = { segs: segs, issues: P.issues(proj, segs) };
    return cache;
  }
  function changed() { cache = null; save(); draw(); }

  // ---------- оболонка ----------
  function render() {
    return '<div class="crumbs"><a href="#/">Головна</a> / Планувальник квартири</div><h1>Планувальник електрики квартири</h1>' +
      '<p class="lead">Спроєктуй проводку квартири з нуля: кімнати, точки на стінах і стелі, траси кабелів, групи, щит, з\'єднання в коробках, матеріали і покроковий план робіт. Кожне рішення має пояснення «Чому так?» з посиланням на урок.</p>' +
      '<div class="pl-root"></div>' +
      '<div class="warn disclaimer">Планувальник — навчальний інструмент. Авторозстановка — розумна чернетка для типової квартири, а не проєкт: перевір точки з меблями, сантехнікою, газовими трубами і конструкцією будинку. Підключення вводу — лише оператор системи розподілу або уповноважена особа.</div>';
  }
  function bind(root) {
    host = root.querySelector(".pl-root");
    load(); cache = null;
    host.addEventListener("click", onClick);
    host.addEventListener("change", onChange);
    draw();
  }

  function draw() {
    if (!host) return;
    if (!proj) ui.tab = "flat";
    var c = proj ? calc() : null, errs = c ? c.issues.filter(function (i) { return i.lvl === "error"; }).length : 0, warns = c ? c.issues.length - errs : 0;
    var h = '<div class="pl-tabs" role="tablist">' + TABS.map(function (t) {
      var dis = !proj && t[0] !== "flat";
      return '<button type="button" role="tab" data-tab="' + t[0] + '" class="' + (ui.tab === t[0] ? "on" : "") + '"' + (dis ? " disabled" : "") + ">" + t[1] +
        (t[0] === "groups" && errs ? ' <span class="pl-badge bad">' + errs + "</span>" : t[0] === "groups" && warns ? ' <span class="pl-badge">' + warns + "</span>" : "") + "</button>";
    }).join("") + (proj ? '<button type="button" class="pl-tourbtn" data-act="tour">' + (ui.tour >= 0 ? "✕ Закрити навчання" : "🎓 Навчальний режим") + "</button>" : "") + "</div>";
    if (proj && ui.tour >= 0) {
      var T = P.TOUR[ui.tour];
      h += '<div class="pl-tour"><b>' + esc(T.t) + "</b> " + esc(T.h) + '<div class="pl-tour-nav">' + (ui.tour > 0 ? '<button type="button" class="btn ghost small" data-act="tprev">← Назад</button>' : "") +
        (ui.tour < P.TOUR.length - 1 ? '<button type="button" class="btn small" data-act="tnext">Далі →</button>' : '<button type="button" class="btn small" data-act="tour">Готово</button>') + " <span class='meta'>" + (ui.tour + 1) + " / " + P.TOUR.length + "</span></div></div>";
    }
    h += '<div class="pl-body">' + body() + "</div>";
    var sx = window.scrollX, sy = window.scrollY;
    host.innerHTML = h;
    window.scrollTo(sx, sy);
    afterDraw();
  }
  function body() {
    if (ui.tab === "flat") return flatTab();
    if (ui.tab === "plan") return planTab();
    if (ui.tab === "walls") return wallsTab();
    if (ui.tab === "groups") return groupsTab();
    if (ui.tab === "wiring") return wiringTab();
    if (ui.tab === "spec") return specTab();
    return stepsTab();
  }

  // ---------- поля форм ----------
  function inp(obj, id, k, v, opt) {
    opt = opt || {};
    return '<label class="pl-f"><span>' + esc(opt.label == null ? k : opt.label) + '</span><input type="' + (opt.type || "text") + '"' + (opt.type ? "" : ' inputmode="decimal"') + ' data-o="' + obj + '" data-id="' + esc(id) + '" data-k="' + k + '"' + (opt.str ? ' data-str="1"' : "") +
      ' value="' + esc(opt.str ? v : String(Math.round(v * 10) / 10).replace(".", ",")) + '">' + (opt.unit ? "<em>" + opt.unit + "</em>" : "") + "</label>";
  }
  function selF(obj, id, k, v, options, label) {
    return '<label class="pl-f"><span>' + esc(label) + '</span><select data-o="' + obj + '" data-id="' + esc(id) + '" data-k="' + k + '">' +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
  }
  function wallOpts(r) { return P.WALLS.map(function (w) { return [w, P.WALL_NAME[w] + " (" + Math.round(P.wallLen(r, w)) + " см)"]; }); }

  // ---------- вкладка «Квартира» ----------
  function flatTab() {
    var h = "";
    if (!proj) {
      return '<div class="pl-start">' +
        '<div class="card"><h3>Шаблон</h3><p>Типове планування — розміри потім змінюються.</p><div class="row"><button type="button" class="btn small" data-act="tpl" data-v="home">Моя квартира 63,7 м²</button><button type="button" class="btn small" data-act="tpl" data-v="studio">Студія</button><button type="button" class="btn small" data-act="tpl" data-v="one">1-кімнатна</button><button type="button" class="btn small" data-act="tpl" data-v="two">2-кімнатна</button></div></div>' +
        '<div class="card"><h3>З опису</h3><p>Кожна кімната — з нового рядка: назва і розміри (м або см) чи площа. Можна вказати висоту стелі.</p><textarea class="pl-desc" rows="6" placeholder="Коридор 1,4×4,5&#10;Кімната 4,2×3,6&#10;Кухня 3×2,8&#10;Ванна 170×200 см&#10;Стеля 2,7"></textarea><div class="row"><button type="button" class="btn small" data-act="desc">Створити план</button></div></div>' +
        '<div class="card"><h3>Файл проєкту</h3><p>Відкрий раніше збережений проєкт (.json) — свій або підготовлений для тебе.</p><label class="btn ghost small pl-file">Відкрити файл<input type="file" accept=".json,application/json" data-act="import" hidden></label>' +
        '<p class="meta">Після створення можна підкласти фото плану з БТІ чи від забудовника і підігнати кімнати по ньому.</p></div></div>';
    }
    h += '<div class="pl-cols"><div class="pl-main">' + toolbarFlat() + planSvg("flat") + "</div><div class='pl-side'>" + flatSide() + "</div></div>";
    return h;
  }
  function toolbarFlat() {
    return '<div class="pl-bar">' +
      '<button type="button" data-tool="select" class="' + (ui.tool === "select" ? "on" : "") + '">✥ Рух і розмір</button>' +
      '<button type="button" data-tool="room" class="' + (ui.tool === "room" ? "on" : "") + '">▭ Намалювати кімнату</button>' +
      '<label class="pl-barbtn">🖼 Фото плану<input type="file" accept="image/*" data-act="photo" hidden></label>' +
      (photo ? '<button type="button" data-tool="calib" class="' + (ui.tool === "calib" ? "on" : "") + '">📏 Масштаб фото</button><label class="pl-barbtn">Прозорість <input type="range" min="10" max="100" value="' + Math.round((photo.op || 0.5) * 100) + '" data-act="photoop"></label><button type="button" data-act="photodel">Прибрати фото</button>' : "") +
      lockBtn() + zoomBtns() + "</div>" +
      (ui.tool === "calib" ? '<p class="pl-help">Клікни дві точки на фото, між якими знаєш реальну відстань (наприклад, довжину стіни), — потім введи її в сантиметрах.</p>' : "") +
      (ui.tool === "room" ? '<p class="pl-help">Протягни прямокутник по плану (або по фото) — з\'явиться нова кімната. Внутрішні розміри потім уточни цифрами справа.</p>' : "");
  }
  // ---------- стандарт висот (від чистої підлоги) ----------
  var stdH = { sw: 90, socket: 30 };
  function nearDoor(t) {
    var r = P.byId(proj.rooms, t.room); if (!r || !t.wall) return false;
    return P.openingsOn(proj, r, t.wall).some(function (o) { return o.kind === "door" && t.pos > o.pos - 45 && t.pos < o.pos + o.width + 45; });
  }
  function stdTargets(kind) {
    return proj.points.filter(function (t) {
      if (kind === "sw") return P.KINDS[t.kind].cat === "switch" && nearDoor(t);
      return t.kind === "socket" && t.h < 60;
    });
  }
  function heightsCard() {
    var sw = stdTargets("sw"), so = stdTargets("so"), swOff = sw.filter(function (t) { return t.h !== stdH.sw; }).length, soOff = so.filter(function (t) { return t.h !== stdH.socket; }).length;
    var rows = [["Розетки загального призначення", "300 мм", "іноді 200–400 під меблі"], ["Вимикачі", "900 мм", "буває 750–1000; з боку ручки, 100–150 мм від одвірка"], ["Розетки над стільницею", "~1100 мм", "150–250 мм над стільницею"],
      ["Біля ліжка", "600–700 мм", "над тумбою"], ["ТВ-зона", "1100–1300 мм", "за кронштейном"], ["Пральна машина", "1000–1100 мм", "збоку, не за машиною"], ["Кондиціонер", "2000–2200 мм", "збоку від блока"], ["Витяжка", "2000–2300 мм", "за кресленням кухні"]];
    return '<div class="card pl-card"><h3>Висоти точок</h3><p class="meta">Жорстко обов\'язкових висот для житла мало — це домовленість із замовником. Головне — однаково по всій квартирі. Висоти — від <b>чистої</b> підлоги (стяжка + покриття).</p>' +
      '<table class="pl-tbl pl-htbl"><tr><th>Точка</th><th>Як правило</th><th>Примітка</th></tr>' + rows.map(function (x) { return "<tr><td>" + x[0] + "</td><td class='pl-nowrap'>" + x[1] + "</td><td class='meta'>" + x[2] + "</td></tr>"; }).join("") + "</table>" +
      '<div class="row"><button type="button" class="btn small" data-act="stdh" data-v="sw"' + (swOff ? "" : " disabled") + '>Вимикачі біля дверей → 90 см' + (swOff ? " (" + swOff + ")" : " ✓") + '</button>' +
      '<button type="button" class="btn small" data-act="stdh" data-v="so"' + (soOff ? "" : " disabled") + '>Низькі розетки → 30 см' + (soOff ? " (" + soOff + ")" : " ✓") + "</button></div>" +
      "<p class='meta'>Кнопки не чіпають розетки над стільницею, біля ліжка, за ТВ і вимикачі біля ліжка — у них свої висоти.</p>" + hint("heights") + "</div>";
  }
  function lockBtn() { return '<button type="button" data-act="lock" class="pl-lock' + (proj && proj.locked ? " on" : "") + '" title="Заборонити перетягування кімнат, точок і щита">' + (proj && proj.locked ? "🔒 Заблоковано" : "🔓 Блокувати рух") + "</button>"; }
  function zoomBtns() { return '<span class="pl-zoom"><button type="button" data-act="zin" title="Збільшити">＋</button><button type="button" data-act="zout" title="Зменшити">－</button><button type="button" data-act="zfit" title="Вмістити">⤢</button></span>'; }
  function flatSide() {
    var h = '<div class="card pl-card"><h3>Проєкт</h3>' + inp("proj", "", "name", proj.name, { label: "Назва", str: true }) + inp("proj", "", "ceilH", proj.ceilH, { label: "Висота стелі (чистова)", unit: "см" }) +
      selF("proj", "", "input", proj.input, [[25, "C25"], [32, "C32"], [40, "C40"], [50, "C50"], [63, "C63"]], "Ввідний автомат") +
      selF("proj", "", "system", proj.system, [["TN-C-S", "TN-C-S (є PE)"], ["TN-C", "TN-C (старий будинок, без PE)"], ["TT", "TT (власний заземлювач)"]], "Система заземлення") +
      '<label class="pl-f pl-chk"><input type="checkbox" data-o="proj" data-k="relay"' + (proj.relay ? " checked" : "") + "> Реле напруги в щиті</label>" +
      (proj.system === "TN-C" ? '<div class="warn">У системі TN-C немає окремого PE. Розетки з заземленням без PE не захищають, а «занулення» в розетці — небезпечне. Як правило, потрібна реконструкція вводу до TN-C-S — це вирішує оператор мережі.</div>' : "") +
      '<div class="row"><button type="button" class="btn" data-act="auto">⚡ Авторозстановка</button></div><p class="meta">Розставить світло, вимикачі, розетки, коробки і групи за типовими правилами. Поточні точки буде замінено.</p>' +
      '<div class="row"><button type="button" class="btn ghost small" data-act="export">⬇ Зберегти файл</button><label class="btn ghost small pl-file">⬆ Відкрити файл<input type="file" accept=".json,application/json" data-act="import" hidden></label><button type="button" class="btn ghost small" data-act="new">Новий проєкт</button></div></div>';
    var r = sel && sel.t === "room" ? P.byId(proj.rooms, sel.id) : null;
    if (!r) h += heightsCard();
    if (!r) h += '<div class="card pl-card"><h3>Кімнати</h3><p class="meta">Клікни кімнату на плані, щоб змінити її, або намалюй нову.</p><ul class="pl-list">' + proj.rooms.map(function (q) { return '<li><a href="javascript:void 0" data-act="selroom" data-id="' + q.id + '">' + esc(q.name) + "</a> <span class='meta'>" + nfm(q.w) + "×" + nfm(q.h) + " м</span></li>"; }).join("") + '</ul><button type="button" class="btn ghost small" data-act="addroom">+ Кімната</button></div>';
    else {
      h += '<div class="card pl-card"><h3>' + esc(r.name) + "</h3>" + inp("room", r.id, "name", r.name, { label: "Назва", str: true }) +
        selF("room", r.id, "type", r.type, Object.keys(P.ROOM_TYPES).map(function (k) { return [k, P.ROOM_TYPES[k]]; }), "Тип (від нього залежать правила)") +
        '<div class="pl-grid2">' + inp("room", r.id, "w", r.w, { label: "Ширина", unit: "см" }) + inp("room", r.id, "h", r.h, { label: "Глибина", unit: "см" }) + inp("room", r.id, "x", r.x, { label: "X", unit: "см" }) + inp("room", r.id, "y", r.y, { label: "Y", unit: "см" }) + "</div>" +
        "<h4>Двері і вікна</h4>" + proj.openings.filter(function (o) { return o.room === r.id; }).map(function (o) {
          return '<div class="pl-open">' + selF("open", o.id, "kind", o.kind, [["door", "Двері"], ["window", "Вікно"]], "") + selF("open", o.id, "wall", o.wall, wallOpts(r), "Стіна") +
            '<div class="pl-grid2">' + inp("open", o.id, "pos", o.pos, { label: "Від лівого кута", unit: "см" }) + inp("open", o.id, "width", o.width, { label: "Ширина", unit: "см" }) + inp("open", o.id, "height", o.height, { label: "Висота", unit: "см" }) + (o.kind === "window" ? inp("open", o.id, "sill", o.sill, { label: "Підвіконня", unit: "см" }) : "") + "</div>" +
            '<button type="button" class="btn ghost small" data-act="delopen" data-id="' + o.id + '">Видалити</button></div>';
        }).join("") +
        '<div class="row"><button type="button" class="btn ghost small" data-act="addopen" data-v="door">+ Двері</button><button type="button" class="btn ghost small" data-act="addopen" data-v="window">+ Вікно</button></div>' +
        '<div class="row"><button type="button" class="btn ghost small" data-act="unsel">← До списку</button><button type="button" class="btn ghost small pl-danger" data-act="delroom" data-id="' + r.id + '">Видалити кімнату</button></div>' +
        '<p class="meta">«Від лівого кута» — якщо стояти в кімнаті обличчям до стіни.</p></div>';
    }
    return h;
  }
  function nfm(cm) { return P.nf(cm / 100, 2); }

  // ---------- план (SVG) ----------
  function bounds() {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    proj.rooms.forEach(function (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
    if (photo && photo.data && ui.tab === "flat") { x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, photo.w * photo.scale); y1 = Math.max(y1, photo.h * photo.scale); }
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 600; y1 = 400; }
    var pad = 60;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }
  function inward(w) { return { N: [0, 1], E: [-1, 0], S: [0, -1], W: [1, 0] }[w]; }
  function wallPt(r, w, pos, off) { var a = P.wallXY(r, w, pos), n = inward(w); return [a[0] + n[0] * off, a[1] + n[1] * off]; }
  function ptXY(t) {
    var r = P.byId(proj.rooms, t.room); if (!r) return null;
    if (P.KINDS[t.kind].surf === "wall") return wallPt(r, t.wall, t.pos, 14);
    return [t.x, t.y];
  }
  function gcolor(gid) { var i = proj.groups.findIndex(function (g) { return g.id === gid; }); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }

  function icon(kind, x, y, s, extra) {
    var c = P.KINDS[kind].cat, h = "";
    if (kind === "socket") h = '<circle cx="' + x + '" cy="' + y + '" r="' + s + '" class="pi pi-socket"/><circle cx="' + (x - s * .35) + '" cy="' + y + '" r="' + s * .16 + '" class="pi-dot"/><circle cx="' + (x + s * .35) + '" cy="' + y + '" r="' + s * .16 + '" class="pi-dot"/>';
    else if (kind === "outlet") h = '<rect x="' + (x - s) + '" y="' + (y - s) + '" width="' + 2 * s + '" height="' + 2 * s + '" class="pi pi-power"/><path d="M' + (x + s * .1) + " " + (y - s * .7) + " L" + (x - s * .4) + " " + (y + s * .1) + " L" + (x + s * .1) + " " + (y + s * .1) + " L" + (x - s * .1) + " " + (y + s * .7) + '" class="pi-line"/>';
    else if (c === "switch") {
      h = '<circle cx="' + x + '" cy="' + y + '" r="' + s * .8 + '" class="pi pi-switch"/>';
      var n = kind === "sw2" ? 2 : 1;
      for (var i = 0; i < n; i++) h += '<line x1="' + (x + s * (.2 + i * .3)) + '" y1="' + (y - s * .2) + '" x2="' + (x + s * (.9 + i * .3)) + '" y2="' + (y - s * 1.2) + '" class="pi-line"/>';
      if (kind === "pass") h += '<line x1="' + (x - s * .2) + '" y1="' + (y + s * .2) + '" x2="' + (x - s * .9) + '" y2="' + (y + s * 1.2) + '" class="pi-line"/>';
      if (kind === "cross") h += '<line x1="' + (x - s * .5) + '" y1="' + (y - s * .5) + '" x2="' + (x + s * .5) + '" y2="' + (y + s * .5) + '" class="pi-line"/><line x1="' + (x - s * .5) + '" y1="' + (y + s * .5) + '" x2="' + (x + s * .5) + '" y2="' + (y - s * .5) + '" class="pi-line"/>';
    } else if (kind === "ceil" || kind === "sconce") {
      h = '<circle cx="' + x + '" cy="' + y + '" r="' + s * (kind === "ceil" ? 1.15 : .85) + '" class="pi pi-light"/><line x1="' + (x - s * .75) + '" y1="' + (y - s * .75) + '" x2="' + (x + s * .75) + '" y2="' + (y + s * .75) + '" class="pi-line"/><line x1="' + (x - s * .75) + '" y1="' + (y + s * .75) + '" x2="' + (x + s * .75) + '" y2="' + (y - s * .75) + '" class="pi-line"/>';
    } else if (kind === "spot") h = '<circle cx="' + x + '" cy="' + y + '" r="' + s * .6 + '" class="pi pi-light"/><circle cx="' + x + '" cy="' + y + '" r="' + s * .2 + '" class="pi-dot"/>';
    else if (kind === "fan") h = '<circle cx="' + x + '" cy="' + y + '" r="' + s * .9 + '" class="pi pi-light"/><path d="M' + x + " " + y + " L" + x + " " + (y - s * .8) + " M" + x + " " + y + " L" + (x + s * .7) + " " + (y + s * .4) + " M" + x + " " + y + " L" + (x - s * .7) + " " + (y + s * .4) + '" class="pi-line"/>';
    else if (kind === "led") h = '<rect x="' + (x - s * 1.2) + '" y="' + (y - s * .45) + '" width="' + 2.4 * s + '" height="' + .9 * s + '" class="pi pi-light"/>';
    else if (kind === "jbox") h = '<rect x="' + (x - s * .8) + '" y="' + (y - s * .8) + '" width="' + 1.6 * s + '" height="' + 1.6 * s + '" class="pi pi-box"/><circle cx="' + x + '" cy="' + y + '" r="' + s * .25 + '" class="pi-dot"/>';
    return h;
  }

  function planSvg(mode) {
    var b = bounds(); if (!view) view = b;
    var v = view, s = Math.max(6, Math.min(16, v.w / 70)), fs = Math.max(9, v.w / 75);
    var c = calc(), bb = bounds(), h = '<svg class="pl-svg pl-plan" data-mode="' + mode + '" viewBox="' + v.x + " " + v.y + " " + v.w + " " + v.h + '" style="--fs:' + fs + "px;aspect-ratio:" + Math.max(0.6, Math.min(2.2, bb.w / bb.h)).toFixed(3) + '">';
    if (photo && photo.data && mode === "flat") h += '<image href="' + photo.data + '" x="0" y="0" width="' + photo.w * photo.scale + '" height="' + photo.h * photo.scale + '" style="opacity:' + (photo.op || 0.5) + '" preserveAspectRatio="none"/>';
    // кімнати
    proj.rooms.forEach(function (r) {
      var on = sel && sel.t === "room" && sel.id === r.id;
      h += '<g data-room="' + r.id + '"><rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" class="pl-room t-' + r.type + (on ? " on" : "") + '"/>' +
        '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 - (mode === "flat" ? 0 : fs * 1.4)) + '" class="pl-rname" text-anchor="middle">' + esc(r.name) + "</text>" +
        (mode === "flat" ? '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + fs * 1.3) + '" class="pl-rdim" text-anchor="middle">' + nfm(r.w) + " × " + nfm(r.h) + " м</text>" : "") + "</g>";
      if (on && mode === "flat") h += '<rect data-handle="' + r.id + '" x="' + (r.x + r.w - s) + '" y="' + (r.y + r.h - s) + '" width="' + 2 * s + '" height="' + 2 * s + '" class="pl-handle"/>';
    });
    // прорізи
    proj.openings.forEach(function (o) {
      var r = P.byId(proj.rooms, o.room); if (!r) return;
      var a = P.wallXY(r, o.wall, o.pos), e = P.wallXY(r, o.wall, o.pos + o.width);
      h += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + e[0] + '" y2="' + e[1] + '" class="pl-' + o.kind + '"/>';
    });
    if (mode !== "flat" && ui.showRoutes) h += routesSvg(c.segs, s);
    // щит
    if (proj.panel) {
      var pr = P.byId(proj.rooms, proj.panel.room);
      if (pr) { var pp = wallPt(pr, proj.panel.wall, proj.panel.pos, 10); h += '<g data-panel="1" class="pl-pt' + (sel && sel.t === "panel" ? " on" : "") + '"><rect x="' + (pp[0] - s * 1.6) + '" y="' + (pp[1] - s) + '" width="' + 3.2 * s + '" height="' + 2 * s + '" class="pl-panel"/><text x="' + pp[0] + '" y="' + (pp[1] + s * .45) + '" text-anchor="middle" class="pl-ptext">Щ</text></g>'; }
    }
    if (mode !== "flat") {
      var bad = {}; c.issues.forEach(function (i) { if (i.ref) bad[i.ref] = bad[i.ref] === "error" ? "error" : i.lvl; });
      proj.points.forEach(function (t) {
        var q = ptXY(t); if (!q) return;
        var on = (sel && sel.t === "point" && sel.id === t.id) || multi.indexOf(t.id) >= 0, isC = P.KINDS[t.kind].surf === "ceiling";
        var dv = P.device && P.device(t.device), isAC = !!(dv && dv.ac);
        var dim = !live.on && !isAC && ((ui.layer === "ceiling" && !isC) || (ui.layer === "walls" && isC));
        var lc = live.on ? liveCls(t) : "";
        var hl = sel && sel.t === "point" && related(sel.id, t);
        h += '<g data-pt="' + t.id + '" class="pl-pt' + (on ? " on" : "") + (hl ? " rel" : "") + (dim ? " dim" : "") + (bad[t.id] && !live.on ? " " + bad[t.id] : "") + lc + '" style="--g:' + (t.group ? gcolor(t.group) : "var(--muted)") + '">' +
          (lc === " lit" ? '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + s * 3 + '" class="pl-glow"/>' : "") + (on || hl ? '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + s * 1.9 + '" class="pl-ring"/>' : "") + icon(t.kind, q[0], q[1], s) + (isAC ? "<text x=\"" + (q[0] + s * 1.3) + "\" y=\"" + (q[1] - s * .9) + "\" class=\"pl-ac\" style=\"font-size:" + (s * 3.2).toFixed(1) + "px\">❄</text>" : "") + "</g>";
      });
    }
    if (drawRect) h += '<rect x="' + Math.min(drawRect[0], drawRect[2]) + '" y="' + Math.min(drawRect[1], drawRect[3]) + '" width="' + Math.abs(drawRect[2] - drawRect[0]) + '" height="' + Math.abs(drawRect[3] - drawRect[1]) + '" class="pl-draw"/>';
    if (calib) calib.forEach(function (q) { h += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + s * .6 + '" class="pl-calib"/>'; });
    return h + "</svg>";
  }
  // точки, пов'язані з виділеною (вимикач ↔ світильники)
  function related(id, t) {
    var s = P.byId(proj.points, id); if (!s || s.id === t.id) return false;
    if ((t.ctl || []).some(function (c) { return c.sw === id; })) return true;
    if ((s.ctl || []).some(function (c) { return c.sw === t.id; })) return true;
    return false;
  }
  // кабелі від щита до точки (по порядку) і кабелі, що йдуть від неї далі

  // ---------- кабелі кімнати: що заходить крізь стіни і що прокладено всередині ----------
  function roomCables(rid, segs) {
    segs = segs || calc().segs;
    var cross = [], inside = [];
    segs.forEach(function (s) {
      var hs = (s.holes || []).filter(function (o) { return o.from === rid || o.to === rid; });
      var ea = P.endpoint(proj, s.a), eb = P.endpoint(proj, s.b);
      var ina = s.a !== "panel" && ea && ea.room && ea.room.id === rid, inb = eb && eb.room && eb.room.id === rid;
      if (s.a === "panel" && proj.panel && proj.panel.room === rid) ina = true;
      if (hs.length) cross.push({ s: s, holes: hs, ina: ina, inb: inb });
      else if (ina || inb) inside.push(s);
    });
    return { cross: cross, inside: inside };
  }
  function short(ref) { return ref === "panel" ? "Щит" : P.labelRef(proj, ref).split(",")[0]; }
  function roomCablesHtml(rid) {
    var r = P.byId(proj.rooms, rid); if (!r) return "";
    var rc = roomCables(rid), byNb = {}, cnt = {};
    function tally(o, s) { o[s.cable] = (o[s.cable] || 0) + 1; }
    function tallyTxt(o) { return Object.keys(o).map(function (k) { return k + " — " + o[k] + " шт"; }).join(", "); }
    rc.cross.forEach(function (x) {
      x.holes.forEach(function (o) {
        var nb = o.from === rid ? o.to : o.from, inc = o.to === rid;
        var k = nb; (byNb[k] = byNb[k] || { nb: nb, list: [] }).list.push({ s: x.s, inc: inc, through: !x.ina && !x.inb });
      });
      tally(cnt, x.s);
    });
    var gname = function (s) { var g = P.byId(proj.groups, s.group); return g ? g.name : ""; };
    var purpose = function (s) { return s.role === "switch" ? "до вимикача" : s.role === "light" ? "світло" : P.byId(proj.groups, s.group) && P.byId(proj.groups, s.group).kind === "light" ? "живлення світла" : "розетки / техніка"; };
    var h = '<div class="card pl-card pl-roomcab"><h3>🧵 Кабелі: ' + esc(r.name) + "</h3>" +
      "<p><b>Крізь стіни проходить " + rc.cross.length + " " + plural(rc.cross.length, "кабель", "кабелі", "кабелів") + "</b>" + (rc.cross.length ? " (" + tallyTxt(cnt) + ")" : "") + ".<br><b>Усередині кімнати — ще " + rc.inside.length + "</b>" + (rc.inside.length ? " (" + tallyTxt(rc.inside.reduce(function (o, s) { tally(o, s); return o; }, {})) + ")" : "") + ".</p>" +
      "<p class='meta'>На плані підсвічено ці траси. Клікни рядок — побачиш саму трасу.</p>";
    Object.keys(byNb).forEach(function (k) {
      var b = byNb[k], nr = P.byId(proj.rooms, b.nb);
      h += "<h4>↔ " + esc(nr ? nr.name : "?") + " — " + b.list.length + " " + plural(b.list.length, "кабель", "кабелі", "кабелів") + " <span class='meta'>(отвір у стіні" + (b.list.some(function (x) { return x.s.plane === "ceiling" || x.s.plane === "ceilGrid" || x.s.plane === "wallTop"; }) ? " під стелею" : "") + ")</span></h4><ul class='pl-rcl'>";
      b.list.forEach(function (x) {
        h += '<li><a href="javascript:void 0" data-act="selseg" data-id="' + esc(x.s.key) + '">' + (x.through ? "⇄ транзит" : x.inc ? "→ заходить" : "← виходить") + ": <b>" + esc(short(x.s.a)) + " → " + esc(short(x.s.b)) + "</b></a> <span class='meta'>· " + x.s.cable + " · " + esc(purpose(x.s)) + " · " + esc(gname(x.s)) + "</span></li>";
      });
      h += "</ul>";
    });
    if (rc.inside.length) {
      h += "<details><summary><b>Усередині кімнати (" + rc.inside.length + ")</b></summary><ul class='pl-rcl'>" + rc.inside.map(function (s) {
        return '<li><a href="javascript:void 0" data-act="selseg" data-id="' + esc(s.key) + '"><b>' + esc(short(s.a)) + " → " + esc(short(s.b)) + "</b></a> <span class='meta'>· " + s.cable + " · " + P.nf(s.len / 100) + " м · " + esc(purpose(s)) + "</span></li>";
      }).join("") + "</ul></details>";
    }
    var boxes = proj.points.filter(function (t) { return t.room === rid && t.kind === "jbox"; });
    if (boxes.length) {
      var segs = calc().segs;
      h += boxes.map(function (b) { var n = segs.filter(function (s) { return s.a === b.id || s.b === b.id; }).length; return "<p class='meta'>У коробку " + esc(P.tagOf(proj, b)) + " заходить " + n + " " + plural(n, "кабель", "кабелі", "кабелів") + " — бери коробку з запасом місця (Ø80–100 або глибоку) і WAGO на " + Math.min(5, Math.max(3, n)) + ".</p>"; }).join("");
    }
    return h + "<p class='meta'>Кабелі, що проходять в одному отворі, клади в окремих гофрах або в одній гофрі більшого діаметра (заповнення ≤ 40 %). Силові 2,5 мм² і світлові 1,5 мм² можна вести поруч — це одна напруга 230 В.</p></div>";
  }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }
  function cablePath(id, segs) {
    var chain = [], cur = id, guard = 0;
    while (cur !== "panel" && guard++ < 60) { var s = segs.filter(function (x) { return x.b === cur; })[0]; if (!s) break; chain.unshift(s); cur = s.a; }
    return { up: chain, down: segs.filter(function (x) { return x.a === id; }) };
  }
  function hlKeys(segs) {
    if (!sel) return null;
    if (sel.t === "seg") { var o = {}; o[sel.id] = 1; return o; }
    if (sel.t === "room" && ui.tab === "plan") { var rc = roomCables(sel.id, segs), ko = {}; rc.cross.forEach(function (x) { ko[x.s.key] = 1; }); rc.inside.forEach(function (s) { ko[s.key] = 1; }); return Object.keys(ko).length ? ko : null; }
    if (sel.t !== "point") return null;
    var cp = cablePath(sel.id, segs), k = {};
    cp.up.concat(cp.down).forEach(function (s) { k[s.key] = 1; });
    return Object.keys(k).length ? k : null;
  }
  // паралельні траси по стелі розводимо на окремі «доріжки», щоб вони не зливалися в одну лінію
  function laneLines(segs) {
    var GAP = 8, legs = [], out = {};
    segs.forEach(function (g) {
      if (g.plane !== "ceilGrid" || !g.line) return;
      for (var i = 0; i < g.line.length - 1; i++) {
        var a = g.line[i], b = g.line[i + 1], hz = Math.abs(a[1] - b[1]) < 0.5, vt = Math.abs(a[0] - b[0]) < 0.5;
        if (!hz && !vt) continue;
        legs.push({ k: g.key, i: i, hz: hz, c: hz ? a[1] : a[0], lo: Math.min(hz ? a[0] : a[1], hz ? b[0] : b[1]), hi: Math.max(hz ? a[0] : a[1], hz ? b[0] : b[1]) });
      }
    });
    legs.sort(function (a, b) { return (a.hz - b.hz) || (a.c - b.c); });
    var cl = [];
    legs.forEach(function (l) { var last = cl[cl.length - 1]; if (last && last.hz === l.hz && Math.abs(l.c - last.c) < 4) last.legs.push(l); else cl.push({ hz: l.hz, c: l.c, legs: [l] }); });
    var off = {};
    cl.forEach(function (c) {
      var ends = [];
      c.legs.sort(function (a, b) { return a.lo - b.lo; }).forEach(function (l) {
        var k = 0; while (k < ends.length && ends[k] > l.lo + 2) k++;
        ends[k] = l.hi; l.lane = k;
      });
      c.legs.forEach(function (l) { off[l.k + "#" + l.i] = (l.lane - (ends.length - 1) / 2) * GAP; });
    });
    segs.forEach(function (g) {
      if (g.plane !== "ceilGrid" || !g.line) return;
      var L = g.line;
      out[g.key] = L.map(function (q, j) {
        var x = q[0], y = q[1];
        [j - 1, j].forEach(function (i) {
          if (i < 0 || i >= L.length - 1) return;
          var o = off[g.key + "#" + i]; if (!o) return;
          if (Math.abs(L[i][1] - L[i + 1][1]) < 0.5) y = q[1] + o; else x = q[0] + o;
        });
        return [x, y];
      });
    });
    return out;
  }
  function routesSvg(segs, s) {
    var h = '<g class="pl-routes">', hk = live.on ? null : hlKeys(segs), lanes = laneLines(segs);
    segs.forEach(function (g) {
      if (ui.gfilter && g.group !== ui.gfilter) return;
      var col = gcolor(g.group), cls = "pl-route p-" + g.plane + (hk ? (hk[g.key] ? " hl" : " fade") : ""), off = g.plane === "wallBottom" ? 22 : 6 + (proj.groups.findIndex(function (x) { return x.id === g.group; }) % 4) * 2.5;
      var hit = ' data-seg="' + esc(g.key) + '"';
      if (g.line) { var pts = (lanes[g.key] || g.line).map(function (q) { return q[0] + "," + q[1]; }).join(" "); h += '<polyline points="' + pts + '" class="pl-case' + (hk && !hk[g.key] ? " fade" : "") + '"/><polyline' + hit + ' points="' + pts + '" class="' + cls + '" style="stroke:' + col + '"/>'; }
      g.pieces.forEach(function (pc) {
        var r = P.byId(proj.rooms, pc.room), a = wallPt(r, pc.wall, pc.p0, off), e = wallPt(r, pc.wall, pc.p1, off);
        h += '<line' + hit + ' x1="' + a[0] + '" y1="' + a[1] + '" x2="' + e[0] + '" y2="' + e[1] + '" class="' + cls + '" style="stroke:' + col + '"/>';
      });
      (g.ceilStub || []).forEach(function (cs) { var a = wallPt(cs[2], cs[3], cs[4], off); h += '<line' + hit + ' x1="' + a[0] + '" y1="' + a[1] + '" x2="' + cs[0] + '" y2="' + cs[1] + '" class="pl-route p-ceiling" style="stroke:' + col + '"/>'; });
      g.holes.forEach(function (o) { h += '<circle cx="' + o.x + '" cy="' + o.y + '" r="' + s * .45 + '" class="pl-hole"/>'; });
    });
    return h + "</g>";
  }

  // ---------- вкладка «План і стеля» ----------
  function planTab() {
    var kinds = ui.layer === "ceiling" ? CEIL_KINDS : WALL_KINDS;
    var h = '<div class="pl-cols"><div class="pl-main"><div class="pl-bar">' +
      '<span class="pl-seg"><button type="button" data-layer="ceiling" class="' + (ui.layer === "ceiling" ? "on" : "") + '">Стеля</button><button type="button" data-layer="walls" class="' + (ui.layer === "walls" ? "on" : "") + '">Стіни</button></span>' +
      '<button type="button" data-tool="select" class="' + (ui.tool === "select" ? "on" : "") + '">✥ Вибір</button>' +
      kinds.map(function (k) { return '<button type="button" data-tool="add:' + k + '" class="' + (ui.tool === "add:" + k ? "on" : "") + '">+ ' + SHORT[k] + "</button>"; }).join("") +
      (true ? '<button type="button" data-tool="ac" class="' + (ui.tool === "ac" ? "on" : "") + '">+ Кондиціонер</button>' : "") +
      '<button type="button" data-act="live" class="pl-livebtn' + (live.on ? " on" : "") + '">' + (live.on ? "✕ Зняти напругу" : "🔌 Під напругою") + "</button>" +
      (ui.layer === "walls" ? '<button type="button" data-tool="panel" class="' + (ui.tool === "panel" ? "on" : "") + '">Щит сюди</button>' : "") +
      '<button type="button" data-tool="del" class="' + (ui.tool === "del" ? "on" : "") + '">✕ Видалити</button>' + '<button type="button" data-act="msel" class="' + (ui.msel ? "on" : "") + '" title="Виділяти кілька точок дотиком (на ПК — Shift/Ctrl + клік або рамка з Shift)">⬚ Кілька</button>' + lockBtn() + zoomBtns() + "</div>" +
      '<div class="pl-bar pl-bar2"><label class="pl-barbtn"><input type="checkbox" data-act="routes"' + (ui.showRoutes ? " checked" : "") + "> Траси</label>" +
      '<label class="pl-barbtn">Група <select data-act="gfilter"><option value="">усі</option>' + proj.groups.map(function (g) { return '<option value="' + g.id + '"' + (ui.gfilter === g.id ? " selected" : "") + ">" + esc(g.name) + "</option>"; }).join("") + "</select></label>" +
      '<span class="pl-legend"><i class="lg-wall"></i>по стіні <i class="lg-ceil"></i>по стелі <i class="lg-floor"></i>по підлозі <i class="lg-hole"></i>отвір у стіні</span></div>' +
      (ui.tool === "ac" ? '<p class="pl-help">Клікни всередині кімнати — планувальник підбере кондиціонер за площею, поставить вивід під стелею і створить окрему лінію з автоматом і кабелем.</p>' : "") +
      (ui.tool.indexOf("add:") === 0 ? '<p class="pl-help">' + (ui.tool === "add:ceil" || ui.tool === "add:spot" ? "Клікни всередині кімнати — світильник стане в цю точку стелі." : "Клікни біля стіни — точка стане на найближчу стіну з типовою висотою. Висоту і відстань уточниш справа або у вкладці «Стіни».") + "</p>" : "") +
      (live.on ? '<p class="pl-help">Мережа під напругою: клацай вимикачі на плані — світильники засвітяться. Клацни розетку, щоб побачити покази тестера. Автомати й ПЗВ — праворуч.</p>' : "") +
      planSvg("plan") + '</div><div class="pl-side">' + (live.on ? liveSide() : pointSide()) + "</div></div>";
    return h;
  }

  // ---------- режим «Під напругою» ----------
  function isOn(id) { return live.brk[id] !== 0; }
  function gPowered(g) {
    if (!g || !isOn("in") || (proj.relay && !isOn("relay")) || !isOn(g.id)) return false;
    if (g.prot === "rcd") { var q = P.byId(proj.rcds, g.rcd); if (q && !isOn(q.id)) return false; }
    return true;
  }
  function gWhyOff(g) {
    if (!g) return "точка не прив'язана до групи";
    if (!isOn("in")) return "вимкнено ввідний автомат";
    if (proj.relay && !isOn("relay")) return "вимкнено реле напруги";
    if (g.prot === "rcd") { var q = P.byId(proj.rcds, g.rcd); if (q && !isOn(q.id)) return "вимкнено ПЗВ " + rcdName(q); }
    if (!isOn(g.id)) return "вимкнено автомат «" + g.name + "»";
    return "";
  }
  function rcdName(q) { return q.In + " А " + q.dI + " мА"; }
  function multiWay(t) { var c = t.ctl || []; return c.length >= 2 && c.every(function (x) { var s = P.byId(proj.points, x.sw); return s && (s.kind === "pass" || s.kind === "cross"); }); }
  function swClosed(t) {
    var c = t.ctl || []; if (!c.length) return false;
    if (multiWay(t)) return c.reduce(function (v, x) { return v ^ (live.sw[x.sw + ":1"] ? 1 : 0); }, 0) === 1;
    return c.some(function (x) { return !!live.sw[x.sw + ":" + x.key]; });
  }
  function isLit(t) { return P.KINDS[t.kind].cat === "light" && gPowered(P.byId(proj.groups, t.group)) && swClosed(t); }
  function liveCls(t) {
    var cat = P.KINDS[t.kind].cat;
    if (cat === "light") return isLit(t) ? " lit" : " unlit";
    if (cat === "switch") { var k = P.KINDS[t.kind].keys || 1, any = false; for (var i = 1; i <= k; i++) if (live.sw[t.id + ":" + i]) any = true; return any ? " swon" : ""; }
    if (cat === "socket" || cat === "power") return gPowered(P.byId(proj.groups, t.group)) ? " hot" : " dead";
    return "";
  }
  function liveTap(id) {
    var t = P.byId(proj.points, id); if (!t) return;
    sel = { t: "point", id: id }; live.msg = "";
    if (P.KINDS[t.kind].cat === "switch" && (P.KINDS[t.kind].keys || 1) === 1) { var k = id + ":1"; live.sw[k] = live.sw[k] ? 0 : 1; }
    draw();
  }
  function liveSel() {
    var t = sel && sel.t === "point" && P.byId(proj.points, sel.id); if (!t) return "";
    var K = P.KINDS[t.kind], g = P.byId(proj.groups, t.group), pw = gPowered(g), nm = esc(P.labelRef(proj, t.id)), h = '<div class="pl-live-sel"><h4>' + nm + "</h4>";
    if (K.cat === "switch") {
      var n = K.keys || 1;
      h += '<div class="pl-keys">';
      for (var i = 1; i <= n; i++) {
        var onK = !!live.sw[t.id + ":" + i], lights = proj.points.filter(function (l) { return (l.ctl || []).some(function (c) { return c.sw === t.id && (multiWay(l) || c.key === i); }); });
        h += '<button type="button" class="pl-key' + (onK ? " on" : "") + '" data-act="lsw" data-id="' + t.id + '" data-v="' + i + '"><b>' + (n > 1 ? "Клавіша " + i : t.kind === "pass" || t.kind === "cross" ? "Перекинути" : "Клавіша") + "</b><span>" +
          (t.kind === "pass" || t.kind === "cross" ? "положення " + (onK ? "2" : "1") : onK ? "увімкнено" : "вимкнено") + " · " + lights.length + " світ.</span></button>";
      }
      h += "</div>";
      if (t.kind === "pass" || t.kind === "cross") h += "<p class='meta'>Прохідний не має «увімкнено» і «вимкнено» — він перекидає фазу з однієї жили-перемички на іншу. Світло залежить від положення всіх вимикачів ланцюжка.</p>";
      if (!pw) h += '<p class="pl-live-why">Світло не загориться: ' + esc(gWhyOff(g)) + ".</p>";
    } else if (K.cat === "light") {
      var lit = isLit(t);
      if (t.kind === "fan") h += "<p>" + (lit ? "🌀 Крутиться, " + P.nf(t.power || 0, 0) + " Вт." : pw ? (t.timer ? "Вимкнено вимикачем. Таймер ще 2–15 хв крутить вентилятор — на клемі L постійна фаза, тому він може доганяти." : "Не крутиться: вимикач розімкнув фазу.") : "Не крутиться: " + esc(gWhyOff(g)) + (t.timer ? ". Таймер теж без живлення." : ".")) + "</p>";
      else h += "<p>" + (lit ? "💡 Світиться, " + P.nf(t.power || 0, 0) + " Вт." : "Не світиться: " + esc(pw ? (t.ctl || []).length ? "вимикач розімкнув фазу" : "не прив'язаний до вимикача" : gWhyOff(g)) + ".") + "</p>";
      if ((t.ctl || []).length) h += "<p class='meta'>Вимикачі: " + t.ctl.map(function (c) { return esc(P.labelRef(proj, c.sw)) + (P.byId(proj.points, c.sw) && P.KINDS[P.byId(proj.points, c.sw).kind].keys > 1 ? ", клавіша " + c.key : ""); }).join("; ") + ".</p>";
    } else if (K.cat === "socket" || K.cat === "power") {
      h += '<table class="pl-meter"><tr><th>Тестер</th><th>Показ</th></tr><tr><td>L–N</td><td>' + (pw ? "≈ 230 В" : "0 В") + "</td></tr><tr><td>L–PE</td><td>" + (pw ? "≈ 230 В" : "0 В") + "</td></tr><tr><td>N–PE</td><td>0 В</td></tr></table>" +
        "<p>" + (pw ? "Напруга є. N–PE ≈ 0 В — нуль і земля розділені правильно в щиті." : "Знеструмлено: " + esc(gWhyOff(g)) + ".") + "</p>";
      if (t.device) { var d = P.device(t.device); if (d && d.id) h += "<p class='meta'>" + esc(d.name) + ": " + (pw ? "працює" : "не працює") + ".</p>"; }
      if ((t.ctl || []).length) h += schWrap("⚡ Схема", schemeSvg(t));
    } else if (t.kind === "jbox") h += "<p class='meta'>У коробці напруга є, коли увімкнено автомат групи. Перед роботою в коробці — вимкни автомат і перевір відсутність напруги індикатором.</p>";
    return h + "</div>";
  }
  function liveSide() {
    var lights = proj.points.filter(function (t) { return P.KINDS[t.kind].cat === "light"; }), lit = lights.filter(isLit);
    var W = lit.reduce(function (s, t) { return s + (t.power || 0); }, 0);
    function tg(id, name, extra) { var o = isOn(id); return '<div class="pl-brk' + (o ? " on" : "") + '"><button type="button" data-act="lbrk" data-id="' + esc(id) + '" class="pl-lever" aria-pressed="' + o + '">' + (o ? "I" : "O") + "</button><span>" + name + "</span>" + (extra || "") + "</div>"; }
    var h = '<div class="pl-live"><h3>🔌 Під напругою</h3><p class="pl-live-sum">Світиться: <b>' + lit.length + " з " + lights.length + "</b> · " + P.nf(W, 0) + " Вт</p>" +
      (live.msg ? '<p class="pl-live-msg">' + esc(live.msg) + "</p>" : "") + liveSel() +
      '<h4>Щиток</h4><div class="pl-brks">' + tg("in", "Ввідний автомат " + proj.input + " А") + (proj.relay ? tg("relay", "Реле напруги") : "");
    proj.rcds.forEach(function (q) {
      h += tg(q.id, "ПЗВ " + rcdName(q), '<button type="button" class="pl-tbtn" data-act="ltest" data-id="' + q.id + '" data-v="rcd">ТЕСТ</button>');
      proj.groups.filter(function (g) { return g.prot === "rcd" && g.rcd === q.id; }).forEach(function (g) { h += '<div class="pl-brk-sub">' + tg(g.id, esc(g.curve + g.In + " · " + g.name)) + "</div>"; });
    });
    proj.groups.filter(function (g) { return !(g.prot === "rcd" && P.byId(proj.rcds, g.rcd)); }).forEach(function (g) {
      h += tg(g.id, esc(g.curve + g.In + " · " + g.name) + (g.prot === "rcbo" ? " <em>диф., " + g.dI + " мА</em>" : ""), g.prot === "rcbo" ? '<button type="button" class="pl-tbtn" data-act="ltest" data-id="' + g.id + '" data-v="rcbo">ТЕСТ</button>' : "");
    });
    h += '</div><div class="row"><button type="button" class="btn ghost small" data-act="lalloff">Вимкнути всі вимикачі</button></div>' + hint("live") + "</div>";
    return h;
  }

  function wname(rid, w) { var r = P.byId(proj.rooms, rid); return (r ? r.name : "?") + ", " + P.WALL_NAME[w] + " стіна"; }
  function cm(v) { return P.nf(v, 0) + " см"; }
  function segSteps(s) {
    var C = proj.ceilH, out = [], v = s.verts || [];
    function vert(x, first, ceilEnd) {
      if (ceilEnd) { out.push("↕ Підйом до стелі: " + wname(x.room, x.wall) + ", " + cm(x.pos) + " від лівого кута — від траси вгору до стелі, далі по стелі до світильника."); return; }
      var up = first ? (s.a === "panel" ? "від щита вгору" : "від точки вгору") : "вниз до точки";
      if (s.plane === "ceiling" || s.plane === "ceilGrid") up = first ? "від точки вгору до стелі" : "зі стелі вниз до точки";
      if (s.plane === "floor") up = first ? "від точки вниз до підлоги" : "від підлоги вгору до точки";
      out.push("↕ Вертикальна штроба: " + wname(x.room, x.wall) + ", " + cm(x.pos) + " від лівого кута — " + up + ", між " + cm(x.z0) + " і " + cm(x.z1) + " від підлоги.");
    }
    if (s.line) {
      if (v[0] && v[0].room && sameEnd(v[0], s.a)) vert(v[0], true);
      if (s.plane === "ceilGrid") {
        for (var gi = 0; gi < s.line.length - 1; gi++) {
          var g0 = s.line[gi], g1 = s.line[gi + 1], gl = Math.hypot(g1[0] - g0[0], g1[1] - g0[1]); if (gl < 1) continue;
          var dirTxt = Math.abs(g1[0] - g0[0]) > Math.abs(g1[1] - g0[1]) ? (g1[0] > g0[0] ? "вправо" : "вліво") : (g1[1] > g0[1] ? "вниз по плану" : "вгору по плану");
          var rr0 = P.roomAt(proj, (g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2);
          out.push("⟶ По стелі " + dirTxt + " на " + P.nf(gl / 100) + " м" + (rr0 ? " (" + rr0.name + ")" : "") + ", паралельно стіні." + (gi < s.line.length - 2 ? " Далі поворот 90°." : ""));
        }
        (s.holes || []).forEach(function (o) { out.push("⊙ Отвір під стелею: " + P.byId(proj.rooms, o.from).name + " → " + P.byId(proj.rooms, o.to).name + "."); });
        out.push("Кліпси через 30–40 см, біля поворотів — по обидва боки.");
      } else out.push((s.plane === "ceiling" ? "↗ По стелі навпрост у гофрі" : "↗ По підлозі навпрост у гофрі під стяжку") + ", " + P.nf(s.horiz / 100) + " м." + (s.plane === "ceiling" ? " Кліпси через 30–40 см." : ""));
      var vb = v.filter(function (x) { return sameEnd(x, s.b); })[0]; if (vb) vert(vb, false);
      if (s.ceilStub && s.plane !== "ceiling" && s.plane !== "ceilGrid") out.push("↗ До світильника — по стелі від стіни до точки на стелі.");
      return out;
    }
    var va = v[0], vb2 = v[1], EA = P.endpoint(proj, s.a), EB = P.endpoint(proj, s.b);
    if (va) vert(va, true, EA && EA.ceiling);
    if (EA && EA.ceiling) out.push("↗ Від світильника по стелі до стіни — у гофрі.");
    var merged = [];
    (s.pieces || []).forEach(function (pc) {
      var lo = Math.min(pc.p0, pc.p1), hi = Math.max(pc.p0, pc.p1), m = merged[merged.length - 1];
      if (m && m.room === pc.room && m.wall === pc.wall) { m.lo = Math.min(m.lo, lo); m.hi = Math.max(m.hi, hi); m.len += hi - lo; }
      else merged.push({ room: pc.room, wall: pc.wall, z: pc.z, lo: lo, hi: hi, len: hi - lo });
    });
    var prevRoom = EA && EA.room ? EA.room.id : null;
    merged.forEach(function (m, i) {
      if (prevRoom && m.room !== prevRoom) {
        var h0 = (s.holes || []).filter(function (o) { return o.from === prevRoom && o.to === m.room; })[0];
        if (h0) out.push("⊙ Отвір у стіні: " + P.byId(proj.rooms, h0.from).name + " → " + P.byId(proj.rooms, h0.to).name + ", на висоті " + cm(h0.z) + ".");
      }
      prevRoom = m.room;
      if (m.len >= 1) out.push("↔ Горизонталь: " + wname(m.room, m.wall) + ", " + (s.plane === "wallTop" ? cm(C - m.z) + " нижче стелі" : cm(m.z) + " від підлоги") + ", від " + cm(m.lo) + " до " + cm(m.hi) + " від лівого кута (" + P.nf(m.len / 100) + " м).");
      var nx = merged[i + 1];
      if (nx && nx.room === m.room && m.len >= 1) out.push("↱ Поворот у кут на сусідню стіну.");
    });
    if (vb2) vert(vb2, false, EB && EB.ceiling);
    if (EB && EB.ceiling) out.push("↗ Від стіни по стелі до світильника — у гофрі, з запасом кабелю 20–30 см.");
    return out;
  }
  function sameEnd(v, ref) { var e = P.endpoint(proj, ref); return e && !e.ceiling && e.room.id === v.room && e.wall === v.wall && Math.abs(e.pos - v.pos) < 1; }

  // ---------- принципова схема: щит → коробка → вимикачі → світильник ----------
  var FN = { L: "фаза від щита", N: "нуль — від світильника назад до щита", PE: "захисне заземлення (корпус)", "L'": "вимкнена фаза — від вимикача до світильника", "L1'": "вимкнена фаза, клавіша 1", "L2'": "вимкнена фаза, клавіша 2",
    T1: "перемичка 1 між прохідними", T2: "перемичка 2 між прохідними", IN1: "перемичка 1 (з боку першого прохідного)", IN2: "перемичка 2 (з боку першого прохідного)", OUT1: "перемичка 1 (до другого прохідного)", OUT2: "перемичка 2 (до другого прохідного)",
    "Lпост": "постійна фаза — живить таймер", "резерв": "запасна — заізолюй", "—": "не використовується — заізолюй" };
  function swTag(id) { var s = P.byId(proj.points, id); return s ? P.tagOf(proj, s) : "?"; }
  // ланцюжки керування світильником: [{multi:bool, els:[{id, key, type:"spst"|"pass1"|"cross"|"pass2"}]}]
  function chainsOf(t) {
    var c = t.ctl || [];
    if (!c.length) return [];
    if (multiWay(t)) {
      var ids = c.map(function (x) { return x.sw; }), pass = ids.filter(function (id) { return P.byId(proj.points, id).kind === "pass"; }), cr = ids.filter(function (id) { return P.byId(proj.points, id).kind === "cross"; });
      if (pass.length !== 2) return [{ bad: "Для керування з кількох місць потрібно рівно два прохідні вимикачі (перехресних між ними — скільки завгодно). Зараз прохідних: " + pass.length + "." }];
      return [{ multi: true, els: [{ id: pass[0], key: 1, type: "pass1" }].concat(cr.map(function (id) { return { id: id, key: 1, type: "cross" }; }), [{ id: pass[1], key: 1, type: "pass2" }]) }];
    }
    var seen = {}, out = [];
    c.forEach(function (x) { var k = x.sw + ":" + x.key; if (seen[k]) return; seen[k] = 1; var s = P.byId(proj.points, x.sw); if (s) out.push({ els: [{ id: x.sw, key: x.key, type: s.kind === "pass" || s.kind === "cross" ? "bad" : "spst" }] }); });
    return out;
  }
  function sigOf(t) { return chainsOf(t).map(function (ch) { return (ch.els || []).map(function (e) { return e.id + ":" + e.key; }).join(">"); }).sort().join("|"); }
  function schemeSvg(t, me) {
    var chains = chainsOf(t), g = P.byId(proj.groups, t.group), pw = gPowered(g), lit = isLit(t);
    if (!chains.length) return "<p class='meta'>Світильник не прив'язаний до вимикача — познач вимикач у «Чим вмикається».</p>";
    if (chains[0].bad) return '<div class="warn">' + esc(chains[0].bad) + "</div>";
    var n = chains.length, maxEl = Math.max.apply(null, chains.map(function (ch) { return ch.els.length; }));
    var xP = 64, xB = 100, x0 = 165, DX = 96, xl = x0 + (maxEl - 1) * DX + 80, W = xl + 100;
    var yTop = 46, CH = 84, yLamp = yTop + n * CH - 6, yN = yLamp + 52, yPE = yN + 24, H = yPE + 22;
    var timer = t.kind === "fan" && t.timer;
    var mates = proj.points.filter(function (x) { return x.id !== t.id && P.KINDS[x.kind].cat === "light" && x.group === t.group && sigOf(x) === sigOf(t); });
    var pn = P.panel(proj), dev = pn.devices.filter(function (d) { return d.group === (g && g.id); })[0];
    var up = cablePath(t.id, calc().segs).up, box = null;
    up.forEach(function (s) { var bp = P.byId(proj.points, s.b); if (bp && bp.kind === "jbox") box = bp; });
    var h = "", path = [], says = [];
    function ln(pts, cls, title) { h += '<polyline points="' + pts.map(function (q) { return q[0] + "," + q[1]; }).join(" ") + '" class="sch-w ' + cls + '"' + (title ? "><title>" + esc(title) + "</title></polyline>" : "/>"); }
    function dotJ(x, y) { h += '<circle cx="' + x + '" cy="' + y + '" r="3.6" class="sch-j"/>'; }
    function txt(x, y, s, cls, anchor) { h += '<text x="' + x + '" y="' + y + '" class="sch-t ' + (cls || "") + '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + esc(s) + "</text>"; }
    function term(x, y) { h += '<circle cx="' + x + '" cy="' + y + '" r="3" class="sch-term"/>'; }
    // щит
    h += '<rect x="6" y="' + (yTop - 30) + '" width="' + (xP - 6) + '" height="' + (yPE - yTop + 42) + '" rx="6" class="sch-panel"/>';
    txt(35, yTop - 14, "Щит", "b", "middle");
    txt(35, yTop + 22, dev ? dev.tag : "QF?", "b", "middle");
    txt(35, yTop + 36, g ? g.curve + g.In : "", "", "middle");
    if (g && (g.prot === "rcbo" || (g.prot === "rcd" && P.byId(proj.rcds, g.rcd)))) txt(35, yTop + 50, (g.prot === "rcbo" ? g.dI : P.byId(proj.rcds, g.rcd).dI) + " мА", "", "middle");
    txt(35, yTop + 70, pw ? "увімк." : "вимк.", pw ? "on" : "off", "middle");
    // коробка
    h += '<rect x="' + (xB - 16) + '" y="' + (yTop - 30) + '" width="32" height="' + (yPE - yTop + 42) + '" rx="5" class="sch-box"/>';
    txt(xB, yTop - 16, box ? P.tagOf(proj, box) : "коробка", "s", "middle");
    var phase = pw ? " ph on" : " ph off";
    // L до коробки і розподіл на ланцюжки
    var yIns = chains.map(function (ch, i) { var y = yTop + i * CH; return ch.els[0].type === "pass1" ? y + 20 : y; });
    ln([[xP, yTop], [xB, yTop]], "L" + phase, "L — фаза від автомата");
    txt(xP + 4, yTop - 5, "L", "s");
    dotJ(xB, yTop);
    if (n > 1 || yIns[0] !== yTop) ln([[xB, yTop], [xB, Math.max.apply(null, yIns)]], "L" + phase);
    says.push("Фаза L: автомат " + (dev ? dev.tag : "") + " → " + (box ? "коробка " + P.tagOf(proj, box) : "коробка") + (pw ? "" : " — зараз автомат або ПЗВ вимкнено, напруги немає") + ".");
    if (timer) {
      ln([[xB + 24, yTop], [xB + 24, yTop - 22], [xl + 12, yTop - 22], [xl + 12, yLamp - 11]], "Lp" + phase, "Lпост — постійна фаза на таймер"); dotJ(xB + 24, yTop);
      txt(xl + 16, yTop - 26, "Lпост → L", "s");
    }
    chains.forEach(function (ch, ci) {
      var y = yTop + ci * CH, yIn = yIns[ci], off = ((n - 1) / 2 - ci) * 12, xo, yo, on;
      ln([[xB, yIn], [x0 - 28, yIn]], "L" + phase); if (ci > 0 || yIn !== yTop) dotJ(xB, yIn);
      var trav = 0, live1 = pw, chainSay = [];
      ch.els.forEach(function (e, k) {
        var x = x0 + k * DX, st = live.sw[e.id + ":" + e.key] ? 1 : 0, sp = P.byId(proj.points, e.id), cls = "sch-sw" + (e.id === me ? " me" : "");
        h += '<g class="' + cls + '" data-act="lsw" data-id="' + esc(e.id) + '" data-v="' + e.key + '"><title>Клацни, щоб перемкнути</title><rect x="' + (x - 36) + '" y="' + (y - 26) + '" width="72" height="' + (e.type === "spst" ? 44 : 78) + '" rx="6" class="sch-hit"/>';
        if (e.type === "spst") {
          term(x - 28, y); term(x + 28, y);
          h += '<line x1="' + (x - 28) + '" y1="' + y + '" x2="' + (st ? x + 28 : x + 20) + '" y2="' + (st ? y : y - 20) + '" class="sch-blade' + (live1 && st ? " on" : "") + '"/>';
          live1 = live1 && !!st; xo = x + 28; yo = y;
          txt(x, y + 26, swTag(e.id) + (sp.kind === "sw2" ? " кл." + e.key : ""), "b", "middle");
          chainSay.push(swTag(e.id) + (st ? " замкнений" : " розімкнений"));
        } else if (e.type === "pass1") {
          term(x - 28, y + 20); term(x + 28, y); term(x + 28, y + 40);
          h += '<line x1="' + (x - 28) + '" y1="' + (y + 20) + '" x2="' + (x + 28) + '" y2="' + (st ? y + 40 : y) + '" class="sch-blade' + (live1 ? " on" : "") + '"/>';
          txt(x - 30, y + 14, "COM", "xs", "end");
          trav = st; xo = x + 28;
          txt(x, y + 58, swTag(e.id), "b", "middle"); txt(x, y + 70, "прохідний", "xs", "middle");
          chainSay.push(swTag(e.id) + " → перемичка " + (st + 1));
        } else if (e.type === "cross") {
          term(x - 28, y); term(x - 28, y + 40); term(x + 28, y); term(x + 28, y + 40);
          if (!st) { h += '<line x1="' + (x - 28) + '" y1="' + y + '" x2="' + (x + 28) + '" y2="' + y + '" class="sch-blade' + (live1 && trav === 0 ? " on" : "") + '"/><line x1="' + (x - 28) + '" y1="' + (y + 40) + '" x2="' + (x + 28) + '" y2="' + (y + 40) + '" class="sch-blade' + (live1 && trav === 1 ? " on" : "") + '"/>'; }
          else { h += '<line x1="' + (x - 28) + '" y1="' + y + '" x2="' + (x + 28) + '" y2="' + (y + 40) + '" class="sch-blade' + (live1 && trav === 0 ? " on" : "") + '"/><line x1="' + (x - 28) + '" y1="' + (y + 40) + '" x2="' + (x + 28) + '" y2="' + y + '" class="sch-blade' + (live1 && trav === 1 ? " on" : "") + '"/>'; trav = 1 - trav; }
          txt(x, y + 58, swTag(e.id), "b", "middle"); txt(x, y + 70, "перехресний", "xs", "middle");
          chainSay.push(swTag(e.id) + (st ? " перехрещує перемички → тепер " + (trav + 1) : " пропускає прямо → перемичка " + (trav + 1)));
        } else if (e.type === "pass2") {
          term(x - 28, y); term(x - 28, y + 40); term(x + 28, y + 20);
          var pick = st ? 0 : 1;
          h += '<line x1="' + (x + 28) + '" y1="' + (y + 20) + '" x2="' + (x - 28) + '" y2="' + (pick ? y + 40 : y) + '" class="sch-blade' + (live1 && trav === pick ? " on" : "") + '"/>';
          txt(x + 30, y + 34, "COM", "xs");
          chainSay.push(swTag(e.id) + " стоїть на перемичці " + (pick + 1) + (trav === pick ? " — фаза проходить" : " — а фаза на іншій, світла немає"));
          live1 = live1 && trav === pick; xo = x + 28; yo = y + 20;
          txt(x, y + 58, swTag(e.id), "b", "middle"); txt(x, y + 70, "прохідний", "xs", "middle");
        }
        h += "</g>";
        // перемички до наступного
        var nx = ch.els[k + 1];
        if (nx && (e.type === "pass1" || e.type === "cross")) {
          [0, 1].forEach(function (tr) { ln([[x + 28, y + tr * 40], [x + DX - 28, y + tr * 40]], "T" + (pw && trav === tr ? " ph on" : " ph off"), "Перемичка " + (tr + 1) + " (перекидний провідник)"); });
          txt(x + DX / 2, y - 5, "перемичка 1", "xs", "middle"); txt(x + DX / 2, y + 35, "перемичка 2", "xs", "middle");
        }
      });
      on = live1;
      var xt = xl + off;
      ln([[xo, yo], [xt, yo], [xt, yLamp - 15]], "Ls" + (on ? " ph on" : " ph off"), (n > 1 ? "L" + (ci + 1) + "'" : "L'") + " — вимкнена фаза до світильника");
      txt(xo + 6, yo - 5, timer ? "L' → S" : n > 1 ? "L" + (ci + 1) + "'" : "L'", "s");
      says.push((ch.multi ? "Керування з " + ch.els.length + " місць: " : "") + chainSay.join("; ") + ". " + (on ? "Фаза доходить до світильника." : "До світильника фаза не доходить."));
    });
    // світильник
    h += '<g class="sch-lamp' + (lit ? " lit" : "") + '">' + (lit ? '<circle cx="' + xl + '" cy="' + yLamp + '" r="28" class="sch-glow"/>' : "") + '<circle cx="' + xl + '" cy="' + yLamp + '" r="16" class="sch-lc"/>' +
      (t.kind === "fan" ? '<path d="M' + xl + " " + yLamp + "l0 -11M" + xl + " " + yLamp + "l9.5 5.5M" + xl + " " + yLamp + 'l-9.5 5.5" class="sch-lx"/>' : '<path d="M' + (xl - 11) + " " + (yLamp - 11) + "L" + (xl + 11) + " " + (yLamp + 11) + "M" + (xl + 11) + " " + (yLamp - 11) + "L" + (xl - 11) + " " + (yLamp + 11) + '" class="sch-lx"/>') + "</g>";
    txt(xl + 22, yLamp - 20, P.tagOf(proj, t), "b");
    if (mates.length) txt(xl + 36, yLamp + 18, "+" + mates.length + " паралельно", "xs");
    // N і PE
    ln([[xl, yLamp + 16], [xl, yN], [xP, yN]], "N" + (lit ? " on" : ""), "N — нуль");
    ln([[xl + 16, yLamp], [xl + 30, yLamp], [xl + 30, yPE], [xP, yPE]], "PE", "PE — захисне заземлення");
    dotJ(xB, yN); dotJ(xB, yPE);
    txt(xP + 4, yN - 5, "N", "s"); txt(xP + 4, yPE - 5, "PE", "s");
    var svg = '<svg class="pl-scheme" viewBox="0 0 ' + W + " " + H + '" style="max-width:' + W * 1.15 + 'px">' + h + "</svg>";
    return svg + '<ul class="pl-says">' + says.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "<li><b>" + (t.kind === "fan" ? (lit ? "🌀 Вентилятор крутиться." : timer && pw ? "Вентилятор стоїть (таймер ще може докрутити кілька хвилин)." : "Вентилятор стоїть.") : lit ? "💡 Світильник світиться." : "Світильник не світиться.") + "</b></li></ul>" +
      '<p class="meta">Це принципова схема — як струм іде логічно. Фізично всі точки ● — це клеми WAGO в коробці' + (box ? " " + esc(P.tagOf(proj, box)) : "") + ": від неї окремий кабель іде до кожного вимикача і до світильника. Клацай вимикачі на схемі — вони перемикаються, а світильник засвічується так само, як у режимі «Під напругою».</p>";
  }
  // усі кабелі, потрібні для цієї точки: від щита до неї і до кожного вимикача, з призначенням кожної жили
  function wiresHtml(t) {
    var segs = calc().segs, list = [], seen = {};
    function add(s) { if (s && !seen[s.key]) { seen[s.key] = 1; list.push(s); } }
    cablePath(t.id, segs).up.forEach(add);
    chainsOf(t).forEach(function (ch) { (ch.els || []).forEach(function (e) { cablePath(e.id, segs).up.forEach(add); }); });
    if (!list.length) return "";
    var ch0 = chainsOf(t)[0], firstPass = ch0 && ch0.multi ? ch0.els[0].id : null, lastPass = ch0 && ch0.multi ? ch0.els[ch0.els.length - 1].id : null;
    var sum = {};
    var rows = list.map(function (s) {
      sum[s.cable] = (sum[s.cable] || 0) + s.len;
      var cs = P.cores(proj, s), purpose = s.role === "feed" ? "живлення" : s.role === "switch" ? "до вимикача" : "до світильника";
      return "<li><b>" + esc(P.labelRef(proj, s.a).split(" (")[0]) + " → " + esc(P.labelRef(proj, s.b).split(" (")[0]) + "</b> <span class='meta'>· " + s.cable + " · " + P.nf(s.len / 100) + " м · " + purpose + "</span><ul class='pl-conn'>" +
        cs.map(function (c) {
          var f = FN[c.f] || c.f;
          if (c.f === "COM") f = s.b === firstPass ? "COM — сюди фаза L з коробки" : s.b === lastPass ? "COM — звідси вимкнена фаза йде на світильник" : "загальна клема COM";
          if (s.role === "switch" && c.f === "L") f = "фаза з коробки на вимикач";
          return "<li>" + dot(c.c) + "<span><b>" + esc(P.COLORS[c.c]) + "</b> — " + esc(c.f) + ": " + esc(f) + (c.mark ? " (" + esc(c.mark) + ")" : "") + "</span></li>";
        }).join("") + "</ul></li>";
    });
    return '<details class="pl-path"><summary>🧵 Усі кабелі й жили для цієї точки (' + list.length + ")</summary><ol class='pl-pathl'>" + rows.join("") + "</ol><p class='meta'>Разом: " +
      Object.keys(sum).map(function (k) { return k + " — " + P.nf(sum[k] / 100) + " м"; }).join(", ") + " (без запасу на коробки). Кабелі від щита до коробки спільні з іншими точками групи.</p></details>";
  }
  var bigSch = false;
  function schWrap(title, inner) {
    return (bigSch ? '<div class="pl-sch-back" data-act="schbig"></div>' : "") + '<details class="pl-path pl-sch' + (bigSch ? " big" : "") + '" open><summary>' + title + '</summary><button type="button" class="btn ghost small pl-schbtn" data-act="schbig">' + (bigSch ? "✕ Закрити" : "⤢ Збільшити схему") + "</button>" + inner + "</details>";
  }
  function schemeHtml(t) {
    var K = P.KINDS[t.kind];
    if (K.cat === "light") return schWrap("⚡ Схема підключення", schemeSvg(t)) + wiresHtml(t);
    if (K.cat === "switch") {
      var ls = proj.points.filter(function (l) { return P.KINDS[l.kind].cat === "light" && (l.ctl || []).some(function (c) { return c.sw === t.id; }); });
      var bySig = {}, reps = [];
      ls.forEach(function (l) { var k = sigOf(l) + "#" + l.group; if (!bySig[k]) { bySig[k] = 1; reps.push(l); } });
      if (!reps.length) return "";
      return schWrap("⚡ Схема: що вмикає цей вимикач", reps.slice(0, 3).map(function (l) { return "<p class='meta'><b>" + esc(P.labelRef(proj, l.id)) + "</b></p>" + schemeSvg(l, t.id); }).join(""));
    }
    return "";
  }
  function pathHtml(t) {
    var segs = calc().segs, cp = cablePath(t.id, segs);
    if (!cp.up.length && !cp.down.length) return "";
    function one(s, n) {
      return '<li><a href="javascript:void 0" data-act="selseg" data-id="' + esc(s.key) + '"><b>' + (n ? n + ". " : "") + esc(P.labelRef(proj, s.a)) + " → " + esc(P.labelRef(proj, s.b)) + "</b></a>" +
        '<div class="meta">' + s.cable + " · " + P.nf(s.len / 100) + " м · " + esc(P.PLANES[s.plane]) + "</div><ul>" + segSteps(s).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></li>";
    }
    var tot = cp.up.reduce(function (a, s) { return a + s.len; }, 0);
    return '<details class="pl-path" open><summary>🧭 Де йде кабель' + (cp.up.length ? " · від щита " + P.nf(tot / 100) + " м" : "") + "</summary>" +
      (cp.up.length ? "<p class='meta'>Від щита до цієї точки, по порядку. На плані підсвічено, решта трас бліді.</p><ol class='pl-pathl'>" + cp.up.map(function (s, i) { return one(s, i + 1); }).join("") + "</ol>" : "") +
      (cp.down.length ? "<p class='meta'>Далі від цієї точки:</p><ul class='pl-pathl'>" + cp.down.map(function (s) { return one(s, 0); }).join("") + "</ul>" : "") + "</details>";
  }

  function defaultGroup(t) {
    var cat = P.KINDS[t.kind].cat;
    if (cat === "light" || cat === "switch" || cat === "box") { var g = proj.groups.filter(function (x) { return x.kind === "light"; })[0]; return g ? g.id : null; }
    if (cat === "socket") {
      var same = proj.points.filter(function (x) { return x.kind === "socket" && x.room === t.room && x.group && x.id !== t.id; })[0];
      if (same) return same.group;
      var sg = proj.groups.filter(function (x) { return x.kind === "socket"; })[0]; return sg ? sg.id : null;
    }
    return null;
  }

  function multiSide() {
    var pts = multi.map(function (mid) { return P.byId(proj.points, mid); }).filter(Boolean), walls = pts.filter(function (t) { return t.wall; }), ceil = pts.filter(function (t) { return t.x != null; });
    var gs = {}; pts.forEach(function (t) { gs[t.group || ""] = 1; }); var g1 = Object.keys(gs).length === 1 ? Object.keys(gs)[0] : "__";
    return '<div class="card pl-card"><h3>Виділено: ' + pts.length + "</h3>" +
      "<p class='meta'>" + (proj.locked ? "Рух заблоковано — зніми 🔒, щоб перетягувати." : "Тягни будь-яку з виділених — усі переміщуються разом. Точки на стіні їдуть уздовж своєї стіни, на стелі — вільно.") + "</p>" +
      '<ul class="pl-ul">' + pts.map(function (t) { return "<li>" + esc(P.labelRef(proj, t.id)) + "</li>"; }).join("") + "</ul>" +
      '<label class="pl-f"><span>Група для всіх</span><select data-act="mgroup">' + (g1 === "__" ? '<option value="__" selected>— різні —</option>' : "") + '<option value=""' + (g1 === "" ? " selected" : "") + '>— без групи —</option>' +
      proj.groups.map(function (g) { return '<option value="' + g.id + '"' + (g1 === g.id ? " selected" : "") + ">" + esc(g.name) + "</option>"; }).join("") + "</select></label>" +
      (walls.length ? '<div class="pl-grid2"><label class="pl-f"><span>Висота для точок на стіні</span><input class="pl-mh" inputmode="decimal" value="' + (walls[0].h || "") + '"><em>см</em></label><div class="row"><button type="button" class="btn small" data-act="mheight">Задати ' + walls.length + " шт.</button></div></div>" : "") +
      (ceil.length > 1 ? '<div class="row"><button type="button" class="btn ghost small" data-act="malign" data-v="y">⇔ В одну лінію (горизонтально)</button><button type="button" class="btn ghost small" data-act="malign" data-v="x">⇕ В одну лінію (вертикально)</button></div>' : "") +
      '<div class="row"><button type="button" class="btn ghost small" data-act="munsel">Зняти виділення</button><button type="button" class="btn ghost small pl-danger" data-act="mdel">Видалити виділені</button></div></div>';
  }
  function pointSide() {
    if (multi.length > 1) return multiSide();
    var c = calc();
    if (sel && sel.t === "panel") return '<div class="card pl-card"><h3>Щит</h3>' + panelFields() + hint("panel", true) + "</div>";
    if (sel && sel.t === "room") return roomCablesHtml(sel.id) + '<div class="card pl-card"><label class="pl-f"><span>Інша кімната</span><select data-act="cabroom">' + proj.rooms.map(function (q) { return '<option value="' + q.id + '"' + (q.id === sel.id ? " selected" : "") + ">" + esc(q.name) + "</option>"; }).join("") + "</select></label></div>";
    var t = sel && sel.t === "point" ? P.byId(proj.points, sel.id) : null;
    if (!t) {
      var errs = c.issues.filter(function (i) { return i.lvl === "error"; });
      return '<div class="card pl-card"><h3>Як користуватись</h3><ul class="pl-ul"><li>Перемикач <b>Стеля / Стіни</b> обирає, що редагувати і що додавати.</li><li>Клікни точку — побачиш її параметри, з\'єднання і пояснення «Чому так».</li><li>Перетягуй точки; на телефоні — пальцем. Порожнє місце тягни, щоб посунути план.</li><li>Колір траси — колір групи. Клікни трасу, щоб змінити спосіб прокладання саме цього відрізка.</li><li>Клікни порожнє місце в кімнаті — побачиш, скільки кабелів у неї заходить і звідки.</li></ul>' +
        '<label class="pl-f"><span>🧵 Кабелі в кімнаті</span><select data-act="cabroom"><option value="">— обери кімнату —</option>' + proj.rooms.map(function (q) { return '<option value="' + q.id + '">' + esc(q.name) + "</option>"; }).join("") + "</select></label>" +
        (errs.length ? '<div class="warn">Помилок у проєкті: ' + errs.length + '. <a href="javascript:void 0" data-tab="groups">Переглянути</a></div>' : '<div class="tip">Помилок немає.</div>') + "</div>" + segSide();
    }
    var K = P.KINDS[t.kind], r = P.byId(proj.rooms, t.room), h = '<div class="card pl-card"><h3>' + esc(P.labelRef(proj, t.id)) + "</h3>";
    if (K.surf === "wall") h += selF("point", t.id, "wall", t.wall, wallOpts(r), "Стіна") + '<div class="pl-grid2">' + inp("point", t.id, "pos", t.pos, { label: "Від лівого кута", unit: "см" }) + inp("point", t.id, "h", t.h, { label: "Висота від підлоги", unit: "см" }) + "</div>";
    else h += '<div class="pl-grid2">' + inp("point", t.id, "rx", t.x - r.x, { label: "Від лівої стіни", unit: "см" }) + inp("point", t.id, "ry", t.y - r.y, { label: "Від верхньої стіни", unit: "см" }) + "</div>";
    if (t.kind === "fan") h += selF("point", t.id, "timer", t.timer ? 1 : 0, [[1, "з таймером — постійна фаза + від вимикача"], [0, "без таймера — лише від вимикача"]], "Живлення");
    if (t.kind === "socket") h += selF("point", t.id, "gang", t.gang, [[1, "1 пост"], [2, "2 пости (блок)"], [3, "3 пости"], [4, "4 пости"]], "Кількість постів");
    if (t.kind === "socket" || t.kind === "outlet") h += selF("device", t.id, "device", t.device || "", P.DEVICES.map(function (d) { return [d.id, d.name + (d.P ? " — " + P.nf(d.P / 1000, 1) + " кВт" : "")]; }), "Що сюди ввімкнуть");
    if (t.kind === "socket" || t.kind === "outlet" || K.cat === "light") h += inp("point", t.id, "power", t.power || 0, { label: K.cat === "light" ? "Потужність" : "Прилад (потужність, якщо відомо)", unit: "Вт" });
    h += inp("point", t.id, "label", t.label || "", { label: "Підпис", str: true });
    h += selF("point", t.id, "group", t.group || "", [["", "— не призначено —"]].concat(proj.groups.map(function (g) { return [g.id, g.name]; })), "Група (автомат у щиті)") +
      '<button type="button" class="btn ghost small" data-act="newgroup" data-id="' + t.id + '">+ Нова група для цієї точки</button>';
    if (K.cat === "light") {
      var sws = proj.points.filter(function (x) { return P.KINDS[x.kind].cat === "switch"; });
      h += "<h4>Чим вмикається</h4>" + (sws.length ? sws.map(function (s) {
        var c1 = (t.ctl || []).filter(function (c) { return c.sw === s.id; })[0];
        return '<label class="pl-f pl-chk"><input type="checkbox" data-act="ctl" data-id="' + t.id + '" data-sw="' + s.id + '"' + (c1 ? " checked" : "") + "> " + esc(P.labelRef(proj, s.id)) + "</label>" +
          (s.kind === "sw2" && c1 ? selF("ctlkey", t.id + "|" + s.id, "key", c1.key, [[1, "клавіша 1"], [2, "клавіша 2"]], "") : "");
      }).join("") : "<p class='meta'>Додай вимикач на стіні.</p>") + '<p class="meta">Два прохідні (і перехресні між ними) — керування з кількох місць.</p>';
    }
    if (K.cat === "switch") {
      var ls = proj.points.filter(function (l) { return (l.ctl || []).some(function (c) { return c.sw === t.id; }); });
      h += "<h4>Що вмикає</h4>" + (ls.length ? "<ul class='pl-ul'>" + ls.map(function (l) { return "<li>" + esc(P.labelRef(proj, l.id)) + "</li>"; }).join("") + "</ul>" : "<p class='meta'>Нічого. Обери світильник і познач цей вимикач у «Чим вмикається».</p>");
    }
    if (t.group) h += groupLoadLine(t.group);
    if (t.device && P.device(t.device) && P.device(t.device).ac) h += hint("ac");
    var iss = c.issues.filter(function (i) { return i.ref === t.id; });
    if (iss.length) h += iss.map(issueHtml).join("");
    // кабель до точки
    var seg = c.segs.filter(function (s) { return s.b === t.id; })[0];
    if (seg) h += "<h4>Кабель до точки</h4><p>Від «" + esc(P.labelRef(proj, seg.a)) + "»: <b>" + seg.cable + "</b>, " + P.nf(seg.len / 100) + " м</p>" + planeSel(seg);
    h += schemeHtml(t) + pathHtml(t) + connHtml(t) + hint(hintKey(t)) + (function () { var rr = P.byId(proj.rooms, t.room); return rr && (rr.type === "bath" || rr.type === "wc") ? hint("bath") : ""; })() + (seg ? hint(seg.plane) : "") + '<div class="row"><button type="button" class="btn ghost small pl-danger" data-act="delpt" data-id="' + t.id + '">Видалити точку</button></div></div>';
    return h;
  }
  function hintKey(t) { return t.kind; }
  function loadOf(gid) { return P.load(proj, calc().segs).filter(function (x) { return x.g.id === gid; })[0]; }
  function bar(pct) { var c = pct > 1 ? "lv-bad" : pct > 0.8 ? "lv-warn" : "lv-ok"; return '<span class="pl-bar-l ' + c + '"><i style="width:' + Math.min(100, Math.round(pct * 100)) + '%"></i></span>'; }
  function groupLoadLine(gid) {
    var x = loadOf(gid); if (!x) return "";
    return '<div class="pl-loadline">Група «' + esc(x.g.name) + "»: " + P.nf(x.P, 0) + " Вт → " + P.nf(x.I, 2) + " А з " + x.g.In + " А " + bar(x.pct) + " " + Math.round(x.pct * 100) + " %</div>";
  }
  function planeSel(seg) {
    var g = P.byId(proj.groups, seg.group), ov = proj.over[seg.key];
    return selF("seg", seg.key, "plane", ov || "", [["", "як у групі (" + P.PLANES[g.plane].toLowerCase() + ")"]].concat(Object.keys(P.PLANES).map(function (k) { return [k, P.PLANES[k]]; })), "Як прокласти цей відрізок");
  }
  function segSide() {
    if (!sel || sel.t !== "seg") return "";
    var seg = calc().segs.filter(function (s) { return s.key === sel.id; })[0]; if (!seg) return "";
    return '<div class="card pl-card"><h3>Відрізок траси</h3><p>' + esc(P.labelRef(proj, seg.a)) + " → " + esc(P.labelRef(proj, seg.b)) + "</p><p><b>" + seg.cable + "</b>, " + P.nf(seg.len / 100) + " м (горизонталь " + P.nf(seg.horiz / 100) + " м, спуски " + P.nf(seg.drops / 100) + " м)</p>" + planeSel(seg) + hint(seg.plane, true) + (seg.plane === "ceiling" || seg.plane === "ceilGrid" || seg.plane === "floor" ? hint("mount", true) : "") + hint("cable") + "</div>";
  }
  function dot(c) { return c ? '<i class="pl-dotc" style="background:' + P.COLOR_HEX[c] + '"></i>' : '<i class="pl-dotc none"></i>'; }
  function connHtml(t) {
    var cn = P.connections(proj, calc().segs);
    if (t.kind === "jbox") { var b = cn.boxes.filter(function (x) { return x.id === t.id; })[0]; return b ? "<h4>З'єднання в коробці</h4>" + boxHtml(b) : ""; }
    var lines = cn.points[t.id]; if (!lines) return "";
    return "<h4>Як під'єднати</h4><ul class='pl-conn'>" + lines.map(function (l) { return "<li>" + dot(l.color) + esc(l.text) + "</li>"; }).join("") + "</ul>" + (t.kind === "socket" && lines.length > 3 ? hint("loop") : "");
  }
  function boxHtml(b) {
    return '<div class="pl-joins">' + b.joins.map(function (j) {
      return '<div class="pl-join"><div class="pl-jt"><b>' + esc(j.title) + '</b><span class="tag">WAGO на ' + j.wago + "</span></div><ul>" +
        j.wires.map(function (w) { return "<li>" + dot(w.color) + esc(P.COLORS[w.color]) + " <b>" + esc(w.core) + "</b> — кабель " + esc(w.cable) + " ↔ " + esc(w.from) + (w.mark ? " <em>(" + esc(w.mark) + ")</em>" : "") + "</li>"; }).join("") + "</ul>" + (j.note ? '<p class="meta">' + esc(j.note) + "</p>" : "") + "</div>";
    }).join("") + (b.unused.length ? '<ul class="pl-unused">' + b.unused.map(function (u) { return "<li>" + esc(u) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
  }
  function issueHtml(i) {
    var hh = P.hintFor(i);
    return '<div class="' + (i.lvl === "error" ? "warn" : "note") + ' pl-issue">' + (i.lvl === "error" ? "✗ " : "⚠ ") + esc(i.msg) +
      (i.ref && P.byId(proj.points, i.ref) ? ' <a href="javascript:void 0" data-act="goto" data-id="' + i.ref + '">показати</a>' : "") +
      (hh ? '<details class="pl-hint"><summary>💡 Чому так</summary>' + hh.h + '<div class="pl-links">' + lessonLinks(hh.l) + "</div></details>" : "") + "</div>";
  }
  function panelFields() {
    var r = P.byId(proj.rooms, proj.panel.room);
    return selF("panelf", "", "room", proj.panel.room, proj.rooms.map(function (q) { return [q.id, q.name]; }), "Кімната") + selF("panelf", "", "wall", proj.panel.wall, wallOpts(r), "Стіна") +
      '<div class="pl-grid2">' + inp("panelf", "", "pos", proj.panel.pos, { label: "Від лівого кута", unit: "см" }) + inp("panelf", "", "h", proj.panel.h, { label: "Низ корпусу", unit: "см" }) + "</div>";
  }

  // ---------- вкладка «Стіни» ----------
  function wallsTab() {
    var r = P.byId(proj.rooms, ui.wallRoom); if (!r) { r = proj.rooms[0]; if (!r) return "<p>Немає кімнат.</p>"; ui.wall = busiestWall(r); }
    ui.wallRoom = r.id;
    var h = '<div class="pl-cols"><div class="pl-main"><div class="pl-bar"><label class="pl-barbtn">Кімната <select data-act="wroom">' + proj.rooms.map(function (q) { return '<option value="' + q.id + '"' + (q.id === r.id ? " selected" : "") + ">" + esc(q.name) + "</option>"; }).join("") + "</select></label>" +
      '<span class="pl-seg">' + P.WALLS.map(function (w) { return '<button type="button" data-wall="' + w + '" class="' + (ui.wall === w ? "on" : "") + '">' + P.WALL_NAME[w] + " " + P.nf(P.wallLen(r, w) / 100, 2) + " м</button>"; }).join("") + "</span></div>" +
      '<div class="pl-bar"><button type="button" data-tool="select" class="' + (ui.tool === "select" ? "on" : "") + '">✥ Вибір</button>' + WALL_KINDS.map(function (k) { return '<button type="button" data-tool="add:' + k + '" class="' + (ui.tool === "add:" + k ? "on" : "") + '">+ ' + SHORT[k] + "</button>"; }).join("") + '<button type="button" data-tool="del" class="' + (ui.tool === "del" ? "on" : "") + '">✕ Видалити</button></div>' +
      '<p class="pl-help">Вигляд зсередини кімнати. Розміри — від лівого кута і від чистової підлоги. Пунктир — зона горизонтальних трас (' + P.ZONE_TOP + " см під стелею і ~" + P.ZONE_BOT + " см над підлогою).</p>" +
      elevSvg(r, ui.wall) + mini(r) + '</div><div class="pl-side">' + pointSide() + hint("wallTop") + "</div></div>";
    return h;
  }
  function busiestWall(r) {
    var best = "N", n = -1;
    P.WALLS.forEach(function (w) { var k = proj.points.filter(function (t) { return t.room === r.id && t.wall === w; }).length; if (k > n) { n = k; best = w; } });
    return best;
  }
  function mini(r) {
    return '<p class="meta">Кімната «' + esc(r.name) + "»: стіни обходяться за годинниковою стрілкою — верхня, права, нижня, ліва (як на плані).</p>";
  }
  function elevSvg(r, w) {
    var L = P.wallLen(r, w), H = proj.ceilH, c = calc(), s = Math.max(7, L / 55), fs = Math.max(9, L / 60);
    var ops = P.openingsOn(proj, r, w), pts = proj.points.filter(function (t) { return t.room === r.id && P.KINDS[t.kind].surf === "wall" && t.wall === w; });
    var Y = function (z) { return H - z; };
    var h = '<svg class="pl-svg pl-elev" data-room="' + r.id + '" data-wall="' + w + '" viewBox="' + (-40) + " " + (-40) + " " + (L + 80) + " " + (H + 110) + '" style="--fs:' + fs + 'px">';
    h += '<rect x="0" y="0" width="' + L + '" height="' + H + '" class="pl-wallr"/>';
    h += '<line x1="0" y1="' + P.ZONE_TOP + '" x2="' + L + '" y2="' + P.ZONE_TOP + '" class="pl-zone"/><line x1="0" y1="' + Y(P.ZONE_BOT) + '" x2="' + L + '" y2="' + Y(P.ZONE_BOT) + '" class="pl-zone"/>';
    ops.forEach(function (o) {
      var z0 = o.kind === "door" ? 0 : o.sill;
      h += '<rect x="' + o.pos + '" y="' + Y(z0 + o.height) + '" width="' + o.width + '" height="' + o.height + '" class="pl-op ' + o.kind + '"/><text x="' + (o.pos + o.width / 2) + '" y="' + Y(z0 + o.height / 2) + '" text-anchor="middle" class="pl-optext">' + (o.kind === "door" ? "двері" : "вікно") + "</text>";
    });
    if (proj.panel && proj.panel.room === r.id && proj.panel.wall === w) h += '<g data-panel="1"><rect x="' + (proj.panel.pos - 20) + '" y="' + Y(proj.panel.h + 50) + '" width="40" height="50" class="pl-panel"/><text x="' + proj.panel.pos + '" y="' + Y(proj.panel.h + 22) + '" text-anchor="middle" class="pl-ptext">Щит</text></g>';
    c.segs.forEach(function (g) {
      var col = gcolor(g.group);
      g.pieces.forEach(function (pc) { if (pc.room === r.id && pc.wall === w) h += '<line data-seg="' + esc(g.key) + '" x1="' + pc.p0 + '" y1="' + Y(pc.z) + '" x2="' + pc.p1 + '" y2="' + Y(pc.z) + '" class="pl-route" style="stroke:' + col + '"/>'; });
      g.verts.forEach(function (vv) { if (vv.room === r.id && vv.wall === w) h += '<line data-seg="' + esc(g.key) + '" x1="' + vv.pos + '" y1="' + Y(vv.z0) + '" x2="' + vv.pos + '" y2="' + Y(vv.z1) + '" class="pl-route" style="stroke:' + col + '"/>'; });
    });
    // розміри
    var dims = pts.slice().sort(function (a, b) { return a.pos - b.pos; });
    dims.forEach(function (t, i) {
      var yy = H + 22 + (i % 2) * 22;
      h += '<line x1="' + t.pos + '" y1="' + H + '" x2="' + t.pos + '" y2="' + (yy - 8) + '" class="pl-dimline"/><text x="' + t.pos + '" y="' + yy + '" text-anchor="middle" class="pl-dim">' + Math.round(t.pos) + "</text>";
    });
    pts.forEach(function (t) {
      var on = sel && sel.t === "point" && sel.id === t.id;
      h += '<g data-pt="' + t.id + '" class="pl-pt' + (on ? " on" : "") + '" style="--g:' + (t.group ? gcolor(t.group) : "var(--muted)") + '">' + (on ? '<circle cx="' + t.pos + '" cy="' + Y(t.h) + '" r="' + s * 1.9 + '" class="pl-ring"/>' : "") + icon(t.kind, t.pos, Y(t.h), s) +
        '<text x="' + (t.pos + s * 1.6) + '" y="' + (Y(t.h) - s * 1.1) + '" class="pl-dim">' + P.tagOf(proj, t) + " · h" + Math.round(t.h) + "</text></g>";
    });
    h += '<text x="0" y="' + (H + 80) + '" class="pl-dim">← лівий кут</text><text x="' + L + '" y="' + (H + 80) + '" text-anchor="end" class="pl-dim">правий кут →</text>';
    return h + "</svg>";
  }

  // ---------- вкладка «Групи і щит» ----------
  function groupsTab() {
    var c = calc(), pn = P.panel(proj), segs = c.segs;
    var h = '<div class="card pl-card"><h3>Групи</h3><div class="pl-tablewrap"><table class="pl-gt"><tr><th>Гр.</th><th>Назва</th><th>Тип</th><th>Автомат</th><th>Кабель</th><th>Захист</th><th>Прокладання</th><th>Точок / м / кВт</th><th></th></tr>';
    proj.groups.forEach(function (g, i) {
      var pts = proj.points.filter(function (t) { return t.group === g.id; }), len = segs.filter(function (s) { return s.group === g.id; }).reduce(function (a, s) { return a + s.len; }, 0) / 100;
      var kw = pts.reduce(function (a, t) { return a + (t.power || 0); }, 0) / 1000;
      h += '<tr><td><i class="pl-gc" style="background:' + gcolor(g.id) + '"></i>' + (i + 1) + "</td><td>" + inp("group", g.id, "name", g.name, { label: "", str: true }) + "</td><td>" +
        selF("group", g.id, "kind", g.kind, Object.keys(P.GROUP_KINDS).map(function (k) { return [k, P.GROUP_KINDS[k]]; }), "") + "</td><td class='pl-nowrap'>" +
        selF("group", g.id, "curve", g.curve, [["B", "B"], ["C", "C"]], "") + selF("group", g.id, "In", g.In, P.BREAKERS.map(function (b) { return [b, b + " А"]; }), "") + "</td><td>" +
        selF("group", g.id, "sec", g.sec, P.SECTIONS.map(function (s) { return [s, String(s).replace(".", ",") + " мм²"]; }), "") + "</td><td>" +
        selF("group", g.id, "prot", g.prot, [["none", "без ПЗВ"], ["rcd", "через ПЗВ"], ["rcbo", "дифавтомат"]], "") +
        (g.prot === "rcd" ? selF("group", g.id, "rcd", g.rcd || "", [["", "— обери ПЗВ —"]].concat(proj.rcds.map(function (q, k) { return [q.id, "ПЗВ " + (k + 1) + " (" + q.In + " А, " + q.dI + " мА)"]; })), "") : "") +
        (g.prot === "rcbo" ? selF("group", g.id, "dI", g.dI, [[10, "10 мА"], [30, "30 мА"]], "") : "") + "</td><td>" +
        selF("group", g.id, "plane", g.plane, Object.keys(P.PLANES).map(function (k) { return [k, P.PLANES[k]]; }), "") + "</td><td class='pl-nowrap'>" + pts.length + " / " + P.nf(len) + " / " + P.nf(kw, 1) + "</td><td>" +
        '<button type="button" class="pl-x" data-act="delgroup" data-id="' + g.id + '" title="Видалити групу">✕</button></td></tr>';
    });
    h += '</table></div><div class="row"><button type="button" class="btn ghost small" data-act="addgroup">+ Група</button><button type="button" class="btn ghost small" data-act="addrcd">+ ПЗВ</button></div>';
    h += '<div class="pl-rcds">' + proj.rcds.map(function (q, k) {
      return '<div class="pl-rcd"><b>ПЗВ ' + (k + 1) + "</b>" + selF("rcd", q.id, "In", q.In, [[25, "25 А"], [40, "40 А"], [63, "63 А"]], "") + selF("rcd", q.id, "dI", q.dI, [[10, "10 мА"], [30, "30 мА"], [100, "100 мА"]], "") + selF("rcd", q.id, "type", q.type, [["A", "тип A"], ["AC", "тип AC"]], "") + '<button type="button" class="pl-x" data-act="delrcd" data-id="' + q.id + '">✕</button></div>';
    }).join("") + "</div>" + '<div class="pl-hints3">' + hint("light") + hint("socketG") + hint("power") + hint("rcd") + hint("rcbo") + hint("cable") + "</div></div>";
    var L = P.load(proj, segs);
    h += '<div class="card pl-card"><h3>Навантаження груп</h3><p class="meta">Потужність кожної точки задається в її картці (світильник — потужність ламп, розетка — прилад). Струм I = P / 230; ΔU — падіння напруги до найдальшої точки, якщо все ввімкнено.</p><div class="pl-tablewrap"><table class="pl-lt"><tr><th>Група</th><th>Ламп / точок</th><th>P</th><th>I</th><th>Автомат</th><th>Завантаження</th><th>Кабель до найдальшої</th><th>ΔU</th><th></th></tr>' +
      L.map(function (x) {
        var ok = x.pct <= 1 && x.dUpct <= 5;
        var noDev = !x.P && x.g.kind !== "light";
        return "<tr><td>" + esc(x.g.name) + "</td><td>" + x.lights + " / " + x.pts.length + "</td><td class='pl-nowrap'>" + (noDev ? "<span class='meta'>вкажи прилади в розетках</span>" : P.nf(x.P, 0) + " Вт") + "</td><td class='pl-nowrap'>" + P.nf(x.I, 2) + " А</td><td>" + x.g.curve + x.g.In + "</td><td class='pl-nowrap'>" + bar(x.pct) + " " + Math.round(x.pct * 100) + " %</td><td class='pl-nowrap'>" + P.nf(x.L, 1) + " м · " + String(x.g.sec).replace(".", ",") + " мм²</td><td>" + P.nf(x.dUpct, 1) + " %</td><td>" +
          (x.g.kind === "power" && x.P ? '<button type="button" class="btn ghost small" data-act="suggest" data-id="' + x.g.id + '">Підібрати</button>' : (ok ? "✓" : "⚠")) + "</td></tr>";
      }).join("") + "</table></div>" +
      "<p class='meta'>Усе ввімкнено разом: " + P.nf(L.reduce(function (s, x) { return s + x.P; }, 0) / 1000, 1) + " кВт. Одночасно працює лише частина приладів, тому сума груп може перевищувати ввідний C" + proj.input + " (" + P.nf(230 * proj.input / 1000, 1) + " кВт) — це нормально, якщо кожна група в межах свого автомата.</p>" + hint("load", true) + hint("ac") + "</div>";
    var errs = c.issues.filter(function (i) { return i.lvl === "error"; }), warns = c.issues.filter(function (i) { return i.lvl !== "error"; });
    h += '<div class="card pl-card"><h3>Перевірка проєкту</h3>' + (c.issues.length ? errs.concat(warns).map(issueHtml).join("") : '<div class="tip">✓ Помилок і зауважень немає.</div>') + "</div>";
    h += '<div class="card pl-card"><h3>Щит: ' + pn.enclosure + " модулів</h3><p>Апарати займають " + pn.modules + " модулів, з запасом 20–30 % потрібно ≥ " + pn.need + ".</p>" + panelSvg(pn) + din(pn) + hint("panel") + "</div>";
    return h;
  }
  function panelSvg(pn) {
    var cols = pn.devices.filter(function (d) { return d.group || d.rcd; }), W = Math.max(cols.length, 3) * 120 + 40, h = '<div class="pl-tablewrap"><svg class="pl-svg pl-sld" viewBox="0 0 ' + W + ' 430" style="--fs:12px">';
    h += '<text x="20" y="22" class="pl-dim">Ввід ' + esc(proj.system) + "</text>";
    function dev(x, y, d) { return '<rect x="' + (x - 46) + '" y="' + y + '" width="92" height="46" class="pl-dev"/><text x="' + x + '" y="' + (y + 18) + '" text-anchor="middle" class="pl-ptext">' + d.tag + '</text><text x="' + x + '" y="' + (y + 36) + '" text-anchor="middle" class="pl-dim">' + esc(d.spec.split(",")[0]) + "</text>"; }
    var main = pn.devices.filter(function (d) { return !d.group && !d.rcd; }), y = 30;
    main.forEach(function (d) { h += '<line x1="60" y1="' + (y - 4) + '" x2="60" y2="' + y + '" class="pl-wire"/>' + dev(60, y, d); y += 60; });
    var busY = y + 10;
    h += '<line x1="60" y1="' + (y - 14) + '" x2="60" y2="' + busY + '" class="pl-wire"/><line x1="60" y1="' + busY + '" x2="' + (W - 30) + '" y2="' + busY + '" class="pl-wire bus"/>';
    var x = 160, under = {};
    pn.devices.forEach(function (d) {
      if (d.rcd) { under[d.tag] = { x: x }; h += '<line x1="' + x + '" y1="' + busY + '" x2="' + x + '" y2="' + (busY + 16) + '" class="pl-wire"/>' + dev(x, busY + 16, d); }
      else if (d.group) {
        var gy = d.under ? busY + 100 : busY + 16, parent = d.under ? under[d.tag && d.under] : null;
        if (d.under && parent) { if (parent.used) x += 0; parent.used = true; h += '<line x1="' + parent.x + '" y1="' + (busY + 62) + '" x2="' + parent.x + '" y2="' + (busY + 80) + '" class="pl-wire"/><line x1="' + parent.x + '" y1="' + (busY + 80) + '" x2="' + x + '" y2="' + (busY + 80) + '" class="pl-wire"/><line x1="' + x + '" y1="' + (busY + 80) + '" x2="' + x + '" y2="' + gy + '" class="pl-wire"/>'; }
        else h += '<line x1="' + x + '" y1="' + busY + '" x2="' + x + '" y2="' + gy + '" class="pl-wire"/>';
        h += dev(x, gy, d) + '<line x1="' + x + '" y1="' + (gy + 46) + '" x2="' + x + '" y2="' + (gy + 70) + '" class="pl-wire" style="stroke:' + gcolor(d.group) + '"/>' +
          '<text x="' + x + '" y="' + (gy + 84) + '" text-anchor="middle" class="pl-dim">' + esc(d.name.slice(0, 18)) + "</text>" + '<text x="' + x + '" y="' + (gy + 98) + '" text-anchor="middle" class="pl-dim">' + esc((d.spec.split(", ")[1] || "").replace("дифавтомат ", "")) + "</text>";
        x += 120;
      }
    });
    return h + "</svg></div>";
  }
  function din(pn) {
    return '<div class="pl-din">' + pn.rows.map(function (row, i) {
      var used = row.reduce(function (a, d) { return a + d.mod; }, 0);
      return '<div class="pl-dinrow"><span class="meta">Ряд ' + (i + 1) + "</span>" + row.map(function (d) { return '<span class="pl-mod" style="flex:' + d.mod + '" title="' + esc(d.name + " — " + d.spec) + '">' + d.tag + "</span>"; }).join("") + (pn.perRow - used > 0 ? '<span class="pl-mod free" style="flex:' + (pn.perRow - used) + '">запас</span>' : "") + "</div>";
    }).join("") + "</div>";
  }

  // ---------- вкладка «З'єднання» ----------
  function wiringTab() {
    var cn = P.connections(proj, calc().segs), h = '<div class="card pl-card"><h3>Кольори жил</h3><p>' + Object.keys(P.COLORS).map(function (k) { return dot(k) + esc(P.COLORS[k]); }).join(" &nbsp; ") + "</p>" + hint("cable") + hint("wago") + "</div>";
    cn.boxes.forEach(function (b) { h += '<div class="card pl-card"><h3>' + esc(b.label) + "</h3>" + boxHtml(b) + "</div>"; });
    h += '<div class="card pl-card"><h3>Щит</h3>' + cn.panel.map(function (x) { return "<h4>" + x.tag + " — " + esc(x.group) + "</h4><ul class='pl-conn'>" + x.lines.map(function (l) { return "<li>" + dot(l.color) + esc(l.text) + "</li>"; }).join("") + "</ul>"; }).join("") + "</div>";
    proj.rooms.forEach(function (r) {
      var pts = proj.points.filter(function (t) { return t.room === r.id && t.kind !== "jbox"; });
      if (!pts.length) return;
      h += '<details class="card pl-card"><summary><b>Точки: ' + esc(r.name) + "</b> (" + pts.length + ")</summary>" + pts.map(function (t) {
        return "<h4>" + esc(P.labelRef(proj, t.id)) + "</h4><ul class='pl-conn'>" + (cn.points[t.id] || []).map(function (l) { return "<li>" + dot(l.color) + esc(l.text) + "</li>"; }).join("") + "</ul>";
      }).join("") + "</details>";
    });
    return h;
  }

  // ---------- вкладка «Матеріали» ----------
  function specTab() {
    var sp = P.spec(proj, calc().segs);
    function tbl(title, rows) { if (!rows.length) return ""; return "<h3>" + title + "</h3><table><tr><th>Найменування</th><th>К-сть</th><th>Примітка</th></tr>" + rows.map(function (r) { return "<tr><td>" + esc(r.name) + "</td><td class='pl-nowrap'>" + r.qty + " " + r.unit + "</td><td>" + esc(r.note || "") + "</td></tr>"; }).join("") + "</table>"; }
    return '<div class="card pl-card pl-print"><div class="row"><button type="button" class="btn ghost small" data-act="print">🖨 Друк</button><span class="meta">Траси разом: ' + P.nf(sp.totalM) + " м</span></div>" +
      tbl("Кабель і гофра", sp.cables.concat(sp.tubes)) + tbl("Монтаж (чорновий)", sp.boxes) + tbl("Чистовий монтаж", sp.finish) + tbl("Щит", sp.panel) +
      '<p class="meta">Кількості орієнтовні: перед закупівлею звір з фактичними трасами на об\'єкті. Інструмент — див. урок «Перший набір інструменту».</p>' + lessonLinks([["r1", "l4"], ["m05", "l5"]]) + "</div>";
  }

  // ---------- вкладка «План робіт» ----------
  function stepsTab() {
    var st = P.steps(proj), done = proj.done || {};
    var n = st.filter(function (s) { return done[s.id]; }).length;
    return '<div class="card pl-card"><div class="row"><b>Виконано ' + n + " з " + st.length + '</b><button type="button" class="btn ghost small" data-act="print">🖨 Друк</button></div><div class="pl-progress"><i style="width:' + Math.round(n / st.length * 100) + '%"></i></div></div>' +
      st.map(function (s, i) {
        return '<details class="card pl-card pl-step' + (done[s.id] ? " done" : "") + '"' + (i === 0 || (!done[s.id] && st.slice(0, i).every(function (x) { return done[x.id]; })) ? " open" : "") + "><summary><span class='pl-stepn'>" + (i + 1) + "</span> " + esc(s.title) + (done[s.id] ? " ✓" : "") + "</summary><div class='prose'>" + s.html + "</div>" +
          '<div class="pl-links">' + lessonLinks(s.lessons) + '</div><label class="donebox"><input type="checkbox" data-act="stepdone" data-id="' + s.id + '"' + (done[s.id] ? " checked" : "") + "> Крок виконано</label></details>";
      }).join("");
  }

  // ---------- події ----------
  function onClick(e) {
    var b = e.target.closest("[data-tab],[data-act],[data-tool],[data-layer],[data-wall]");
    if (!b || !host.contains(b) || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    if (b.tagName === "LABEL") return;
    if (b.dataset.tab === "walls" && sel && sel.t === "point") { var st0 = P.byId(proj.points, sel.id); if (st0 && st0.wall) { ui.wallRoom = st0.room; ui.wall = st0.wall; } }
    if (b.dataset.tab) { ui.tab = b.dataset.tab; ui.tool = "select"; view = null; save(); draw(); return; }
    if (b.dataset.tool) { ui.tool = b.dataset.tool; calib = null; draw(); return; }
    if (b.dataset.layer) { ui.layer = b.dataset.layer; ui.tool = "select"; save(); draw(); return; }
    if (b.dataset.wall) { ui.wall = b.dataset.wall; save(); draw(); return; }
    var a = b.dataset.act, id = b.dataset.id;
    if (a === "live") { live.on = !live.on; if (live.on) { live.sw = {}; live.brk = {}; ui.tool = "select"; } draw(); return; }
    if (a === "schbig") { bigSch = !bigSch; draw(); return; }
    if (a === "lsw") { var lk = id + ":" + b.dataset.v; live.sw[lk] = live.sw[lk] ? 0 : 1; draw(); return; }
    if (a === "lbrk") { live.brk[id] = isOn(id) ? 0 : 1; draw(); return; }
    if (a === "ltest") { live.brk[id] = 0; live.msg = b.dataset.v === "rcbo" ? "Диф. автомат спрацював від кнопки «ТЕСТ» — механізм справний. Увімкни його знову." : "ПЗВ спрацював від кнопки «ТЕСТ» — механізм справний. Усе під ним знеструмлено. Увімкни ПЗВ знову."; draw(); return; }
    if (a === "lock") { proj.locked = !proj.locked; changed(); return; }
    if (a === "msel") { ui.msel = !ui.msel; if (ui.msel) { multi = []; sel = null; } else if (multi.length < 2) multi = []; draw(); return; }
    if (a === "munsel") { multi = []; draw(); return; }
    if (a === "mdel") { if (!confirm("Видалити " + multi.length + " точок?")) return; proj.points = proj.points.filter(function (t) { return multi.indexOf(t.id) < 0; }); proj.points.forEach(function (t) { if (t.ctl) t.ctl = t.ctl.filter(function (c) { return multi.indexOf(c.sw) < 0; }); }); multi = []; sel = null; changed(); return; }
    if (a === "mheight") { var hv = num(host.querySelector(".pl-mh").value); if (!(hv > 0)) return; multi.forEach(function (mid) { var t = P.byId(proj.points, mid); if (t && t.wall) t.h = hv; }); changed(); return; }
    if (a === "malign") {
      var pts = multi.map(function (mid) { return P.byId(proj.points, mid); }).filter(Boolean), cs = pts.filter(function (t) { return t.x != null; });
      if (b.dataset.v === "x" && cs.length) { var ax = snap(cs.reduce(function (s2, t) { return s2 + t.x; }, 0) / cs.length); cs.forEach(function (t) { t.x = ax; }); }
      if (b.dataset.v === "y" && cs.length) { var ay = snap(cs.reduce(function (s2, t) { return s2 + t.y; }, 0) / cs.length); cs.forEach(function (t) { t.y = ay; }); }
      changed(); return;
    }
    if (a === "stdh") {
      var cnt0 = 0;
      stdTargets(b.dataset.v).forEach(function (t) { t.h = b.dataset.v === "sw" ? stdH.sw : stdH.socket; cnt0++; });
      if (!cnt0) return; changed(); return;
    }
    if (a === "selseg") { sel = { t: "seg", id: id }; draw(); return; }
    if (a === "lalloff") { live.sw = {}; draw(); return; }
    if (a === "tpl") { setProj(P.template(b.dataset.v)); ui.tab = "flat"; draw(); return; }
    if (a === "desc") {
      var txt = host.querySelector(".pl-desc").value, p = P.parseDescription(txt);
      if (!p) { alert("Не вдалося розпізнати кімнати. Пиши кожну з нового рядка: «Кухня 3×2,8»."); return; }
      setProj(p); draw(); return;
    }
    if (a === "auto") {
      if (proj.points.length && !confirm("Замінити всі точки і групи типовою розстановкою?")) return;
      P.autoPlace(proj); sel = null; ui.tab = "plan"; changed(); return;
    }
    if (a === "new") { if (!confirm("Почати новий проєкт? Поточний буде втрачено (збережи файл, якщо треба).")) return; proj = null; sel = null; lsSet(KEY, ""); draw(); return; }
    if (a === "export") { download(); return; }
    if (a === "photodel") { photo = null; lsSet(PKEY, ""); draw(); return; }
    if (a === "zin" || a === "zout") { zoom(a === "zin" ? 0.75 : 1.33); return; }
    if (a === "zfit") { view = null; draw(); return; }
    if (a === "selroom") { sel = { t: "room", id: id }; draw(); return; }
    if (a === "unsel") { sel = null; draw(); return; }
    if (a === "addroom") {
      var bx = bounds(), r = P.addRoom(proj, "Кімната " + (proj.rooms.length + 1), "room", snap(bx.x + bx.w - 60 + 10), snap(bx.y + 60), 300, 300);
      sel = { t: "room", id: r.id }; view = null; changed(); return;
    }
    if (a === "delroom") {
      if (!confirm("Видалити кімнату разом з її точками, дверима і вікнами?")) return;
      proj.rooms = proj.rooms.filter(function (r) { return r.id !== id; }); proj.openings = proj.openings.filter(function (o) { return o.room !== id; });
      proj.points = proj.points.filter(function (t) { return t.room !== id; }); if (proj.panel && proj.panel.room === id) proj.panel = proj.rooms[0] ? { room: proj.rooms[0].id, wall: "W", pos: 40, h: 150 } : null;
      sel = null; changed(); return;
    }
    if (a === "addopen") { var rr = P.byId(proj.rooms, sel.id); P.addOpening(proj, rr, "N", b.dataset.v, 20, b.dataset.v === "door" ? 80 : 120); changed(); return; }
    if (a === "delopen") { proj.openings = proj.openings.filter(function (o) { return o.id !== id; }); changed(); return; }
    if (a === "delpt") { delPoint(id); return; }
    if (a === "goto") { var t = P.byId(proj.points, id); sel = { t: "point", id: id }; ui.tab = P.KINDS[t.kind].surf === "wall" && ui.tab === "walls" ? "walls" : "plan"; ui.layer = P.KINDS[t.kind].surf === "wall" ? "walls" : "ceiling"; if (ui.tab === "walls") { ui.wallRoom = t.room; ui.wall = t.wall; } draw(); return; }
    if (a === "newgroup") {
      var tp = P.byId(proj.points, id), K = P.KINDS[tp.kind], rm = P.byId(proj.rooms, tp.room);
      var g = P.addGroup(proj, { name: (tp.label || K.name) + " — " + rm.name, kind: K.cat === "light" || K.cat === "switch" || K.cat === "box" ? "light" : K.cat === "power" ? "power" : "socket", In: K.cat === "light" ? 10 : 16, sec: K.cat === "light" ? 1.5 : 2.5, prot: rm.type === "bath" ? "rcbo" : "rcd", rcd: proj.rcds[0] ? proj.rcds[0].id : null, dI: rm.type === "bath" ? 10 : 30 });
      if (g.prot === "rcd" && !g.rcd) { g.prot = "rcbo"; }
      tp.group = g.id; changed(); return;
    }
    if (a === "addgroup") { P.addGroup(proj, { name: "Нова група", kind: "socket", In: 16, sec: 2.5, prot: proj.rcds[0] ? "rcd" : "rcbo", rcd: proj.rcds[0] ? proj.rcds[0].id : null }); changed(); return; }
    if (a === "delgroup") { if (!confirm("Видалити групу? Її точки залишаться без групи.")) return; proj.groups = proj.groups.filter(function (g) { return g.id !== id; }); proj.points.forEach(function (t) { if (t.group === id) t.group = null; }); changed(); return; }
    if (a === "suggest") { var gx = P.byId(proj.groups, id), lx = loadOf(id), sg2 = P.suggest(lx.P); gx.In = sg2.In; gx.sec = sg2.sec; gx.curve = "C"; changed(); return; }
    if (a === "addrcd") { P.addRcd(proj, 40, 30); changed(); return; }
    if (a === "delrcd") { proj.rcds = proj.rcds.filter(function (q) { return q.id !== id; }); proj.groups.forEach(function (g) { if (g.rcd === id) { g.rcd = null; } }); changed(); return; }
    if (a === "print") { window.print(); return; }
    if (a === "tour") { ui.tour = ui.tour >= 0 ? -1 : 0; if (ui.tour === 0) ui.tab = P.TOUR[0].tab; save(); draw(); return; }
    if (a === "tnext" || a === "tprev") { ui.tour = Math.max(0, Math.min(P.TOUR.length - 1, ui.tour + (a === "tnext" ? 1 : -1))); ui.tab = P.TOUR[ui.tour].tab; view = null; save(); draw(); return; }
  }
  function delPoint(id) {
    proj.points = proj.points.filter(function (t) { return t.id !== id; });
    proj.points.forEach(function (t) { if (t.ctl) t.ctl = t.ctl.filter(function (c) { return c.sw !== id; }); });
    if (sel && sel.id === id) sel = null; changed();
  }
  function onChange(e) {
    var el = e.target, a = el.dataset.act;
    if (a === "import") { var f = el.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { var p = JSON.parse(rd.result); if (!p.rooms) throw 0; setProj(p); ui.tab = "plan"; draw(); } catch (er) { alert("Це не файл проєкту планувальника."); } }; rd.readAsText(f); return; }
    if (a === "photo") { loadPhoto(el.files[0]); return; }
    if (a === "photoop") { photo.op = el.value / 100; lsSet(PKEY, JSON.stringify(photo)); draw(); return; }
    if (a === "routes") { ui.showRoutes = el.checked; save(); draw(); return; }
    if (a === "gfilter") { ui.gfilter = el.value; draw(); return; }
    if (a === "wroom") { ui.wallRoom = el.value; ui.wall = busiestWall(P.byId(proj.rooms, el.value)); sel = null; save(); draw(); return; }
    if (a === "stepdone") { proj.done = proj.done || {}; proj.done[el.dataset.id] = el.checked; save(); draw(); return; }
    if (a === "cabroom") { sel = el.value ? { t: "room", id: el.value } : null; draw(); return; }
    if (a === "mgroup") { multi.forEach(function (mid) { var t2 = P.byId(proj.points, mid); if (t2 && t2.kind !== "jbox") t2.group = el.value || null; }); changed(); return; }
    if (a === "ctl") {
      var t = P.byId(proj.points, el.dataset.id); t.ctl = t.ctl || [];
      if (el.checked) t.ctl.push({ sw: el.dataset.sw, key: 1 }); else t.ctl = t.ctl.filter(function (c) { return c.sw !== el.dataset.sw; });
      changed(); return;
    }
    var o = el.dataset.o, k = el.dataset.k, id = el.dataset.id; if (!o) return;
    var v = el.type === "checkbox" ? el.checked : el.dataset.str ? el.value : el.tagName === "SELECT" ? el.value : num(el.value);
    if (el.tagName === "SELECT" && /^-?\d+(\.\d+)?$/.test(v)) v = +v;
    if (typeof v === "number" && !isFinite(v)) { draw(); return; }
    if (o === "proj") proj[k] = v;
    else if (o === "room") {
      var r = P.byId(proj.rooms, id);
      if ((k === "w" || k === "h") && v < 60) v = 60;
      if (k === "x" || k === "y") { var dx = k === "x" ? v - r.x : 0, dy = k === "y" ? v - r.y : 0; proj.points.forEach(function (t) { if (t.room === r.id && t.x != null) { t.x += dx; t.y += dy; } }); }
      r[k] = v;
      if (k === "w" || k === "h") clampRoom(r);
    } else if (o === "open") { var op = P.byId(proj.openings, id); op[k] = v; }
    else if (o === "point") {
      var t2 = P.byId(proj.points, id), rr = P.byId(proj.rooms, t2.room);
      if (k === "rx") t2.x = rr.x + Math.max(0, Math.min(rr.w, v)); else if (k === "ry") t2.y = rr.y + Math.max(0, Math.min(rr.h, v));
      else if (k === "group") t2.group = v || null;
      else t2[k] = v;
      if (k === "pos") t2.pos = Math.max(0, Math.min(P.wallLen(rr, t2.wall), t2.pos));
      if (k === "wall") t2.pos = Math.min(t2.pos, P.wallLen(rr, v));
    } else if (o === "group") { var g = P.byId(proj.groups, id); g[k] = v; if (k === "prot" && v === "rcd" && !g.rcd && proj.rcds[0]) g.rcd = proj.rcds[0].id; if (k === "rcd") g.rcd = v || null; }
    else if (o === "rcd") { P.byId(proj.rcds, id)[k] = v; }
    else if (o === "seg") { if (v) proj.over[id] = v; else delete proj.over[id]; }
    else if (o === "ctlkey") { var ids = id.split("|"), lt = P.byId(proj.points, ids[0]); lt.ctl.forEach(function (c) { if (c.sw === ids[1]) c.key = +v; }); }
    else if (o === "device") {
      var td = P.byId(proj.points, id), dv = P.device(v);
      td.device = v || null;
      if (dv && dv.id) { td.power = dv.P; td.label = dv.name.replace(/ \(.*/, ""); }
    }
    else if (o === "panelf") { proj.panel[k] = v; if (k === "room") proj.panel.pos = 30; }
    changed();
  }
  function clampRoom(r) {
    proj.points.forEach(function (t) { if (t.room !== r.id) return; if (t.x != null) { t.x = Math.max(r.x, Math.min(r.x + r.w, t.x)); t.y = Math.max(r.y, Math.min(r.y + r.h, t.y)); } else t.pos = Math.min(t.pos, P.wallLen(r, t.wall)); });
  }
  function download() {
    var blob = new Blob([JSON.stringify(proj, null, 1)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = (proj.name || "kvartyra").replace(/[^\wА-Яа-яІіЇїЄєҐґ-]+/g, "_") + ".json";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function loadPhoto(f) {
    if (!f) return;
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      var k = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      var b = bounds(), data = cv.toDataURL("image/jpeg", 0.78);
      photo = { data: data, w: cv.width, h: cv.height, scale: Math.max(b.w, 800) / cv.width, op: 0.5 };
      if (!lsSet(PKEY, JSON.stringify(photo))) alert("Фото завелике, щоб зберегти його в браузері — воно працюватиме до перезавантаження сторінки.");
      URL.revokeObjectURL(url); ui.tool = "calib"; view = null; draw();
    };
    img.src = url;
  }
  function zoom(k, cx, cy) {
    if (!view) view = bounds();
    cx = cx == null ? view.x + view.w / 2 : cx; cy = cy == null ? view.y + view.h / 2 : cy;
    view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w: view.w * k, h: view.h * k };
    var svg = host.querySelector(".pl-plan"); if (svg) svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h); else draw();
  }

  // ---------- вказівник на SVG ----------
  function afterDraw() {
    var svg = host.querySelector(".pl-plan, .pl-elev"); if (!svg) return;
    var elev = svg.classList.contains("pl-elev"), drag = null;
    function pt(e) { var m = svg.getScreenCTM(); if (!m) return [0, 0]; var q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; q = q.matrixTransform(m.inverse()); return [q.x, q.y]; }
    svg.addEventListener("wheel", function (e) { if (elev) return; e.preventDefault(); var q = pt(e); zoom(e.deltaY > 0 ? 1.15 : 0.87, q[0], q[1]); }, { passive: false });
    svg.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      var q = pt(e), tg = e.target, ptg = tg.closest("[data-pt]"), rg = tg.closest("[data-room]"), hg = tg.closest("[data-handle]"), pg = tg.closest("[data-panel]"), sg = tg.closest("[data-seg]");
      var tool = ui.tool;
      try { svg.setPointerCapture(e.pointerId); } catch (er) {}
      e.preventDefault();
      if (proj.locked && tool === "select" && !live.on) {
        if (ptg) { sel = { t: "point", id: ptg.dataset.pt }; multi = []; draw(); return; }
        if (pg) { sel = { t: "panel" }; draw(); return; }
        if (sg && !elev) { sel = { t: "seg", id: sg.dataset.seg }; draw(); return; }
        if (!elev && ui.tab === "flat" && rg) { sel = { t: "room", id: rg.dataset.room }; draw(); return; }
        if (elev) { sel = null; draw(); return; }
        drag = { kind: "pan", c0: [e.clientX, e.clientY], v0: view || bounds(), moved: false, room: rg && !elev ? rg.dataset.room : null }; return;
      }
      if (elev) { elevDown(q, ptg, pg, sg); return; }
      if (live.on) { if (ptg) { liveTap(ptg.dataset.pt); return; } drag = { kind: "pan", c0: [e.clientX, e.clientY], v0: view || bounds(), moved: false, room: rg && !elev ? rg.dataset.room : null }; return; }
      if (tool === "calib") { calib = (calib || []).concat([q]); if (calib.length === 2) { var d = Math.hypot(calib[1][0] - calib[0][0], calib[1][1] - calib[0][1]); var real = num(prompt("Реальна відстань між точками, см:", "400")); if (real > 0 && d > 0) { photo.scale *= real / d; lsSet(PKEY, JSON.stringify(photo)); } calib = null; ui.tool = "select"; view = null; } draw(); return; }
      if (tool === "room") { drawRect = [snap(q[0]), snap(q[1]), snap(q[0]), snap(q[1])]; drag = { kind: "rect" }; return; }
      if (tool === "del") { if (ptg) delPoint(ptg.dataset.pt); return; }
      if (tool.indexOf("add:") === 0) { addAt(tool.slice(4), q); return; }
      if (tool === "ac") { var ar = P.roomAt(proj, q[0], q[1]); if (ar) { var at = P.addAC(proj, ar); sel = { t: "point", id: at.id }; ui.tool = "select"; changed(); } return; }
      if (tool === "panel") { var rm = P.roomAt(proj, q[0], q[1]); if (rm) { var nw = P.nearestWall(rm, q[0], q[1]); proj.panel = { room: rm.id, wall: nw.wall, pos: snap(nw.pos), h: proj.panel ? proj.panel.h : 150 }; ui.tool = "select"; sel = { t: "panel" }; changed(); } return; }
      if (ui.tab === "flat") {
        if (hg) { drag = { kind: "resize", r: P.byId(proj.rooms, hg.dataset.handle), q0: q }; return; }
        if (rg) { var r = P.byId(proj.rooms, rg.dataset.room); drag = { kind: "room", r: r, q0: q, x0: r.x, y0: r.y, moved: false }; return; }
      } else {
        var addKey = e.shiftKey || e.ctrlKey || e.metaKey || ui.msel;
        if (ptg && addKey && !live.on) {
          var pid = ptg.dataset.pt;
          if (!multi.length && sel && sel.t === "point" && sel.id !== pid) multi = [sel.id];
          var ix = multi.indexOf(pid); if (ix >= 0) multi.splice(ix, 1); else multi.push(pid);
          sel = multi.length === 1 ? { t: "point", id: multi[0] } : null; if (multi.length === 1 && !ui.msel) multi = [];
          draw(); return;
        }
        if (ptg && multi.length > 1 && multi.indexOf(ptg.dataset.pt) >= 0) {
          drag = { kind: "multi", q0: q, moved: false, start: multi.map(function (mid) { var t = P.byId(proj.points, mid); return { t: t, x: t.x, y: t.y, pos: t.pos }; }) }; return;
        }
        if (ptg) { multi = []; drag = { kind: "pt", t: P.byId(proj.points, ptg.dataset.pt), moved: false }; return; }
        if (addKey && !pg && !sg) { drawRect = [q[0], q[1], q[0], q[1]]; drag = { kind: "box" }; return; }
        if (pg) { drag = { kind: "panel", moved: false }; return; }
        if (sg) { sel = { t: "seg", id: sg.dataset.seg }; draw(); return; }
      }
      drag = { kind: "pan", c0: [e.clientX, e.clientY], v0: view || bounds(), moved: false, room: rg && !elev ? rg.dataset.room : null };
    });
    function elevDown(q, ptg, pg, sg) {
      var r = P.byId(proj.rooms, svg.dataset.room), w = svg.dataset.wall, H = proj.ceilH;
      var pos = snap(Math.max(0, Math.min(P.wallLen(r, w), q[0]))), z = snap(Math.max(5, Math.min(H - 5, H - q[1])));
      if (ui.tool === "del") { if (ptg) delPoint(ptg.dataset.pt); return; }
      if (ui.tool.indexOf("add:") === 0) {
        var kind = ui.tool.slice(4), t = P.addPoint(proj, kind, r, { wall: w, pos: pos, h: z }); t.group = defaultGroup(t); sel = { t: "point", id: t.id }; ui.tool = "select"; changed(); return;
      }
      if (ptg) { drag = { kind: "ept", t: P.byId(proj.points, ptg.dataset.pt), moved: false }; return; }
      if (sg) { sel = { t: "seg", id: sg.dataset.seg }; draw(); return; }
      sel = null; draw();
    }
    svg.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var q = pt(e);
      if (drag.kind === "pan") {
        var m = svg.getScreenCTM(); if (!m) return;
        var dx = (e.clientX - drag.c0[0]) / m.a, dy = (e.clientY - drag.c0[1]) / m.d;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        view = { x: drag.v0.x - dx, y: drag.v0.y - dy, w: drag.v0.w, h: drag.v0.h };
        svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h); return;
      }
      if (drag.kind === "rect") { drawRect[2] = snap(q[0]); drawRect[3] = snap(q[1]); redrawSvg(); return; }
      if (drag.kind === "box") { drawRect[2] = q[0]; drawRect[3] = q[1]; redrawSvg(); return; }
      if (drag.kind === "multi") {
        var mdx = snap(q[0] - drag.q0[0]), mdy = snap(q[1] - drag.q0[1]);
        drag.start.forEach(function (s0) {
          var t = s0.t, rm = P.byId(proj.rooms, t.room);
          if (t.x != null) { t.x = Math.max(rm.x, Math.min(rm.x + rm.w, s0.x + mdx)); t.y = Math.max(rm.y, Math.min(rm.y + rm.h, s0.y + mdy)); }
          else { var dd = { N: mdx, S: -mdx, E: mdy, W: -mdy }[t.wall]; t.pos = Math.max(5, Math.min(P.wallLen(rm, t.wall) - 5, s0.pos + dd)); }
        });
        if (mdx || mdy) drag.moved = true; cache = null; redrawSvg(); return;
      }
      if (drag.kind === "room") {
        var nx = snap(drag.x0 + q[0] - drag.q0[0]), ny = snap(drag.y0 + q[1] - drag.q0[1]), r = drag.r;
        if (nx !== r.x || ny !== r.y) { var ddx = nx - r.x, ddy = ny - r.y; proj.points.forEach(function (t) { if (t.room === r.id && t.x != null) { t.x += ddx; t.y += ddy; } }); r.x = nx; r.y = ny; drag.moved = true; cache = null; redrawSvg(); }
        return;
      }
      if (drag.kind === "resize") { var rr = drag.r, w = Math.max(60, snap(q[0] - rr.x)), h = Math.max(60, snap(q[1] - rr.y)); if (w !== rr.w || h !== rr.h) { rr.w = w; rr.h = h; clampRoom(rr); cache = null; redrawSvg(); } return; }
      if (drag.kind === "pt") {
        var t = drag.t, rm = P.byId(proj.rooms, t.room);
        if (P.KINDS[t.kind].surf === "ceiling") { var cx = snap(Math.max(rm.x, Math.min(rm.x + rm.w, q[0]))), cy = snap(Math.max(rm.y, Math.min(rm.y + rm.h, q[1]))); if (cx !== t.x || cy !== t.y) { t.x = cx; t.y = cy; drag.moved = true; cache = null; redrawSvg(); } }
        else { var nw = P.nearestWall(rm, q[0], q[1]), np = snap(nw.pos); if (np !== t.pos || nw.wall !== t.wall) { t.wall = nw.wall; t.pos = np; drag.moved = true; cache = null; redrawSvg(); } }
        return;
      }
      if (drag.kind === "panel") { var pr = P.byId(proj.rooms, proj.panel.room), pw = P.nearestWall(pr, q[0], q[1]); proj.panel.wall = pw.wall; proj.panel.pos = snap(pw.pos); drag.moved = true; cache = null; redrawSvg(); return; }
      if (drag.kind === "ept") {
        var r2 = P.byId(proj.rooms, svg.dataset.room), H = proj.ceilH, p2 = snap(Math.max(0, Math.min(P.wallLen(r2, drag.t.wall), q[0]))), z2 = snap(Math.max(5, Math.min(H - 5, H - q[1])));
        if (p2 !== drag.t.pos || z2 !== drag.t.h) { drag.t.pos = p2; drag.t.h = z2; drag.moved = true; cache = null; redrawSvg(); }
      }
    });
    svg.addEventListener("pointerup", function () {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.kind === "rect") {
        var x = Math.min(drawRect[0], drawRect[2]), y = Math.min(drawRect[1], drawRect[3]), w = Math.abs(drawRect[2] - drawRect[0]), h = Math.abs(drawRect[3] - drawRect[1]);
        drawRect = null;
        if (w >= 60 && h >= 60) { var r = P.addRoom(proj, "Кімната " + (proj.rooms.length + 1), "room", x, y, w, h); sel = { t: "room", id: r.id }; ui.tool = "select"; }
        changed(); return;
      }
      if (d.kind === "box") {
        var bx0 = Math.min(drawRect[0], drawRect[2]), by0 = Math.min(drawRect[1], drawRect[3]), bx1 = Math.max(drawRect[0], drawRect[2]), by1 = Math.max(drawRect[1], drawRect[3]); drawRect = null;
        proj.points.forEach(function (t) {
          var isC = P.KINDS[t.kind].surf === "ceiling"; if ((ui.layer === "ceiling") !== isC) return;
          var xy = ptXY(t); if (xy && xy[0] >= bx0 && xy[0] <= bx1 && xy[1] >= by0 && xy[1] <= by1 && multi.indexOf(t.id) < 0) multi.push(t.id);
        });
        if (sel && sel.t === "point" && multi.indexOf(sel.id) < 0 && multi.length) multi.unshift(sel.id);
        sel = multi.length === 1 ? { t: "point", id: multi[0] } : null; draw(); return;
      }
      if (d.kind === "multi") { changed(); return; }
      if (d.kind === "pan") { if (!d.moved) { sel = d.room && ui.tab === "plan" && !live.on ? { t: "room", id: d.room } : null; if (!ui.msel) multi = []; draw(); } return; }
      if (d.kind === "room" || d.kind === "resize") { sel = { t: "room", id: d.r.id }; changed(); return; }
      if (d.kind === "pt" || d.kind === "ept") { sel = { t: "point", id: d.t.id }; changed(); return; }
      if (d.kind === "panel") { sel = { t: "panel" }; changed(); }
    });
    function redrawSvg() {
      var tmp = document.createElement("div");
      tmp.innerHTML = elev ? elevSvg(P.byId(proj.rooms, svg.dataset.room), svg.dataset.wall) : planSvg(ui.tab === "flat" ? "flat" : "plan");
      svg.innerHTML = tmp.firstChild.innerHTML;
    }
  }
  function addAt(kind, q) {
    var r = P.roomAt(proj, q[0], q[1]), K = P.KINDS[kind];
    if (!r) { var best = null, bd = 80; proj.rooms.forEach(function (rm) { var nw = P.nearestWall(rm, q[0], q[1]); if (nw.d < bd) { bd = nw.d; best = rm; } }); r = best; }
    if (!r) return;
    var t;
    if (K.surf === "ceiling") t = P.addPoint(proj, kind, r, { x: snap(Math.max(r.x, Math.min(r.x + r.w, q[0]))), y: snap(Math.max(r.y, Math.min(r.y + r.h, q[1]))) });
    else { var nw = P.nearestWall(r, q[0], q[1]); t = P.addPoint(proj, kind, r, { wall: nw.wall, pos: snap(nw.pos) }); }
    t.group = defaultGroup(t);
    if (K.cat === "light") { var sw = proj.points.filter(function (x) { return x.room === r.id && (x.kind === "sw1" || x.kind === "sw2"); })[0]; if (sw) t.ctl = [{ sw: sw.id, key: 1 }]; }
    sel = { t: "point", id: t.id }; ui.tool = "select"; changed();
  }

  window.PLANNER = { render: render, bind: bind };
})();
