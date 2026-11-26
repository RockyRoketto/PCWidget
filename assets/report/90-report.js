'use strict';
// Карточка итога игры. Рисуется на canvas: то, что видно, то и сохраняется в картинку.
// Go присылает {r: отчёт, ui: настройки виджета, accent: цвет Windows}. Оформление тем — 80-skins.js.

var W = 560, H = 342, PAD = 16, SCALE = 2;

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

// Плитки с числами: чего нет (датчики), то не показывается. Третье поле — состояние «тепло» или «горячо».
function tilesOf(r, tariff) {
  var t = [[num(r.fps, 0), 'средний FPS'], [num(r.low1, 0), '1% low']];
  if (r.gpuMax != null) t.push([num(r.gpuMax, 0) + '°', 'пик GPU', r.gpuMax >= 80 ? 'hot' : r.gpuMax >= 65 ? 'warm' : '']);
  if (r.cpuMax != null) t.push([num(r.cpuMax, 0) + '°', 'пик CPU', r.cpuMax >= 85 ? 'hot' : r.cpuMax >= 70 ? 'warm' : '']);
  if (r.wh != null) {
    var kwh = r.wh >= 100, label = (kwh ? 'кВт·ч' : 'Вт·ч') + ', CPU и GPU';
    if (tariff > 0) label = (kwh ? 'кВт·ч' : 'Вт·ч') + ' · ' + num(r.wh * tariff / 1000, 2) + ' ₽';
    t.push([kwh ? num(r.wh / 1000, 2) : num(r.wh, r.wh < 10 ? 1 : 0), label]);
  }
  return t;
}

// График: среднее время кадра линией, худшее — бледной заливкой (у «ЖК-табло» столбиками), фризы точками.
function chart(g, k, r, x, y, w, h) {
  var top = Math.max(33.4, Math.min(120, Math.max.apply(null, r.worst) * 1.1));
  var n = r.avg.length;
  var px = function (i) { return n < 2 ? x + w * i : x + w * i / (n - 1); };
  var py = function (v) { return y + h - h * Math.min(v, top) / top; };
  var path = function (a) { g.beginPath(); a.forEach(function (v, i) { g[i ? 'lineTo' : 'moveTo'](px(i), py(v)); }); };
  [16.7, 33.3, 50].forEach(function (ms) {
    if (ms > top) return;
    g.save(); g.strokeStyle = ms === 50 ? k.hot : k.track; g.globalAlpha = ms === 50 ? .5 : 1; g.lineWidth = 1;
    if (k.id === 'gauge') g.setLineDash([1, 4]);
    g.beginPath(); g.moveTo(x, py(ms) + .5); g.lineTo(x + w, py(ms) + .5); g.stroke(); g.restore();
    text(g, k, num(ms, 0), x + w, py(ms) - 3, 10, k.dim, { align: 'right', font: small(k) });
  });
  if (k.id === 'lcd') { // столбики из сегментов: горят до среднего, до худшего — бледно
    var cols = Math.floor(w / 6);
    for (var c = 0; c < cols; c++) {
      var a = Math.floor(c * n / cols), b = Math.max(a + 1, Math.floor((c + 1) * n / cols));
      var avg = r.avg.slice(a, b).reduce(function (s, v) { return s + v; }, 0) / (b - a), bad = Math.max.apply(null, r.worst.slice(a, b));
      for (var q = 0; q < h; q += 4) {
        var level = (q + 2) / h * top;
        if (level > Math.max(bad, avg, top / h * 4)) break;
        g.globalAlpha = level <= Math.max(avg, top / h * 4) || level > 50 ? 1 : .3; // фриз горит целиком выше черты
        g.fillStyle = level > 50 ? k.hot : k.accent;
        g.fillRect(x + c * 6, y + h - q - 3, 4, 3);
      }
    }
    g.globalAlpha = 1;
    return;
  }
  g.save(); g.globalAlpha = k.id === 'fill' ? .45 : .25; path(r.worst); g.lineTo(px(n - 1), y + h); g.lineTo(x, y + h); g.fillStyle = k.accent; g.fill(); g.restore();
  path(r.avg); g.strokeStyle = k.id === 'fill' ? k.text : k.accent; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = k.hot;
  r.worst.forEach(function (v, i) { if (v > 50) { g.beginPath(); if (k.id === 'gauge') g.rect(px(i) - 2.5, py(v) - 2.5, 5, 5); else g.arc(px(i), py(v), 3, 0, 7); g.fill(); } });
}

