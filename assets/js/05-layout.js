'use strict';
// Какие плитки видны и как они разложены (без DOM, общее для виджета и окна настроек).
// Полный режим: CFG.rows — ряды из одной или двух плиток, CFG.hide — скрытые плитки (место в рядах за ними остаётся).
// Колонка и полоска: свои списки CFG.mini.column и CFG.mini.strip: [{ id, on }].

var TILE_IDS = ['clock', 'weather', 'cpu', 'gpu', 'mem', 'net', 'disks', 'procs', 'records', 'uptime'];
var OPT_OFF = { clock: 1, weather: 1 };  // по умолчанию выключены
var ONLY_WIDE = { procs: 1 };            // рядом с другой не встаёт
var LOOK_WIDE = { cpu: 1, gpu: 1, mem: 1, net: 1, disks: 1 }; // в виде «Строки» всегда во всю ширину
var TILE_NAMES = { clock: 'Часы', weather: 'Погода', cpu: 'CPU', gpu: 'GPU', mem: 'Память', net: 'Сеть', disks: 'Диски', procs: 'Процессы', records: 'Пик за сессию', uptime: 'ПК включён' };
var MINI_IDS = ['clock', 'weather', 'cpu', 'gpu', 'mem', 'down', 'up', 'ping', 'disk', 'space', 'uptime'];
var MINI_OFF = { clock: 1, weather: 1, ping: 1, space: 1, uptime: 1 };
var MINI_NAMES = { clock: 'Часы', weather: 'Погода', cpu: 'CPU', gpu: 'GPU', mem: 'Память', down: 'Сеть: приём', up: 'Сеть: отдача', ping: 'Пинг', disk: 'Диски: скорость', space: 'Диск: занято места', uptime: 'ПК включён' };

function defaultRows() { return [['clock', 'weather'], ['cpu', 'gpu'], ['mem'], ['net'], ['disks'], ['procs'], ['records', 'uptime']]; }
function defaultMini() { return MINI_IDS.map(function (id) { return { id: id, on: !MINI_OFF[id] }; }); }

// Ряды из файла: лишнее и повторы отбрасываются, недостающие плитки встают своим рядом.
function cleanRows(rows) {
  var seen = {}, out = [];
  rows.forEach(function (row) {
    var r = (Array.isArray(row) ? row : []).filter(function (id) { return TILE_IDS.indexOf(id) >= 0 && !seen[id] && (seen[id] = 1); });
    if (r.length > 2 || r.some(function (id) { return ONLY_WIDE[id]; })) r.forEach(function (id) { out.push([id]); });
    else if (r.length) out.push(r);
  });
  TILE_IDS.forEach(function (id) {
    if (seen[id]) return;
    if (OPT_OFF[id]) out.unshift([id]); else out.push([id]);
  });
  return out;
}
// Настройки старой версии: список плиток с признаком «во всю ширину»; соседние узкие стояли парами.
function rowsFromTiles(tiles) {
  var rows = [], pair = null;
  tiles.forEach(function (t) {
    if (!t) return;
    var wide = typeof t.w === 'boolean' ? t.w : /^(mem|net|disks|procs)$/.test(t.id), on = t.on !== false;
    if (!on) rows.push([t.id]);
    else if (!wide && pair) { pair.push(t.id); pair = null; }
    else { var r = [t.id]; rows.push(r); pair = wide ? null : r; }
  });
  return rows;
}
function cleanMini(list) {
  var seen = {}, out = [];
  (Array.isArray(list) ? list : []).forEach(function (t) {
    if (t && MINI_IDS.indexOf(t.id) >= 0 && !seen[t.id]) { seen[t.id] = 1; out.push({ id: t.id, on: t.on === true }); }
  });
  if (!out.length) return defaultMini();
  MINI_IDS.forEach(function (id) { if (!seen[id]) out.push({ id: id, on: false }); });
  return out;
}
function mergeLayout(c, saved) {
  if (Array.isArray(saved.rows)) {
    c.rows = cleanRows(saved.rows); c.hide = {};
    TILE_IDS.forEach(function (id) { if (saved.hide && saved.hide[id]) c.hide[id] = 1; });
  } else if (Array.isArray(saved.tiles)) {
    c.rows = cleanRows(rowsFromTiles(saved.tiles));
    c.hide = { clock: 1, weather: 1 };
    saved.tiles.forEach(function (t) { if (t && TILE_IDS.indexOf(t.id) >= 0) { if (t.on === false) c.hide[t.id] = 1; else delete c.hide[t.id]; } });
  }
  if (saved.mini) ['column', 'strip'].forEach(function (m) { c.mini[m] = cleanMini(saved.mini[m]); });
}

