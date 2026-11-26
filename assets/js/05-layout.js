'use strict';
// Какие плитки видны и как они разложены (без DOM, общее для виджета и окна настроек).
// Полный режим: CFG.rows — ряды из одной или двух плиток, CFG.hide — скрытые плитки (место в рядах за ними остаётся).
// Колонка и полоска: свои списки CFG.mini.column и CFG.mini.strip: [{ id, on }].
// GAP в ряду — пустая половина: плитку оттащили к краю, и она стала короткой.
// CFG.thin — плитки высотой в один модуль (тонкие); тонкой плитка видна, только если соседка по ряду тоже в модуль.

var TILE_IDS = ['clock', 'weather', 'calendar', 'cpu', 'gpu', 'mem', 'net', 'disks', 'claude', 'procs', 'records', 'uptime'];
var GAP = '_';
var THIN_OK = { cpu: 1, gpu: 1, mem: 1, net: 1, claude: 1 };
var OPT_OFF = { clock: 1, weather: 1, calendar: 1, claude: 1 };  // по умолчанию выключены
var TILE_NAMES = { clock: 'Часы', weather: 'Погода', calendar: 'Календарь', cpu: 'CPU', gpu: 'GPU', mem: 'Память', net: 'Сеть', disks: 'Диски', claude: 'Claude', procs: 'Процессы', records: 'Пик за сессию', uptime: 'ПК включён' };
var MINI_IDS = ['clock', 'weather', 'calendar', 'cpu', 'gpu', 'mem', 'down', 'up', 'ping', 'disk', 'space', 'claude', 'claudew', 'uptime'];
var MINI_OFF = { clock: 1, weather: 1, calendar: 1, ping: 1, space: 1, claude: 1, claudew: 1, uptime: 1 };
var SQUARE_ON = { cpu: 1, gpu: 1, mem: 1, down: 1 }; // квадрат 2x2
var MINI_NAMES = { clock: 'Часы', weather: 'Погода', calendar: 'Календарь', cpu: 'CPU', gpu: 'GPU', mem: 'Память', down: 'Приём', up: 'Отдача', ping: 'Пинг', disk: 'Диски: обмен', space: 'Место', claude: 'Claude, 5 ч', claudew: 'Claude, нед.', uptime: 'ПК включён' };

var MINI_TINT = { down: 'net', up: 'net', ping: 'net', disk: 'disks', space: 'disks', claudew: 'claude' }; // строка колонки -> плитка
function colorKey(id) { return MINI_TINT[id] || id; }

function defaultRows() { return [['clock', 'weather'], ['calendar'], ['cpu', 'gpu'], ['mem'], ['net'], ['disks'], ['claude'], ['procs'], ['records', 'uptime']]; }
function defaultHide() { var h = {}; Object.keys(OPT_OFF).forEach(function (id) { h[id] = 1; }); return h; }
function defaultMini(m) { return MINI_IDS.map(function (id) { return { id: id, on: m === 'square' ? !!SQUARE_ON[id] : !MINI_OFF[id] }; }); }

