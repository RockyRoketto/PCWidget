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
  setThemeVars(document.body.style);
  rootEl.style.zoom = CFG.scale / 100;
  rootEl.classList.toggle('loading', !dataReady);
  $$('[data-id]', rootEl).forEach(paintTile);
  if (view) placeFills(view.el);
  postOnce('style', styleKey()); // размытие, углы и прозрачность окна
}

// Перестраивает виджет.
function layout() {
  var old = view && view.el;
  view = GRID_MODES[CFG.mode] ? buildFull() : buildCompact(CFG.mode);
  if (old) rootEl.replaceChild(view.el, old); else rootEl.insertBefore(view.el, rootEl.firstChild);
  applyBody(); syncWeather(); syncClaude();
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
};
window.__sys = function (sys) {
  var acc = SYS.accent;
  SYS = sys; TOPMOST = sys.topmost;
  if (sys.accent !== acc && CFG) applyBody(); // в Windows сменили цвет акцента
};
// Windows переключилась между светлой и тёмной: тема «как в Windows» следует за ней.
if (darkMQ) darkMQ.addEventListener('change', function () { if (CFG && CFG.tone === 'auto' && view) applyBody(); });

// Настройки поменялись в окне настроек. Перестраиваем виджет, только если это видно в раскладке.
var LIGHT = { edgeBack: 1, glass: 1, accent: 1, pal: 1, tone: 1, tileColors: 1, thr: 1, notify: 1, city: 1, scale: 1 };
function shape(c) { return JSON.stringify(c, function (k, v) { return LIGHT[k] ? undefined : v; }); }
window.__cfg = function (c) {
  var old = CFG;
  CFG = mergeCfg(c);
  if (JSON.stringify(old.thr) !== JSON.stringify(CFG.thr)) Alarm.reset();
  if (shape(old) !== shape(CFG)) { layout(); return; }
  applyBody(); syncWeather(); syncClaude();
  if (S && dataReady) refresh(Date.now());
};
// Команды из меню и от окна настроек.
window.__cmd = function (c) {
  var p = c.split(':'), k = p[0], v = p[1];
  if (k === 'theme' && THEMES[v]) { CFG.theme = v; saveCfg(); layout(); }
  else if (k === 'mode' && MODES[v]) { setMode(v); saveCfg(); layout(); }
  else if (k === 'tone' && TONES[v]) { CFG.tone = v; saveCfg(); applyBody(); }
  else if (k === 'editing') { editing = v === '1'; layout(); }
  // Виджет отпустили у левого или правого края экрана: Панель и Широкая становятся Колонкой,
  // а оттащили от края — возвращаются. Колонку, выбранную руками, край не трогает.
  else if (k === 'edge' && v === '1' && GRID_MODES[CFG.mode]) { var was = CFG.mode; setMode('column'); CFG.edgeBack = was; saveCfg(); layout(); }
  else if (k === 'edge' && v === '0' && CFG.edgeBack && CFG.mode === 'column') { setMode(CFG.edgeBack); saveCfg(); layout(); }
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
