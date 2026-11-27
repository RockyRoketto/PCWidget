'use strict';
// Карточка по наведению. Мышь задержалась на плитке на 0,5 с (список плиток — HV_IDS, остальные в 96-hvcards.js) —
// рядом открывается карточка: график за 10 минут или за час, минимум, среднее, максимум, порог температуры.
// История копится здесь: 600 точек по секунде и 360 средних по 10 с (с минимумом и максимумом внутри).
// Карточку показывает отдельное окно (hist_windows.go): разметка уходит в Go сообщением hist:.

var HV_FINE = 600, HV_STEP = 10, HV_COARSE = 360;
var HV_GET = {
  cpu: function (s) { return s.cpu && s.cpu.load; }, cpuT: function (s) { return s.cpu && s.cpu.temp; },
  gpu: function (s) { return s.gpu && s.gpu.load; }, gpuT: function (s) { return s.gpu && s.gpu.temp; },
  mem: function (s) { return s.mem && s.mem.pct; },
  down: function (s) { return s.net && s.net.down; }, up: function (s) { return s.net && s.net.up; },
  pow: function (s) { return s.energy && s.energy.power; }
};
var HSER = {};
Object.keys(HV_GET).forEach(function (k) { HSER[k] = { f: [], c: [], sum: 0, n: 0, lo: null, hi: null, k: 0 }; });

