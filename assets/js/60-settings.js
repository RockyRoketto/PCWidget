'use strict';
// Панель настроек рядом с виджетом. Всё применяется сразу, виджет виден и меняется на глазах.

function toggle(key, on, label) {
  return '<span class="sw"><input type="checkbox" data-k="' + key + '" aria-label="' + label + '"' + (on ? ' checked' : '') + '><i></i></span>';
}
function segment(key, opts, cur) {
  return '<div class="seg">' + opts.map(function (o) { return '<button data-k="' + key + '" data-v="' + o[0] + '" class="' + (String(o[0]) === String(cur) ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
}
function setRow(title, note, right) { return '<div class="row"><div class="g">' + title + (note ? '<small>' + note + '</small>' : '') + '</div>' + right + '</div>'; }
function label(text, val) { return '<div class="lab">' + text + (val ? '<b data-val>' + val + '</b>' : '') + '</div>'; }
function ghost(act, text) { return '<button class="btn ghost" data-sys="' + act + '">' + text + '</button>'; }
function zonePos(v) { return clamp((v - 50) * 2, 0, 100); } // шкала порогов 50..100

// ключ порога -> цвет показателя, подпись, единица, значение сейчас
var THR_ROWS = {
  cpuTemp: ['cpu', 'Температура CPU', '°', function (s) { return s.cpu && s.cpu.temp; }],
  gpuTemp: ['gpu', 'Температура GPU', '°', function (s) { return s.gpu && s.gpu.temp; }],
  mem: ['mem', 'Память занята', '%', function (s) { return s.mem && s.mem.pct; }],
  disk: ['disks', 'Диск заполнен', '%', function (s) { return s.disks && s.disks.length ? Math.max.apply(null, s.disks.map(function (d) { return d.usedPct; })) : null; }]
};
var SET_TABS = { look: ['look', 'Вид'], tiles: ['tiles', 'Плитки'], alarm: ['bell', 'Тревоги'], sys: ['sys', 'Система'] };
var TILE_OPTS = {
  clock: function () {
    return '<label class="ol">24-часовой формат' + toggle('clock24', CFG.clock24, '24-часовой формат') + '</label><label class="ol">Секунды' + toggle('clockSec', CFG.clockSec, 'Секунды') + '</label>';
  },
  weather: function () { return '<input class="txt" type="text" maxlength="60" data-city value="' + esc(CFG.city) + '" placeholder="Название города" aria-label="Город"><div class="hint" data-hint></div>'; },
  procs: function () { return '<div class="ol">Строк в списке<span style="width:110px">' + segment('procN', [[3, '3'], [5, '5']], CFG.procN) + '</span></div>'; }
};
var setState = { tab: 'look', open: '', sure: false };

var SET_BODY = {
  look: function () {
    return label('Режим') + '<div class="cards c3">' + Object.keys(MODES).map(function (m) {
        return '<button class="card' + (curMode() === m ? ' on' : '') + '" data-k="mode" data-v="' + m + '">' + PICS[m] + MODES[m] + '</button>'; }).join('') + '</div>' +
      label('Тема') + '<div class="cards c2">' + Object.keys(THEMES).map(function (k) {
        var t = THEMES[k];
        return '<button class="card tcard' + (CFG.theme === k ? ' on' : '') + '" data-k="theme" data-v="' + k + '"><span class="sw4" style="background:' + t[1] + '">' +
          t[2].map(function (c, i) { return '<i style="background:' + c + ';width:' + [90, 60, 75][i] + '%"></i>'; }).join('') + '</span>' + t[0] + '</button>'; }).join('') + '</div>' +
      label('Вид плиток') + segment('look', Object.keys(LOOKS).map(function (k) { return [k, LOOKS[k]]; }), CFG.look) +
      label('Цвет цифр') + segment('mono', [[false, 'Свой у каждого'], [true, 'Один']], CFG.mono) +
      label('Размер', CFG.scale + '%') + segment('scale', SCALES.map(function (v) { return [v, v]; }), CFG.scale) +
      (CFG.theme === 'glass' ? label('Плотность стекла', CFG.glass + '%') + '<input class="rng" type="range" min="20" max="95" value="' + CFG.glass + '" data-glass aria-label="Плотность стекла">' : '');
  },
  tiles: function () {
    return '<div style="height:10px"></div><button class="btn ghost wide" data-k="editmode" data-v="1">Править прямо на виджете</button><div style="height:6px"></div>' +
      CFG.tiles.map(function (t) {
        var o = TILE_OPTS[t.id], id = t.id;
        var w = function (v, ic, title) { return '<button data-w="' + v + '" class="' + (t.w === !!v ? 'on' : '') + '" title="' + title + '">' + ICONS[ic] + '</button>'; };
        return '<div class="trow' + (t.on ? '' : ' off') + (o && setState.open === id ? ' open' : '') + '" data-id="' + id + '" data-m="' + id + '"><div class="m"><span class="grip">' + ICONS.grip + '</span>' + I(id) +
          '<span class="nm">' + TILE_NAMES[id] + '</span>' + (o ? '<button class="chev" data-open="' + id + '" title="Параметры">' + ICONS.chev + '</button>' : '') +
          (ONLY_WIDE[id] ? '' : '<span class="w12">' + w(0, 'half', 'Половина ширины') + w(1, 'whole', 'Во всю ширину') + '</span>') +
          toggle('tile:' + id, t.on, TILE_NAMES[id]) + '</div>' + (o ? '<div class="opts">' + o() + '</div>' : '') + '</div>';
      }).join('');
  },
  alarm: function () {
    return Object.keys(THR_ROWS).map(function (k) {
      var r = THR_ROWS[k], v = CFG.thr[k];
      return '<div class="thr" data-m="' + r[0] + '"><div class="t">' + I(r[0]) + '<span>' + r[1] + '</span><b>' + v + r[2] + '</b></div><div class="zone" style="--t:' + zonePos(v) + '%"><div class="tr"></div>' +
        '<div class="now" data-now="' + k + '" hidden></div><input type="range" min="50" max="100" value="' + v + '" data-thr="' + k + '" aria-label="' + r[1] + '"></div></div>';
    }).join('') + '<p class="hint">Светлая черта: значение сейчас. Тревога включается через 3 секунды выше порога.</p><div style="height:8px"></div>' +
      setRow('Уведомления Windows', 'При включении тревоги', toggle('notify', CFG.notify, 'Уведомления Windows'));
  },
  sys: function () {
    return setRow('Поверх всех окон', TOPMOST ? '' : 'Выключено: лежит на рабочем столе', toggle('topmost', TOPMOST, 'Поверх всех окон')) +
      (SYS.installed ? setRow('Запускать с Windows', '', toggle('autostart', SYS.autostart, 'Запускать с Windows')) : '') +
      (SYS.sensors ? setRow('Температура CPU', SYS.driver ? '<span class="s-ok">Драйвер PawnIO установлен</span>' : 'Нужен драйвер PawnIO', SYS.driver ? '' : ghost('driver', 'Поставить…')) : '') +
      setRow('Положение окна', '', ghost('corner', 'Вернуть в угол')) +
      setRow('Настройки', setState.sure ? 'Плитки, тема и пороги станут как в начале' : '', ghost('reset', setState.sure ? 'Точно сбросить?' : 'Сбросить')) +
      (SYS.installed ? setRow('PC Widget', 'Установлен на этот ПК', ghost('uninstall', 'Удалить…')) : setRow('PC Widget', 'Запущен без установки', ghost('install', 'Установить…')));
  }
};

function buildSettings(onDone) {
  var el = mk('<div class="set"><div class="set-in"><div class="sh" data-drag><span>Настройки</span><button class="btn" data-nodrag data-done>Готово</button></div><div class="stabs" data-nodrag></div><div class="sbody" data-nodrag></div></div></div>');
  var tabs = $('.stabs', el), body = $('.sbody', el);
  function render(top) {
    var st = top ? 0 : body.scrollTop;
    tabs.innerHTML = Object.keys(SET_TABS).map(function (k) { return '<button data-tab="' + k + '" class="' + (k === setState.tab ? 'on' : '') + '">' + I(SET_TABS[k][0]) + SET_TABS[k][1] + '</button>'; }).join('');
    body.innerHTML = SET_BODY[setState.tab]();
    body.scrollTop = st;
    update();
  }
  // живые части: черта текущего значения и состояние города
  function update() {
    $$('[data-now]', body).forEach(function (n) {
      var v = S ? THR_ROWS[n.getAttribute('data-now')][3](S) : null;
      n.hidden = v == null; if (v != null) n.style.left = zonePos(v) + '%';
    });
    cityHint($('[data-hint]', body));
  }
  function changed() { saveCfg(); layout(); render(); }

  el.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var d = b.dataset, row = b.closest('.trow');
    if (d.sys !== 'reset') setState.sure = false;
    if (b.hasAttribute('data-done')) onDone();
    else if (d.tab) { setState.tab = d.tab; render(true); }
    else if (d.open) { setState.open = setState.open === d.open ? '' : d.open; render(); }
    else if (d.w) { tileBy(row.getAttribute('data-id')).w = d.w === '1'; changed(); }
    else if (d.sys === 'reset') { if (setState.sure) { setState.sure = false; CFG = defaults(); Alarm.reset(); syncWeather(); changed(); } else { setState.sure = true; render(); } }
    else if (d.sys) post('sys:' + d.sys);
    else if (d.k === 'editmode') action('edit');
    else if (d.k === 'mode') { setMode(d.v); editing = false; changed(); }
    else if (d.k) { CFG[d.k] = d.k === 'mono' ? d.v === 'true' : /^(scale|procN)$/.test(d.k) ? Number(d.v) : d.v; changed(); }
  });
  el.addEventListener('change', function (e) {
    var t = e.target, k = t.dataset.k;
    if (t.hasAttribute('data-city')) applyCity(t.value);
    else if (t.dataset.thr || t.hasAttribute('data-glass')) saveCfg();
    else if (k === 'topmost') { TOPMOST = t.checked; post('topmost:' + (t.checked ? 1 : 0)); layout(); render(); }
    else if (k === 'autostart') { SYS.autostart = t.checked; post('sys:autostart:' + (t.checked ? 1 : 0)); }
    else if (k && k.indexOf('tile:') === 0) {
      var id = k.slice(5); tileBy(id).on = t.checked;
      if (t.checked && TILE_OPTS[id]) setState.open = id; // погоде нужен город: сразу раскрываем
      syncWeather(); changed();
    } else if (k) { CFG[k] = t.checked; changed(); }
  });
  el.addEventListener('input', function (e) {
    var t = e.target, k = t.dataset.thr;
    if (k) {
      CFG.thr[k] = Number(t.value); Alarm.reset();
      var z = t.closest('.thr'); $('.zone', z).style.setProperty('--t', zonePos(CFG.thr[k]) + '%'); $('.t b', z).textContent = t.value + THR_ROWS[k][2];
    } else if (t.hasAttribute('data-glass')) {
      CFG.glass = Number(t.value); applyBody(); $$('[data-val]', body).pop().textContent = t.value + '%';
    } else if (t.hasAttribute('data-city')) cityTyped(t);
  });
  // перетаскивание строк за ручку
  body.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.grip')) return;
    var id = e.target.closest('.trow').getAttribute('data-id'), list = body;
    var mark = function () { var n = $('.trow[data-id=' + id + ']', list); if (n) n.classList.add('drag'); };
    e.preventDefault(); mark();
    try { body.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события без захвата */ }
    var move = function (ev) {
      var o = document.elementFromPoint(ev.clientX, ev.clientY), to = o && o.closest ? o.closest('.trow') : null, toId = to && to.getAttribute('data-id');
      if (!toId || toId === id) return;
      var ids = CFG.tiles.map(function (t) { return t.id; }), fwd = ids.indexOf(toId) > ids.indexOf(id), r = to.getBoundingClientRect(), mid = r.top + r.height / 2;
      if (fwd ? ev.clientY < mid : ev.clientY > mid) return;
      moveTile(id, toId, fwd); render(); mark();
    };
    var up = function () { ['pointermove', 'pointerup', 'pointercancel'].forEach(function (n) { body.removeEventListener(n, n === 'pointermove' ? move : up); }); changed(); };
    body.addEventListener('pointermove', move); body.addEventListener('pointerup', up); body.addEventListener('pointercancel', up);
  });
  render(true);
  return { el: el, update: update, render: render };
}
