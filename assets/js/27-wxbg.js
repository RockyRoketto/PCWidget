'use strict';
// Фон плитки погоды: солнце (ночью звёзды), облака, туман, дождь с брызгами, снег, гроза с молниями.
// Рисует <canvas> под содержимым плитки. Цвета берутся из темы: частицы — цвет текста (или --wx-p),
// солнце — --warm (или --wx-sun), вспышка — --wx-fl, заливка — цвет карточки (--wx-f или --solid).
// Как рисовать, задаёт тема в WX_STYLE: kind — набор форм (28-wxdraw.js — soft, 29-wxstyles.js — tick и fill,
// 29b-wxlines.js — phos и line, 29c-wxpixel.js — pix), matrix — вывести кадр точками матрицы (ЖК-табло, Пиксели), fps — частота кадров,
// persist — доля, на которую гаснет прошлый кадр (след у движущегося, как на экране осциллографа).
// Стоит, когда окно скрыто, идёт игра, плитка не видна, в Windows «уменьшить движение» или выключено (CFG.wxAnim).
// Координаты внутри — в «единицах макета»: 2 единицы на CSS-пиксель, плитка около 420×300.

var WX_STYLE = {
  sheet: { kind: 'soft' },                                   // стекло: мягкие облака, свечение солнца
  gauge: { kind: 'tick' },                                   // приборная доска: деления, штрихи, без свечения
  fill: { kind: 'fill' },                                    // заливка: залитые формы, уровень воды, сугроб
  lcd: { kind: 'soft', fps: 12, matrix: { cell: 7, gap: 2, lo: .06, hi: .5, ghost: true } }, // точки табло
  osc: { kind: 'phos', persist: .3 },                        // луч на экране: послесвечение вместо очистки кадра
  bp: { kind: 'line' },                                      // чертёж: только контуры
  // пиксели: крупные цветные клетки; use — какие цвета палитры (k.pal: текст, облака, дождь, солнце) берёт клетка
  // в каждой погоде, иначе на краях форм проскакивают смешанные цвета
  pixel: { kind: 'pix', fps: 10, matrix: { cell: 10, gap: 2, lo: .1, hi: .6, color: true,
    use: { sun: [0, 3], cloud: [0, 1, 3], fog: [1], rain: [1, 2, 3], storm: [1, 2, 3], snow: [0, 1] } } }
};
var WX_KINDS = {};   // наборы форм: { kit(k), sky, night, cloud, fog, rain, snow } — чего нет, берётся из soft
var WX_LIST = [], wxRaf = 0;
var wxR = Math.random;

function wxRun() { return CFG && CFG.wxAnim !== false && !document.hidden && !SYS.game && !(stillMQ && stillMQ.matches); }

// Цвет CSS → "r,g,b" через пробный элемент внутри плитки (так работают var() темы).
function wxRgb(host, css) {
  var s = document.createElement('i'); s.style.cssText = 'position:absolute;visibility:hidden;color:' + css; host.appendChild(s);
  var m = getComputedStyle(s).color.match(/[\d.]+/g) || [255, 255, 255]; host.removeChild(s);
  return m.slice(0, 3).join(',');
}
function wxCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function wxBlur(src, bl) {
  if (!bl) return src;
  var o = wxCanvas(src.width + bl * 6, src.height + bl * 6), g = o.getContext('2d'); g.filter = 'blur(' + bl + 'px)'; g.drawImage(src, bl * 3, bl * 3); return o;
}

