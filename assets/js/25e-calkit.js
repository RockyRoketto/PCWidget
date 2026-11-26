'use strict';
// Календарь по темам: варианты 1 и 2 (сами варианты — 25f-calvars.js; вариант 0 — calendarFace в 25-faces.js).
// Лицо само выбирает раскладку по месту: высота в «модулях» m (1..4) и во всю ширину (full).
// Число дня задаётся желаемым размером, kcFit уменьшает масштаб k, пока всё не влезет. Шрифт ячеек — от размера клетки,
// «добавки» (неделя года, полоса месяца, шкала) рисуются после замера своего места и сами уменьшают шрифт.

function kcIsoWeek(d) {
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), n = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - n + 3);
  var y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - y) / 864e5 - 3 + (y.getUTCDay() + 6) % 7) / 7);
}
function kcInfo(d) {
  var nd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    D: d.getDate(), wl: ruDate(d, { weekday: 'long' }), ws: ruDate(d, { weekday: 'short' }), ml: ruDate(d, { month: 'long' }), y: d.getFullYear(),
    nd: nd, df: (d.getHours() * 60 + d.getMinutes()) / 1440, wk: kcIsoWeek(d), wi: (d.getDay() + 6) % 7,
    doy: Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1
  };
}
// Период полос и шкал: у недели — неделя, у дня и месяца — месяц.
function kcPeriod(c) {
  var s = c.s;
  if (c.view === 'week') return { u: 7, frac: (s.wi + s.df) / 7, left: 6 - s.wi, labs: WDAYS };
  return { u: s.nd, frac: (s.D - 1 + s.df) / s.nd, left: s.nd - s.D, labs: ['1', String(Math.round(s.nd / 2)), String(s.nd)] };
}
function kcPlural(n, a, b, m) { var x = n % 10, h = n % 100; return x === 1 && h !== 11 ? a : x >= 2 && x <= 4 && (h < 10 || h >= 20) ? b : m; }
function kcLeft(n) { return n ? 'осталось ' + n + ' ' + kcPlural(n, 'день', 'дня', 'дней') : 'последний день'; }
function kcPct(c) { return Math.round(kcPeriod(c).frac * 100); }

// ---- кирпичики ----
function kcNum(c, n) { return c.K.num ? c.K.num(c, n) : '<span class="kn" style="font-size:' + n + 'px">' + c.s.D + '</span>'; }
// Сегодня: число и текст. lay — row (текст справа) или col (текст под числом).
function kcTb(c, lay, n0) {
  var n = Math.round(n0 * c.k), s = c.s;
  if (c.K.tb) return c.K.tb(c, lay, n);
  var tbf = clamp(Math.round(n * .23), 12, 20), tsf = clamp(Math.round(n * .17), 11, 15);
  return '<div class="tb ' + lay + '" style="--tb:' + tbf + 'px;--ts:' + tsf + 'px">' + kcNum(c, n) +
    '<div class="tx"><b>' + s.wl + '</b><span>' + s.ml + (c.full || lay === 'col' || c.m > 2 ? ' ' + s.y : '') + '</span></div></div>';
}
function kcHd(c) { return '<div class="kh">' + (c.K.head ? c.K.head(c) : c.s.ml + ' ' + c.s.y) + '</div>'; }
// Сетка недели или месяца с буквами дней. auto — строка по высоте содержимого (неделя под числом), иначе делит место поровну.
function kcGrid(c, list, auto) {
  var d = c.d, t = new Date(d.getFullYear(), d.getMonth(), d.getDate()), L = calDays(d, list), cur = d.getMonth(), nd = c.s.nd, h = '';
  WDAYS.forEach(function (w, i) { h += '<span class="cw' + (i > 4 ? ' we' : '') + '">' + w + '</span>'; });
  L.forEach(function (x, i) {
    var f = { now: x.toDateString() === d.toDateString(), we: i % 7 > 4, off: list === 'month' && x.getMonth() !== cur, past: x < t, n: x.getDate(), fr: (x.getDate() - 1) / (nd - 1) };
    h += '<span class="cd' + (f.now ? ' now' : '') + (f.we ? ' we' : '') + (f.off ? ' off' : '') + (f.past ? ' past' : '') + '">' + (c.K.cell ? c.K.cell(c, f) : '<i>' + f.n + '</i>') + '</span>';
  });
  return '<div class="cg ' + list + (auto ? ' auto' : '') + '" style="--cf:12px;--lf:9px;grid-template-rows:auto repeat(' + L.length / 7 + ',' + (auto ? 'auto' : 'minmax(0,1fr)') + ')">' + h + '</div>';
}
// «Добавка»: место отдаётся пустым, содержимое рисует kcFillEx после замера. h — высота, без неё занимает остаток.
function kcEx(c, h) { return c.K.extra ? '<div class="ex" style="' + (h ? 'height:' + h + 'px' : 'flex:1;align-self:stretch') + '"></div>' : ''; }

