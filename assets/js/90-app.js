'use strict';
// Точка входа виджета: раскладка, связь с Go (__init, __stats, __cmd, __cfg, __sys), перетаскивание окна, размер.

var rootEl = document.getElementById('root');
var view = null;           // текущий вид { el, update(s) }
var dataReady = false;     // первые данные пришли целиком, заготовки убраны
var LOAD_MAX = 4000, loadStart = 0;

var sent = {};
function postOnce(key, v) { if (sent[key] !== v) { sent[key] = v; post(key + ':' + v); } }

function applyBody() {
  document.body.className = bodyClass();
  setGlassVars(document.body.style, CFG.glass, CFG.accent, CFG.theme);
  rootEl.style.zoom = CFG.scale / 100;
  rootEl.classList.toggle('loading', !dataReady);
  postOnce('corners', CFG.theme === 'terminal' ? 'square' : 'round');
  postOnce('glass', CFG.theme === 'glass' ? 1 : 0); // непрозрачным темам размытие не нужно
}

// Перестраивает виджет.
function layout() {
  hideTip(true);
  var old = view && view.el;
  view = CFG.mode === 'full' ? buildFull() : buildCompact(CFG.compact === 'strip');
  if (old) rootEl.replaceChild(view.el, old); else rootEl.insertBefore(view.el, rootEl.firstChild);
  applyBody(); syncWeather();
  if (S && dataReady) refresh(Date.now());
}

function refresh(now) {
  var fired = evalAlarms(S, now);
  if (CFG.notify && fired.length) post('notify:' + fired.join('; '));
  view.update(S);
}

// Заготовки вместо плиток держатся, пока не пришли все основные данные (GPU и датчики отвечают последними).
function checkReady(s, now) {
  if (!loadStart) loadStart = now;
  var full = s.cpu && s.mem && s.gpu && (s.cpu.temp != null || !SYS.driver);
  if (!full && now - loadStart < LOAD_MAX) return false;
  dataReady = true;
  applyBody();
  rootEl.classList.add('reveal');
  setTimeout(function () { rootEl.classList.remove('reveal'); }, 600);
  return true;
}

// ---- вызовы из Go ----
window.__init = function (o) {
  CFG = mergeCfg(o.ui);
  TOPMOST = !!o.topmost;
  if (o.sys) SYS = o.sys;
  layout();
};
window.__stats = function (s) {
  S = s;
  var now = Date.now();
  if (s.cpu) pushHist('cpu', s.cpu.load);
  if (s.gpu) pushHist('gpu', s.gpu.load);
  if (s.mem) pushHist('mem', s.mem.pct);
  if (s.net) { pushHist('down', s.net.down); pushHist('up', s.net.up); }
  updateRecords(s);
  if (!view || (!dataReady && !checkReady(s, now))) return;
  refresh(now);
  if (Tip.row) showTip();
};
window.__sys = function (sys) { SYS = sys; TOPMOST = sys.topmost; };

// Настройки поменялись в окне настроек. Перестраиваем виджет, только если это видно в раскладке.
var LIGHT = { glass: 1, accent: 1, thr: 1, notify: 1, city: 1, theme: 1, mono: 1, scale: 1 };
function shape(c) { return JSON.stringify(c, function (k, v) { return LIGHT[k] ? undefined : v; }); }
window.__cfg = function (c) {
  var old = CFG;
  CFG = mergeCfg(c);
  if (JSON.stringify(old.thr) !== JSON.stringify(CFG.thr)) Alarm.reset();
  if (shape(old) !== shape(CFG)) { layout(); return; }
  applyBody(); syncWeather();
  if (S && dataReady) refresh(Date.now());
};
// Команды из меню и от окна настроек.
window.__cmd = function (c) {
  var p = c.split(':'), k = p[0], v = p[1];
  if (k === 'theme' && THEMES[v]) { CFG.theme = v; saveCfg(); layout(); }
  else if (k === 'mode' && MODES[v]) { setMode(v); saveCfg(); layout(); }
  else if (k === 'editing') { editing = v === '1'; layout(); }
};

// ---- окно ----
document.addEventListener('mousedown', function (e) {
  if (e.button === 0 && !e.target.closest('[data-nodrag]')) post('drag');
});
document.addEventListener('contextmenu', function (e) { e.preventDefault(); post('menu'); });

// Размер окна задаёт страница (CSS px), Go пересчитывает с учётом DPI.
var lastSize = '';
function postSize() {
  var r = rootEl.getBoundingClientRect();
  var s = 'size:' + Math.ceil(r.width) + ',' + Math.ceil(r.height);
  if (s !== lastSize) { lastSize = s; post(s); }
}
new ResizeObserver(postSize).observe(rootEl);

// Часы идут по своему таймеру, ровно по смене секунды (данные от Go приходят со сдвигом).
(function secTick() {
  if (view && dataReady) view.tick();
  setTimeout(secTick, 1005 - Date.now() % 1000);
})();

post('ready');
