'use strict';
// Общие состояние и хелперы. Файлы js/ склеиваются по алфавиту.

function $(s, r) { return (r || document).querySelector(s); }
function post(m) { window.chrome.webview.postMessage(m); }
function mk(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function num(v, d) { return v == null ? '' : v.toFixed(d || 0); }

var TILE_IDS = ['cpu', 'gpu', 'mem', 'net', 'disks', 'procs', 'records', 'uptime'];
var TILE_NAMES = { cpu: 'CPU', gpu: 'GPU', mem: 'Память', net: 'Сеть', disks: 'Диски', procs: 'Топ процессов', records: 'Рекорды сессии', uptime: 'Аптайм' };
var THEMES = { glass: 'Стекло', terminal: 'Ретро-терминал', minimal: 'Тёмный минимализм', neon: 'Неон' };

function defaults() {
  return {
    theme: 'glass', mode: 'full', compact: 'column',
    tiles: TILE_IDS.map(function (id) { return { id: id, on: true }; }),
    thr: { cpuTemp: 85, gpuTemp: 80, mem: 90, disk: 90 },
    notify: false
  };
}

var CFG = defaults();
var S = null;          // последний снимок от Go
var TOPMOST = false;

// Настройки из файла накладываются на значения по умолчанию, лишнее и битое отбрасывается.
function mergeCfg(saved) {
  var c = defaults();
  if (!saved || typeof saved !== 'object') return c;
  if (THEMES[saved.theme]) c.theme = saved.theme;
  if (saved.mode === 'full' || saved.mode === 'compact') c.mode = saved.mode;
  if (saved.compact === 'column' || saved.compact === 'strip') c.compact = saved.compact;
  if (Array.isArray(saved.tiles)) {
    var seen = {}, out = [];
    saved.tiles.forEach(function (t) {
      if (t && TILE_IDS.indexOf(t.id) >= 0 && !seen[t.id]) { seen[t.id] = 1; out.push({ id: t.id, on: t.on !== false }); }
    });
    TILE_IDS.forEach(function (id) { if (!seen[id]) out.push({ id: id, on: true }); });
    c.tiles = out;
  }
  if (saved.thr) Object.keys(c.thr).forEach(function (k) {
    var v = Number(saved.thr[k]); if (isFinite(v) && v > 0 && v <= 200) c.thr[k] = v;
  });
  c.notify = saved.notify === true;
  return c;
}
function saveCfg() { post('cfg:' + JSON.stringify(CFG)); }

// ---- форматирование ----
function rateParts(bps) { // байт/с -> [число, единица]
  if (bps >= 1048576) return [(bps / 1048576).toFixed(bps >= 10485760 ? 0 : 1), 'МБ/с'];
  if (bps >= 1024) return [(bps / 1024).toFixed(0), 'КБ/с'];
  return [Math.round(bps).toString(), 'Б/с'];
}
function rateText(bps) { var p = rateParts(bps); return p[0] + ' ' + p[1]; }
function sizeText(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(bytes >= 10737418240 ? 0 : 1) + ' ГБ';
  return (bytes / 1048576).toFixed(0) + ' МБ';
}
function uptimeText(sec) {
  var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return (d ? d + ' д ' : '') + h + ' ч ' + m + ' мин';
}

// ---- история для мини-графиков и рекорды сессии ----
var HN = 60;
var HIST = { cpu: [], gpu: [], down: [], up: [] };
function pushHist(k, v) { var a = HIST[k]; a.push(v); if (a.length > HN) a.shift(); }
var REC = { cpuLoad: 0, cpuTemp: null, gpuLoad: 0, gpuTemp: null, mem: 0, down: 0 };
function updateRecords(s) {
  var mx = function (o, k, v) { if (v != null && (o[k] == null || v > o[k])) o[k] = v; };
  if (s.cpu) { mx(REC, 'cpuLoad', s.cpu.load); mx(REC, 'cpuTemp', s.cpu.temp); }
  if (s.gpu) { mx(REC, 'gpuLoad', s.gpu.load); mx(REC, 'gpuTemp', s.gpu.temp); }
  if (s.mem) mx(REC, 'mem', s.mem.pct);
  if (s.net) mx(REC, 'down', s.net.down);
}

// SVG-график: точки 0..100 по оси Y (в процентах от max).
function sparkPoints(arr, max) {
  if (arr.length < 2) return '';
  var m = max || Math.max.apply(null, arr.concat([1]));
  var step = 100 / (HN - 1), x0 = 100 - (arr.length - 1) * step;
  return arr.map(function (v, i) { return (x0 + i * step).toFixed(1) + ',' + (30 - Math.min(v / m, 1) * 28 - 1).toFixed(1); }).join(' ');
}
