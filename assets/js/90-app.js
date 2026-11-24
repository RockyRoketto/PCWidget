'use strict';
// Точка входа: раскладка, связь с Go (__init, __stats, __cmd, __sys), перетаскивание окна, размер.

var rootEl = document.getElementById('root');
var view = null;           // текущий вид { el, update(s) }
var settings = null;       // панель настроек, если открыта
var side = 'right';        // с какой стороны от виджета встаёт панель (решает Go по месту на экране)
var dataReady = false;     // первые данные пришли целиком, заготовки убраны
var LOAD_MAX = 4000, loadStart = 0;

function applyBody() {
  document.body.className = bodyClass();
  document.body.style.setProperty('--glass', CFG.glass / 100);
  rootEl.style.zoom = CFG.scale / 100;
  var strip = curMode() === 'strip';
  rootEl.className = (settings ? (strip ? 'stack ' : side + ' ') : '') + (dataReady ? '' : 'loading');
  post('corners:' + (CFG.theme === 'terminal' ? 'square' : 'round'));
  post('raise:' + (settings || editing ? 1 : 0)); // пока настраиваем, виджет поверх программ
  post('glass:' + (CFG.theme === 'glass' ? 1 : 0)); // непрозрачным темам размытие не нужно
}

// Перестраивает виджет; открытая панель настроек остаётся на месте.
function layout() {
  hideTip(true);
  if (CFG.mode !== 'full') editing = false;
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
  if (settings) settings.update();
}

function openSettings(tab) {
  if (tab) setState.tab = tab;
  if (settings) { settings.render(true); return; }
  post('panel:' + Math.ceil(344 * CFG.scale / 100)); // Go ответит командой panel:left или panel:right
}
function showPanel(s) {
  side = s === 'left' ? 'left' : 'right';
  if (settings) return;
  settings = buildSettings(closeSettings);
  rootEl.appendChild(settings.el);
  applyBody();
}
function closeSettings() {
  if (!settings) return;
  settings.el.remove(); settings = null;
  applyBody();
  post('panel:0');
}

// Действия кнопок виджета и меню.
function action(a) {
  if (a === 'mini') { setMode(CFG.compact); saveCfg(); layout(); if (settings) settings.render(); }
  else if (a === 'edit') {
    editing = CFG.mode === 'full' ? !editing : true;
    if (CFG.mode !== 'full') { CFG.mode = 'full'; saveCfg(); }
    layout(); if (settings) settings.render();
  } else if (a === 'pin') { TOPMOST = !TOPMOST; post('topmost:' + (TOPMOST ? 1 : 0)); layout(); if (settings) settings.render(); }
  else if (a === 'settings') { if (settings) closeSettings(); else openSettings(); }
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
window.__sys = function (sys) { SYS = sys; TOPMOST = sys.topmost; if (settings && setState.tab === 'sys') settings.render(); };
// Команды из меню трея и из меню правого клика.
window.__cmd = function (c) {
  var p = c.split(':'), k = p[0], v = p[1];
  if (k === 'theme' && THEMES[v]) { CFG.theme = v; saveCfg(); layout(); }
  else if (k === 'mode' && MODES[v]) { setMode(v); saveCfg(); layout(); }
  else if (k === 'settings') { openSettings(v); return; }
  else if (k === 'edit') { action('edit'); return; }
  else if (k === 'panel') { showPanel(v); return; }
  else if (k === 'panelside') { side = v; applyBody(); return; }
  else if (k === 'topmost') { TOPMOST = v === '1'; layout(); }
  if (settings) settings.render();
};

// ---- окно ----
document.addEventListener('mousedown', function (e) {
  if (e.button !== 0) return;
  var n = e.target.closest('[data-nodrag],[data-drag]'); // ближайший решает: заголовок настроек тянется, кнопки в нём нет
  if (!n || n.hasAttribute('data-drag')) post('drag');
});
// Поля ввода: окну виджета нужна активация, иначе клавиатура не доходит.
// Выход из режима отложен: пока Go переносит фокус, поле на миг теряет его, и без паузы получалось мигание.
var typing = false, typeTimer = 0;
function isTextInput(n) { return n && n.tagName === 'INPUT' && n.type === 'text'; }
document.addEventListener('focusin', function (e) {
  if (!isTextInput(e.target)) return;
  clearTimeout(typeTimer);
  if (!typing) { typing = true; post('edit:1'); }
});
document.addEventListener('focusout', function () {
  clearTimeout(typeTimer);
  typeTimer = setTimeout(function () {
    if (typing && !isTextInput(document.activeElement)) { typing = false; post('edit:0'); }
  }, 300);
});
document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); post('menu'); });

// Размер окна задаёт страница (CSS px), Go пересчитывает с учётом DPI.
var lastSize = '';
function postSize() {
  var r = rootEl.getBoundingClientRect();
  var s = 'size:' + Math.ceil(r.width) + ',' + Math.ceil(r.height);
  if (s !== lastSize) { lastSize = s; post(s); }
}
new ResizeObserver(postSize).observe(rootEl);

post('ready');
