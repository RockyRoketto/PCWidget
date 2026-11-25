'use strict';
// Полный режим: сетка плиток. Правка на месте (все режимы): перетаскивание и крестик.
// Включается, пока в окне настроек открыта вкладка «Плитки».

var editing = false;   // включена правка плиток
var gridView = [];     // [{ row: [id, id], items: [{ id, b }] }]

function editButton() { return mk('<button class="ed" data-nodrag data-e="x" title="Скрыть">' + ICONS.hide + '</button>'); }
function emptyNote() { return mk('<div class="empty">Пусто. Правая кнопка мыши: «Изменить плитки»</div>'); }

// Раскладка: две видимые плитки ряда стоят рядом, одна растягивается. Высота в модулях 52px:
// плитки одного ряда (в Широкой — двух соседних рядов) тянутся до самой высокой, поэтому дыр нет.
var packSig = '';
function repack(root) {
  var cols = CFG.mode === 'wide' ? 4 : 2, units = [];
  gridView.forEach(function (r) {
    var vis = r.items.filter(function (x) { return !x.b.el.hidden; });
    if (!vis.length) return;
    units.push(vis);
  });
  // строки сетки: в Панели ряд, в Широкой два ряда рядом (последний одинокий — на всю ширину)
  // ряд из плиток в один модуль (пик, ПК включён) идёт отдельной строкой: рядом с высокими он бы растянулся
  var lines = [], cur = [];
  var thin = function (u) { return u.every(function (x) { return x.b.span && x.b.span() === 1; }); };
  units.forEach(function (u) {
    if (cols === 4 && thin(u)) { if (cur.length) lines.push(cur); lines.push([u]); cur = []; return; }
    cur.push(u);
    if (cur.length === cols / 2) { lines.push(cur); cur = []; }
  });
  if (cur.length) lines.push(cur);
  var sig = [];
  lines.forEach(function (ln, li) {
    var per = cols / ln.length; // колонок на ряд
    ln.forEach(function (u) { u.forEach(function (x) { x.b.el.classList.toggle('w2', per / u.length >= 2); }); });
    var h = 1;
    ln.forEach(function (u) { u.forEach(function (x) { h = Math.max(h, x.b.span ? x.b.span() : 2); }); });
    ln.forEach(function (u) {
      u.forEach(function (x) {
        var c = per / u.length, st = x.b.el.style;
        st.gridColumn = 'span ' + c; st.gridRow = 'span ' + h;
        x.b.el.classList.toggle('first', li === 0);
        sig.push(x.id + c + h);
      });
    });
  });
  sig = sig.join();
  if (sig === packSig) return false;
  packSig = sig;
  if (root) placeFills(root);
  return true;
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
  packSig = ''; repack(grid);
}

function buildFull() {
  var el = mk('<div class="full m-' + CFG.mode + (editing ? ' editing' : '') + '"><div class="grid"></div></div>'), grid = $('.grid', el);
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
  editEvents(el, '.tile', function (id) { setOn(CFG.mode, id, false); }, dropAt, function (id, d) { moveTile(id, d.to, d.how); }, function () { reflowFull(grid); });
  var each = function (f) { gridView.forEach(function (r) { r.items.forEach(f); }); };
  return {
    el: el,
    update: function (s) {
      each(function (x) { x.b.update(s); });
      if (repack(el)) each(function (x) { x.b.update(s); }); // ширина поменялась: перерисовать под неё
    },
    tick: function () { each(function (x) { if (x.b.tick) x.b.tick(); }); }
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
      return { id: t.getAttribute('data-id'), el: t, l: r.left, t: r.top, r: r.right, b: r.bottom, half: !!GRID_MODES[mode] && !t.classList.contains('w2') };
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
  // Направляющая: подсвечивает плитку-цель и показывает, как встанет перетаскиваемая (обмен, рядом, выше, ниже).
  var GUIDE = { swap: 'g-swap', before: 'g-t', after: 'g-b', left: 'g-l', right: 'g-r' };
  function guide(d) {
    $$(sel, el).forEach(function (t) { t.classList.toggle('g-swap', false); t.classList.toggle('g-t', false); t.classList.toggle('g-b', false); t.classList.toggle('g-l', false); t.classList.toggle('g-r', false); });
    if (!d) return;
    var how = d.how;
    if (mode === 'strip') how = how === 'before' ? 'left' : how === 'after' ? 'right' : how;
    var o = rects.filter(function (r) { return r.id === d.to; })[0];
    if (o && GUIDE[how]) o.el.classList.add(GUIDE[how]);
  }
  function consider() {
    clearTimeout(timer); timer = 0;
    if (!on || !ptr) return;
    var d = calc(rects, ptr.x, ptr.y, id);
    guide(d);
    if (!d) { pend = null; return; }
    var k = d.to + '/' + d.how, now = Date.now();
    if (!pend || pend.k !== k) pend = { k: k, t: now };
    var wait = Math.max(pend.t + DWELL - now, lockUntil - now);
    if (wait > 0) { timer = setTimeout(consider, wait); return; }
    pend = null;
    step(d);
    guide(null);
    lockUntil = Date.now() + COOL;
  }
  function clean() {
    clearTimeout(timer); guide(null);
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
    guide(null);
    if (d) step(d); // отпустил над новым местом, не дождавшись паузы
    n.style.transition = 'transform .15s ease, box-shadow .15s ease'; n.style.transform = '';
    setTimeout(function () { clean(); saveCfg(); layout(); }, 160);
  }
  el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
