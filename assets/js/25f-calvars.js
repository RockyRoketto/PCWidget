'use strict';
// Варианты календаря по темам (раскладка и подгонка — 25e-calkit.js, стили — css/calendar*.css).
// Вариант: k — класс, wide — полосе нужно место во всю ширину, num/cell/tb — своё число, клетка, блок «сегодня»,
// extra(c, w, h) — добавка в отведённое место, bg/deco — слои под и над лицом. Цвета только из переменных темы.

function kcV(v) { return 'var(--' + v + ')'; }
function kcDrums(s) { return '<span class="kc-dr">' + s.split('').map(function (ch) { return '<i>' + ch + '</i>'; }).join('') + '</span>'; }
// 3×5 размером в шрифт: высота .72em (клетки ячеек растут вместе с --cf)
function kcPxEm(str, col) {
  var d = '', x = 0;
  str.split('').forEach(function (ch) {
    var rows = PX5[ch], y, j;
    for (y = 0; y < 5; y++) for (j = 0; j < 3; j++) if (rows[y][j] === '1') d += 'M' + (x + j) + ' ' + y + 'h1v1h-1z';
    x += 4;
  });
  return '<svg viewBox="0 0 ' + (x - 1) + ' 5" style="height:.72em;width:' + ((x - 1) / 5 * .72).toFixed(2) + 'em;fill:' + kcV(col) + '"><path d="' + d + '"/></svg>';
}
// 7 сегментов размером в шрифт
function kcSegEm(str, h) { var g = ckSegG(str); return '<svg class="seg7" viewBox="-1 -1 ' + ckF(g.w + 2) + ' 24" style="height:' + h + 'em;width:' + ckF((g.w + 2) / 24 * h) + 'em">' + g.g + '</svg>'; }
// цвет из градиента «Заливки» по доле 0..1
function kcPal(f) {
  var st = palStops(), i = f < .5 ? 0 : 1, k = f < .5 ? f * 2 : f * 2 - 1, a = rgbOf(st[i]), b = rgbOf(st[i + 1]);
  return 'rgb(' + a.map(function (v, j) { return Math.round(v + (b[j] - v) * k); }).join(',') + ')';
}
function kcPalGrad(deg) { return 'linear-gradient(' + deg + 'deg,' + palStops().join(',') + ')'; }