// Ряды из файла: лишнее и повторы отбрасываются, недостающие плитки встают своим рядом.
function cleanRows(rows) {
  var seen = {}, out = [];
  rows.forEach(function (row) {
    var r = (Array.isArray(row) ? row : []).filter(function (id) { return id === GAP || (TILE_IDS.indexOf(id) >= 0 && !seen[id] && (seen[id] = 1)); });
    var real = r.filter(function (id) { return id !== GAP; });
    if (r.length > 2 || (r.length === 2 && !real.length)) real.forEach(function (id) { out.push([id]); });
    else if (real.length) out.push(r);
  });
  TILE_IDS.forEach(function (id) {
    if (seen[id]) return;
    if (OPT_OFF[id] && id !== 'claude') out.unshift([id]); else out.push([id]);
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
function cleanMini(list, m) {
  var seen = {}, out = [];
  (Array.isArray(list) ? list : []).forEach(function (t) {
    if (t && MINI_IDS.indexOf(t.id) >= 0 && !seen[t.id]) { seen[t.id] = 1; out.push({ id: t.id, on: t.on === true }); }
  });
  if (!out.length) return defaultMini(m);
  MINI_IDS.forEach(function (id) { if (!seen[id]) out.push({ id: id, on: false }); });
  return out;
}
function mergeLayout(c, saved) {
  if (Array.isArray(saved.rows)) {
    var known = JSON.stringify(saved.rows);
    c.rows = cleanRows(saved.rows); c.hide = {};
    TILE_IDS.forEach(function (id) { // плитка новее файла настроек: необязательная остаётся выключенной
      if ((saved.hide && saved.hide[id]) || (OPT_OFF[id] && known.indexOf('"' + id + '"') < 0)) c.hide[id] = 1;
    });
  } else if (Array.isArray(saved.tiles)) {
    c.rows = cleanRows(rowsFromTiles(saved.tiles));
    c.hide = defaultHide();
    saved.tiles.forEach(function (t) { if (t && TILE_IDS.indexOf(t.id) >= 0) { if (t.on === false) c.hide[t.id] = 1; else delete c.hide[t.id]; } });
  }
  if (saved.mini) ['column', 'strip', 'square'].forEach(function (m) { if (saved.mini[m]) c.mini[m] = cleanMini(saved.mini[m], m); });
}

// ---- текущий режим ----
// Панель и Широкая собраны из одних плиток (общие ряды и скрытые), у компактных режимов свои списки.
function curMode() { return CFG.mode; }
function setMode(m) { if (MODES[m]) CFG.mode = m; }
function miniBy(list, id) { return list.filter(function (t) { return t.id === id; })[0]; }
function modeIds(m) { return GRID_MODES[m] ? TILE_IDS : MINI_IDS; }
function tileName(m, id) { return (GRID_MODES[m] ? TILE_NAMES : MINI_NAMES)[id]; }
function isOn(m, id) { return GRID_MODES[m] ? !CFG.hide[id] : miniBy(CFG.mini[m], id).on; }
function setOn(m, id, on) {
  if (!GRID_MODES[m]) miniBy(CFG.mini[m], id).on = on;
  else if (on) delete CFG.hide[id];
  else CFG.hide[id] = 1;
}
function resetTiles(m) {
  var d = defaults();
  if (GRID_MODES[m]) { CFG.rows = d.rows; CFG.hide = d.hide; } else CFG.mini[m] = d.mini[m];
}

// ---- раскладка полного режима ----
function canPair() { return true; }
// Стоят ли видимые плитки ряда рядом (иначе каждая во всю ширину).
function isSplit(ids) { return ids.length === 2 && canPair(ids[0], ids[1]); }
function rowOf(id) { return CFG.rows.filter(function (r) { return r.indexOf(id) >= 0; })[0]; }
// Видимые в ряду, вместе с пустой половиной; ряд из одной пустоты не виден.
function shownIn(row) {
  var r = row.filter(function (id) { return !CFG.hide[id]; });
  return r.some(function (id) { return id !== GAP; }) ? r : [];
}
// Пустая половина на виджете: data-id «_» и номер ряда.
function isGap(id) { return id.charAt(0) === GAP; }
function rowAt(id) { return isGap(id) ? CFG.rows[+id.slice(1)] : rowOf(id); }

// Перенос плитки: how = before | after (своим рядом), left | right (рядом с to), swap (поменяться местами),
// edgeL | edgeR (к краю своего ряда: короткая, рядом пусто). to может быть пустой половиной (_N).
function moveTile(id, to, how) {
  var a = rowOf(id), b = rowAt(to), i;
  if (how === 'edgeL' || how === 'edgeR') {
    var rest = a.filter(function (x) { return x !== id && x !== GAP; });
    i = CFG.rows.indexOf(a);
    CFG.rows.splice.apply(CFG.rows, [i, 1, how === 'edgeL' ? [id, GAP] : [GAP, id]].concat(rest.map(function (x) { return [x]; })));
    return;
  }
  if (id === to || !b) return;
  if (isGap(to) && how === 'swap') { // в пустую половину: в своём ряду — на другую сторону, из чужого — занять её
    if (a === b) a.reverse();
    else { a.splice(a.indexOf(id), 1); b[b.indexOf(GAP)] = id; }
    CFG.rows = CFG.rows.filter(hasReal);
    return;
  }
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
    if (isGap(to) || split || b.length < 2 || k === 0 || k === b.length) CFG.rows.splice(i + (how === 'after' ? 1 : 0), 0, [id]);
    else CFG.rows.splice(i, 1, b.slice(0, k), [id], b.slice(k)); // ряд показан столбиком: встаём между
  }
  CFG.rows = CFG.rows.filter(hasReal);
}
function hasReal(r) { return r.some(function (x) { return x !== GAP; }); }
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
  if (!best) return null;
  var u = (x - best.l) / (best.r - best.l), v = (y - best.t) / (best.b - best.t);
  if (best.id === id) return !best.half && (u < .2 || u > .8) ? { to: id, how: u < .5 ? 'edgeL' : 'edgeR' } : null; // своя длинная: к краю
  var mate = best.half && rowAt(best.id).filter(function (o) { return o !== best.id && !CFG.hide[o]; })[0];
  if (isGap(best.id)) return { to: best.id, how: v > .22 && v < .78 ? 'swap' : v < .5 ? 'before' : 'after' };
  var vert = v < .5 ? 'before' : 'after';
  if (best.half) {
    var fits = mate === id || !mate || mate === GAP || canPair(id, mate);
    return { to: best.id, how: fits && v > .22 && v < .78 ? 'swap' : vert };
  }
  if (canPair(id, best.id) && (u < .3 || u > .7)) return { to: best.id, how: u < .5 ? 'left' : 'right' };
  return { to: best.id, how: vert };
}
// То же для колонки, полоски и квадрата: до или после ближайшей.
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
