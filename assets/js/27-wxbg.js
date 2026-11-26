'use strict';
// Фон плитки погоды: солнце (ночью звёзды), облака, туман, дождь с брызгами, снег, гроза с молниями.
// Рисует <canvas> под содержимым плитки. Цвета берутся из темы: частицы — цвет текста (или --wx-p),
// солнце — --warm (или --wx-sun), вспышка — --wx-fl. Новой теме ничего задавать не нужно.
// Облака и туман рисуются один раз в спрайты с размытием, в кадре их только сдвигают.
// Не больше 30 кадров в секунду; стоит, когда окно скрыто, идёт игра, плитка не видна,
// в Windows «уменьшить движение» или выключено в настройках (CFG.wxAnim).
// Координаты внутри — в «единицах макета»: 2 единицы на CSS-пиксель, плитка около 420×300.

var WX_FPS = 30, WX_LIST = [], wxRaf = 0, wxLast = 0;
var wxR = Math.random;

function wxRun() { return CFG && CFG.wxAnim !== false && !document.hidden && !SYS.game && !(stillMQ && stillMQ.matches); }

// Цвет CSS → "r,g,b" через пробный элемент внутри плитки (так работают var() темы).
function wxRgb(host, css) {
  var s = document.createElement('i'); s.style.cssText = 'position:absolute;visibility:hidden;color:' + css; host.appendChild(s);
  var m = getComputedStyle(s).color.match(/[\d.]+/g) || [255, 255, 255]; host.removeChild(s);
  return m.slice(0, 3).join(',');
}
function wxCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function wxBlur(src, bl) { var o = wxCanvas(src.width + bl * 6, src.height + bl * 6), g = o.getContext('2d'); g.filter = 'blur(' + bl + 'px)'; g.drawImage(src, bl * 3, bl * 3); return o; }

// Облако: пушистые круги с плоским низом; холст по габаритам кругов, чтобы ничего не обрезалось.
function wxCloud(rgb, w, h, bl) {
  var cs = [], x0 = 1e9, x1 = -1e9, y0 = 1e9;
  for (var i = 0; i < 14; i++) {
    var cx = w * (.1 + wxR() * .8), e = 1 - Math.abs(cx - w / 2) / (w / 2), r = h * (.18 + e * .32 + wxR() * .1), cy = h - r * .75 - wxR() * h * .1;
    cs.push([cx, cy, r]); x0 = Math.min(x0, cx - r); x1 = Math.max(x1, cx + r); y0 = Math.min(y0, cy - r);
  }
  var t = wxCanvas(x1 - x0, h - y0), g = t.getContext('2d');
  g.translate(-x0, -y0); g.fillStyle = 'rgb(' + rgb + ')';
  cs.forEach(function (c) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, 7); g.fill(); });
  return wxBlur(t, bl);
}
function wxFog(rgb, w, h, bl) {
  var t = wxCanvas(w, h), g = t.getContext('2d'); g.fillStyle = 'rgb(' + rgb + ')';
  for (var i = 0; i < 9; i++) {
    var rx = w * (.08 + wxR() * .1), ry = h * (.15 + wxR() * .15);
    g.beginPath(); g.ellipse(rx + wxR() * (w - 2 * rx), h / 2 + (wxR() - .5) * (h - 2 * ry) * .6, rx, ry, 0, 0, 7); g.fill();
  }
  return wxBlur(t, bl);
}
function wxRays(rgb, R) {
  var o = wxCanvas(R * 2, R * 2), g = o.getContext('2d'); g.filter = 'blur(10px)'; g.translate(R, R);
  for (var i = 0; i < 9; i++) {
    var a = i * Math.PI * 2 / 9 + wxR() * .3, sp = .05 + wxR() * .05, gr = g.createLinearGradient(0, 0, Math.cos(a) * R, Math.sin(a) * R);
    gr.addColorStop(0, 'rgba(' + rgb + ',.5)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * .95, a - sp, a + sp); g.closePath(); g.fill();
  }
  return o;
}
function wxDot(rgb) {
  var o = wxCanvas(32, 32), g = o.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(.45, 'rgba(' + rgb + ',.8)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return o;
}

// Палитра и спрайты под текущую тему. Светлые частицы — значит фон тёмный: тучи темнее фона, иначе — цвета частиц.
function wxKit(host) {
  var p = wxRgb(host, 'var(--wx-p, var(--text))'), sun = wxRgb(host, 'var(--wx-sun, var(--warm))'), fl = wxRgb(host, 'var(--wx-fl, #fff)');
  var lum = p.split(',').reduce(function (s, v, i) { return s + v * [.3, .59, .11][i]; }, 0), dark = lum > 128;
  var dk = dark ? '0,0,0' : p, k = { p: p, sun: sun, fl: fl, dark: dark, base: dark ? .75 : .5, cla: dark ? .26 : .32, dka: dark ? .4 : .42, sa: dark ? .34 : .5 };
  k.clouds = [0, 1, 2, 3, 4, 5].map(function (i) { return wxCloud(p, 200 + i * 20, 90 + i * 8, i < 3 ? 10 : 6); });
  k.darkC = [0, 1, 2, 3].map(function (i) { return wxCloud(dk, 260 + i * 30, 100 + i * 10, 9); });
  k.lit = [0, 1, 2, 3].map(function (i) { return wxCloud(fl, 260 + i * 30, 100 + i * 10, 12); });
  k.fogs = [0, 1, 2, 3, 4].map(function () { return wxFog(p, 420, 110, 16); });
  k.rays = wxRays(sun, 390); k.dot = wxDot(p);
  return k;
}

// Подключить фон к карточке плитки. Возвращает set(icon, power, night) — звать при каждом снимке.
function wxBg(cb) {
  var cv = document.createElement('canvas'); cv.className = 'wxbg'; cv.setAttribute('aria-hidden', 'true');
  cb.insertBefore(cv, cb.firstChild);
  var o = { cb: cb, cv: cv, g: cv.getContext('2d'), st: '', pw: 2, night: false, W: 0, H: 0, kitKey: '', kit: null, ps: [], sp: [], cl: [], seg: null, ft: -1e9, next: 0, drawn: false };
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
  if (t - wxLast < 1000 / WX_FPS - 2) return;
  var dt = Math.min(4, (t - wxLast) / 16); wxLast = t;
  WX_LIST.forEach(function (o) { if (o.cb.isConnected && o.cb.offsetParent) wxDraw(o, t, dt); });
  WX_LIST = WX_LIST.filter(function (o) { return o.cb.isConnected; }); // плитку пересоздали — старую забываем
}
function wxClear(o) { if (o.drawn) { o.g.clearRect(0, 0, o.W, o.H); o.drawn = false; } } // в единицах макета: масштаб холста задан в wxFit

// Размер холста и тема проверяются в кадре: изменились — пересчитываем.
function wxFit(o) {
  var w = o.cb.clientWidth, h = o.cb.clientHeight, dpr = window.devicePixelRatio || 1, key = document.body.className;
  if (key !== o.kitKey || !o.kit) { o.kitKey = key; o.kit = wxKit(o.cb); o.W = 0; }
  if (o.W === w * 2 && o.H === h * 2) return;
  o.cv.width = Math.round(w * dpr); o.cv.height = Math.round(h * dpr); o.W = w * 2; o.H = h * 2;
  o.g.setTransform(dpr / 2, 0, 0, dpr / 2, 0, 0);
  wxSeed(o);
}