// Шкала периода: деления по дням (у недели — четверти дня), стрелка и залитый путь до сегодня.
function kcRuler(c, w, h) {
  var p = kcPeriod(c), hh = Math.min(h, 64), lf = clamp(hh * .2, 9, 13), lab = hh >= 24, base = lab ? hh - lf - 4 : hh - 2;
  var sub = c.view === 'week' ? 4 : 1, N = p.u * sub, x0 = 4, x1 = w - 4, o = '', i, L, len, dt, day, t;
  function X(f) { return ckF(x0 + (x1 - x0) * f); }
  for (i = 0; i <= N; i++) {
    day = i / sub;
    if (c.view === 'week') L = i % sub === 0 ? 1 : 0;
    else { dt = new Date(c.d.getFullYear(), c.d.getMonth(), day + 1); L = i === 0 || i === N || dt.getDay() === 1 ? 1 : 0; }
    len = L ? Math.min(22, base * .55) : Math.min(11, base * .3);
    o += '<line x1="' + X(i / N) + '" x2="' + X(i / N) + '" y1="' + base + '" y2="' + ckF(base - len) + '"' + ckS('text', L ? 1.2 : 1, L ? .85 : .4) + '/>';
    if (lab && L && i < N) {
      t = c.view === 'week' ? WDAYS[day] : String(day + 1);
      o += '<text x="' + (c.view === 'week' ? X((i + sub / 2) / N) : X(i / N)) + '" y="' + (hh - 1) + '" font-size="' + ckF(lf) + '" text-anchor="middle"' + ckFi('dim') + '>' + t + '</text>';
    }
  }
  var px = X(p.frac);
  return '<div><svg width="' + w + '" height="' + hh + '"><line x1="' + x0 + '" x2="' + x1 + '" y1="' + base + '" y2="' + base + '"' + ckS('text', 1, .5) + '/>' +
    '<line x1="' + x0 + '" x2="' + px + '" y1="' + base + '" y2="' + base + '"' + ckS('warm', 2.5) + '/>' + o +
    '<polygon points="' + px + ',' + (base - 1) + ' ' + ckF(px - 4) + ',' + (base - 8) + ' ' + ckF(+px + 4) + ',' + (base - 8) + '"' + ckFi('warm') + '/>' +
    '<line x1="' + px + '" x2="' + px + '" y1="' + base + '" y2="0"' + ckS('warm', 1.2, .8) + '/></svg></div>';
}
// Луч осциллографа: ровная линия с метками периода и импульс на сегодня.
function kcTrace(c, w, h) {
  var p = kcPeriod(c), hh = Math.min(h, 72), b = hh * .78, top = Math.max(2, hh * .08), x = w * p.frac, d = 'M0 ' + ckF(b), i, xi;
  for (i = 1; i < p.u; i++) { xi = w * i / p.u; if (Math.abs(xi - x) < 8) continue; d += ' L' + ckF(xi - 1.5) + ' ' + ckF(b) + ' L' + ckF(xi) + ' ' + ckF(b - 2) + ' L' + ckF(xi + 1.5) + ' ' + ckF(b); }
  var sp = 'M' + ckF(x - 6) + ' ' + ckF(b) + ' L' + ckF(x - 2) + ' ' + ckF(b) + ' L' + ckF(x) + ' ' + ckF(top) + ' L' + ckF(x + 2) + ' ' + ckF(b + 3) + ' L' + ckF(x + 5) + ' ' + ckF(b);
  return '<div class="kx-tr"><svg width="' + w + '" height="' + hh + '"><path d="' + d + ' L' + w + ' ' + ckF(b) + '"' + ckS('a', 1.3, .75) + '/><path d="' + sp + '"' + ckS('text', 1.6) + ' stroke-linejoin="round"/></svg></div>';
}
// Размерная линия чертежа: выносные, стрелки, длина периода, кружок на сегодня.
function kcDim(c, w, h) {
  var p = kcPeriod(c), hh = Math.min(h, 56), y = hh >= 24 ? hh * .72 : hh / 2 + 3, x0 = 3, x1 = w - 3, x = ckF(x0 + (x1 - x0) * p.frac);
  function A(xx, dir) { return '<polygon points="' + xx + ',' + y + ' ' + (xx + dir * 6) + ',' + (y - 2) + ' ' + (xx + dir * 6) + ',' + (y + 2) + '"' + ckFi('text') + '/>'; }
  return '<div><svg width="' + w + '" height="' + ckF(hh) + '"><line x1="' + x0 + '" x2="' + x0 + '" y1="' + (y - 7) + '" y2="' + (y + 5) + '"' + ckS('ln', 1) + '/><line x1="' + x1 + '" x2="' + x1 + '" y1="' + (y - 7) + '" y2="' + (y + 5) + '"' + ckS('ln', 1) + '/>' +
    '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y + '" y2="' + y + '"' + ckS('text', .9) + '/>' + A(x0, 1) + A(x1, -1) +
    '<circle cx="' + x + '" cy="' + y + '" r="2.6" style="fill:var(--sheet);stroke:var(--text)"/>' +
    (hh >= 24 ? '<text class="kx-dt" x="' + w / 2 + '" y="' + (y - 5) + '" font-size="' + ckF(clamp(hh * .24, 10, 14)) + '" text-anchor="middle">' + (c.view === 'week' ? 7 : p.u) + ' ДН</text>' : '') + '</svg></div>';
}
// Блоки «Пикселей»: в «Дне» — карта месяца (недели × 7), иначе полоса блоков периода.
function kcBlocks(c, w, h) {
  var p = kcPeriod(c), now = Math.floor(p.frac * p.u), o = '', W0, H0, g, z, bw, bh, u;
  function col(i) { return i < now ? 'mint' : i === now ? 'pink' : 'track'; }
  if (c.view === 'day' && h >= 36) {
    var L = calDays(c.d, 'month'), rows = L.length / 7;
    g = 2; z = Math.floor(Math.min((w - 6 * g) / 7, (h - (rows - 1) * g) / rows));
    L.forEach(function (x, i) { if (x.getMonth() === c.d.getMonth()) o += '<rect x="' + i % 7 * (z + g) + '" y="' + Math.floor(i / 7) * (z + g) + '" width="' + z + '" height="' + z + '"' + ckFi(col(x.getDate() - 1)) + '/>'; });
    W0 = 7 * (z + g) - g; H0 = rows * (z + g) - g;
  } else {
    u = p.u; g = w / u < 6 ? 1 : 2; bw = Math.floor((w - g * (u - 1)) / u); bh = Math.min(h, Math.max(6, bw * (c.view === 'week' ? 1 : 1.6)), c.view === 'week' ? 60 : 22);
    for (var i = 0; i < u; i++) o += '<rect x="' + i * (bw + g) + '" y="0" width="' + bw + '" height="' + bh + '"' + ckFi(col(i)) + '/>';
    W0 = u * (bw + g) - g; H0 = bh;
  }
  return '<div><svg class="kx-px" width="' + W0 + '" height="' + H0 + '">' + o + '</svg></div>';
}

