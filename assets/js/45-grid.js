'use strict';
// Полный режим: сетка плиток, ручка с кнопками сверху, правка плиток на месте.

var editing = false;   // включена правка плиток
var gridView = [];     // [{ t: настройка плитки, b: построенная плитка }]
var LOOK_WIDE = { cpu: 1, gpu: 1, mem: 1, net: 1, disks: 1 }; // в виде «Строки» всегда во всю ширину

function isWide(t) { return t.w || ONLY_WIDE[t.id] || (CFG.look === 'rows' && LOOK_WIDE[t.id]); }

// Ширины плиток: узкая без пары растягивается. Вернёт список ширин (1 или 2) для видимых плиток.
function packSpans(wide) {
  var out = [];
  for (var i = 0; i < wide.length;) {
    if (!wide[i] && i + 1 < wide.length && !wide[i + 1]) { out.push(1, 1); i += 2; } else { out.push(2); i++; }
  }
  return out;
}
var packSig = '';
function repack() {
  var vis = gridView.filter(function (x) { return !x.b.el.hidden; }), sp = packSpans(vis.map(function (x) { return isWide(x.t); }));
  var sig = vis.map(function (x, i) { return x.t.id + sp[i]; }).join();
  if (sig === packSig) return;
  packSig = sig;
  vis.forEach(function (x, i) { x.b.el.classList.toggle('w2', sp[i] === 2); });
}

function buildFull() {
  var btn = function (a, ic, title) { return '<button data-a="' + a + '" title="' + title + '"' + (a === 'pin' && TOPMOST ? ' class="on"' : '') + '>' + ICONS[ic] + '</button>'; };
  var el = mk('<div class="full look-' + CFG.look + (editing ? ' editing' : '') + '">' +
    '<div class="handle"><div class="hbar" data-nodrag>' + btn('mini', 'mini', 'Компактный режим') + btn('edit', 'pen', 'Изменить плитки') + btn('pin', 'pin', 'Поверх всех окон') + btn('settings', 'gear', 'Настройки') + '</div></div>' +
    '<div class="editbar"><span>Тяни плитки, меняй ширину, скрывай</span><button class="btn" data-nodrag data-a="edit">Готово</button></div>' +
    '<div class="grid"></div><div class="tray" data-nodrag></div></div>');
  fillGrid(el);
  el.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var tl = b.closest('.tile'), t = tl && tileBy(tl.getAttribute('data-id')), d = b.dataset;
    if (d.e === 'w') t.w = !t.w;
    else if (d.e === 'x') t.on = false;
    else if (d.add) tileBy(d.add).on = true;
    else { if (d.a) action(d.a); return; }
    saveCfg(); layout();
  });
  el.addEventListener('pointerdown', function (e) {
    var tl = editing && !e.target.closest('button') && e.target.closest('.tile');
    if (tl) dragTile(el, tl, e);
  });
  return {
    el: el,
    update: function (s) { gridView.forEach(function (x) { x.b.update(s); }); repack(); }
  };
}

function fillGrid(el) {
  var grid = $('.grid', el);
  grid.innerHTML = ''; gridView = []; packSig = '';
  CFG.tiles.forEach(function (t) {
    if (!t.on) return;
    var b = TILE_BUILD[t.id](), canW = !ONLY_WIDE[t.id] && !(CFG.look === 'rows' && LOOK_WIDE[t.id]);
    b.el.setAttribute('data-id', t.id);
    if (editing) {
      b.el.setAttribute('data-nodrag', '');
      b.el.appendChild(mk('<div class="ed">' + (canW ? '<button data-e="w" title="Ширина">' + ICONS[t.w ? 'narrow' : 'wide'] + '</button>' : '') + '<button data-e="x" title="Скрыть">' + ICONS.hide + '</button></div>'));
    }
    gridView.push({ t: t, b: b }); grid.appendChild(b.el);
  });
  $('.tray', el).innerHTML = CFG.tiles.filter(function (t) { return !t.on; }).map(function (t) {
    return '<button class="chip" data-add="' + t.id + '">' + I('plus') + TILE_NAMES[t.id] + '</button>';
  }).join('');
  if (S) gridView.forEach(function (x) { x.b.update(S); });
  repack();
}

// Перетаскивание: плитка меняется местами с той, над которой курсор (у широких после её середины).
function dragTile(el, tl, e) {
  var id = tl.getAttribute('data-id');
  var mark = function () { var n = $('.tile[data-id=' + id + ']', el); if (n) n.classList.add('drag'); };
  e.preventDefault(); mark();
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события без захвата */ }
  var move = function (ev) {
    var o = document.elementFromPoint(ev.clientX, ev.clientY), to = o && o.closest ? o.closest('.tile') : null, toId = to && to.getAttribute('data-id');
    if (!toId || toId === id) return;
    var ids = CFG.tiles.map(function (t) { return t.id; }), fwd = ids.indexOf(toId) > ids.indexOf(id);
    var r = to.getBoundingClientRect(), mid = r.top + r.height / 2;
    if (to.classList.contains('w2') && (fwd ? ev.clientY < mid : ev.clientY > mid)) return;
    moveTile(id, toId, fwd); fillGrid(el); mark();
  };
  var up = function () {
    el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    saveCfg(); layout();
  };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
