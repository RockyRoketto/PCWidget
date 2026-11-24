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

// Переставляет уже построенные плитки по модели (при перетаскивании).
function reflowFull(grid) {
  var by = {};
  gridView.forEach(function (r) { r.items.forEach(function (x) { by[x.id] = x; }); });
  gridView = [];
  CFG.rows.forEach(function (row) {
    var items = shownIn(row).map(function (id) { return by[id]; }).filter(Boolean);
    items.forEach(function (x) { grid.appendChild(x.b.el); });
    if (items.length) gridView.push({ items: items });
  });
  packSig = ''; repack();
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
  editEvents(el, '.tile', function (id) { setOn('full', id, false); }, dropAt, function (id, d) { moveTile(id, d.to, d.how); }, function () { reflowFull(grid); });
  return {
    el: el,
    update: function (s) { gridView.forEach(function (r) { r.items.forEach(function (x) { x.b.update(s); }); }); repack(); },
    tick: function () { gridView.forEach(function (r) { r.items.forEach(function (x) { if (x.b.tick) x.b.tick(); }); }); }
  };
}

// Правка: крестик скрывает; плитку можно взять и таскать: она идёт за мышью, остальные плавно расступаются.
// Порядок меняется сразу в модели (исходный запоминается), при отпускании сохраняется, при отмене возвращается.
function editEvents(el, sel, hide, calc, move, reflow) {
  if (!editing) return;
  el.addEventListener('click', function (e) {
    if (!e.target.closest('.ed')) return;
    hide(e.target.closest(sel).getAttribute('data-id'));
    saveCfg(); layout();
  });
  el.addEventListener('pointerdown', function (e) {
    var n = e.button === 0 && !e.target.closest('.ed') && e.target.closest(sel);
    if (n) dragTile(el, n, e, sel, calc, move, reflow);
  });
}

function dragTile(el, n, e, sel, calc, move, reflow) {
  var id = n.getAttribute('data-id'), x0 = e.clientX, y0 = e.clientY, on = false, z = CFG.scale / 100;
  var DWELL = 280, COOL = 380, timer = 0, pend = null, lockUntil = 0;
  var rects, gx = 0, gy = 0, ptr = null, snap = JSON.stringify([CFG.rows, CFG.mini]), mode = curMode();
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события без захвата */ }
  function model() { return JSON.stringify([CFG.rows, CFG.mini]); }
  // Места плиток по раскладке (без сдвигов от анимации).
  function measure() {
    var ts = $$(sel, el).filter(function (t) { return !t.hidden; }), keep = ts.map(function (t) { return t.style.transform; });
    ts.forEach(function (t) { t.style.transform = ''; });
    var out = ts.map(function (t) {
      var r = t.getBoundingClientRect();
      return { id: t.getAttribute('data-id'), el: t, l: r.left, t: r.top, r: r.right, b: r.bottom, half: mode === 'full' && !t.classList.contains('w2') };
    });
    ts.forEach(function (t, i) { t.style.transform = keep[i]; });
    return out;
  }
  function slot() { return rects.filter(function (o) { return o.id === id; })[0]; }
  function place() {
    var r = slot();
    if (r && ptr) n.style.transform = 'translate(' + (ptr.x - gx - r.l) / z + 'px,' + (ptr.y - gy - r.t) / z + 'px)';
  }
  function start() {
    on = true;
    rects = measure();
    var r = slot();
    gx = x0 - r.l; gy = y0 - r.t;
    n.classList.add('drag'); el.classList.add('dragging');
  }
  // Остальные плитки плавно уезжают на новые места.
  function step(d) {
    var before = model(), vis = {};
    rects.forEach(function (o) { var r = o.el.getBoundingClientRect(); vis[o.id] = { l: r.left, t: r.top }; });
    move(id, d);
    if (model() === before) return;
    reflow();
    rects = measure();
    rects.forEach(function (o) {
      if (o.id === id || !vis[o.id]) return;
      var dx = (vis[o.id].l - o.l) / z, dy = (vis[o.id].t - o.t) / z;
      if (!dx && !dy) return;
      o.el.style.transition = 'none';
      o.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    void el.offsetWidth;
    rects.forEach(function (o) {
      if (o.id === id) return;
      o.el.style.transition = 'transform .2s ease';
      o.el.style.transform = '';
    });
    place();
  }
  function onMove(ev) {
    if (!on) {
      if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
      start();
    }
    ptr = { x: ev.clientX, y: ev.clientY };
    place();
    consider();
  }
  // Перестановка только если курсор постоял над новым местом (DWELL) и после прошлой перестановки прошла пауза (COOL):
  // иначе плитки прыгают туда-сюда, пока едут из-под курсора.
  function consider() {
    clearTimeout(timer); timer = 0;
    if (!on || !ptr) return;
    var d = calc(rects, ptr.x, ptr.y, id);
    if (!d) { pend = null; return; }
    var k = d.to + '/' + d.how, now = Date.now();
    if (!pend || pend.k !== k) pend = { k: k, t: now };
    var wait = Math.max(pend.t + DWELL - now, lockUntil - now);
    if (wait > 0) { timer = setTimeout(consider, wait); return; }
    pend = null;
    step(d);
    lockUntil = Date.now() + COOL;
  }
  function clean() {
    clearTimeout(timer);
    $$(sel, el).forEach(function (t) { t.style.transform = ''; t.style.transition = ''; });
    n.classList.remove('drag'); el.classList.remove('dragging');
  }
  function end(ev) {
    clearTimeout(timer);
    el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
    if (!on) return;
    if (ev.type !== 'pointerup' || !el.isConnected) {
      var o = JSON.parse(snap); CFG.rows = o[0]; CFG.mini = o[1];
      if (el.isConnected) { clean(); layout(); }
      return;
    }
    var d = ptr && calc(rects, ptr.x, ptr.y, id);
    if (d) step(d); // отпустил над новым местом, не дождавшись паузы
    n.style.transition = 'transform .15s ease, box-shadow .15s ease'; n.style.transform = '';
    setTimeout(function () { clean(); saveCfg(); layout(); }, 160);
  }
  el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
