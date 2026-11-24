'use strict';
// Точка входа: раскладка, связь с Go (__init, __stats, __cmd), перетаскивание окна, размер.

var rootEl = document.getElementById('root');
var view = [];            // построенные плитки, у каждой есть update(s)
var settingsOpen = false;

function applyBody() {
  var m = settingsOpen ? 'settings' : (CFG.mode === 'full' ? 'full' : 'c-' + CFG.compact);
  document.body.className = 'theme-' + CFG.theme + ' mode-' + m;
  post('corners:' + (CFG.theme === 'terminal' ? 'square' : 'round'));
  post('glass:' + (CFG.theme === 'glass' ? 1 : 0)); // непрозрачным темам размытие не нужно
}

function layout() {
  hideTip(true);
  rootEl.innerHTML = '';
  view = [];
  applyBody();
  if (settingsOpen) {
    rootEl.appendChild(buildSettings(function (light) { saveCfg(); if (!light) applyBody(); }, function () { settingsOpen = false; layout(); }));
    return;
  }
  if (CFG.mode === 'full') {
    var grid = mk('<div class="grid"></div>');
    CFG.tiles.forEach(function (t) {
      if (!t.on) return;
      var b = TILE_BUILD[t.id](); view.push(b); grid.appendChild(b.el);
    });
    rootEl.appendChild(grid);
    var gear = mk('<button class="gear" data-nodrag title="Настройки">' + ICONS.gear + '</button>');
    gear.addEventListener('click', function () { settingsOpen = true; layout(); });
    rootEl.appendChild(gear);
  } else {
    var c = buildCompact(CFG.compact === 'strip'); view.push(c); rootEl.appendChild(c.el);
  }
  if (S) refresh(Date.now());
}

function refresh(now) {
  var fired = evalAlarms(S, now);
  if (CFG.notify && fired.length) post('notify:' + fired.join('; '));
  view.forEach(function (b) { b.update(S); });
}

// ---- вызовы из Go ----
window.__init = function (o) {
  CFG = mergeCfg(o.ui);
  TOPMOST = !!o.topmost;
  layout();
};
window.__stats = function (s) {
  S = s;
  if (s.cpu) pushHist('cpu', s.cpu.load);
  if (s.gpu) pushHist('gpu', s.gpu.load);
  if (s.net) { pushHist('down', s.net.down); pushHist('up', s.net.up); }
  updateRecords(s);
  refresh(Date.now());
  if (Tip.row) showTip();
};
// Команды из меню трея и из меню правого клика.
window.__cmd = function (c) {
  var p = c.split(':'), k = p[0], v = p[1];
  if (k === 'theme' && THEMES[v]) { CFG.theme = v; saveCfg(); layout(); }
  else if (k === 'mode') {
    if (v === 'full') CFG.mode = 'full'; else if (v === 'column' || v === 'strip') { CFG.mode = 'compact'; CFG.compact = v; }
    saveCfg(); layout();
  } else if (k === 'settings') { settingsOpen = true; layout(); }
  else if (k === 'topmost') { TOPMOST = v === '1'; if (settingsOpen) layout(); }
};

// ---- окно ----
document.addEventListener('mousedown', function (e) {
  if (e.button !== 0) return;
  var n = e.target.closest('[data-nodrag],[data-drag]'); // ближайший решает: заголовок настроек тянется, кнопки в нём нет
  if (!n || n.hasAttribute('data-drag')) post('drag');
});
document.addEventListener('contextmenu', function (e) { e.preventDefault(); post('menu'); });

// Размер окна задаёт страница (CSS px), Go пересчитывает с учётом DPI.
var lastSize = '';
new ResizeObserver(function () {
  var r = rootEl.getBoundingClientRect();
  var s = 'size:' + Math.ceil(r.width) + ',' + Math.ceil(r.height);
  if (s !== lastSize) { lastSize = s; post(s); }
}).observe(rootEl);

post('ready');