var CAL_K = {
  sheet: [
    { k: 'sh1', extra: function (c) { var s = c.s; return '<div class="kx-t"><span><b>' + s.wk + '-я</b> неделя</span> · <span><b>' + s.doy + '-й</b> день года</span> · <span>' + kcLeft(s.nd - s.D) + '</span></div>'; } },
    { k: 'sh2', wide: 1, extra: function (c, w, h) {
      var p = kcPeriod(c);
      return '<div class="kx-bar"><div class="kbr"><i style="width:' + kcPct(c) + '%"></i></div>' + (h >= 24 ? '<div class="lb">' + p.labs.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' : '') +
        (h >= 44 ? '<div class="lf">' + kcLeft(p.left) + '</div>' : '') + '</div>';
    } }
  ],
  gauge: [
    { k: 'ga1', num: function (c, n) { return '<span class="kn" style="font-size:' + Math.round(n * .74) + 'px">' + kcDrums(String(c.s.D)) + '</span>'; },
      extra: function (c, w) { var s = c.s; return '<div class="kx-dr"><span><small>НЕД</small>' + kcDrums(two(s.wk)) + '</span><span><small>ДЕНЬ</small>' + kcDrums(String(s.doy)) + '</span>' + (w > 230 ? '<span><small>ОСТ</small>' + kcDrums(two(s.nd - s.D)) + '</span>' : '') + '</div>'; } },
    { k: 'ga2', wide: 1, extra: kcRuler }
  ],
  fill: [
    { k: 'fi1', num: function (c, n) { return '<span class="kn" style="font-size:' + n + 'px;background-image:' + kcPalGrad(120) + '">' + c.s.D + '</span>'; },
      extra: function (c, w) { var s = c.s, st = palStops(); return '<div class="kx-pl"><i style="background:' + st[0] + '">нед ' + s.wk + '</i><i style="background:' + st[1] + '">день ' + s.doy + '</i>' + (w > 200 ? '<i style="background:' + st[2] + '">' + kcLeft(s.nd - s.D) + '</i>' : '') + '</div>'; },
      cell: function (c, f) { return '<i' + (f.now ? ' style="background:' + kcPalGrad(120) + '"' : '') + '>' + f.n + '</i>'; } },
    { k: 'fi2', wide: 1,
      cell: function (c, f) { return '<i style="--cc:' + kcPal(f.fr) + ';--f:' + (f.past ? 100 : f.now ? Math.max(12, Math.round(c.s.df * 100)) : 0) + '%">' + f.n + '</i>'; },
      bg: function (c) { return c.view === 'day' ? '<div class="kc-lvl" style="--p:' + kcPct(c) / 100 + ';background:linear-gradient(to top,' + kcPal(1) + ',' + kcPal(0) + ')"></div>' : ''; },
      extra: function (c, w, h) { var s = c.s; return '<div class="kx-fl" style="--bh:' + Math.min(30, h) + 'px"><div class="kbr"><i style="width:' + kcPct(c) + '%;background:' + kcPalGrad(90) + '"></i>' + (h >= 16 ? '<b>' + (c.view === 'week' ? s.wi + 1 + ' из 7' : s.D + ' из ' + s.nd) + '</b>' : '') + '</div></div>'; } }
  ],
  lcd: [
    { k: 'lc1', num: function (c, n) { return ckSeg((c.s.D < 10 ? ' ' : '') + c.s.D, Math.round(n * .9)).replace('class="seg7"', 'class="seg7 kn"'); },
      cell: function (c, f) { return '<i><s>88</s>' + (f.n < 10 ? ' ' : '') + f.n + '</i>'; },
      extra: function (c) { var s = c.s; return '<div class="kx-sg"><span>НЕД ' + kcSegEm(two(s.wk), 1.7) + '</span><span>ДЕНЬ ' + kcSegEm(String(s.doy), 1.7) + '</span></div>'; } },
    { k: 'lc2', head: function (c) { return c.s.ml.slice(0, 3) + ' ' + c.s.y; },
      extra: function (c, w) { var s = c.s; return '<div class="kx-bx"><span>НЕД ' + two(s.wk) + '</span><span>ДЕНЬ ' + s.doy + '</span>' + (w > 200 ? '<span>ОСТ ' + two(s.nd - s.D) + '</span>' : '') + '</div>'; } }
  ],
  osc: [
    { k: 'os1', wide: 1, extra: kcTrace, deco: function (c) { return c.m > 1 ? '<span class="kc-ch">CH1 · ' + (c.view === 'week' ? 'НЕД' : 'МЕС') + '</span>' : ''; } },
    { k: 'os2', num: function (c, n) { return '<span class="kn xh" style="font-size:' + n + 'px">' + c.s.D + '</span>'; },
      deco: function (c) { return c.m > 1 ? '<span class="kc-rd">X ' + c.s.ws.toUpperCase() + ' · Y Н' + c.s.wk + '</span>' : ''; },
      extra: function (c, w) { var s = c.s, p = kcPeriod(c); return '<div class="kx-rd"><span>Δt ' + p.left + ' ' + kcPlural(p.left, 'день', 'дня', 'дней') + '</span><span>T ' + s.doy + '/' + (new Date(s.y, 1, 29).getDate() === 29 ? 366 : 365) + '</span>' + (w > 200 ? '<span>Н ' + s.wk + '</span>' : '') + '</div>'; } }
  ],
  bp: [
    { k: 'bp1', tb: function (c, lay, n) {
      var s = c.s, ts = clamp(Math.round(n * .16), 11, 15), thin = c.m === 1, sh = lay === 'col' || !c.full;
      return '<div class="tb bpt' + (lay === 'col' ? ' col' : '') + '" style="--ts:' + ts + 'px"><div class="nb">' + (thin ? '' : '<small>ДАТА</small>') + '<span class="kn" style="font-size:' + Math.round(n * (thin ? .82 : .8)) + 'px">' + s.D + '</span></div>' +
        '<div class="c"><small>ДЕНЬ</small><b>' + (sh ? s.ws : s.wl) + '</b></div><div class="c"><small>' + (sh ? '' : 'МЕС') + '</small>' + (sh ? s.ml.slice(0, 3) + ' ' + s.y : s.ml + ' ' + s.y) + '</div></div>';
    },
      extra: function (c, w) { var s = c.s; return '<div class="kx-st"><span><small>НЕД</small>' + s.wk + '</span><span><small>ДЕНЬ</small>' + s.doy + '</span>' + (w > 200 ? '<span><small>ОСТ</small>' + (s.nd - s.D) + '</span>' : '') + '</div>'; } },
    { k: 'bp2', wide: 1, extra: kcDim }
  ],
  pixel: [
    { k: 'px1', num: function (c, n) { return ckPx(String(c.s.D), Math.max(3, Math.round(n / 6.2)), 'yel').replace('class="pxt"', 'class="pxt kn"'); },
      cell: function (c, f) { return '<i>' + kcPxEm(String(f.n), f.now ? 'tile' : f.we ? 'pink' : 'text') + '</i>'; },
      extra: function (c, w, h) {
        var s = c.s, xf = clamp(h * .34, 10, 17), nar = w < 150;
        var cc = nar ? clamp(Math.min(Math.floor(h / 13), Math.floor((w - 5 * xf * .62 - 8) / 11 * 2) / 2), 1.5, 4) : clamp(Math.min(Math.floor(h / 6), Math.floor((w - 9 * xf * .62 - 24) / 18 * 2) / 2), 1.5, 5);
        return '<div class="kx-px3"><span>НЕД ' + ckPx(two(s.wk), cc, 'blue') + '</span><span>ДЕНЬ ' + ckPx(String(s.doy), cc, 'mint') + '</span></div>';
      } },
    { k: 'px2', num: function (c, n) { return ckPx(String(c.s.D), Math.max(3, Math.round(n / 6.2)), 'pink').replace('class="pxt"', 'class="pxt kn"'); }, extra: kcBlocks }
  ]
};
