'use strict';
// Оформление карточки итога под темы виджета: цвета как в assets/css/theme-*.css и рисование на canvas.
// Тему, светлость, акцент и градиент берём из настроек виджета (00-core.js).

var SANS = '"Segoe UI Variable Text", "Segoe UI", sans-serif';
var GAUGE = 'Bahnschrift, "Segoe UI", sans-serif';
var MONO = '"Cascadia Mono", Consolas, monospace';
var ON_DARK = { ok: '#7fe0a6', warm: '#ffc65c', hot: '#ff7b6b' };
var ON_LIGHT = { ok: '#17804a', warm: '#a85f00', hot: '#c8281d' };

// bg — подложка карточки, head/mute — текст на ней; tile/text/dim — ячейки и текст в них.
var SKINS = {
  sheet: {
    dark: { bg: '#151b26', tile: 'rgba(255,255,255,.06)', rim: 'rgba(255,255,255,.07)', text: '#ffffff', dim: 'rgba(255,255,255,.66)', track: 'rgba(255,255,255,.12)' },
    light: { bg: '#eaeff3', tile: 'rgba(255,255,255,.72)', rim: 'rgba(20,32,43,.08)', text: '#14202b', dim: 'rgba(20,32,43,.66)', track: 'rgba(20,32,43,.12)' }
  },
  gauge: {
    dark: { bg: '#0e2229', tile: '#16323a', text: '#f1ead9', dim: '#9fb5b6', track: '#2c4b53', ok: '#8fd6a8', warm: '#f3b04a', hot: '#ff6a4d' },
    light: { bg: '#c9cfc6', tile: '#e8ebe2', text: '#22302f', dim: '#5d6a68', track: '#c8cec3', ok: '#2c7a4b', warm: '#b86a00', hot: '#c5361b' }
  },
  fill: {
    dark: { bg: '#121318', tile: '#1d1e25', text: '#f7f9ff', dim: 'rgba(232,238,255,.74)', track: 'rgba(255,255,255,.1)', ok: '#8be3b5', hot: '#ff8a78', top: .22, bot: .72, mix: 0 },
    light: { bg: '#e6e9f1', tile: '#fcfdff', text: '#141c33', dim: 'rgba(20,28,51,.7)', track: 'rgba(20,28,51,.1)', warm: '#8a4b00', hot: '#a3160c', top: .16, bot: .5, mix: .38 }
  },
  lcd: {
    dark: { bg: '#121418', tile: '#0c2236', text: '#d3ecff', dim: 'rgba(211,236,255,.62)', track: 'rgba(211,236,255,.1)', head: '#e9ece4', mute: 'rgba(233,236,228,.6)', inset: .55, ghost: .08 },
    light: { bg: '#2e322c', tile: '#a9b597', text: '#1b2617', dim: 'rgba(27,38,23,.68)', track: 'rgba(27,38,23,.14)', head: '#e9ece4', mute: 'rgba(233,236,228,.6)', ok: '#1d5c2a', warm: '#7a4700', hot: '#a3160c', inset: .28, ghost: .1 }
  }
};

