'use strict';
// Общие состояние и хелперы. Файлы js/ склеиваются по алфавиту.

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
function post(m) { window.chrome.webview.postMessage(m); }
function mk(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Темы с одной раскладкой: меняется материал и индикатор (кривая и полоса, деления, заливка, сегменты).
var THEMES = { sheet: 'Лист', gauge: 'Прибор', fill: 'Заливка', lcd: 'ЖК-табло' };
var TONES = { auto: 'Как в Windows', dark: 'Тёмная', light: 'Светлая' };
var MODES = { full: 'Панель', wide: 'Широкая', column: 'Колонка', strip: 'Полоска', square: 'Квадрат' };
var GRID_MODES = { full: 1, wide: 1 };
var CLOCKS = { digital: 'Цифры', flip: 'Перекидные', analog: 'Стрелки' };
var CALS = { day: 'День', week: 'Неделя', month: 'Месяц' };
var SCALES = [90, 100, 115, 130];
// Акцент «Листа»: из Windows или свой. Градиенты «Заливки»: три точки, первая сверху слева.
var ACCENTS = ['#7cc4ff', '#7fe0bd', '#ffc773', '#f6a8d0', '#c3b1ff', '#ffffff'];
var PALS = {
  aurora: ['Сияние', ['#18c7b0', '#2f7df0', '#8a4df2']],
  sunset: ['Закат', ['#ff9a5a', '#f2558b', '#7a4be0']],
  sea: ['Море', ['#4fd3e8', '#2a86e8', '#2c4fc4']],
  berry: ['Ягода', ['#ff7eb6', '#c04bd8', '#5b4be6']],
  mint: ['Мята', ['#a8dc5c', '#2fb78a', '#157f9c']]
};
function rgbOf(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function lumOf(hex) { var c = rgbOf(hex); return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000; }
function mixTo(hex, to, k) { return '#' + rgbOf(hex).map(function (v) { return (256 + Math.round(v + (to - v) * k)).toString(16).slice(1); }).join(''); }
function accentOn(hex) { return lumOf(hex) > 150 ? '#14181f' : '#fff'; } // текст поверх цвета
// Цвет под фон: на тёмном не темнее 140, на светлом не светлее 120 (иначе не видно).
function fitColor(c) {
  if (!c) return c;
  var y = lumOf(c);
  if (isLight()) return y > 120 ? mixTo(c, 0, 1 - 120 / y) : c;
  return y < 140 ? mixTo(c, 255, (140 - y) / (255 - y)) : c;
}

// Светлая или тёмная сейчас: своя настройка или как в Windows (WebView2 следует системе).
var darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function isLight() { return CFG.tone === 'light' || (CFG.tone === 'auto' && !!darkMQ && !darkMQ.matches); }
function toneKey() { return isLight() ? 'light' : 'dark'; }
// Ключ оформления окна для Go: тема и светлость (стекло у «Листа» разное).
function styleKey() { return CFG.theme + ':' + toneKey(); }

// Акцент: свой, из Windows (Go присылает SYS.accent), иначе спокойный голубой.
function accentColor() { return fitColor(CFG.accent !== 'win' && CFG.accent || SYS.accent || ACCENTS[0]); }
function palStops() {
  if (CFG.pal !== 'win') return (PALS[CFG.pal] || PALS.aurora)[1];
  var a = SYS.accent || '#2f7df0';
  return [mixTo(a, 255, .35), a, mixTo(a, 0, .3)];
}
function gradOf(stops) { return 'linear-gradient(155deg,' + stops[0] + ',' + stops[1] + ' 48%,' + stops[2] + ')'; }
// Переменные страницы: плотность, акцент, градиент. Одинаково для виджета, меню и настроек.
// У «Прибора» и «ЖК-табло» свой цвет шкал, у «Заливки» акцент берётся из середины градиента.
function themeVars() {
  var a = CFG.theme === 'gauge' ? (isLight() ? '#2f5d5c' : '#e9dfc3') : CFG.theme === 'lcd' ? (isLight() ? '#1b2617' : '#9fd6ff') : CFG.theme === 'fill' ? fitColor(palStops()[1]) : accentColor();
  return { '--glass': CFG.glass / 100, '--accent': a, '--on-accent': accentOn(a), '--pal': gradOf(palStops()) };
}
function setThemeVars(style, density) {
  var v = themeVars();
  if (density != null) v['--glass'] = density / 100;
  Object.keys(v).forEach(function (k) { style.setProperty(k, v[k]); });
}
function bodyClass() { return 'theme-' + CFG.theme + ' tone-' + toneKey(); }

// Свой цвет плитки (общий для режимов и тем): красит только индикатор, цифры остаются цвета текста.
var TILE_TINTS = ['#7cc4ff', '#c3b1ff', '#f6a8d0', '#ff8a7a', '#ffb35c', '#ffd85a', '#7fe0bd', '#ffffff'];
function paintTile(el) {
  var c = CFG.tileColors[colorKey(el.getAttribute('data-id'))] || '', h = fitColor(c);
  el.classList.toggle('tinted', !!c);
  if (h) { el.style.setProperty('--a', h); el.style.setProperty('--tint', c); }
  else { el.style.removeProperty('--a'); el.style.removeProperty('--tint'); }
}

function defaults() {
  return {
    ver: 3, theme: 'sheet', tone: 'auto', accent: 'win', pal: 'aurora', mode: 'full', edgeBack: '', scale: 100, glass: 62, tileColors: {}, thin: {},
    rows: defaultRows(), hide: defaultHide(), mini: { column: defaultMini('column'), strip: defaultMini('strip'), square: defaultMini('square') },
    thr: { cpuTemp: 85, gpuTemp: 80, mem: 90, disk: 90, claude: 90 },
    notify: false, antiburn: false, updates: true, city: '', wxDays: true, clock24: true, clockSec: false, clockView: 'digital', clockHand: true, clockDate: true, calView: 'month', procN: 3, procTab: 'cpu', tariff: 0,
    profiles: []
  };
}

var CFG = null;        // задаётся в конце 05-layout.js, потом из __init
var S = null;          // последний снимок от Go
var TOPMOST = false;
var SYS = { installed: false, autostart: false, driver: false, sensors: false, claude: 'none', claudeErr: '', accent: '', version: '', update: '', updateBusy: false, updateNote: '' }; // состояние системы от Go

// Настройки из файла накладываются на значения по умолчанию, лишнее и битое отбрасывается.
// До ver 3 были другие темы и виды: тема становится «Листом», плотность по умолчанию.
function mergeCfg(saved) {
  var c = defaults();
  if (!saved || typeof saved !== 'object') return c;
  var old = !(saved.ver >= 3);
  if (THEMES[saved.theme]) c.theme = saved.theme;
  if (TONES[saved.tone]) c.tone = saved.tone;
  if (PALS[saved.pal] || saved.pal === 'win') c.pal = saved.pal;
  if (MODES[saved.mode]) c.mode = saved.mode;
  else if (saved.mode === 'compact' && MODES[saved.compact]) c.mode = saved.compact; // до ver 3
  if (c.mode === 'column' && GRID_MODES[saved.edgeBack]) c.edgeBack = saved.edgeBack; // Колонкой стал у края экрана
  mergeLayout(c, saved);
  mergeFocus(c, saved);
  if (saved.thr) Object.keys(c.thr).forEach(function (k) {
    var v = Number(saved.thr[k]); if (isFinite(v) && v >= 50 && v <= 100) c.thr[k] = v;
  });
  ['notify', 'antiburn', 'clockSec'].forEach(function (k) { c[k] = saved[k] === true; });
  c.updates = saved.updates !== false;
  ['wxDays', 'clock24', 'clockHand', 'clockDate'].forEach(function (k) { c[k] = saved[k] !== false; });
  if (CLOCKS[saved.clockView]) c.clockView = saved.clockView;
  if (CALS[saved.calView]) c.calView = saved.calView;
  if (SCALES.indexOf(saved.scale) >= 0) c.scale = saved.scale;
  if (!old && saved.glass >= 20 && saved.glass <= 95) c.glass = Math.round(saved.glass);
  var hex = function (v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ''; };
  if (hex(saved.accent)) c.accent = hex(saved.accent);
  if (saved.tileColors) TILE_IDS.forEach(function (k) { if (hex(saved.tileColors[k])) c.tileColors[k] = hex(saved.tileColors[k]); });
  if (saved.thin) Object.keys(THIN_OK).forEach(function (k) { if (saved.thin[k]) c.thin[k] = 1; });
  if (saved.procN === 5) c.procN = 5;
  if (saved.procTab === 'ram' || saved.procTab === 'disk') c.procTab = saved.procTab;
  var tf = Number(saved.tariff); if (isFinite(tf) && tf > 0 && tf <= 1000) c.tariff = Math.round(tf * 100) / 100;
  if (typeof saved.city === 'string') c.city = saved.city.trim().slice(0, 60);
  c.profiles = cleanProfiles(saved.profiles); // 07-profiles.js
  return c;
}
function saveCfg() { post('cfg:' + JSON.stringify(CFG)); }
// Go ходит за погодой в интернет только когда плитка включена (хоть в одном режиме) и город задан.
function weatherOn() { return Object.keys(MODES).some(function (m) { return isOn(m, 'weather'); }); }
function syncWeather() { post('weather:' + (weatherOn() ? CFG.city : '')); }
// Файлы Claude Code Go читает только пока включена плитка (или строка в компакте).
function claudeOn() { return Object.keys(MODES).some(function (m) { return isOn(m, 'claude') || (!GRID_MODES[m] && isOn(m, 'claudew')); }); }
function syncClaude() { post('claude:' + (claudeOn() ? 1 : 0)); }

// ---- форматирование: десятичная запятая, единица отдельно ----
function dec(v, n) { return v.toFixed(n).replace('.', ','); }
function num(v) { return v < 10 ? dec(v, 1) : String(Math.round(v)); }
function rateParts(bps) { // байт/с -> [число, единица]
  var k = bps / 1024;
  if (k < 1000) return [String(Math.round(k)), 'КБ/с'];
  var m = k / 1024;
  return m < 1000 ? [num(m), 'МБ/с'] : [num(m / 1024), 'ГБ/с'];
}
function rateText(bps) { return rateParts(bps).join(' '); }
function sizeParts(bytes) {
  var g = bytes / 1073741824;
  if (g >= 1000) return [dec(g / 1024, 1), 'ТБ'];
  return g >= 1 ? [num(g), 'ГБ'] : [String(Math.round(bytes / 1048576)), 'МБ'];
}
function sizeText(bytes) { return sizeParts(bytes).join(' '); }
function gbParts(gb) { return gb >= 1000 ? [dec(gb / 1024, 1), 'ТБ'] : [String(Math.round(gb)), 'ГБ']; }
// Энергия: Вт·ч до тысячи, дальше кВт·ч; стоимость по тарифу за кВт·ч (0 = не показывать).
function whParts(wh) { return wh < 1000 ? [String(Math.round(wh)), 'Вт·ч'] : [dec(wh / 1000, wh < 10000 ? 2 : 1), 'кВт·ч']; }
function costText(wh) {
  if (!CFG.tariff) return '';
  var r = CFG.tariff * wh / 1000;
  return (r < 10 ? dec(r, 1) : String(Math.round(r))) + ' ₽';
}
function energyText(wh) { var c = costText(wh); return whParts(wh).join(' ') + (c ? ' · ' + c : ''); }
function uptimeText(sec) {
  var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? d + ' д ' + h + ' ч' : h ? h + ' ч ' + m + ' мин' : m + ' мин';
}
// Состояние по порогу: горячо за 5 до порога, тепло за 15.
function level(v, thr) { return v == null ? '' : v >= thr - 5 ? 'hot' : v >= thr - 15 ? 'warm' : ''; }
function pingLevel(ms) { return ms >= 100 ? 'hot' : ms >= 50 ? 'warm' : ''; }

function clockText(d) { return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: CFG.clockSec ? '2-digit' : undefined, hour12: !CFG.clock24 }); }

