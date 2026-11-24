'use strict';
// Общие состояние и хелперы. Файлы js/ склеиваются по алфавиту.

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
function post(m) { window.chrome.webview.postMessage(m); }
function mk(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// имя, подложка и три цвета для образца в настройках и меню
var THEMES = {
  glass: ['Стекло', '#3a4256', ['#6fb1ff', '#c09bff', '#ff8fc4']],
  terminal: ['Терминал', '#020a04', ['#4dff7c', '#4dff7c', '#4dff7c']],
  neon: ['Неон', '#0a0a15', ['#29c8ff', '#b77bff', '#ff5fc8']]
};
var LOOKS = { graph: 'Графики', ring: 'Кольца', rows: 'Строки' };
var CLOCKS = { digital: 'Цифры', flip: 'Перекидные', analog: 'Стрелки' };
var CALS = { day: 'День', week: 'Неделя', month: 'Месяц' };
var MODES = { full: 'Полный', column: 'Колонка', strip: 'Полоска' };
var SCALES = [90, 100, 115, 130];
// Акцентный цвет Стекла (подписи, выбранное, кнопки, цифры в режиме «Один цвет»): быстрый выбор, плюс свой цвет.
var ACCENTS = ['#e9b872', '#6fb1ff', '#c09bff', '#ff8fc4', '#5fe0a0', '#ff7a6b'];
function accentOn(hex) { // цвет текста поверх акцента
  var n = parseInt(hex.slice(1), 16);
  return (((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150) ? '#1a1408' : '#fff';
}
// Плотность подложки и акцент (только у Стекла: у остальных тем свой). Одинаково для виджета, подсказки и настроек.
function setGlassVars(style, density, accent, theme) {
  style.setProperty('--glass', density / 100);
  if (theme === 'glass' && accent) { style.setProperty('--accent', accent); style.setProperty('--on-accent', accentOn(accent)); }
  else { style.removeProperty('--accent'); style.removeProperty('--on-accent'); }
}

function defaults() {
  return {
    theme: 'glass', look: 'graph', mode: 'full', compact: 'column', mono: false, scale: 100, glass: 76, accent: '',
    rows: defaultRows(), hide: defaultHide(), mini: { column: defaultMini(), strip: defaultMini() },
    thr: { cpuTemp: 85, gpuTemp: 80, mem: 90, disk: 90 },
    notify: false, city: '', clock24: true, clockSec: false, clockView: 'digital', clockHand: true, calView: 'month', procN: 3, procTab: 'cpu'
  };
}

var CFG = null;        // задаётся в конце 05-layout.js, потом из __init
var S = null;          // последний снимок от Go
var TOPMOST = false;
var SYS = { installed: false, autostart: false, driver: false, sensors: false }; // состояние системы от Go

// Настройки из файла накладываются на значения по умолчанию, лишнее и битое отбрасывается.
function mergeCfg(saved) {
  var c = defaults();
  if (!saved || typeof saved !== 'object') return c;
  if (THEMES[saved.theme]) c.theme = saved.theme;
  if (LOOKS[saved.look]) c.look = saved.look;
  if (saved.mode === 'full' || saved.mode === 'compact') c.mode = saved.mode;
  if (saved.compact === 'column' || saved.compact === 'strip') c.compact = saved.compact;
  mergeLayout(c, saved);
  if (saved.thr) Object.keys(c.thr).forEach(function (k) {
    var v = Number(saved.thr[k]); if (isFinite(v) && v >= 50 && v <= 100) c.thr[k] = v;
  });
  ['mono', 'notify', 'clockSec'].forEach(function (k) { c[k] = saved[k] === true; });
  ['clock24', 'clockHand'].forEach(function (k) { c[k] = saved[k] !== false; });
  if (CLOCKS[saved.clockView]) c.clockView = saved.clockView;
  if (CALS[saved.calView]) c.calView = saved.calView;
  if (SCALES.indexOf(saved.scale) >= 0) c.scale = saved.scale;
  if (saved.glass >= 20 && saved.glass <= 95) c.glass = Math.round(saved.glass);
  if (typeof saved.accent === 'string' && /^(#[0-9a-f]{6})?$/i.test(saved.accent)) c.accent = saved.accent.toLowerCase();
  if (saved.procN === 5) c.procN = 5;
  if (saved.procTab === 'ram' || saved.procTab === 'disk') c.procTab = saved.procTab;
  if (typeof saved.city === 'string') c.city = saved.city.trim().slice(0, 60);
  return c;
}
function saveCfg() { post('cfg:' + JSON.stringify(CFG)); }
// Классы и переменные страницы: общие для виджета, подсказки и меню.
function bodyClass() { return 'theme-' + CFG.theme + (CFG.mono ? ' mono' : '') + (CFG.theme === 'glass' && CFG.accent ? ' acc' : ''); }
// Go ходит за погодой в интернет только когда плитка включена (хоть в одном режиме) и город задан.
function weatherOn() { return ['full', 'column', 'strip'].some(function (m) { return isOn(m, 'weather'); }); }
function syncWeather() { post('weather:' + (weatherOn() ? CFG.city : '')); }

// ---- форматирование ----
function rateParts(bps) { // байт/с -> [число, единица]
  if (bps >= 1048576) return [(bps / 1048576).toFixed(bps >= 10485760 ? 0 : 1), 'МБ/с'];
  return [(bps / 1024).toFixed(0), 'КБ/с'];
}
function rateText(bps) { return rateParts(bps).join(' '); }
function sizeParts(bytes) {
  if (bytes >= 1099511627776) return [(bytes / 1099511627776).toFixed(1), 'ТБ'];
  if (bytes >= 1073741824) return [(bytes / 1073741824).toFixed(bytes >= 107374182400 ? 0 : 1), 'ГБ'];
  return [(bytes / 1048576).toFixed(0), 'МБ'];
}
function sizeText(bytes) { return sizeParts(bytes).join(' '); }
function uptimeText(sec) {
  var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return (d ? d + ' д ' : '') + (d || h ? h + ' ч ' : '') + m + ' мин';
}
// Состояние по порогу: горячо за 5 до порога, тепло за 15.
function level(v, thr) { return v == null ? '' : v >= thr - 5 ? 'hot' : v >= thr - 15 ? 'warm' : 'ok'; }
function pingLevel(ms) { return ms >= 100 ? 'hot' : ms >= 50 ? 'warm' : 'ok'; }

function clockText(d) { return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: CFG.clockSec ? '2-digit' : undefined, hour12: !CFG.clock24 }); }

// ---- история для графиков и рекорды сессии ----
var HN = 60;
var HIST = { cpu: [], gpu: [], mem: [], down: [], up: [] };
function pushHist(k, v) { var a = HIST[k]; a.push(v); if (a.length > HN) a.shift(); }
function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
var REC = { cpuLoad: 0, cpuTemp: null, gpuLoad: 0, gpuTemp: null, mem: 0, down: 0 };
function updateRecords(s) {
  var mx = function (k, v) { if (v != null && (REC[k] == null || v > REC[k])) REC[k] = v; };
  if (s.cpu) { mx('cpuLoad', s.cpu.load); mx('cpuTemp', s.cpu.temp); }
  if (s.gpu) { mx('gpuLoad', s.gpu.load); mx('gpuTemp', s.gpu.temp); }
  if (s.mem) mx('mem', s.mem.pct);
  if (s.net) mx('down', s.net.down);
}

// Линия и заливка под ней в координатах 100x30.
function areaPath(arr, max) {
  if (arr.length < 2) return ['', ''];
  var st = 100 / (HN - 1), x0 = (100 - (arr.length - 1) * st).toFixed(1);
  var p = 'M' + arr.map(function (v, i) { return (+x0 + i * st).toFixed(1) + ',' + (29 - Math.min(v / max, 1) * 27).toFixed(1); }).join('L');
  return [p, p + 'L100,30L' + x0 + ',30Z'];
}
function graphSvg(extra) { return '<svg class="graph" viewBox="0 0 100 30" preserveAspectRatio="none"><path class="a"/><path class="l"/>' + (extra || '') + '</svg>'; }
function drawGraph(svg, arr, max) {
  var d = areaPath(arr, max);
  $('.l', svg).setAttribute('d', d[0]); $('.a', svg).setAttribute('d', d[1]);
}