function hexOr(v, d) { return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d; }
function alpha(hex, a) { var c = rgbOf(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

// skinFor заполняет CFG и SYS (их читают функции 00-core.js) и собирает оформление.
function skinFor(ui, accent) {
  ui = ui || {};
  CFG = {
    theme: THEMES[ui.theme] ? ui.theme : 'sheet', tone: TONES[ui.tone] ? ui.tone : 'auto',
    pal: PALS[ui.pal] || ui.pal === 'win' ? ui.pal : 'aurora', accent: hexOr(ui.accent, 'win'), glass: 62
  };
  SYS.accent = hexOr(accent, '');
  var tone = toneKey(), id = CFG.theme;
  var k = Object.assign({ id: id, light: tone === 'light' }, tone === 'light' ? ON_LIGHT : ON_DARK, SKINS[id][tone]);
  k.head = k.head || k.text; k.mute = k.mute || k.dim;
  k.accent = themeVars()['--accent'];
  k.font = id === 'gauge' ? GAUGE : id === 'lcd' ? MONO : SANS;
  k.R = id === 'gauge' || id === 'lcd' ? 4 : id === 'fill' ? 16 : 10;
  if (id === 'fill') k.stops = palStops().map(function (c) { return k.mix ? mixTo(c, 255, k.mix) : c; });
  return k;
}

function box(g, x, y, w, h, rad, fill) { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, rad); g.fill(); }

// Цвет заливки в точке x: градиент тянется через всю карточку, как у виджета.
function palAt(k, x) {
  var t = Math.max(0, Math.min(1, x / 560)) * 2, i = t < 1 ? 0 : 1, f = t - i;
  var a = rgbOf(k.stops[i]), b = rgbOf(k.stops[i + 1]);
  return '#' + a.map(function (v, j) { return (256 + Math.round(v + (b[j] - v) * f)).toString(16).slice(1); }).join('');
}

// Ячейка темы. fillFrom — с какой высоты «Заливка» красит карточку (доля), без него карточка нейтральная.
function cell(g, k, x, y, w, h, fillFrom) {
  box(g, x, y, w, h, k.R, k.tile);
  if (k.rim) { g.strokeStyle = k.rim; g.lineWidth = 1; g.beginPath(); g.roundRect(x + .5, y + .5, w - 1, h - 1, k.R); g.stroke(); }
  if (k.id === 'fill' && fillFrom != null) {
    var c = palAt(k, x + w / 2), top = y + h * fillFrom, gr = g.createLinearGradient(0, top, 0, y + h);
    gr.addColorStop(0, alpha(c, k.top)); gr.addColorStop(1, alpha(c, k.bot));
    g.save(); g.beginPath(); g.roundRect(x, y, w, h, k.R); g.clip(); g.fillStyle = gr; g.fillRect(x, top, w, y + h - top); g.restore();
  }
  if (k.id === 'lcd') { // стекло табло чуть утоплено в рамку
    g.save(); g.beginPath(); g.roundRect(x, y, w, h, k.R); g.clip();
    var s = g.createLinearGradient(0, y, 0, y + 5);
    s.addColorStop(0, 'rgba(0,0,0,' + k.inset + ')'); s.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = s; g.fillRect(x, y, w, 5); g.restore();
  }
}

function text(g, k, s, x, y, size, color, opt) {
  opt = opt || {};
  g.font = (opt.weight || 400) + ' ' + size + 'px ' + (opt.font || k.font);
  g.fillStyle = color; g.textAlign = opt.align || 'left'; g.textBaseline = 'alphabetic';
  g.fillText(s, x, y, opt.max);
}
// Заголовок: на «ЖК-табло» заглавными вразрядку.
function title(g, k, s, x, y, size, color, opt) {
  var lcd = k.id === 'lcd';
  if (lcd) g.letterSpacing = '.8px';
  text(g, k, lcd || k.id === 'gauge' ? s.toUpperCase() : s, x, y, lcd || k.id === 'gauge' ? size - 1 : size, color, opt);
  g.letterSpacing = '0px';
}
// Мелкие подписи: моноширинный в ячейку не влезает, у «ЖК-табло» они узким шрифтом.
function small(k) { return k.id === 'lcd' ? GAUGE : k.font; }

// Семисегментная цифра: сегменты a b c d e f g по порядку, несветящиеся видны бледно.
var SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd' };
function segments(g, k, s, x, base, em, color) {
  var w = .48 * em, h = .72 * em, t = .08 * em, half = h / 2 - .085 * em;
  var at = { a: [.06 * em, 0, w - .12 * em, t], g: [.06 * em, h / 2 - t / 2, w - .12 * em, t], d: [.06 * em, h - t, w - .12 * em, t],
    f: [0, .055 * em, t, half], b: [w - t, .055 * em, t, half], e: [0, h - .055 * em - half, t, half], c: [w - t, h - .055 * em - half, t, half] };
  g.save(); g.fillStyle = color; g.strokeStyle = color;
  g.translate(x, base - h); g.transform(1, 0, -.105, 1, .105 * h, 0);
  var px = 0;
  s.split('').forEach(function (ch) {
    if (SEG7[ch]) {
      Object.keys(at).forEach(function (n) {
        var r = at[n]; g.globalAlpha = SEG7[ch].indexOf(n) >= 0 ? 1 : k.ghost; g.fillRect(px + r[0], r[1], r[2], r[3]);
      });
      px += w + .09 * em;
    } else if (ch === '°') {
      g.globalAlpha = 1; g.lineWidth = t * .8; g.strokeRect(px + t, t / 2, .16 * em, .16 * em); px += .3 * em;
    } else {
      g.globalAlpha = 1; g.fillRect(px + .02 * em, h - t * 1.2, t * 1.2, t * 1.2); px += t * 2.2;
    }
  });
  g.restore();
}

// Главное число ячейки в манере темы.
function number(g, k, s, x, y, color, max) {
  if (k.id === 'lcd') segments(g, k, s, x, y + 1, 26, color);
  else text(g, k, s, x, y, k.id === 'fill' ? 24 : 22, color, { weight: k.id === 'fill' ? 600 : 400, max: max });
}

// Полоса долей: у «Прибора» и «ЖК-табло» из делений, у остальных сплошными отрезками.
function bar(g, k, parts, x, y, w, h) {
  var total = parts.reduce(function (a, p) { return a + p[0]; }, 0) || 1;
  var shown = parts.filter(function (p) { return p[0] > 0; });
  if (k.id === 'gauge' || k.id === 'lcd') {
    var n = Math.floor((w + 2) / 5), sum = 0, j = 0;
    for (var i = 0; i < n; i++) {
      var pos = (i + .5) / n * total;
      while (j < shown.length - 1 && pos > sum + shown[j][0]) sum += shown[j++][0];
      g.fillStyle = shown.length ? shown[j][1] : k.track;
      g.fillRect(x + i * 5, y - 2, 3, h + 4);
    }
    return;
  }
  var free = w - 2 * Math.max(0, shown.length - 1), at = x;
  shown.forEach(function (p) {
    var pw = free * p[0] / total;
    box(g, at, y, pw, h, Math.min(k.id === 'fill' ? 5 : 3, pw / 2), p[1]);
    at += pw + 2;
  });
}