// ---- история для графиков и рекорды сессии ----
var HN = 60;
var HIST = { cpu: [], gpu: [], mem: [], down: [], up: [], pow: [] };
function pushHist(k, v) { var a = HIST[k]; a.push(v); if (a.length > HN) a.shift(); }
var REC = { cpuLoad: 0, cpuTemp: null, gpuLoad: 0, gpuTemp: null, mem: 0, down: 0, up: 0 };
function updateRecords(s) {
  var mx = function (k, v) { if (v != null && (REC[k] == null || v > REC[k])) REC[k] = v; };
  if (s.cpu) { mx('cpuLoad', s.cpu.load); mx('cpuTemp', s.cpu.temp); }
  if (s.gpu) { mx('gpuLoad', s.gpu.load); mx('gpuTemp', s.gpu.temp); }
  if (s.mem) mx('mem', s.mem.pct);
  if (s.net) { mx('down', s.net.down); mx('up', s.net.up); }
}

// ---- фокус-таймер: длительности (минуты) и состояние идущего отрезка ----
// focusRun: null — не начат; { ph: work|short|long, n: номер фокуса, start: отметка пуска (0 — пауза), done: прошло до паузы, мс }.
var FOCUS_DEF = { work: 25, short: 5, long: 15, cycles: 4, auto: false };
var FOCUS_LIM = { work: [1, 180], short: [1, 60], long: [1, 90], cycles: [1, 12] };
function focusCfg() { return CFG.focus || FOCUS_DEF; }
function mergeFocus(c, saved) {
  var f = saved.focus || {}, r = saved.focusRun;
  c.focus = { auto: f.auto === true };
  Object.keys(FOCUS_LIM).forEach(function (k) { var v = Math.round(Number(f[k])), l = FOCUS_LIM[k]; c.focus[k] = isFinite(v) && v >= l[0] && v <= l[1] ? v : FOCUS_DEF[k]; });
  c.focusRun = r && /^(work|short|long)$/.test(r.ph) && r.n >= 1 && r.n <= c.focus.cycles && r.start >= 0 && r.done >= 0 && r.start <= Date.now() + 60000 ?
    { ph: r.ph, n: Math.round(r.n), start: Number(r.start), done: Number(r.done) } : null;
}
