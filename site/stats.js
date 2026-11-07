// Kipple stats dashboard (/stats/): reads the totals from /api/stats (anonymous, aggregated,
// see api/_lib/stats.ts) and draws them. The token is kept in this browser only.
// /stats/?demo shows made-up numbers, to see the layout before real data exists.
(function () {
  "use strict";
  var GOAL = 200;
  var TOKEN_KEY = "kipple.stats.token";
  var RANGE_KEY = "kipple.stats.days";
  var root = document.getElementById("root");
  var tip = document.getElementById("tip");
  var demo = new URLSearchParams(location.search).has("demo");

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {
      return null;
    }
  }
  var days = Number(store(RANGE_KEY)) || 28;

  // ---- helpers ---------------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var nf = new Intl.NumberFormat("ru-RU");
  function n(x) {
    return nf.format(Math.round(x));
  }
  function isoDay(d) {
    return d.toISOString().slice(0, 10);
  }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    var y = t.getUTCFullYear();
    var w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return y + "-W" + (w < 10 ? "0" : "") + w;
  }
  function short(day) {
    return day.slice(8, 10) + "." + day.slice(5, 7);
  }
  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p * 4 >= v) return steps[i] * p * 4;
    return 10 * p * 4;
  }
  function sumFields(h, test) {
    var s = 0;
    for (var k in h) if (test(k)) s += h[k];
    return s;
  }
  function addTo(acc, h, prefix) {
    for (var k in h) {
      if (prefix && k.indexOf(prefix) !== 0) continue;
      var key = prefix ? k.slice(prefix.length) : k;
      acc[key] = (acc[key] || 0) + h[k];
    }
    return acc;
  }

  // ---- data ------------------------------------------------------------------
  function periodDays() {
    var out = [];
    for (var i = days - 1; i >= 0; i--) out.push(isoDay(new Date(Date.now() - i * 864e5)));
    return out;
  }
  function periodWeeks(list) {
    var seen = [];
    list.forEach(function (d) {
      var w = isoWeek(new Date(d + "T12:00:00Z"));
      if (seen.indexOf(w) < 0) seen.push(w);
    });
    return seen;
  }

  function fakeData() {
    var data = {};
    var list = [];
    for (var i = 119; i >= 0; i--) list.push(isoDay(new Date(Date.now() - i * 864e5)));
    var installs = 0;
    list.forEach(function (d, i) {
      var growth = 1 + i / 60;
      var dl = Math.round((6 + Math.random() * 8) * growth);
      var first = Math.round(dl * (0.55 + Math.random() * 0.15));
      installs += first;
      var active = Math.round((30 + i * 1.6) * (0.4 + Math.random() * 0.12));
      var h = { active: active, "e:app_first_launch": first, "e:import_completed:direct": Math.round(first * 0.6), "e:import_completed:export_json": Math.round(first * 0.15), "e:import_failed:direct": Math.round(first * 0.05), "e:activated": Math.round(first * 0.38), "e:search_used": active * 3, "e:card_opened": active * 9, "e:topic_filtered": active * 2, "e:ai_consent_answered:yes": Math.round(first * 0.4), "e:ai_consent_answered:no": Math.round(first * 0.3), "e:ai_run_completed:builtin": Math.round(active * 0.3), "e:export_completed:md": Math.round(active * 0.05), "e:tg_signin_started": first, "e:tg_signin_completed": Math.round(first * 0.7) };
      data["kt:d:" + d] = h;
      data["kt:dl:" + d] = { total: dl, telegram: Math.round(dl * 0.45), direct: Math.round(dl * 0.3), reddit: Math.round(dl * 0.15), producthunt: Math.round(dl * 0.1) };
    });
    periodWeeks(list).forEach(function (w, i) {
      var base = 40 + i * 14;
      data["kt:w:" + w] = {
        active: base,
        "cohort:x|0": Math.round(base * 0.12), "cohort:x|2-6": Math.round(base * 0.2), "cohort:x|7-13": Math.round(base * 0.18), "cohort:x|14-29": Math.round(base * 0.25), "cohort:x|30+": Math.round(base * 0.25),
        "os:windows": base, "lang:en": Math.round(base * 0.6), "lang:ru": Math.round(base * 0.4), "ai:off": Math.round(base * 0.5), "ai:builtin": Math.round(base * 0.4), "ai:own": Math.round(base * 0.1),
        "v:0.1.16": Math.round(base * 0.8), "v:0.1.15": Math.round(base * 0.2), "lib:100-999": Math.round(base * 0.4), "lib:1k-5k": Math.round(base * 0.35), "lib:1-99": Math.round(base * 0.15), "lib:5k+": Math.round(base * 0.1),
      };
    });
    return Promise.resolve(data);
  }

  function load(token) {
    if (demo) return fakeData();
    return fetch("/api/stats?days=" + days, { headers: { authorization: "Bearer " + token }, cache: "no-store" }).then(function (r) {
      if (r.status === 404) throw new Error("token");
      if (!r.ok) throw new Error("Сервер ответил " + r.status + ". Подключён ли Upstash?");
      return r.json();
    });
  }

  // ---- charts ----------------------------------------------------------------
  // W is set to the chart's real width before each draw, so text stays at its true size.
  var W = 640, H = 200, PL = 36, PR = 8, PT = 8, PB = 24;

  function axes(max, labels) {
    var out = '<g class="axis">';
    for (var i = 0; i <= 4; i++) {
      var y = PT + (H - PT - PB) * (1 - i / 4);
      out += '<line class="gridline" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y + '" y2="' + y + '"/>';
      out += '<text x="' + (PL - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + n((max * i) / 4) + "</text>";
    }
    labels.forEach(function (l) {
      out += '<text x="' + l.x + '" y="' + (H - 6) + '" text-anchor="' + (l.anchor || "middle") + '">' + esc(l.text) + "</text>";
    });
    return out + "</g>";
  }
  function xLabels(list, xOf, fmt) {
    var idx = list.length <= 1 ? [0] : [0, Math.floor((list.length - 1) / 2), list.length - 1];
    return idx.map(function (i, k) {
      return { x: xOf(i), text: fmt(list[i]), anchor: k === 0 && idx.length > 1 ? "start" : k === idx.length - 1 && idx.length > 1 ? "end" : "middle" };
    });
  }
  /** A path for a bar whose top corners are rounded (the data end); flat on the baseline. */
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return "";
    return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
  }

  function lineChart(list, values, label) {
    var max = niceMax(Math.max.apply(null, values.concat([1])));
    var step = (W - PL - PR) / Math.max(1, list.length - 1);
    var xOf = function (i) { return PL + i * step; };
    var yOf = function (v) { return PT + (H - PT - PB) * (1 - v / max); };
    var d = values.map(function (v, i) { return (i ? "L" : "M") + xOf(i).toFixed(1) + "," + yOf(v).toFixed(1); }).join("");
    var hits = values.map(function (v, i) {
      return '<rect class="hit" x="' + (xOf(i) - step / 2) + '" y="' + PT + '" width="' + step + '" height="' + (H - PT - PB) + '" data-tip="' + esc(short(list[i]) + " · " + label + ": " + n(v)) + '" data-x="' + xOf(i) + '"/>';
    }).join("");
    var last = values.length - 1;
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(label) + '">' + axes(max, xLabels(list, xOf, short)) +
      '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + xOf(last) + '" cy="' + yOf(values[last]) + '" r="4" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/>' + hits + "</svg>";
  }

  function barChart(list, values, label, fmt) {
    var max = niceMax(Math.max.apply(null, values.concat([1])));
    var slot = (W - PL - PR) / list.length;
    var bw = Math.max(2, slot - 2);
    var xOf = function (i) { return PL + i * slot + slot / 2; };
    var yOf = function (v) { return PT + (H - PT - PB) * (1 - v / max); };
    var bars = values.map(function (v, i) {
      var y = yOf(v);
      return '<path d="' + barPath(PL + i * slot + 1, y, bw, H - PB - y, 4) + '" fill="var(--accent)"/>' +
        '<rect class="hit" x="' + (PL + i * slot) + '" y="' + PT + '" width="' + slot + '" height="' + (H - PT - PB) + '" data-tip="' + esc((fmt || short)(list[i]) + " · " + label + ": " + n(v)) + '"/>';
    }).join("");
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(label) + '">' + axes(max, xLabels(list, xOf, fmt || short)) + bars + "</svg>";
  }

  var AGE_GROUPS = [
    { key: "young", name: "0–6 дней", color: "var(--seq-1)", ages: ["0", "1", "2-6"] },
    { key: "mid", name: "7–13 дней", color: "var(--seq-2)", ages: ["7-13"] },
    { key: "old", name: "14+ дней", color: "var(--seq-3)", ages: ["14-29", "30+"] },
  ];
  function ageCounts(h) {
    return AGE_GROUPS.map(function (g) {
      return sumFields(h || {}, function (k) {
        if (k.indexOf("cohort:") !== 0) return false;
        return g.ages.indexOf(k.split("|")[1]) >= 0;
      });
    });
  }

  function stackedWeeks(weeks, rows) {
    var totals = rows.map(function (r) { return r[0] + r[1] + r[2]; });
    var max = niceMax(Math.max.apply(null, totals.concat([GOAL / 2, 1])));
    var slot = (W - PL - PR) / weeks.length;
    var bw = Math.min(56, slot - 8);
    var xOf = function (i) { return PL + i * slot + slot / 2; };
    var yOf = function (v) { return PT + (H - PT - PB) * (1 - v / max); };
    var out = "";
    rows.forEach(function (r, i) {
      var x = xOf(i) - bw / 2;
      var base = H - PB;
      var top = -1;
      for (var j = 2; j >= 0; j--) if (r[j] > 0) { top = j; break; }
      for (var k = 0; k < 3; k++) {
        if (!r[k]) continue;
        var h = (H - PT - PB) * (r[k] / max);
        var gap = k > 0 ? 2 : 0;
        var y = base - h;
        out += k === top ? '<path d="' + barPath(x, y, bw, h - gap, 4) + '" fill="' + AGE_GROUPS[k].color + '"/>' : '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(0, h - gap) + '" fill="' + AGE_GROUPS[k].color + '"/>';
        base = y;
      }
      out += '<rect class="hit" x="' + (PL + i * slot) + '" y="' + PT + '" width="' + slot + '" height="' + (H - PT - PB) + '" data-tip="' + esc(weeks[i] + " · всего " + n(totals[i]) + " · 14+ дней: " + n(r[2])) + '"/>';
    });
    // Goal line: 200 installs active 14+ days (named in the legend).
    var gy = yOf(GOAL);
    var goal = '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--ink-2)" stroke-dasharray="4 4" stroke-width="1.5"/>';
    var labels = weeks.map(function (w, i) { return { x: xOf(i), text: w.slice(5) }; });
    if (weeks.length > Math.floor(W / 60)) labels = labels.filter(function (_, i) { return i % 2 === (weeks.length - 1) % 2; });
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Активные за неделю по возрасту установки">' + axes(max, labels) + out + goal + "</svg>";
  }

  function barList(entries, opts) {
    opts = opts || {};
    if (!entries.length) return '<p class="empty">Пока нет данных</p>';
    var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }).concat([1]));
    return '<div class="bars' + (opts.cls ? " " + opts.cls : "") + '">' + entries.map(function (e) {
      return '<div class="bar-row"><span class="name" title="' + esc(e[0]) + '">' + esc(e[0]) + '</span><span class="track"><i style="width:' + ((e[1] / max) * 100).toFixed(1) + '%"></i></span><span class="num">' + n(e[1]) + (e[2] ? "<small>" + esc(e[2]) + "</small>" : "") + "</span></div>";
    }).join("") + "</div>";
  }
  function sorted(obj, names) {
    return Object.keys(obj).filter(function (k) { return obj[k] > 0; }).sort(function (a, b) { return obj[b] - obj[a]; }).map(function (k) { return [names && names[k] ? names[k] : k, obj[k]]; });
  }
  function pct(a, b) {
    return b ? Math.round((a / b) * 100) + "%" : "—";
  }

  var EVENT_NAMES = {
    app_first_launch: "Первый запуск", tg_signin_started: "Вход в Telegram: показан", tg_signin_completed: "Вход в Telegram: успешно", tg_signin_failed: "Вход в Telegram: ошибка",
    "import_completed:direct": "Импорт из Telegram", "import_completed:export_json": "Импорт из файла экспорта", "import_failed:direct": "Импорт из Telegram: ошибка", "import_failed:export_json": "Импорт из файла: ошибка",
    "ai_consent_answered:yes": "AI: согласились", "ai_consent_answered:no": "AI: отказались", "ai_run_completed:builtin": "AI-разбор (встроенный ключ)", "ai_run_completed:own": "AI-разбор (свой ключ)", ai_quota_hit: "Упёрлись в лимит AI",
    search_used: "Поиск", topic_filtered: "Фильтр по теме или тегу", card_opened: "Открыта карточка", "item_edited:tag": "Правка тегов", "item_edited:topic": "Правка темы", "item_edited:status": "Правка статуса", "item_edited:other": "Другие правки",
    "export_completed:md": "Экспорт в Markdown", "export_completed:csv": "Экспорт в CSV", update_installed: "Установлено обновление", activated: "Активированы",
  };
  var AI_NAMES = { off: "Выключен", builtin: "Встроенный ключ", own: "Свой ключ" };
  var LANG_NAMES = { ru: "Русский", en: "English" };
  var OS_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux", other: "Другая" };

  // ---- page ------------------------------------------------------------------
  function header() {
    var seg = [7, 28, 90].map(function (d) {
      return '<button data-days="' + d + '" aria-pressed="' + (d === days) + '">' + d + " дн.</button>";
    }).join("");
    return '<header><h1>Kipple <span>статистика</span>' + (demo ? '<span class="demo">демо-данные</span>' : "") + '</h1><span class="spacer"></span><div class="seg" role="group" aria-label="Период">' + seg + "</div>" + (demo ? "" : '<button class="link" data-logout>Выйти</button>') + "</header>";
  }

  var charts = [];
  /** A placeholder that is drawn once its width is known (and again on resize). */
  function later(draw) {
    charts.push(draw);
    return '<div class="chart" data-chart="' + (charts.length - 1) + '"></div>';
  }
  function drawCharts() {
    root.querySelectorAll("[data-chart]").forEach(function (el) {
      W = Math.max(260, el.clientWidth);
      el.innerHTML = charts[Number(el.getAttribute("data-chart"))]();
    });
  }
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCharts, 100);
  });

  function render(data) {
    charts = [];
    var list = periodDays();
    var weeks = periodWeeks(list);
    var day = function (d) { return data["kt:d:" + d] || {}; };
    var dl = function (d) { return data["kt:dl:" + d] || {}; };
    var week = function (w) { return data["kt:w:" + w] || {}; };

    var ev = {};
    list.forEach(function (d) { addTo(ev, day(d), "e:"); });
    var sources = {};
    list.forEach(function (d) { addTo(sources, dl(d)); });
    var downloads = sources.total || 0;
    delete sources.total;
    var firsts = ev.app_first_launch || 0;
    var imports = sumFields(ev, function (k) { return k.indexOf("import_completed:") === 0; });
    var activated = ev.activated || 0;

    var thisW = weeks[weeks.length - 1];
    var prevW = weeks[weeks.length - 2];
    var ageNow = ageCounts(week(thisW));
    var agePrev = ageCounts(week(prevW));
    var weeklyActive = week(thisW).active || 0;
    var latest = week(thisW).active ? week(thisW) : week(prevW);
    function dim(prefix, names) {
      var o = {};
      addTo(o, latest, prefix);
      return sorted(o, names);
    }

    var goalPct = Math.min(100, (ageNow[2] / GOAL) * 100);
    var html = header();
    html += '<p class="note">Только суммы: без id, IP и текста сообщений. Неделя — ISO, по UTC; текущая неделя ещё идёт. Активные 14+ дней у обновившихся со старой версии считаются с первого запуска со статистикой.</p>';
    html += '<div class="grid">';
    html += '<div class="kpis">' +
      kpi("Активны 14+ дней, эта неделя", n(ageNow[2]) + " <small>из " + GOAL + "</small>", "прошлая неделя: " + n(agePrev[2]), goalPct) +
      kpi("Активные установки, эта неделя", n(weeklyActive), "прошлая неделя: " + n(week(prevW).active || 0)) +
      kpi("Скачивания", n(downloads), "за " + days + " дн.") +
      kpi("Новые установки", n(firsts), "первые запуски за " + days + " дн.") +
      kpi("Активация", pct(activated, firsts), "импорт + возврат в другой день за первые 7 дней") +
      "</div>";

    html += card("span-12", "Активные за неделю по возрасту установки", "Сколько разных установок открывали Kipple за неделю. Верхний сегмент — те, кому 14+ дней.",
      '<div class="legend">' + AGE_GROUPS.map(function (g) { return '<span><i style="background:' + g.color + '"></i>' + g.name + "</span>"; }).join("") +
      '<span><i class="dash"></i>цель: ' + GOAL + " активных 14+ дней</span></div>" +
      later(function () { return stackedWeeks(weeks, weeks.map(function (w) { return ageCounts(week(w)); })); }));

    html += card("span-6", "Активные установки по дням", "Сколько установок открывали приложение в этот день",
      later(function () { return lineChart(list, list.map(function (d) { return day(d).active || 0; }), "активны"); }));
    html += card("span-6", "Скачивания по дням", "Клики по кнопке скачивания на сайте",
      later(function () { return barChart(list, list.map(function (d) { return dl(d).total || 0; }), "скачивания"); }));

    html += card("span-6", "Воронка за " + days + " дн.", "% от предыдущего шага. Шаги считают события, а не людей, поэтому это оценка.",
      barList([
        ["Скачивания", downloads],
        ["Первые запуски", firsts, pct(firsts, downloads)],
        ["Импорты", imports, pct(imports, firsts)],
        ["Активированы", activated, pct(activated, firsts) + " от запусков"],
      ], { cls: "funnel" }));
    html += card("span-6", "Откуда скачивают", "По utm_source в ссылке на сайт, за " + days + " дн.", barList(sorted(sources)));

    html += card("span-4", "Версии", "Активные установки за последнюю неделю", barList(dim("v:")));
    html += card("span-4", "AI", "Как включён AI", barList(dim("ai:", AI_NAMES)));
    html += card("span-4", "Размер библиотеки", "Сообщений в библиотеке", barList(dim("lib:")));
    html += card("span-6", "Язык интерфейса", "Активные установки за последнюю неделю", barList(dim("lang:", LANG_NAMES)));
    html += card("span-6", "Система", "Активные установки за последнюю неделю", barList(dim("os:", OS_NAMES)));

    var evRows = sorted(ev).map(function (e) {
      return "<tr><td>" + esc(EVENT_NAMES[e[0]] || e[0]) + " <code>" + esc(e[0]) + '</code></td><td class="n">' + n(e[1]) + "</td></tr>";
    }).join("");
    html += card("span-12 events", "События за " + days + " дн.", "Сколько раз, по всем установкам",
      evRows ? '<table><thead><tr><th>Событие</th><th class="n">Раз</th></tr></thead><tbody>' + evRows + "</tbody></table>" : '<p class="empty">Пока нет данных</p>');
    html += "</div>";
    root.innerHTML = html;
    drawCharts();
  }

  function kpi(label, value, hint, goal) {
    return '<div class="kpi"><div class="label">' + esc(label) + '</div><div class="value">' + value + '</div><div class="hint">' + esc(hint) + "</div>" +
      (goal !== undefined ? '<div class="goal" role="img" aria-label="' + Math.round(goal) + '% цели"><i style="width:' + goal.toFixed(1) + '%"></i></div>' : "") + "</div>";
  }
  function card(span, title, sub, body) {
    return '<section class="card ' + span + '"><h2>' + esc(title) + "</h2>" + (sub ? '<p class="sub">' + esc(sub) + "</p>" : '<p class="sub">&nbsp;</p>') + '<div class="chart-wrap">' + body + "</div></section>";
  }

  function loginForm(error) {
    root.innerHTML = '<div class="login card"><h2>Статистика Kipple</h2><p class="sub">Введи значение <code>KIPPLE_STATS_TOKEN</code> из настроек Vercel. Оно сохранится только в этом браузере.</p>' +
      '<form><input type="password" name="token" autocomplete="current-password" aria-label="Токен" placeholder="Токен"><button class="primary">Открыть</button></form>' +
      (error ? '<p class="error">' + esc(error) + "</p>" : "") + '<p class="sub" style="margin-top:12px"><a href="?demo">Посмотреть на демо-данных</a></p></div>';
    root.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = root.querySelector("input").value.trim();
      if (!t) return;
      store(TOKEN_KEY, t);
      start();
    });
  }

  function start() {
    var token = store(TOKEN_KEY);
    if (!demo && !token) return loginForm();
    root.innerHTML = header() + '<p class="empty">Загружаю…</p>';
    load(token).then(render, function (e) {
      if (e.message === "token") {
        store(TOKEN_KEY, null);
        loginForm("Токен не подошёл, или KIPPLE_STATS_TOKEN не задан в Vercel.");
      } else root.innerHTML = header() + '<p class="error">' + esc(e.message) + "</p>";
    });
  }

  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-days]");
    if (b) {
      days = Number(b.getAttribute("data-days"));
      store(RANGE_KEY, String(days));
      return start();
    }
    if (e.target.closest("[data-logout]")) {
      store(TOKEN_KEY, null);
      loginForm();
    }
  });
  document.addEventListener("pointermove", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) return (tip.hidden = true);
    tip.textContent = t.getAttribute("data-tip");
    tip.hidden = false;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
  });
  document.addEventListener("pointerleave", function () {
    tip.hidden = true;
  });

  start();
})();