function draw(o) {
  var r = o.r, ui = o.ui || {}, k = skinFor(ui, o.accent);
  var c = document.getElementById('card');
  c.width = W * SCALE; c.height = H * SCALE; c.style.height = H + 'px';
  var g = c.getContext('2d'), iw = W - PAD * 2, inner = iw - 20;
  g.scale(SCALE, SCALE);
  g.fillStyle = k.bg; g.fillRect(0, 0, W, H);

  var right = duration(r.sec) + ' · ' + when(r.end);
  text(g, k, right, W - PAD, 29, 11, k.mute, { align: 'right', font: small(k) });
  var room = iw - g.measureText(right).width - 16;
  title(g, k, r.name.replace(/\.exe$/i, ''), PAD, 30, 16, k.head, { weight: 600, max: room });

  var tiles = tilesOf(r, Number(ui.tariff) || 0), tw = (iw - 8 * (tiles.length - 1)) / tiles.length;
  tiles.forEach(function (t, i) {
    var x = PAD + i * (tw + 8);
    cell(g, k, x, 44, tw, 56, .35);
    // у «Заливки» цвет тепла на цветной карточке читается плохо: красным только «горячо»
    var color = t[2] && !(k.id === 'fill' && t[2] === 'warm') ? k[t[2]] : k.text;
    number(g, k, t[0], x + 9, 72, color, tw - 18);
    text(g, k, t[1], x + 9, 91, 11, k.id === 'fill' ? k.text : k.dim, { max: tw - 18, font: small(k) });
  });

  cell(g, k, PAD, 108, iw, 142);
  title(g, k, 'Время кадра, мс', PAD + 10, 126, 12, k.text, { weight: 600 });
  var fr = r.freezes ? r.freezes + ' ' + plural(r.freezes, 'фриз', 'фриза', 'фризов') + ' дольше 50 мс' : 'без фризов дольше 50 мс';
  text(g, k, fr, W - PAD - 10, 126, 11, r.freezes ? k.hot : k.ok, { align: 'right', font: small(k) });
  chart(g, k, r, PAD + 10, 138, inner, 102);

  cell(g, k, PAD, 258, iw, 66);
  title(g, k, 'Сколько времени на каком FPS', PAD + 10, 276, 12, k.text, { weight: 600 });
  var colors = [k.hot, k.warm, k.accent, k.ok], names = ['меньше 60', '60–90', '90–120', 'от 120'];
  bar(g, k, r.share.map(function (p, i) { return [p, colors[i]]; }), PAD + 10, 286, inner, 10);
  names.forEach(function (name, i) {
    var lx = PAD + 10 + i * inner / 4;
    box(g, lx, 307, 8, 8, k.id === 'sheet' || k.id === 'fill' ? 2 : 0, colors[i]);
    text(g, k, name + ' · ' + num(r.share[i], r.share[i] > 0 && r.share[i] < 1 ? 1 : 0) + '%', lx + 13, 315, 11, k.dim, { font: small(k), max: inner / 4 - 18 });
  });
  g.save(); g.globalAlpha = .6; text(g, k, 'PC Widget', W - PAD, 337, 10, k.mute, { align: 'right', font: small(k) }); g.restore();
  dress(k);
}

// Кнопки под картинкой в цветах темы.
function dress(k) {
  var s = document.body.style;
  s.background = k.bg;
  s.setProperty('--text', k.head);
  s.setProperty('--mute', k.mute);
  s.setProperty('--btn', k.id === 'lcd' || k.id === 'osc' || !k.light ? 'rgba(255,255,255,.1)' : 'rgba(20,32,43,.09)');
  s.setProperty('--r', (k.id === 'fill' ? 11 : k.id === 'sheet' ? 7 : k.id === 'bp' ? 0 : 4) + 'px');
  s.setProperty('--font', k.font);
  // тёмный акцент на тёмной рамке не виден: у светлого «ЖК-табло» кнопка цвета стекла
  var a = k.id === 'lcd' && k.light ? k.tile : k.accent;
  s.setProperty('--accent', a);
  s.setProperty('--on', accentOn(a));
}

var last = null;
var msg = document.getElementById('msg');
window.__show = function (o) {
  last = o;
  msg.textContent = '';
  draw(o);
  var b = document.getElementById('box').getBoundingClientRect();
  post('size:' + Math.ceil(b.width) + ',' + Math.ceil(b.height));
};
// Windows переключили на светлую или тёмную, а в настройках «как в Windows».
if (darkMQ) darkMQ.addEventListener('change', function () { if (last) draw(last); });
window.__saved = function (t) { msg.textContent = t; };
document.getElementById('close').onclick = function () { post('close'); };
document.getElementById('save').onclick = function () { post('save:' + document.getElementById('card').toDataURL('image/png')); };
document.getElementById('card').addEventListener('mousedown', function (e) { if (e.button === 0) post('drag'); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') post('close'); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
post('ready');