// ---- текущий режим ----
function curMode() { return CFG.mode === 'full' ? 'full' : CFG.compact; }
function setMode(m) { if (m === 'full') CFG.mode = 'full'; else if (m === 'column' || m === 'strip') { CFG.mode = 'compact'; CFG.compact = m; } }
function miniBy(list, id) { return list.filter(function (t) { return t.id === id; })[0]; }
function modeIds(m) { return m === 'full' ? TILE_IDS : MINI_IDS; }
function tileName(m, id) { return (m === 'full' ? TILE_NAMES : MINI_NAMES)[id]; }
function isOn(m, id) { return m === 'full' ? !CFG.hide[id] : miniBy(CFG.mini[m], id).on; }
function setOn(m, id, on) {
  if (m !== 'full') miniBy(CFG.mini[m], id).on = on;
  else if (on) delete CFG.hide[id];
  else CFG.hide[id] = 1;
}
function resetTiles(m) {
  var d = defaults();
  if (m === 'full') { CFG.rows = d.rows; CFG.hide = d.hide; } else CFG.mini[m] = d.mini[m];
}

// ---- раскладка полного режима ----
function alwaysWide(id) { return !!(ONLY_WIDE[id] || (CFG.look === 'rows' && LOOK_WIDE[id])); }
function canPair(a, b) { return !alwaysWide(a) && !alwaysWide(b); }
// Стоят ли видимые плитки ряда рядом (иначе каждая во всю ширину).
function isSplit(ids) { return ids.length === 2 && canPair(ids[0], ids[1]); }
function rowOf(id) { return CFG.rows.filter(function (r) { return r.indexOf(id) >= 0; })[0]; }
function shownIn(row) { return row.filter(function (id) { return !CFG.hide[id]; }); }

// Перенос плитки: how = before | after (своим рядом), left | right (рядом с to), swap (поменяться местами).
function moveTile(id, to, how) {
  var a = rowOf(id), b = rowOf(to), i;
  if (id === to) return;
  if (how === 'swap') {
    var ia = a.indexOf(id), ib = b.indexOf(to);
    a[ia] = to; b[ib] = id;
    return;
  }
  var split = isSplit(shownIn(b));
  a.splice(a.indexOf(id), 1);
  if (how === 'left' || how === 'right') {
    var rest = b.filter(function (x) { return x !== to; }); // скрытая соседка уступает место
    var pair = how === 'left' ? [id, to] : [to, id];
    i = CFG.rows.indexOf(b);
    CFG.rows.splice.apply(CFG.rows, [i, 1, pair].concat(rest.map(function (x) { return [x]; })));
  } else {
    i = CFG.rows.indexOf(b);
    var k = b.indexOf(to) + (how === 'after' ? 1 : 0);
    if (split || b.length < 2 || k === 0 || k === b.length) CFG.rows.splice(i + (how === 'after' ? 1 : 0), 0, [id]);
    else CFG.rows.splice(i, 1, b.slice(0, k), [id], b.slice(k)); // ряд показан столбиком: встаём между
  }
  CFG.rows = CFG.rows.filter(function (r) { return r.length; });
}
function moveMini(m, id, to, after) {
  var a = CFG.mini[m], t = miniBy(a, id);
  if (id === to) return;
  a.splice(a.indexOf(t), 1);
  a.splice(a.indexOf(miniBy(a, to)) + (after ? 1 : 0), 0, t);
}

// Куда встанет плитка id, если отпустить её в точке. rects: [{ id, l, t, r, b, half }] видимых плиток.
// Середина узкой плитки: обмен; край широкой (по бокам): встать рядом; верх или низ: своим рядом.
function dropAt(rects, x, y, id) {
  var best = null, bd = Infinity;
  rects.forEach(function (r) {
    var dx = Math.max(r.l - x, 0, x - r.r), dy = Math.max(r.t - y, 0, y - r.b), d = dx * dx + dy * dy * 4;
    if (d < bd) { bd = d; best = r; }
  });
  if (!best || best.id === id) return null;
  var u = (x - best.l) / (best.r - best.l), v = (y - best.t) / (best.b - best.t), mate = best.half && rowOf(best.id).filter(function (o) { return o !== best.id && !CFG.hide[o]; })[0];
  var vert = v < .5 ? 'before' : 'after';
  if (best.half) {
    var fits = mate === id || !mate || canPair(id, mate);
    return { to: best.id, how: fits && v > .22 && v < .78 ? 'swap' : vert };
  }
  if (canPair(id, best.id) && (u < .3 || u > .7)) return { to: best.id, how: u < .5 ? 'left' : 'right' };
  return { to: best.id, how: vert };
}
// То же для колонки и полоски: до или после ближайшей.
function dropMini(rects, x, y, id, strip) {
  var best = null, bd = Infinity;
  rects.forEach(function (r) {
    var d = strip ? Math.abs((r.l + r.r) / 2 - x) : Math.abs((r.t + r.b) / 2 - y);
    if (d < bd) { bd = d; best = r; }
  });
  if (!best || best.id === id) return null;
  return { to: best.id, how: (strip ? x < (best.l + best.r) / 2 : y < (best.t + best.b) / 2) ? 'before' : 'after' };
}

CFG = defaults();