// Облако: пушистые круги с плоским низом; холст по габаритам кругов, чтобы ничего не обрезалось.
// paint(g, w, h) — чем залить (по умолчанию сплошной цвет rgb), после заливки можно наложить узор.
function wxCloud(rgb, w, h, bl, paint) {
  var cs = [], x0 = 1e9, x1 = -1e9, y0 = 1e9;
  for (var i = 0; i < 14; i++) {
    var cx = w * (.1 + wxR() * .8), e = 1 - Math.abs(cx - w / 2) / (w / 2), r = h * (.18 + e * .32 + wxR() * .1), cy = h - r * .75 - wxR() * h * .1;
    cs.push([cx, cy, r]); x0 = Math.min(x0, cx - r); x1 = Math.max(x1, cx + r); y0 = Math.min(y0, cy - r);
  }
  var t = wxCanvas(x1 - x0, h - y0), g = t.getContext('2d');
  g.translate(-x0, -y0); g.fillStyle = 'rgb(' + rgb + ')';
  cs.forEach(function (c) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, 7); g.fill(); });
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (paint) paint(g, t.width, t.height);
  return wxBlur(t, bl);
}
function wxDot(rgb) {
  var o = wxCanvas(32, 32), g = o.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(.45, 'rgba(' + rgb + ',.8)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return o;
}

// Палитра и спрайты под текущую тему. Светлые частицы — значит фон тёмный: тучи темнее фона, иначе — цвета частиц.
function wxKit(o) {
  var host = o.cb, sol = o.cv.style.getPropertyValue('--solid'); // цвет карточки в «Заливке» ставит placeFills на сам холст
  var style = WX_STYLE[CFG.theme] || WX_STYLE.sheet, kind = WX_KINDS[style.kind] || WX_KINDS.soft;
  var p = wxRgb(host, 'var(--wx-p, var(--text))'), lum = p.split(',').reduce(function (s, v, i) { return s + v * [.3, .59, .11][i]; }, 0), dark = lum > 128;
  var k = {
    style: style, kind: kind, p: p, dark: dark, dk: dark ? '0,0,0' : p,
    sun: wxRgb(host, 'var(--wx-sun, var(--warm))'), fl: wxRgb(host, 'var(--wx-fl, #fff)'), fc: wxRgb(host, sol || 'var(--wx-f, var(--a))'),
    base: dark ? .75 : .5, cla: dark ? .26 : .32, dka: dark ? .4 : .42, sa: dark ? .34 : .5
  };
  k.dot = wxDot(p);
  if (style.matrix && style.matrix.color) { // цветная матрица: свои цвета облаков и дождя, клетка берёт ближайший из палитры
    k.cl = wxRgb(host, 'var(--wx-cl, var(--dim))'); k.rain = wxRgb(host, 'var(--wx-rain, var(--a))');
    k.pal = [p, k.cl, k.rain, k.sun].map(function (c) { return c.split(',').map(Number); });
  } else if (style.matrix) { // табло одноцветное; тонкое не попадёт в точку — толще
    k.sun = p; k.fl = p; k.cla *= .6; k.dka *= .45; k.thick = 3;
    // Яркость точек — от контраста с фоном плитки: одинаково мягко и на светлом табло, и на тёмном с подсветкой
    // (светлые точки на тёмном при той же прозрачности режут глаз).
    var bg = wxRgb(host, 'var(--wx-bg, var(--tile))').split(',').reduce(function (s, v, i) { return s + v * [.3, .59, .11][i]; }, 0), diff = Math.max(40, Math.abs(lum - bg));
    k.mOn = Math.min(.6, 55 / diff); k.mGhost = Math.min(.08, 7 / diff);
  }
  kind.kit(k);
  return k;
}

// Подключить фон к карточке плитки. Возвращает set(icon, power, night) — звать при каждом снимке.
function wxBg(cb) {
  var cv = document.createElement('canvas'); cv.className = 'wxbg'; cv.setAttribute('aria-hidden', 'true');
  cb.insertBefore(cv, cb.firstChild);
  var o = { cb: cb, cv: cv, g: cv.getContext('2d'), st: '', pw: 2, night: false, W: 0, H: 0, kitKey: '', kit: null, last: 0, drawn: false };
  WX_LIST.push(o);
  return function (icon, power, night) {
    var st = icon || '', pw = power || 2, n = !!night;
    if (st === o.st && pw === o.pw && n === o.night) return;
    o.st = st; o.pw = pw; o.night = n; o.W = 0; // пересев на следующем кадре
    wxKick();
  };
}

function wxKick() { if (!wxRaf) wxRaf = requestAnimationFrame(wxFrame); }
document.addEventListener('visibilitychange', wxKick);

function wxFrame(t) {
  wxRaf = 0;
  if (!wxRun()) { WX_LIST.forEach(wxClear); setTimeout(wxKick, 1000); return; } // проверяем раз в секунду, без кадров
  wxRaf = requestAnimationFrame(wxFrame);
  WX_LIST = WX_LIST.filter(function (o) { return o.cb.isConnected; }); // плитку пересоздали — старую забываем
  WX_LIST.forEach(function (o) {
    var fps = (o.kit && o.kit.style.fps) || 30;
    if (!o.cb.offsetParent || t - o.last < 1000 / fps - 2) return;
    var dt = o.last ? Math.min(6, (t - o.last) / 16) : 1; o.last = t;
    wxDraw(o, t, dt); // 28-wxdraw.js
  });
}
function wxClear(o) { if (o.drawn) { o.g.clearRect(0, 0, o.W, o.H); o.drawn = false; } } // в единицах макета: масштаб холста задан в wxFit

// Размер холста и тема проверяются в кадре: изменились — пересчитываем. При матрице сцена рисуется во внеэкранный холст.
function wxFit(o) {
  var w = o.cb.clientWidth, h = o.cb.clientHeight, dpr = window.devicePixelRatio || 1, key = document.body.className + o.cv.style.getPropertyValue('--solid');
  if (key !== o.kitKey || !o.kit) { o.kitKey = key; o.kit = wxKit(o); o.W = 0; }
  if (o.W === w * 2 && o.H === h * 2) return;
  o.cv.width = Math.round(w * dpr); o.cv.height = Math.round(h * dpr); o.W = w * 2; o.H = h * 2;
  o.g.setTransform(dpr / 2, 0, 0, dpr / 2, 0, 0);
  var m = o.kit.style.matrix;
  if (m) {
    o.off = wxCanvas(o.W, o.H); o.cols = Math.ceil(o.W / m.cell); o.rows = Math.ceil(o.H / m.cell);
    o.sm = wxCanvas(o.cols, o.rows); o.smg = o.sm.getContext('2d', { willReadFrequently: true });
  } else o.off = null;
  wxSeed(o);
}

// Кадр точками матрицы: сцену уменьшаем до сетки, клетка светится, если в ней набралось достаточно цвета.
// Порог у соседних клеток разный (упорядоченный дизеринг 4×4): полупрозрачное — редкими точками, плотное — сплошь.
// Несветящиеся точки видны бледно (ghost), как сегменты табло. Цветная (color) — клетка цвета ближайшего из палитры k.pal.
var WX_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function wxMatrix(o) {
  var m = o.kit.style.matrix, g = o.g, c = m.cell, s = c - m.gap, cols = o.cols, rows = o.rows;
  o.smg.clearRect(0, 0, cols, rows); o.smg.imageSmoothingQuality = 'high'; o.smg.drawImage(o.off, 0, 0, cols, rows);
  var d = o.smg.getImageData(0, 0, cols, rows).data, x, y;
  g.clearRect(0, 0, o.W, o.H);
  if (m.color) return wxMatrixColor(o, d);
  if (m.ghost) { g.fillStyle = 'rgba(' + o.kit.p + ',' + o.kit.mGhost + ')'; for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) g.fillRect(x * c, y * c, s, s); }
  g.fillStyle = 'rgba(' + o.kit.p + ',' + o.kit.mOn + ')';
  for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
    var th = m.lo + (WX_BAYER[(x & 3) + ((y & 3) << 2)] + .5) / 16 * (m.hi - m.lo);
    if (d[(y * cols + x) * 4 + 3] > th * 255) g.fillRect(x * c, y * c, s, s);
  }
}
function wxMatrixColor(o, d) {
  var m = o.kit.style.matrix, use = (m.use && m.use[o.st]) || [0], pal = use.map(function (j) { return o.kit.pal[j]; }), g = o.g, c = m.cell, s = c - m.gap, cols = o.cols, rows = o.rows, by = pal.map(function () { return []; });
  for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
    var i = (y * cols + x) * 4, th = m.lo + (WX_BAYER[(x & 3) + ((y & 3) << 2)] + .5) / 16 * (m.hi - m.lo);
    if (d[i + 3] <= th * 255) continue;
    var best = 0, bd = 1e9;
    for (var j = 0; j < pal.length; j++) {
      var dr = d[i] - pal[j][0], dg = d[i + 1] - pal[j][1], db = d[i + 2] - pal[j][2], e = dr * dr + dg * dg + db * db;
      if (e < bd) { bd = e; best = j; }
    }
    by[best].push(x, y);
  }
  by.forEach(function (a, j) {
    if (!a.length) return;
    g.fillStyle = 'rgb(' + pal[j].join(',') + ')';
    for (var q = 0; q < a.length; q += 2) g.fillRect(a[q] * c, a[q + 1] * c, s, s);
  });
}
