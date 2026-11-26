'use strict';
// Карточка итога игры. Рисуется на canvas: то, что видно, то и сохраняется в картинку.
// Go присылает {r: отчёт, ui: настройки виджета, accent: цвет Windows}.

var W = 560, PAD = 16, SCALE = 2;
var FONT = '"Segoe UI Variable Text", "Segoe UI", sans-serif';
var DIM = 'rgba(255,255,255,.66)', TILE = 'rgba(255,255,255,.06)', HOT = '#ff7b6b', WARM = '#ffc65c', OK = '#7fe0a6';

function post(m) { if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(m); }
function num(v, d) { return v.toFixed(d).replace('.', ','); }
function duration(sec) {
  var m = Math.round(sec / 60), h = Math.floor(m / 60);
  return (h ? h + ' ч ' : '') + (m % 60) + ' мин';
}
function when(ms) {
  return new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
function plural(n, one, few, many) {
  var a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

// Плитки с числами: чего нет (датчики), то не показывается.
function tilesOf(r, tariff) {
  var t = [[num(r.fps, 0), 'средний FPS'], [num(r.low1, 0), '1% low']];
  if (r.gpuMax != null) t.push([num(r.gpuMax, 0) + '°', 'пик GPU', r.gpuMax >= 80 ? HOT : r.gpuMax >= 65 ? WARM : '']);
  if (r.cpuMax != null) t.push([num(r.cpuMax, 0) + '°', 'пик CPU', r.cpuMax >= 85 ? HOT : r.cpuMax >= 70 ? WARM : '']);
  if (r.wh != null) {
    var kwh = r.wh >= 100, label = (kwh ? 'кВт·ч' : 'Вт·ч') + ', CPU и GPU';
    if (tariff > 0) label = (kwh ? 'кВт·ч' : 'Вт·ч') + ' · ' + num(r.wh * tariff / 1000, 2) + ' ₽';
    t.push([kwh ? num(r.wh / 1000, 2) : num(r.wh, r.wh < 10 ? 1 : 0), label]);
  }
  return t;
}

function box(g, x, y, w, h, rad, fill) { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, rad); g.fill(); }
function text(g, s, x, y, size, color, opt) {
  opt = opt || {};
  g.font = (opt.weight || 400) + ' ' + size + 'px ' + FONT;
  g.fillStyle = color; g.textAlign = opt.align || 'left'; g.textBaseline = 'alphabetic';
  g.fillText(s, x, y, opt.max);
}

// График: среднее время кадра линией, худшее — бледной заливкой, фризы точками.
function chart(g, r, x, y, w, h, accent) {
  var top = Math.max(33.4, Math.min(120, Math.max.apply(null, r.worst) * 1.1));
  var n = r.avg.length;
  var px = function (i) { return n < 2 ? x + w * i : x + w * i / (n - 1); };
  var py = function (v) { return y + h - h * Math.min(v, top) / top; };
  var path = function (a) { g.beginPath(); a.forEach(function (v, i) { g[i ? 'lineTo' : 'moveTo'](px(i), py(v)); }); };
  [16.7, 33.3, 50].forEach(function (ms) {
    if (ms > top) return;
    g.fillStyle = ms === 50 ? 'rgba(255,123,107,.4)' : 'rgba(255,255,255,.1)';
    g.fillRect(x, py(ms), w, 1);
    text(g, num(ms, 0), x + w, py(ms) - 3, 10, DIM, { align: 'right' });
  });
  g.save(); g.globalAlpha = .25; path(r.worst); g.lineTo(px(n - 1), y + h); g.lineTo(x, y + h); g.fillStyle = accent; g.fill(); g.restore();
  path(r.avg); g.strokeStyle = accent; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = HOT;
  r.worst.forEach(function (v, i) { if (v > 50) { g.beginPath(); g.arc(px(i), py(v), 3, 0, 7); g.fill(); } });
}

function draw(o) {
  var r = o.r, ui = o.ui || {};
  var accent = /^#[0-9a-f]{6}$/i.test(ui.accent) ? ui.accent : /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent : '#7cc4ff';
  var c = document.getElementById('card'), H = 336;
  c.width = W * SCALE; c.height = H * SCALE; c.style.height = H + 'px';
  var g = c.getContext('2d'), iw = W - PAD * 2;
  g.scale(SCALE, SCALE);
  g.fillStyle = '#141a24'; g.fillRect(0, 0, W, H);

  var right = duration(r.sec) + ' · ' + when(r.end);
  text(g, right, W - PAD, 30, 11, DIM, { align: 'right' });
  text(g, r.name.replace(/\.exe$/i, ''), PAD, 30, 16, '#fff', { weight: 600, max: iw - g.measureText(right).width - 90 });

  var tiles = tilesOf(r, Number(ui.tariff) || 0), tw = (iw - 8 * (tiles.length - 1)) / tiles.length;
  tiles.forEach(function (t, i) {
    var x = PAD + i * (tw + 8);
    box(g, x, 44, tw, 54, 8, TILE);
    text(g, t[0], x + 9, 71, 22, t[2] || '#fff', { max: tw - 18 });
    text(g, t[1], x + 9, 89, 11, DIM, { max: tw - 18 });
  });

  text(g, 'Время кадра, мс', PAD, 120, 12, '#fff');
  var fr = r.freezes ? r.freezes + ' ' + plural(r.freezes, 'фриз', 'фриза', 'фризов') + ' дольше 50 мс' : 'без фризов дольше 50 мс';
  text(g, fr, W - PAD, 120, 11, r.freezes ? HOT : OK, { align: 'right' });
  chart(g, r, PAD, 134, iw, 104, accent);

  text(g, 'Сколько времени на каком FPS', PAD, 262, 12, '#fff');
  var colors = [HOT, WARM, accent, OK], names = ['меньше 60', '60–90', '90–120', 'от 120'];
  var parts = r.share.filter(function (p) { return p > 0; }).length, free = iw - 2 * Math.max(0, parts - 1), x = PAD;
  var total = r.share.reduce(function (a, b) { return a + b; }, 0) || 1;
  r.share.forEach(function (p, i) {
    if (p <= 0) return;
    var w = free * p / total;
    box(g, x, 272, w, 10, Math.min(3, w / 2), colors[i]);
    x += w + 2;
  });
  var step = iw / 4;
  names.forEach(function (n, i) {
    var lx = PAD + i * step;
    box(g, lx, 293, 8, 8, 2, colors[i]);
    text(g, n + ' · ' + num(r.share[i], r.share[i] > 0 && r.share[i] < 1 ? 1 : 0) + '%', lx + 13, 301, 11, DIM);
  });
  text(g, 'PC Widget', W - PAD, 326, 10, 'rgba(255,255,255,.35)', { align: 'right' });

  document.body.style.setProperty('--accent', accent);
  var n = parseInt(accent.slice(1), 16);
  var lum = .299 * (n >> 16) + .587 * (n >> 8 & 255) + .114 * (n & 255);
  document.body.style.setProperty('--on', lum > 150 ? '#14181f' : '#fff');
}

var msg = document.getElementById('msg');
window.__show = function (o) {
  msg.textContent = '';
  draw(o);
  var b = document.getElementById('box').getBoundingClientRect();
  post('size:' + Math.ceil(b.width) + ',' + Math.ceil(b.height));
};
window.__saved = function (t) { msg.textContent = t; };
document.getElementById('close').onclick = function () { post('close'); };
document.getElementById('save').onclick = function () { post('save:' + document.getElementById('card').toDataURL('image/png')); };
document.getElementById('card').addEventListener('mousedown', function (e) { if (e.button === 0) post('drag'); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') post('close'); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
post('ready');
