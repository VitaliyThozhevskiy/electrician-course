(function () {
  "use strict";

  var RHO = 0.0175; // мідь, Ом·мм²/м
  // Переріз мідної жили → найбільший автомат, який як правило ставлять на приховану проводку в квартирі
  var CABLE = [[1.5, 10], [2.5, 16], [4, 25], [6, 32], [10, 40], [16, 63], [25, 80], [35, 100]];
  var BREAKERS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100];

  function f(n, d) { return isFinite(n) ? (+n).toLocaleString("uk-UA", { maximumFractionDigits: d == null ? 2 : d }) : "—"; }
  function v(root, id) { var x = root.querySelector("#" + id); return x ? parseFloat(String(x.value).replace(",", ".")) : NaN; }
  function sel(root, id) { return root.querySelector("#" + id).value; }

  var DEFAULT_APPS = [
    ["Освітлення (LED, вся квартира)", 300, 0.8], ["Холодильник", 200, 1], ["Пральна машина", 2200, 0.6],
    ["Індукційна плита", 7000, 0.6], ["Духовка", 3000, 0.5], ["Бойлер", 2000, 0.8], ["Електрочайник", 2000, 0.3],
    ["Мікрохвильовка", 1200, 0.3], ["Кондиціонер", 1000, 0.8], ["ТВ, роутер, ПК", 500, 0.8]
  ];

  function render() {
    var h = '<div class="crumbs"><a href="#/">Головна</a> / Калькулятори</div><h1>Калькулятори</h1>' +
      '<p class="lead">Інструменти для розрахунків з курсу. Значення орієнтовні — для навчання і перевірки себе, не замість проєкту.</p>';

    h += card("Закон Ома і потужність", "Заповни будь-які два поля — решта порахується (постійний струм або активне навантаження).",
      field("o_u", "Напруга U, В") + field("o_i", "Струм I, А") + field("o_r", "Опір R, Ом") + field("o_p", "Потужність P, Вт"),
      '<button class="btn small" data-calc="ohm">Порахувати</button> <button class="btn ghost small" data-calc="ohmclear">Очистити</button>', "r_ohm");

    h += card("Струм за потужністю", "I = P / (U·cos φ) для 1 фази, I = P / (√3·U·cos φ) для 3 фаз.",
      field("c_p", "Потужність, Вт", 3500) + select("c_ph", "Мережа", [["1", "1 фаза, 230 В"], ["3", "3 фази, 400 В"]]) + field("c_cos", "cos φ", 1),
      '<button class="btn small" data-calc="cur">Порахувати</button>', "r_cur");

    h += card("Переріз кабелю, автомат і втрата напруги", "Мідний кабель, прихована проводка. Перевіряє і струм, і падіння напруги на довжині лінії.",
      field("k_p", "Потужність, Вт", 3500) + select("k_ph", "Мережа", [["1", "1 фаза, 230 В"], ["3", "3 фази, 400 В"]]) + field("k_cos", "cos φ", 1) +
      field("k_l", "Довжина лінії, м", 25) + field("k_du", "Допустима втрата, %", 3),
      '<button class="btn small" data-calc="cable">Підібрати</button>', "r_cable");

    var rows = DEFAULT_APPS.map(function (a) { return appRow(a[0], a[1], a[2]); }).join("");
    h += '<div class="card calc"><h3>Розрахункове навантаження квартири</h3><p class="meta">Pрозр = Σ(P·Kп). Kп — коефіцієнт попиту (яку частку часу/потужності прилад реально працює одночасно з іншими).</p>' +
      '<div class="prose"><table class="applist"><thead><tr><th>Прилад</th><th>P, Вт</th><th>Kп</th><th></th></tr></thead><tbody id="apps">' + rows + "</tbody></table></div>" +
      '<div class="row" style="margin-bottom:12px"><button class="btn ghost small" data-calc="addapp">+ Прилад</button><button class="btn small" data-calc="load">Порахувати</button></div>' +
      '<div class="result" id="r_load">—</div></div>';

    h += card("Інвертор і акумулятор (резерв)", "Ємність АКБ: C = P·t / (U·DoD·η). Інвертор — з запасом за тривалою і піковою (пусковою) потужністю.",
      field("b_p", "Середнє навантаження, Вт", 400) + field("b_peak", "Пікове/пускове, Вт", 1500) + field("b_t", "Автономність, год", 8) +
      select("b_u", "Напруга АКБ, В", [["12", "12"], ["24", "24"], ["48", "48"]], "24") +
      select("b_type", "Тип АКБ", [["0.9", "LiFePO4 (DoD 90%)"], ["0.5", "AGM/GEL (DoD 50%)"]]) + field("b_eta", "ККД інвертора", 0.9),
      '<button class="btn small" data-calc="bat">Порахувати</button>', "r_bat");

    h += card("Стабілізатор напруги", "При зниженій вхідній напрузі стабілізатор віддає меншу потужність — закладаємо запас. Коефіцієнти орієнтовні, дивись паспорт моделі.",
      field("s_p", "Навантаження, Вт", 3000) + field("s_cos", "cos φ", 0.9) +
      select("s_umin", "Мінімальна напруга в мережі", [["1", "≥ 190 В"], ["0.85", "≈ 170 В"], ["0.7", "≈ 150 В"], ["0.55", "≈ 130 В"]]),
      '<button class="btn small" data-calc="stab">Порахувати</button>', "r_stab");

    h += card("Сонячна станція: кількість панелей", "Кількість = добове споживання / (потужність панелі · пікові сонячні години · (1 − втрати)).",
      field("pv_e", "Добове споживання, кВт·год", 10) + field("pv_w", "Потужність панелі, Вт", 450) +
      field("pv_h", "Пікові сонячні години", 3.5) + field("pv_loss", "Втрати, %", 20),
      '<button class="btn small" data-calc="pv">Порахувати</button>', "r_pv");

    h += card("Стрінг: скільки панелей послідовно", "Voc зростає на морозі: Voc(T) = Voc·(1 + k·(T − 25)), k — від'ємний температурний коефіцієнт.",
      field("st_voc", "Voc панелі, В", 49.5) + field("st_k", "Темп. коеф. Voc, %/°C", -0.27) + field("st_t", "Мінімальна темп., °C", -20) +
      field("st_max", "Max вхідна напруга інвертора, В", 500),
      '<button class="btn small" data-calc="str">Порахувати</button>', "r_str");

    h += card("Заземлення в системі TT", "Умова безпеки: Ra · IΔn ≤ 50 В.",
      select("tt_i", "Уставка ПЗВ IΔn", [["0.03", "30 мА"], ["0.1", "100 мА"], ["0.3", "300 мА"]]),
      '<button class="btn small" data-calc="tt">Порахувати</button>', "r_tt");

    h += card("Переріз за діаметром жили", "S = π·d² / 4. Міряй жилу без ізоляції штангенциркулем.",
      field("d_d", "Діаметр, мм", 1.78) + field("d_n", "Кількість дротів у жилі", 1),
      '<button class="btn small" data-calc="diam">Порахувати</button>', "r_diam");

    return h;
  }

  function card(title, desc, fields, buttons, rid) {
    return '<div class="card calc"><h3>' + title + '</h3><p class="meta">' + desc + '</p><div class="form">' + fields +
      '</div><div class="row" style="margin-bottom:12px">' + buttons + '</div><div class="result" id="' + rid + '">—</div></div>';
  }
  function field(id, lbl, val) {
    return '<label>' + lbl + '<input id="' + id + '" type="text" inputmode="decimal"' + (val != null ? ' value="' + val + '"' : "") + "></label>";
  }
  function select(id, lbl, opts, def) {
    return "<label>" + lbl + '<select id="' + id + '">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === def ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("") + "</select></label>";
  }
  function appRow(n, p, k) {
    return '<tr><td><input value="' + (n || "") + '"></td><td><input inputmode="decimal" value="' + (p || "") + '"></td><td><input inputmode="decimal" value="' + (k || "") +
      '"></td><td><button class="icon-btn" data-calc="delapp" title="Видалити">×</button></td></tr>';
  }
  function current(p, ph, cos) { return ph === "3" ? p / (Math.sqrt(3) * 400 * cos) : p / (230 * cos); }
  function breakerFor(i) { for (var k = 0; k < BREAKERS.length; k++) if (BREAKERS[k] >= i) return BREAKERS[k]; return NaN; }

  var calcs = {
    ohm: function (r) {
      var U = v(r, "o_u"), I = v(r, "o_i"), R = v(r, "o_r"), P = v(r, "o_p"), n = [U, I, R, P].filter(isFinite).length;
      if (n < 2) return "Заповни хоча б два поля.";
      if (!isFinite(U)) U = isFinite(I) && isFinite(R) ? I * R : isFinite(P) && isFinite(I) ? P / I : Math.sqrt(P * R);
      if (!isFinite(I)) I = isFinite(R) ? U / R : P / U;
      if (!isFinite(R)) R = U / I;
      if (!isFinite(P)) P = U * I;
      return "U = <b>" + f(U, 3) + " В</b>, I = <b>" + f(I, 3) + " А</b>, R = <b>" + f(R, 3) + " Ом</b>, P = <b>" + f(P, 2) + " Вт</b>";
    },
    ohmclear: function (r) { ["o_u", "o_i", "o_r", "o_p"].forEach(function (id) { r.querySelector("#" + id).value = ""; }); return "—"; },
    cur: function (r) {
      var I = current(v(r, "c_p"), sel(r, "c_ph"), v(r, "c_cos") || 1);
      return "Струм: <b>" + f(I, 2) + " А</b>" + (sel(r, "c_ph") === "3" ? " у кожній фазі" : "") + ". Найближчий стандартний автомат не менше: <b>" + f(breakerFor(I), 0) + " А</b>.";
    },
    cable: function (r) {
      var ph = sel(r, "k_ph"), cos = v(r, "k_cos") || 1, I = current(v(r, "k_p"), ph, cos), L = v(r, "k_l"), lim = v(r, "k_du");
      var br = breakerFor(I);
      if (!isFinite(br)) return "Струм " + f(I) + " А — поза межами квартирних ліній, потрібен проєкт.";
      var first = -1;
      for (var k = 0; k < CABLE.length; k++) {
        var S = CABLE[k][0];
        if (CABLE[k][1] < br) continue;
        if (first < 0) first = k;
        var du = ph === "3" ? Math.sqrt(3) * L * I * RHO * cos / S / 400 * 100 : 2 * L * I * RHO * cos / S / 230 * 100;
        if (du <= lim) {
          return "Струм: <b>" + f(I) + " А</b>. Автомат: <b>" + br + " А</b> (характеристика C, для освітлення можна B). Кабель: <b>" +
            (ph === "3" ? "5" : "3") + "×" + f(S, 1) + " мм²</b> Cu. Втрата напруги: <b>" + f(du) + " %</b>" +
            (k > first ? " (переріз збільшено через довжину лінії)" : "") + ".";
        }
      }
      return "Навіть 35 мм² не вкладається у " + f(lim) + " % — зменш довжину або перерахуй.";
    },
    addapp: function (r) { r.querySelector("#apps").insertAdjacentHTML("beforeend", appRow("", "", 1)); return null; },
    load: function (r) {
      var sum = 0, inst = 0;
      r.querySelectorAll("#apps tr").forEach(function (tr) {
        var x = tr.querySelectorAll("input"), p = parseFloat(String(x[1].value).replace(",", ".")), k = parseFloat(String(x[2].value).replace(",", "."));
        if (isFinite(p)) { inst += p; sum += p * (isFinite(k) ? k : 1); }
      });
      var I1 = sum / 230, I3 = sum / (Math.sqrt(3) * 400);
      return "Встановлена потужність: <b>" + f(inst / 1000) + " кВт</b>. Розрахункова: <b>" + f(sum / 1000) + " кВт</b>.<br>1 фаза: <b>" + f(I1, 1) +
        " А</b> → ввідний автомат від " + f(breakerFor(I1), 0) + " А. 3 фази: <b>" + f(I3, 1) + " А</b> на фазу → від " + f(breakerFor(I3), 0) +
        " А.<br><span class='meta'>Ввідний номінал обмежений виділеною потужністю за договором — порівняй з нею.</span>";
    },
    bat: function (r) {
      var P = v(r, "b_p"), Pk = v(r, "b_peak"), t = v(r, "b_t"), U = +sel(r, "b_u"), dod = +sel(r, "b_type"), eta = v(r, "b_eta") || 0.9;
      var inv = Math.max(P * 1.25, Pk / 2), C = P * t / (U * dod * eta);
      return "Інвертор: тривала потужність не менше <b>" + f(Math.ceil(inv / 100) * 100, 0) + " Вт</b>, пікова (кілька секунд) не менше <b>" + f(Pk, 0) +
        " Вт</b>.<br>Акумулятор: <b>" + f(C, 0) + " А·год</b> при " + U + " В (≈ " + f(C * U / 1000) + " кВт·год номінальної енергії).<br>Струм розряду ≈ " +
        f(P / (U * eta), 1) + " А, піковий ≈ " + f(Pk / (U * eta), 0) + " А — під нього підбирай кабель і запобіжник АКБ.";
    },
    stab: function (r) {
      var S = v(r, "s_p") / (v(r, "s_cos") || 1) * 1.25 / +sel(r, "s_umin");
      return "Потрібна номінальна потужність стабілізатора: <b>" + f(Math.ceil(S / 500) * 500, 0) + " ВА</b> (розраховано " + f(S, 0) + " ВА з запасом 25%).";
    },
    pv: function (r) {
      var n = v(r, "pv_e") * 1000 / (v(r, "pv_w") * v(r, "pv_h") * (1 - v(r, "pv_loss") / 100));
      return "Потрібно панелей: <b>" + Math.ceil(n) + "</b> (розраховано " + f(n, 1) + "), сумарно ≈ <b>" + f(Math.ceil(n) * v(r, "pv_w") / 1000) + " кВт</b>. Це в середньому за сезон; взимку генерація значно нижча.";
    },
    str: function (r) {
      var voc = v(r, "st_voc") * (1 + v(r, "st_k") / 100 * (v(r, "st_t") - 25)), n = Math.floor(v(r, "st_max") / voc);
      return "Voc панелі при " + f(v(r, "st_t"), 0) + " °C: <b>" + f(voc) + " В</b>. Максимум послідовно: <b>" + n + " шт.</b> (стрінг ≈ " + f(n * voc, 0) +
        " В). Перевір також, що Vmp стрінга потрапляє в MPPT-діапазон інвертора.";
    },
    tt: function (r) {
      var i = +sel(r, "tt_i");
      return "Опір заземлювача Ra має бути не більше <b>" + f(50 / i, 0) + " Ом</b>. На практиці прагнуть до значно меншого і стабільного значення (сезонні зміни ґрунту).";
    },
    diam: function (r) {
      var S = Math.PI * Math.pow(v(r, "d_d"), 2) / 4 * (v(r, "d_n") || 1), near = CABLE.reduce(function (a, c) { return Math.abs(c[0] - S) < Math.abs(a[0] - S) ? c : a; });
      return "Переріз: <b>" + f(S, 2) + " мм²</b>. Найближчий стандартний: " + f(near[0], 1) + " мм²" + (S < near[0] * 0.9 ? " — <b>жила тонша за номінал</b>, кабель занижений." : ".");
    }
  };

  function bind(root) {
    if (root.dataset.calcBound) return;
    root.dataset.calcBound = "1";
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-calc]");
      if (!b || !b.closest(".calc")) return;
      var name = b.dataset.calc;
      if (name === "delapp") { b.closest("tr").remove(); return; }
      var out = calcs[name](root);
      if (out == null) return;
      var res = b.closest(".calc").querySelector(".result");
      res.innerHTML = out;
    });
  }

  window.CALC = { render: render, bind: bind };
})();