// ---- раскладки ----
function kcDay(c) {
  var m = c.m, full = c.full, W = kcGrid(c, 'week', true);
  if (m === 1) return '<div class="L row kf"' + (full ? '' : ' style="justify-content:center"') + '>' + kcTb(c, 'row', 36) + (full ? kcEx(c) : '') + '</div>';
  if (!full && m === 2) return '<div class="L col kf ksb">' + kcTb(c, 'row', 46) + W + '</div>';
  if (!full && m === 3) return '<div class="L col kf" style="gap:8px">' + kcTb(c, 'col', 80) + W + '</div>';
  if (!full) return '<div class="L col kf" style="gap:10px">' + kcTb(c, 'col', 100) + W + kcEx(c) + '</div>';
  if (m === 2) return '<div class="L row kf" style="gap:16px">' + kcTb(c, 'row', 84) + kcEx(c) + '</div>';
  if (c.K.wide) return '<div class="L row kf" style="gap:16px">' + kcTb(c, 'col', m === 3 ? 76 : 100) + '<div class="fx" style="gap:10px">' + kcEx(c) + W + '</div></div>';
  return '<div class="L col kf" style="gap:10px"><div class="L row" style="gap:16px;flex:1">' + kcTb(c, 'row', m === 3 ? 68 : 96) + kcEx(c) + '</div>' + W + '</div>';
}
function kcWeek(c) {
  var m = c.m, full = c.full;
  if (m === 1) return full ? '<div class="L row kf" style="gap:14px">' + kcTb(c, 'row', 34) + kcGrid(c, 'week') + '</div>' : '<div class="L col kf">' + kcGrid(c, 'week') + '</div>';
  var W = kcGrid(c, 'week', true);
  if (!full) return '<div class="L col kf" style="gap:' + (m === 2 ? 4 : 10) + 'px">' + (m === 2 ? kcHd(c) : m === 3 ? kcTb(c, 'row', 50) : kcTb(c, 'col', 80)) + W + kcEx(c) + '</div>';
  if (m === 2) return '<div class="L row kf" style="gap:16px">' + kcTb(c, 'col', 58) + '<div class="fx" style="justify-content:center">' + W + '</div></div>';
  if (c.K.wide) return '<div class="L row kf" style="gap:16px">' + kcTb(c, 'col', m === 3 ? 62 : 80) + '<div class="fx" style="gap:10px">' + W + kcEx(c) + '</div></div>';
  return '<div class="L col kf" style="gap:10px"><div class="L row" style="gap:16px;flex:1">' + kcTb(c, 'row', m === 3 ? 52 : 72) + kcEx(c) + '</div>' + W + '</div>';
}
function kcMonth(c) {
  var m = c.m, full = c.full;
  if (m === 1) return kcWeek(c); // в один модуль сетка месяца не помещается: текущая неделя
  if (!full && m === 2) return '<div class="L col kf">' + kcGrid(c, 'month') + '</div>';
  if (!full && m === 3) return '<div class="L col kf" style="gap:4px">' + kcHd(c) + kcGrid(c, 'month') + '</div>';
  if (!full) return '<div class="L col kf" style="gap:8px">' + kcTb(c, 'row', 48) + kcGrid(c, 'month') + '</div>';
  if (m === 2) return '<div class="L row kf" style="gap:14px">' + kcTb(c, 'col', 52) + kcGrid(c, 'month') + '</div>';
  if (m === 3) return '<div class="L row kf" style="gap:16px">' + kcTb(c, 'col', 68) + kcGrid(c, 'month') + '</div>';
  if (c.K.wide) return '<div class="L row kf" style="gap:16px">' + kcTb(c, 'col', 76) + '<div class="fx" style="gap:8px">' + kcGrid(c, 'month') + kcEx(c, 26) + '</div></div>';
  return '<div class="L row kf" style="gap:16px"><div class="fx" style="flex:none;width:40%;gap:12px">' + kcTb(c, 'col', 76) + kcEx(c) + '</div>' + kcGrid(c, 'month') + '</div>';
}
function kcBody(c) {
  var K = c.K;
  return (K.bg ? K.bg(c) : '') + (c.view === 'day' ? kcDay(c) : c.view === 'week' ? kcWeek(c) : kcMonth(c)) + (K.deco ? K.deco(c) : '');
}