function hvPush(k, v) {
  var s = HSER[k];
  if (v == null || !isFinite(v)) v = null;
  s.f.push(v); if (s.f.length > HV_FINE) s.f.shift();
  if (v != null) { s.sum += v; s.n++; s.lo = s.lo == null ? v : Math.min(s.lo, v); s.hi = s.hi == null ? v : Math.max(s.hi, v); }
  if (++s.k === HV_STEP) {
    s.c.push(s.n ? [s.sum / s.n, s.lo, s.hi] : null); if (s.c.length > HV_COARSE) s.c.shift();
    s.sum = s.n = s.k = 0; s.lo = s.hi = null;
  }
}
// Снимок раз в секунду. Пропуск (сон, зависание) заполняется пустыми точками, чтобы шкала времени не врала.
var hvLast = 0;
function hvAdd(s, now) {
  var miss = hvLast ? Math.min(Math.round((now - hvLast) / 1000) - 1, HV_COARSE * HV_STEP) : 0;
  hvLast = now;
  Object.keys(HV_GET).forEach(function (k) {
    for (var i = 0; i < miss; i++) hvPush(k, null);
    hvPush(k, HV_GET[k](s));
  });
}
// Ряд за период: n точек [среднее, мин, макс] или null, новые справа; недостающее слева пусто.
function hvSeries(k, range) {
  var s = HSER[k], a;
  if (range === '1h') {
    a = s.c.slice();
    if (s.n) a.push([s.sum / s.n, s.lo, s.hi]); // текущие неполные 10 с
    a = a.slice(-HV_COARSE);
  } else a = s.f.map(function (v) { return v == null ? null : [v, v, v]; });
  var n = range === '1h' ? HV_COARSE : HV_FINE;
  while (a.length < n) a.unshift(null);
  return a;
}
function hvStats(a) {
  var lo = null, hi = null, sum = 0, n = 0;
  a.forEach(function (p) {
    if (!p) return;
    sum += p[0]; n++;
    lo = lo == null ? p[1] : Math.min(lo, p[1]); hi = hi == null ? p[2] : Math.max(hi, p[2]);
  });
  return n ? { lo: lo, avg: sum / n, hi: hi } : null;
}
// Сжимает ряд до m столбцов: среднее средних, пустой столбец — null.
function hvBucket(a, m) {
  var out = [], per = a.length / m;
  for (var i = 0; i < m; i++) {
    var sum = 0, n = 0;
    for (var j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) if (a[j]) { sum += a[j][0]; n++; }
    out.push(n ? sum / n : null);
  }
  return out;
}
function niceUp(v) {
  var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// ---- что показывает карточка каждой плитки ----
var hvPct = function (v) { return Math.round(v) + '%'; };
var hvDeg = function (v) { return Math.round(v) + '°'; };
var hvW = function (v) { return Math.round(v) + ' Вт'; };
function hvTempPart(k, thrKey) {
  return { k: k, name: 'Температура', fmt: hvDeg, thr: function () { return CFG.thr[thrKey]; },
    scale: function (st, thr) { return [Math.max(0, Math.floor((st.lo - 10) / 10) * 10), Math.ceil(Math.max(thr + 5, st.hi + 3) / 10) * 10]; } };
}
var hvLoad = { name: 'Загрузка', fmt: hvPct, scale: function () { return [0, 100]; } };
function hvRate(k, name) { return { k: k, name: name, fmt: rateText, scale: function (st) { return [0, niceUp(Math.max(st.hi, 102400))]; } }; }
var HV_CARDS = {
  cpu: { name: 'CPU', parts: [Object.assign({ k: 'cpu' }, hvLoad), hvTempPart('cpuT', 'cpuTemp')] },
  gpu: { name: 'GPU', parts: [Object.assign({ k: 'gpu' }, hvLoad), hvTempPart('gpuT', 'gpuTemp')] },
  mem: { name: 'Память', parts: [{ k: 'mem', name: 'Занято', fmt: hvPct, thr: function () { return CFG.thr.mem; }, scale: function () { return [0, 100]; } }] },
  net: { name: 'Сеть', parts: [hvRate('down', 'Приём'), hvRate('up', 'Отдача')] },
  energy: { name: 'Энергия', parts: [{ k: 'pow', name: 'Мощность', fmt: hvW, scale: function (st) { return [0, Math.max(50, Math.ceil(st.hi / 50) * 50)]; } }] }
};
var HV_IDS = { cpu: 'cpu', gpu: 'gpu', mem: 'mem', net: 'net', energy: 'energy', down: 'net', up: 'net' };
var HV_RANGES = { '10m': '10 мин', '1h': 'Час' };

// ---- график в материале темы. Поле 240×64: Лист — линия, Заливка — рельеф, Прибор — столбики, ЖК — сегменты ----
var HV_W = 240, HV_H = 64;
function hvChart(a, lo, hi, thr) {
  var t = CFG.theme, y = function (v) { return HV_H - clamp((v - lo) / (hi - lo), 0, 1) * (HV_H - 2); };
  var lv = function (v) { return thr == null ? '' : level(v, thr); };
  var body = '';
  var seg = t === 'lcd' || t === 'pixel';
  if (t === 'gauge' || seg) {
    var n = seg ? 48 : 60, st = HV_W / n, bw = seg ? st - 1 : st - 1.2, b = hvBucket(a, n);
    b.forEach(function (v, i) {
      var x = (i * st).toFixed(1);
      if (seg) { // 8 сегментов в столбике, несветящиеся видны бледно; у «Пикселей» цвет блока по высоте
        var on = v == null ? 0 : Math.max(1, Math.round(clamp((v - lo) / (hi - lo), 0, 1) * 8)), cls = v == null ? '' : lv(v);
        for (var s = 0; s < 8; s++) body += '<rect class="' + (s < on ? 'on ' + (t === 'pixel' ? 'b' + PX_BANDS[s] + ' ' : '') + cls : 'off') + '" x="' + x + '" y="' + (HV_H - (s + 1) * 8 + 1) + '" width="' + bw.toFixed(1) + '" height="6.5"/>';
      } else if (v != null) {
        var top = Math.min(y(v), HV_H - 1.5);
        body += '<rect class="cl ' + lv(v) + '" x="' + x + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (HV_H - top).toFixed(1) + '"/>';
      }
    });
  } else {
    var m = 120, sx = HV_W / (m - 1), pts = hvBucket(a, m), line = '', area = '', run = [];
    var flush = function () {
      if (run.length === 1) run = [[run[0][0] - sx / 2, run[0][1]], [run[0][0] + sx / 2, run[0][1]]]; // одна точка — короткий штрих
      if (run.length) {
        var d = 'M' + run.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L');
        line += d; area += d + 'L' + run[run.length - 1][0].toFixed(1) + ',' + HV_H + 'L' + run[0][0].toFixed(1) + ',' + HV_H + 'Z';
      }
      run = [];
    };
    pts.forEach(function (v, i) { if (v == null) flush(); else run.push([i * sx, y(v)]); });
    flush();
    if (t === 'fill') {
      var c = palStops();
      body = '<defs><linearGradient id="hvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset=".48" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></linearGradient></defs>' +
        '<path class="ar" style="fill:url(#hvg)" d="' + area + '"/>';
    } else body = '<path class="ar" d="' + area + '"/><path class="ln" d="' + line + '"/>';
  }
  return '<svg class="hc-g" viewBox="0 0 ' + HV_W + ' ' + HV_H + '" preserveAspectRatio="none" aria-hidden="true">' + body + '</svg>';
}

function hvPart(p, range) {
  var a = hvSeries(p.k, range), st = hvStats(a);
  if (!st) return '';
  var thr = p.thr ? p.thr() : null, sc = p.scale(st, thr), cur = HSER[p.k].f[HSER[p.k].f.length - 1];
  var f = function (v) { return segs(esc(p.fmt(v))); }, lvOf = function (v) { return thr == null ? '' : level(v, thr); };
  // только название, максимум за период, значение сейчас и сам график
  return '<div class="hc-s"><div class="hc-tt"><span class="hc-n">' + p.name + ' <small>макс <span class="num ' + lvOf(st.hi) + '">' + f(st.hi) + '</span></small></span>' +
    (cur != null ? '<span class="num hc-v ' + lvOf(cur) + '">' + f(cur) + '</span>' : '') + '</div>' +
    '<div class="hc-ch">' + hvChart(a, sc[0], sc[1], thr) + '</div></div>';
}

function hvCardHTML(id, range, tint) {
  var c = HV_CARDS[id], parts = c.parts.map(function (p) { return hvPart(p, range); }).join('');
  var more = c.more && S ? c.more(S) : ''; // блоки без графика (96-hvcards.js)
  if (!parts && !more) return '';
  var seg = parts ? '<span class="hc-seg">' + Object.keys(HV_RANGES).map(function (r) { return '<button data-r="' + r + '" class="' + (r === range ? 'on' : '') + '">' + HV_RANGES[r] + '</button>'; }).join('') + '</span>' : '';
  var name = typeof c.name === 'function' ? c.name(S || {}) : c.name;
  return '<div class="hc"' + (tint ? ' style="--a:' + tint + '"' : '') + '><div class="hc-hd"><b class="hc-nm">' + name + '</b>' + seg + '</div>' + parts + more + '</div>';
}

// ---- наведение ----
var HV_ON = false; // карточки по наведению пока выключены; история копится дальше
var HV_DELAY = 500, HV_KEEP = 450;
var hv = { el: null, id: null, timer: 0, hideT: 0, open: null, over: false, range: '10m', block: null, sent: '' };

function hvTarget(t) {
  var el = t && t.closest ? t.closest('[data-id]') : null;
  var id = el && rootEl.contains(el) ? HV_IDS[el.getAttribute('data-id')] : null;
  return id ? { id: id, el: el } : null;
}
function hvAt(t) {
  if (!HV_ON || editing || !dataReady) t = null;
  var el = t ? t.el : null;
  if (el === hv.el) return;
  hv.el = el; hv.id = t && t.id;
  if (el !== hv.block) hv.block = null; // нажали на плитку: до ухода с неё карточка не появится
  clearTimeout(hv.timer);
  if (!el || hv.block) { hvSoonHide(); return; }
  clearTimeout(hv.hideT);
  hv.timer = setTimeout(function () { hv.open = { el: el, id: t.id, key: el.getAttribute('data-id') }; hvSend(); }, HV_DELAY);
}
function hvSoonHide() {
  clearTimeout(hv.hideT);
  hv.hideT = setTimeout(function () { if (!hv.over && !hv.el) hvHide(); }, HV_KEEP);
}
function hvHide() {
  clearTimeout(hv.timer);
  hv.over = false;
  if (!hv.open) return;
  hv.open = null; hv.sent = '';
  post('hist:');
}
function hvSend() {
  var o = hv.open;
  if (!o) return;
  if (!o.el.isConnected) o.el = $('[data-id="' + o.key + '"]', rootEl); // виджет перестроился
  if (editing || !o.el || o.el.offsetParent === null) { hvHide(); return; }
  var tint = CFG.tileColors[colorKey(o.key)], html = hvCardHTML(o.id, hv.range, tint ? fitColor(tint) : '');
  if (!html) { hvHide(); return; }
  var r = o.el.getBoundingClientRect();
  var msg = JSON.stringify({ html: html, theme: styleKey(), cls: bodyClass(), vars: themeVars(), scale: CFG.scale, tile: [r.left, r.top, r.width, r.height] });
  if (msg !== hv.sent) { hv.sent = msg; post('hist:' + msg); }
}

document.addEventListener('mouseover', function (e) { hvAt(hvTarget(e.target)); });
document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) hvAt(null); });
// Нажатие (перетаскивание окна или плитки) и меню прячут карточку сразу.
document.addEventListener('mousedown', function () { hv.block = hv.el; hvHide(); }, true);
document.addEventListener('contextmenu', function () { hv.block = hv.el; hvHide(); }, true);

// Вызовы из Go: переключатель в карточке и мышь над ней.
window.__histRange = function (r) { if (HV_RANGES[r]) { hv.range = r; hvSend(); } };
window.__histOver = function (v) {
  hv.over = !!v;
  if (v) clearTimeout(hv.hideT); else if (!hv.el) hvSoonHide();
};

// Каждый снимок от Go: в историю и в открытую карточку.
(function () {
  var base = window.__stats;
  window.__stats = function (s) {
    hvAdd(s, Date.now());
    base(s);
    if (hv.open) hvSend();
  };
})();
