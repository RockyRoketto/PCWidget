'use strict';
// Тема «Пиксели»: цифры шрифтом 3×5 и столбики истории из блоков (theme-pixel.css).

// Знак — строки сверху вниз, 1 — закрашенный пиксель. Ширина по первой строке (цифры 3, двоеточие 1, градус 2).
var PX5 = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], '−': ['000', '000', '111', '000', '000'], '-': ['000', '000', '111', '000', '000'],
  ':': ['0', '1', '0', '1', '0'], ',': ['0', '0', '0', '1', '1'], '.': ['0', '0', '0', '0', '1'], '°': ['11', '11', '00', '00', '00']
};
var PX5_HTML = {};
Object.keys(PX5).forEach(function (ch) {
  var rows = PX5[ch], w = rows[0].length, d = '';
  rows.forEach(function (r, y) {
    // подряд идущие пиксели строки — одним прямоугольником
    for (var x = 0; x < w; x++) if (r[x] === '1') { var n = 1; while (r[x + n] === '1') n++; d += 'M' + x + ' ' + y + 'h' + n + 'v1h-' + n + 'z'; x += n - 1; }
  });
  PX5_HTML[ch] = '<svg class="px5' + (w < 3 ? ' n' + w : '') + (ch === ':' ? ' pc' : '') + '" viewBox="0 0 ' + w + ' 5" aria-hidden="true"><path d="' + d + '"/></svg>';
});
// Цифры и знаки строки — пиксельными, теги и сущности не трогаются.
function pxDigits(h) {
  return h.replace(/(<[^>]*>|&[a-z]+;)|([0-9−\-:,.°])/g, function (m, tag, ch) { return tag || PX5_HTML[ch]; });
}

// Столбики последних значений из блоков: 8 блоков в столбике, нижние мятные, выше жёлтые, верхние розовые,
// пустые — цвета дорожки.
var PX_ROWS = 8, PX_BANDS = ['m', 'm', 'm', 'm', 'y', 'y', 'r', 'r'];
function pxHistViz() {
  var el = mk('<svg class="hist px" preserveAspectRatio="none" aria-hidden="true"><path class="t"/><path class="m"/><path class="y"/><path class="r"/></svg>');
  var p = { t: el.childNodes[0], m: el.childNodes[1], y: el.childNodes[2], r: el.childNodes[3] };
  return {
    el: el,
    set: function (o) {
      var n = Math.max(8, Math.round((el.clientWidth || 136) / 5)), h = (o.hist || []).slice(-n), d = { t: '', m: '', y: '', r: '' };
      el.setAttribute('viewBox', '0 0 ' + n * 5 + ' ' + PX_ROWS * 3);
      for (var i = 0; i < n; i++) {
        var v = h[i - (n - h.length)], on = v == null ? 0 : Math.max(1, Math.round(Math.min(v / o.max, 1) * PX_ROWS)), x = i * 5;
        for (var s = 0; s < PX_ROWS; s++) d[s < on ? PX_BANDS[s] : 't'] += 'M' + x + ',' + (PX_ROWS - 1 - s) * 3 + 'h4v2h-4z';
      }
      Object.keys(p).forEach(function (k) { p[k].setAttribute('d', d[k]); });
    }
  };
}
