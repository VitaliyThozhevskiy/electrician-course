(function () {
  "use strict";

  var COURSE = (window.COURSE || []).slice().sort(function (a, b) { return a.num - b.num; });
  var app = document.getElementById("app");
  var sidebar = document.getElementById("sidebar");

  var KIND = { calc: "Розрахунок", task: "Завдання", scheme: "Схема", checklist: "Чекліст", "case": "Кейс" };

  // ---------- progress (localStorage, per viewer) ----------
  var store = load();
  function load() {
    try { return JSON.parse(localStorage.getItem("ec-progress")) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem("ec-progress", JSON.stringify(store)); } catch (e) {}
  }
  function mark(key, val) { store[key] = val; save(); }
  function isDone(key) { return !!store[key]; }

  function modProgress(m) {
    var total = (m.lessons || []).length + (m.practice || []).length + ((m.quiz || []).length ? 1 : 0);
    var done = 0;
    (m.lessons || []).forEach(function (l) { if (isDone(m.id + "/l/" + l.id)) done++; });
    (m.practice || []).forEach(function (p) { if (isDone(m.id + "/p/" + p.id)) done++; });
    if ((m.quiz || []).length && store[m.id + "/quiz"] >= 0.7) done++;
    return total ? done / total : 0;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function find(id) { for (var i = 0; i < COURSE.length; i++) if (COURSE[i].id === id) return COURSE[i]; return null; }
  function label(m) {
    if (m.id === "r1" || m.id === "r2") return "Ремонт " + m.id.slice(1);
    if (m.id === "bonus") return "Бонус";
    if (m.id === "faults") return "Кейси";
    return "Модуль " + m.num;
  }
  function numBadge(m) {
    if (/^m\d+$/.test(m.id)) return String(m.num);
    return { r1: "Р1", r2: "Р2", bonus: "★", faults: "?" }[m.id] || "";
  }

  // ---------- sidebar ----------
  function renderSidebar(route) {
    var groups = [
      ["Курс", COURSE.filter(function (m) { return /^m\d+$/.test(m.id); })],
      ["Практикум ремонту", COURSE.filter(function (m) { return /^r\d$/.test(m.id); })],
      ["Додатково", COURSE.filter(function (m) { return m.id === "bonus" || m.id === "faults"; })]
    ];
    var h = '<a href="#/" class="' + (route.page === "home" ? "active" : "") + '"><span class="num">⌂</span>Головна</a>';
    groups.forEach(function (g) {
      if (!g[1].length) return;
      h += '<div class="group">' + g[0] + "</div>";
      g[1].forEach(function (m) {
        var p = modProgress(m);
        h += '<a href="#/m/' + m.id + '" class="' + (route.mod === m.id ? "active" : "") + '"><span class="num">' +
          numBadge(m) + "</span><span>" + esc(m.short || m.title) + "</span>" +
          (p >= 1 ? '<span class="done-dot">✓</span>' : "") + "</a>";
      });
    });
    h += '<a href="#/calc" class="' + (route.page === "calc" ? "active" : "") + '"><span class="num">∑</span>Калькулятори</a>';
    sidebar.innerHTML = h;
  }

  // ---------- routing ----------
  function parse() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!parts.length) return { page: "home" };
    if (parts[0] === "calc") return { page: "calc" };
    if (parts[0] === "m" && parts[1]) {
      var r = { page: "module", mod: parts[1] };
      if (parts[2] === "l" && parts[3]) { r.page = "lesson"; r.lesson = parts[3]; }
      else if (parts[2] === "p") { r.page = "practice"; r.task = parts[3]; }
      else if (parts[2] === "q") r.page = "quiz";
      return r;
    }
    return { page: "home" };
  }

  function render() {
    var route = parse();
    document.body.classList.remove("menu-open");
    renderSidebar(route);
    var m = route.mod && find(route.mod);
    if (route.mod && !m) { app.innerHTML = "<h1>Не знайдено</h1><p>Цей розділ ще не завантажився. <a href='#/'>На головну</a></p>"; return; }
    if (route.page === "home") home();
    else if (route.page === "calc") { app.innerHTML = window.CALC ? window.CALC.render() : "<p>Калькулятори недоступні.</p>"; if (window.CALC) window.CALC.bind(app); document.title = "Калькулятори · Електрика для дому"; }
    else if (route.page === "module") moduleView(m);
    else if (route.page === "lesson") lessonView(m, route.lesson);
    else if (route.page === "practice") practiceView(m, route.task);
    else if (route.page === "quiz") quizView(m);
    if (route.page !== "practice" || !route.task) window.scrollTo(0, 0);
  }

  // ---------- views ----------
  function home() {
    document.title = "Електрика для дому";
    var nL = 0, nP = 0, nQ = 0;
    COURSE.forEach(function (m) { nL += (m.lessons || []).length; nP += (m.practice || []).length; nQ += (m.quiz || []).length; });
    var h = '<section class="hero"><h1>Електрика для дому: теорія і практика</h1>' +
      '<p class="lead">Від основ безпеки та закону Ома до збирання квартирного щита, резервного живлення, сонячної станції, заземлення, діагностики — і повного практикуму електрики під час ремонту квартири.</p>' +
      '<div class="stats"><div class="stat"><b>' + COURSE.length + '</b><span>розділів</span></div><div class="stat"><b>' + nL +
      '</b><span>уроків теорії</span></div><div class="stat"><b>' + nP + '</b><span>практичних завдань</span></div><div class="stat"><b>' + nQ +
      '</b><span>питань у тестах</span></div></div>' +
      '<div class="row"><a class="btn" href="#/m/' + (COURSE[0] ? COURSE[0].id : "") + '">Почати з модуля 1</a><a class="btn ghost" href="#/calc">Калькулятори</a></div></section>' +
      '<div class="warn disclaimer"><b>Важливо.</b> Матеріали — навчальні. Вони не дають кваліфікаційного розряду, групи з електробезпеки чи права самостійно виконувати електромонтажні роботи. Будь-яку роботу в електроустановці виконуй лише після знеструмлення і перевірки відсутності напруги, а роботи у поверховому щиті та на вводі — тільки силами оператора системи розподілу або уповноважених осіб.</div>' +
      '<div class="note"><b>Як працює практика.</b> Задачі з числовою відповіддю перевіряються автоматично. Схеми з позначкою «Симулятор» можна зібрати в безкоштовному браузерному симуляторі Falstad CircuitJS. Прогрес зберігається лише у твоєму браузері.</div>';
    h += "<h2>Програма</h2><div class='grid'>";
    COURSE.forEach(function (m) {
      var p = Math.round(modProgress(m) * 100);
      h += '<a class="card mod-card" href="#/m/' + m.id + '"><span class="k">' + label(m) + "</span><h3>" + esc(m.title) + "</h3><p>" + esc(m.intro || "") +
        '</p><div class="bar"><i style="width:' + p + '%"></i></div><div class="meta">' + (m.lessons || []).length + " уроків · " +
        (m.practice || []).length + " завдань · " + (m.quiz || []).length + " питань · " + p + "%</div></a>";
    });
    h += "</div>" + footer();
    app.innerHTML = h;
  }

  function footer() {
    return '<footer class="site">Навчальний проєкт. Тексти, схеми і задачі створені для самостійного вивчення. Перевіряй рішення з чинними нормами (ПУЕ, ДБН) і консультуйся з кваліфікованим електриком перед роботами.</footer>';
  }

  function tabs(m, active) {
    var t = [["module", "#/m/" + m.id, "Огляд"], ["practice", "#/m/" + m.id + "/p", "Практика (" + (m.practice || []).length + ")"]];
    if ((m.quiz || []).length) t.push(["quiz", "#/m/" + m.id + "/q", "Тест (" + m.quiz.length + ")"]);
    return '<div class="tabs">' + t.map(function (x) {
      return '<a href="' + x[1] + '" class="' + (x[0] === active ? "active" : "") + '">' + x[2] + "</a>";
    }).join("") + "</div>";
  }
  function head(m) {
    return '<div class="crumbs"><a href="#/">Головна</a> / ' + label(m) + "</div><h1>" + esc(m.title) + "</h1>";
  }

  function moduleView(m) {
    document.title = m.title + " · Електрика для дому";
    var h = head(m) + tabs(m, "module");
    if (m.intro) h += "<p class='lead'>" + esc(m.intro) + "</p>";
    if ((m.goals || []).length) h += '<div class="tip"><b>Після цього розділу ти зможеш:</b><ul>' + m.goals.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul></div>";
    h += "<h2>Теорія</h2><ol class='lesson-list'>";
    (m.lessons || []).forEach(function (l, i) {
      h += '<li><a href="#/m/' + m.id + "/l/" + l.id + '"><span class="num">' + (i + 1) + ".</span>" + esc(l.title) +
        (isDone(m.id + "/l/" + l.id) ? '<span class="chk">✓</span>' : "") + "</a></li>";
    });
    h += "</ol>";
    if ((m.practice || []).length) {
      h += "<h2>Практика</h2><ol class='lesson-list'>";
      m.practice.forEach(function (p, i) {
        h += '<li><a href="#/m/' + m.id + "/p/" + p.id + '"><span class="num">' + (i + 1) + ".</span>" + esc(p.title) +
          ' <span class="tag">' + (KIND[p.kind] || "Завдання") + "</span>" + (isDone(m.id + "/p/" + p.id) ? '<span class="chk">✓</span>' : "") + "</a></li>";
      });
      h += "</ol>";
    }
    if ((m.quiz || []).length) {
      var best = store[m.id + "/quiz"];
      h += '<div class="row"><a class="btn" href="#/m/' + m.id + '/q">Пройти тест</a>' + (best != null ? "<span class='meta'>Найкращий результат: " + Math.round(best * 100) + "%</span>" : "") + "</div>";
    }
    app.innerHTML = h + pagerModules(m) + footer();
  }

  function pagerModules(m) {
    var i = COURSE.indexOf(m), prev = COURSE[i - 1], next = COURSE[i + 1];
    return '<div class="pager"><span>' + (prev ? '<a href="#/m/' + prev.id + '">← ' + esc(prev.short || prev.title) + "</a>" : "") +
      "</span><span>" + (next ? '<a href="#/m/' + next.id + '">' + esc(next.short || next.title) + " →</a>" : "") + "</span></div>";
  }

  function lessonView(m, lid) {
    var ls = m.lessons || [], i = -1;
    for (var k = 0; k < ls.length; k++) if (ls[k].id === lid) i = k;
    if (i < 0) { moduleView(m); return; }
    var l = ls[i], key = m.id + "/l/" + l.id;
    document.title = l.title + " · Електрика для дому";
    var h = '<div class="crumbs"><a href="#/">Головна</a> / <a href="#/m/' + m.id + '">' + label(m) + "</a> / Урок " + (i + 1) + "</div>" +
      "<h1>" + esc(l.title) + '</h1><article class="prose">' + l.html + "</article>" +
      '<label class="donebox"><input type="checkbox" id="lessonDone"' + (isDone(key) ? " checked" : "") + "> Урок вивчено</label>";
    var prev = ls[i - 1], next = ls[i + 1];
    h += '<div class="pager"><span>' + (prev ? '<a href="#/m/' + m.id + "/l/" + prev.id + '">← ' + esc(prev.title) + "</a>" : '<a href="#/m/' + m.id + '">← До розділу</a>') +
      "</span><span>" + (next ? '<a class="btn" href="#/m/' + m.id + "/l/" + next.id + '">Далі: ' + esc(next.title) + " →</a>"
        : '<a class="btn" href="#/m/' + m.id + '/p">До практики →</a>') + "</span></div>";
    app.innerHTML = h;
    document.getElementById("lessonDone").onchange = function (e) { mark(key, e.target.checked); renderSidebar(parse()); };
    if (next) {
      var btn = app.querySelector(".pager .btn");
      btn.addEventListener("click", function () { mark(key, true); });
    }
  }

  function parseNum(s) { return parseFloat(String(s).replace(",", ".").replace(/\s/g, "")); }

  function practiceView(m, openId) {
    document.title = "Практика · " + m.title;
    var h = head(m) + tabs(m, "practice");
    if (!(m.practice || []).length) h += "<p>У цьому розділі немає практичних завдань.</p>";
    (m.practice || []).forEach(function (p, i) {
      var key = m.id + "/p/" + p.id;
      h += '<details class="task" id="t-' + p.id + '"' + (openId === p.id ? " open" : "") + "><summary>" + (i + 1) + ". " + esc(p.title) +
        (isDone(key) ? ' <span style="color:var(--ok)">✓</span>' : "") + '<span class="kind tag">' + (KIND[p.kind] || "Завдання") + "</span></summary>" +
        '<div class="body prose">' + (p.task || "");
      if (typeof p.answer === "number") {
        h += '<div class="check"><input type="text" inputmode="decimal" placeholder="Відповідь" data-ans="' + i + '"><span>' + esc(p.unit || "") +
          '</span><button class="btn small" data-chk="' + i + '">Перевірити</button><span class="verdict" id="v-' + i + '"></span></div>';
      }
      if (p.sim) h += '<p><a class="btn ghost small" href="https://www.falstad.com/circuit/circuitjs.html" target="_blank" rel="noopener">Відкрити симулятор Falstad ↗</a></p>';
      if (p.hint) h += '<details class="reveal"><summary>Підказка</summary>' + p.hint + "</details>";
      if (p.solution) h += '<details class="reveal"><summary>Розв\'язок / еталон</summary>' + p.solution + "</details>";
      h += '<label class="donebox"><input type="checkbox" data-done="' + i + '"' + (isDone(key) ? " checked" : "") + "> Виконано</label></div></details>";
    });
    app.innerHTML = h + pagerModules(m);

    app.querySelectorAll("[data-chk]").forEach(function (b) {
      b.onclick = function () { check(+b.dataset.chk); };
    });
    app.querySelectorAll("[data-ans]").forEach(function (inp) {
      inp.onkeydown = function (e) { if (e.key === "Enter") check(+inp.dataset.ans); };
    });
    app.querySelectorAll("[data-done]").forEach(function (c) {
      c.onchange = function () { mark(m.id + "/p/" + m.practice[+c.dataset.done].id, c.checked); renderSidebar(parse()); };
    });
    function check(i) {
      var p = m.practice[i], v = parseNum(app.querySelector('[data-ans="' + i + '"]').value), out = document.getElementById("v-" + i);
      if (isNaN(v)) { out.className = "verdict bad"; out.textContent = "Введи число"; return; }
      var tol = p.tolerance != null ? p.tolerance : 0.03;
      var ok = p.answer === 0 ? Math.abs(v) < 0.01 : Math.abs(v - p.answer) / Math.abs(p.answer) <= tol;
      out.className = "verdict " + (ok ? "ok" : "bad");
      out.textContent = ok ? "✓ Правильно" : "✗ Ще раз — перевір розрахунок";
      if (ok) { mark(m.id + "/p/" + p.id, true); var c = app.querySelector('[data-done="' + i + '"]'); if (c) c.checked = true; renderSidebar(parse()); }
    }
    if (openId) { var el = document.getElementById("t-" + openId); if (el) el.scrollIntoView({ block: "start" }); }
  }

  function quizView(m) {
    document.title = "Тест · " + m.title;
    var qs = m.quiz || [];
    var h = head(m) + tabs(m, "quiz") + "<form id='quiz'>";
    qs.forEach(function (q, i) {
      h += '<div class="card q"><h4>' + (i + 1) + ". " + esc(q.q) + "</h4>";
      q.options.forEach(function (o, j) {
        h += '<label class="opt" data-q="' + i + '" data-o="' + j + '"><input type="radio" name="q' + i + '" value="' + j + '"><span>' + esc(o) + "</span></label>";
      });
      h += '<div class="explain" id="e-' + i + '" hidden></div></div>';
    });
    h += '<div class="row"><button class="btn" type="submit">Перевірити відповіді</button><button class="btn ghost" type="button" id="reset">Скинути</button><span class="score" id="score"></span></div></form>';
    app.innerHTML = h + pagerModules(m);
    var form = document.getElementById("quiz");
    form.onsubmit = function (e) {
      e.preventDefault();
      var right = 0;
      qs.forEach(function (q, i) {
        var sel = form.querySelector('input[name="q' + i + '"]:checked'), pick = sel ? +sel.value : -1;
        form.querySelectorAll('.opt[data-q="' + i + '"]').forEach(function (o) {
          o.classList.remove("right", "wrong");
          var j = +o.dataset.o;
          if (j === q.correct) o.classList.add("right");
          else if (j === pick) o.classList.add("wrong");
        });
        if (pick === q.correct) right++;
        var ex = document.getElementById("e-" + i);
        ex.hidden = false;
        ex.innerHTML = (pick === q.correct ? "✓ " : pick < 0 ? "— Без відповіді. " : "✗ ") + esc(q.explain || "");
      });
      var r = qs.length ? right / qs.length : 0;
      document.getElementById("score").textContent = right + " / " + qs.length + " (" + Math.round(r * 100) + "%)" + (r >= 0.7 ? " — тест зараховано" : " — для заліку потрібно 70%");
      if (store[m.id + "/quiz"] == null || r > store[m.id + "/quiz"]) mark(m.id + "/quiz", r);
      renderSidebar(parse());
    };
    document.getElementById("reset").onclick = function () { quizView(m); };
  }

  // ---------- search ----------
  var index = [];
  COURSE.forEach(function (m) {
    (m.lessons || []).forEach(function (l) {
      index.push({ t: l.title, s: label(m), h: "#/m/" + m.id + "/l/" + l.id, x: (l.title + " " + l.html.replace(/<[^>]+>/g, " ")).toLowerCase() });
    });
    (m.practice || []).forEach(function (p) {
      index.push({ t: p.title, s: label(m) + " · практика", h: "#/m/" + m.id + "/p/" + p.id, x: (p.title + " " + (p.task || "").replace(/<[^>]+>/g, " ")).toLowerCase() });
    });
  });
  var si = document.getElementById("searchInput"), sr = document.getElementById("searchResults");
  si.oninput = function () {
    var q = si.value.trim().toLowerCase();
    if (q.length < 2) { sr.hidden = true; return; }
    var hits = index.filter(function (e) { return e.x.indexOf(q) >= 0; })
      .sort(function (a, b) { return (b.t.toLowerCase().indexOf(q) >= 0) - (a.t.toLowerCase().indexOf(q) >= 0); }).slice(0, 25);
    sr.innerHTML = hits.length ? hits.map(function (e) { return '<a href="' + e.h + '">' + esc(e.t) + "<small>" + esc(e.s) + "</small></a>"; }).join("")
      : '<a>Нічого не знайдено</a>';
    sr.hidden = false;
  };
  sr.onclick = function () { sr.hidden = true; si.value = ""; };
  document.addEventListener("click", function (e) { if (!e.target.closest(".search")) sr.hidden = true; });

  // ---------- chrome ----------
  document.getElementById("menuBtn").onclick = function () { document.body.classList.toggle("menu-open"); };
  document.getElementById("themeBtn").onclick = function () {
    var root = document.documentElement;
    var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("ec-theme", root.dataset.theme); } catch (e) {}
  };

  window.addEventListener("hashchange", render);
  render();
})();
