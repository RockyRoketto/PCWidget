'use strict';
// Точка входа окна настроек. Виджет живёт на другой странице: изменения уходят в Go, он передаёт их виджету.

var setEl = document.getElementById('set');
var settings = null;
var liveTimer = 0;

// Пока тянут ползунок: показать на виджете, не чаще 25 раз в секунду.
function liveCfg() {
  if (liveTimer) return;
  liveTimer = setTimeout(function () { liveTimer = 0; post('live:' + JSON.stringify(CFG)); }, 40);
}
function applySetBody() {
  document.body.className = bodyClass();
  setThemeVars(document.body.style, Math.max(CFG.glass, 80)); // настройкам нужна читаемая подложка
  post('style:' + styleKey());
}

// ---- вызовы из Go ----
window.__init = function (o) {
  CFG = mergeCfg(o.ui);
  TOPMOST = !!o.topmost;
  if (o.sys) SYS = o.sys;
  if (o.tab && SET_TABS[o.tab]) setState.tab = o.tab;
  setState.sure = false;
  applySetBody();
  if (settings) settings.render(true);
  else { settings = buildSettings(); setEl.appendChild(settings.el); }
};
window.__stats = function (s) { S = s; if (settings) settings.update(); };
// Настройки изменил сам виджет (перетащили плитку, сменили режим в меню).
window.__cfg = function (c) {
  CFG = mergeCfg(c);
  applySetBody();
  if (settings && !isTyping()) settings.render();
};
window.__sys = function (sys) {
  var acc = SYS.accent;
  SYS = sys; TOPMOST = sys.topmost;
  if (acc !== sys.accent && CFG) { applySetBody(); if (settings && setState.tab === 'look') settings.render(); }
  if (settings && setState.tab === 'sys') settings.render();
  else if (settings) settings.update();
};

// ---- окно ----
function isTyping() { var n = document.activeElement; return n && n.tagName === 'INPUT' && n.type === 'text'; }
document.addEventListener('mousedown', function (e) {
  if (e.button === 0 && !e.target.closest('[data-nodrag]')) post('drag');
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') post('close');
  else if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur();
});
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

post('ready');
if (darkMQ) darkMQ.addEventListener('change', function () { if (CFG && CFG.tone === 'auto') applySetBody(); });