// ---- подгонка ----
function kcSizeGrids(el) {
  $$('.cg', el).forEach(function (g) {
    for (var k = 0; k < 2; k++) { // второй раз — после того как буквы дней сменили высоту
      var q = $('.cd', g).getBoundingClientRect(), cf = clamp(Math.min(g.classList.contains('auto') ? 99 : q.height * .6, q.width / 1.55), 8, 30);
      g.style.setProperty('--cf', cf.toFixed(1) + 'px'); g.style.setProperty('--lf', clamp(cf * .66, 8, 13).toFixed(1) + 'px');
    }
  });
}
function kcFillEx(el, c) {
  $$('.ex', el).forEach(function (e) {
    var w = Math.floor(e.clientWidth), h = Math.floor(e.clientHeight), f, k;
    e.innerHTML = h >= 12 && w >= 40 ? c.K.extra(c, w, h) : '';
    for (f = clamp(h * .34, 10, 17); f >= 8; f -= .5) { // шрифт подписей добавки — пока не влезет
      e.style.setProperty('--xf', f + 'px'); k = e.firstElementChild;
      if (!k || k.scrollWidth <= w + 1 && k.offsetHeight <= h + 1) return;
    }
    e.innerHTML = ''; // не влезла и мелким шрифтом: лучше без неё, чем обрезанной
  });
}
// Не влезло: что-то за краем лица, обрезанный текст, слишком мелкие клетки или добавке не осталось места.
function kcBad(el, c, withEx) {
  var R = el.getBoundingClientRect(), bad = false;
  $$('.L *', el).forEach(function (e) {
    if (bad || e.closest('.ex')) return;
    var q = e.getBoundingClientRect();
    if (!q.width || !q.height) return;
    if (q.left < R.left - 1 || q.right > R.right + 1 || q.top < R.top - 1 || q.bottom > R.bottom + 1) bad = true;
    else if (e.matches('.tx b,.tx span,.tb,.bpt .c,.bpt .c b,.kh') && e.scrollWidth > e.clientWidth + 1) bad = true;
  });
  $$('.cd', el).forEach(function (e) { if (!bad && e.getBoundingClientRect().height < 11) bad = true; });
  $$('.L.row>.ex', el).forEach(function (e) { if (e.clientWidth < 72) bad = true; });
  $$('.L.col>.ex,.fx>.ex', el).forEach(function (e) { if (e.style.flex && e.clientHeight < (c.m > 2 ? 40 : 24)) bad = true; });
  if (withEx) $$('.ex>*', el).forEach(function (e) { if (!bad && (e.scrollWidth > e.parentNode.clientWidth + 1 || e.offsetHeight > e.parentNode.clientHeight + 1)) bad = true; });
  return bad;
}
function kcFit(el, c) {
  if (CFG.theme === 'fill') palStops().forEach(function (x, i) { el.style.setProperty('--kp' + i, x); }); // градиент «Заливки»
  for (var n = 0; n < 16; n++) {
    el.innerHTML = kcBody(c);
    kcSizeGrids(el); kcFillEx(el, c);
    if (c.k < .4 || !kcBad(el, c, c.k > .6)) return;
    c.k *= .93;
  }
}

// Лицо: перерисовка при смене дня, часа (полосы и шкалы) и размера места.
function calThemed(v) {
  var K = (CAL_K[CFG.theme] || CAL_K.sheet)[v - 1], view = CFG.calView, last = '';
  var el = mk('<div class="face kc kc-' + K.k + ' v-' + view + '"></div>');
  return {
    el: el,
    tick: function () {
      var d = new Date(), W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      var key = d.toDateString() + d.getHours() + ' ' + W + 'x' + H;
      if (key === last) return;
      last = key;
      kcFit(el, { K: K, d: d, view: view, full: W >= 250, m: H < 72 ? 1 : H < 132 ? 2 : H < 192 ? 3 : 4, s: kcInfo(d), k: 1 });
    }
  };
}
