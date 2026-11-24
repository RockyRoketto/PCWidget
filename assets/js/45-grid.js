'use strict';
// Полный режим: сетка плиток. Правка на месте (все режимы): перетаскивание и крестик.
// Включается, пока в окне настроек открыта вкладка «Плитки».

var editing = false;   // включена правка плиток
var gridView = [];     // [{ row: [id, id], items: [{ id, b }] }]

function editButton() { return mk('<button class="ed" data-nodrag data-e="x" title="Скрыть">' + ICONS.hide + '</button>'); }
function emptyNote() { return mk('<div class="empty">Пусто. Правая кнопка мыши: «Изменить плитки»</div>'); }

// Ширины: две видимые плитки ряда стоят рядом, одна растягивается.
var packSig = '';
function repack() {
  var sig = gridView.map(function (r) {
    return r.items.filter(function (x) { return !x.b.el.hidden; }).map(function (x) { return x.id; }).join('+');
  }).join();
  if (sig === packSig) return;
  packSig = sig;
  gridView.forEach(function (r) {
    var vis = r.items.filter(function (x) { return !x.b.el.hidden; }), split = isSplit(vis.map(function (x) { return x.id; }));
    vis.forEach(function (x) { x.b.el.classList.toggle('w2', !split); });
  });
}

function buildFull() {
  var el = mk('<div class="full look-' + CFG.look + (editing ? ' editing' : '') + '"><div class="grid"></div></div>'), grid = $('.grid', el);
  gridView = []; packSig = '';
  CFG.rows.forEach(function (row) {
    var items = shownIn(row).map(function (id) {
      var b = TILE_BUILD[id]();
      b.el.setAttribute('data-id', id);
      if (editing) { b.el.setAttribute('data-nodrag', ''); b.el.appendChild(editButton()); }
      grid.appendChild(b.el);
      return { id: id, b: b };
    });
    if (items.length) gridView.push({ items: items });
  });
  if (!gridView.length) el.appendChild(emptyNote());
  repack();
  editEvents(el, '.tile', function (id) { setOn('full', id, false); }, dropAt, function (id, d) { moveTile(id, d.to, d.how); });
  return {
    el: el,
    update: function (s) { gridView.forEach(function (r) { r.items.forEach(function (x) { x.b.update(s); }); }); repack(); }
  };
}

// Правка: крестик скрывает, перетаскивание показывает, куда встанет плитка, и переносит её, когда отпустили.
// До этого ничего не двигается.
function editEvents(el, sel, hide, calc, move, strip) {
  if (!editing) return;
  el.addEventListener('click', function (e) {
    if (!e.target.closest('.ed')) return;
    hide(e.target.closest(sel).getAttribute('data-id'));
    saveCfg(); layout();
  });
  el.addEventListener('pointerdown', function (e) {
    var n = e.button === 0 && !e.target.closest('.ed') && e.target.closest(sel);
    if (n) dragTile(el, n, e, sel, calc, move, strip);
  });
}

function dragTile(el, n, e, sel, calc, move, strip) {
  var id = n.getAttribute('data-id'), x0 = e.clientX, y0 = e.clientY, on = false, drop = null, z = CFG.scale / 100;
  var mode = curMode(), mark, ghost, base = el.getBoundingClientRect(), rects;
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события без захвата */ }
  function start() {
    on = true;
    n.classList.add('drag'); el.classList.add('dragging');
    mark = mk('<div class="mark"></div>'); ghost = mk('<div class="dghost">' + I(CSPEC[id] && mode !== 'full' ? CSPEC[id].icon : id) + '</div>');
    el.appendChild(mark); el.appendChild(ghost);
    rects = $$(sel, el).filter(function (t) { return !t.hidden; }).map(function (t) {
      var r = t.getBoundingClientRect();
      return { id: t.getAttribute('data-id'), l: r.left, t: r.top, r: r.right, b: r.bottom, half: mode === 'full' && !t.classList.contains('w2') };
    });
  }
  function box(l, t, r, b) {
    mark.hidden = false;
    mark.style.cssText = 'left:' + (l - base.left) / z + 'px;top:' + (t - base.top) / z + 'px;width:' + (r - l) / z + 'px;height:' + (b - t) / z + 'px';
  }
  function show() {
    mark.hidden = true;
    if (!drop) return;
    var r = rects.filter(function (o) { return o.id === drop.to; })[0], g = 4 * z, mid = (r.l + r.r) / 2;
    var line = drop.how === 'before' || drop.how === 'after';
    mark.classList.toggle('line', line);
    if (strip) { var x = drop.how === 'before' ? r.l : r.r; box(x - 1.5 * z, r.t, x + 1.5 * z, r.b); }
    else if (line) {
      var y = drop.how === 'before' ? r.t - (mode === 'full' ? g : 0) : r.b + (mode === 'full' ? g : 0);
      var all = mode === 'full' ? [Math.min.apply(null, rects.map(function (o) { return o.l; })), Math.max.apply(null, rects.map(function (o) { return o.r; }))] : [r.l, r.r];
      box(all[0], y - 1.5 * z, all[1], y + 1.5 * z);
    } else box(drop.how === 'right' ? mid : r.l, r.t, drop.how === 'left' ? mid : r.r, r.b);
  }
  function onMove(ev) {
    if (!on) {
      if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
      start();
    }
    ghost.style.transform = 'translate(' + (ev.clientX - base.left) / z + 'px,' + (ev.clientY - base.top) / z + 'px) translate(-50%,-50%)';
    drop = calc(rects, ev.clientX, ev.clientY, id);
    show();
  }
  function end(ev) {
    el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
    if (!on) return;
    mark.remove(); ghost.remove(); n.classList.remove('drag'); el.classList.remove('dragging');
    if (ev.type !== 'pointerup' || !drop || !el.isConnected) return;
    move(id, drop); saveCfg(); layout();
  }
  el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
