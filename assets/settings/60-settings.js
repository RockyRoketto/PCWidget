'use strict';
// Содержимое окна настроек. Всё применяется сразу, виджет рядом меняется на глазах, само окно не двигается.

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
  disk: ['disks', 'Диск заполнен', '%', function (s) { return s.disks && s.disks.length ? Math.max.apply(null, s.disks.map(function (d) { return d.usedPct; })) : null; }],
  claude: ['claude', 'Лимит Claude', '%', function (s) { var l = s.claude && s.claude.limits; return l ? Math.max.apply(null, l.map(function (x) { return x.pct; })) : null; }]
};
var SET_TABS = { look: ['look', 'Вид'], tiles: ['tiles', 'Плитки'], alarm: ['bell', 'Тревоги'], sys: ['sys', 'Система'] };
var TILE_OPTS = {
  clock: function () {
    var strip = curMode() === 'strip', hands = !strip && CFG.clockView === 'analog'; // в полоске часы всегда цифрами
    return (strip ? '' : segment('clockView', Object.keys(CLOCKS).map(function (k) { return [k, CLOCKS[k]]; }), CFG.clockView)) + (hands ?
      '<div class="two"><label class="ol">Секундная стрелка' + toggle('clockHand', CFG.clockHand, 'Секундная стрелка') + '</label><label class="ol">Дата' + toggle('clockDate', CFG.clockDate, 'Дата на циферблате') + '</label></div>' :
      '<div class="two"><label class="ol">24 часа' + toggle('clock24', CFG.clock24, '24-часовой формат') + '</label><label class="ol">Секунды' + toggle('clockSec', CFG.clockSec, 'Секунды') + '</label></div>');
  },
  calendar: function () { return curMode() === 'strip' ? '' : segment('calView', Object.keys(CALS).map(function (k) { return [k, CALS[k]]; }), CFG.calView); },
  weather: function () { return '<input class="txt" type="text" maxlength="60" data-city value="' + esc(CFG.city) + '" placeholder="Название города" aria-label="Город"><div class="hint" data-hint></div>' +
    (curMode() === 'full' ? '<label class="ol">Прогноз на неделю' + toggle('wxDays', CFG.wxDays, 'Прогноз на неделю') + '</label><div class="hint">Виден, когда плитка во всю ширину</div>' : ''); },
  procs: function () { return curMode() !== 'full' ? '' : '<div class="ol">Строк в списке<span style="width:110px">' + segment('procN', [[3, '3'], [5, '5']], CFG.procN) + '</span></div>'; }
};
var setState = { tab: 'look', open: '', sure: false };

var MINI_TINT = { down: 'net', up: 'net', ping: 'net', disk: 'disks', space: 'disks', claudew: 'claude' };
function modeCards() {
  return '<div class="cards c3">' + Object.keys(MODES).map(function (m) {
    return '<button class="card' + (curMode() === m ? ' on' : '') + '" data-k="mode" data-v="' + m + '">' + PICS[m] + MODES[m] + '</button>'; }).join('') + '</div>';
}
// Как переставлять: сразу на виджете, правка включена, пока открыта эта вкладка.
function tilesHint(m) {
  if (m !== 'full') return '<p class="hint how">Перетаскивай ' + (m === 'strip' ? 'блоки' : 'строки') + ' прямо на виджете. Крестик убирает.</p>';
  var pic = function (body) { return '<svg viewBox="0 0 56 34" fill="currentColor">' + body + '</svg>'; };
  var b = function (x, y, w, h, o) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2.5" opacity="' + (o || .3) + '"/>'; };
  var acc = function (x, y, w, h) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2.5" fill="var(--accent)"/>'; };
  return '<p class="hint how">Перетаскивай плитки прямо на виджете. Крестик убирает.</p><div class="hows">' +
    '<div>' + pic(b(2, 2, 52, 8) + b(2, 13, 25, 19) + acc(29, 13, 25, 19)) + '<span>На край плитки:<br>встанут рядом</span></div>' +
    '<div>' + pic(b(2, 2, 52, 11) + acc(2, 15.5, 52, 3) + b(2, 21, 52, 11)) + '<span>Между ними:<br>во всю ширину</span></div></div>';
}

function densityRow(text) {
  return label(text, CFG.glass + '%') + '<input class="rng" type="range" min="20" max="95" value="' + CFG.glass + '" data-glass aria-label="' + text + '">';
}
// Стекло: акцентный цвет и плотность подложки; Apple и Aero: только плотность.
function glassBlock() {
  if (CFG.theme === 'apple') return densityRow('Плотность карточек');
  if (CFG.theme === 'aero') return densityRow('Плотность фона');
  if (CFG.theme !== 'glass') return '';
  var own = !!CFG.accent && ACCENTS.indexOf(CFG.accent) < 0;
  return label('Цвет') + '<div class="tints"><button class="tint multi' + (CFG.accent ? '' : ' on') + '" data-accent="" title="Цветной: у каждого показателя свой" aria-label="Цветной"></button>' + ACCENTS.map(function (c) {

    return '<button class="tint' + (CFG.accent === c ? ' on' : '') + '" data-accent="' + c + '" style="background:' + c + '" aria-label="Цвет ' + c + '"></button>';
  }).join('') + '<label class="tint custom' + (own ? ' on' : '') + '" title="Свой цвет"' + (own ? ' style="background:' + CFG.accent + '"' : '') +
    '><input type="color" data-tintc value="' + (CFG.accent || ACCENTS[0]) + '" aria-label="Свой цвет"></label></div>' +
    densityRow('Плотность стекла');
}

var SET_BODY = {
  look: function () {
    return label('Режим') + modeCards() +
      label('Тема') + '<div class="cards c4">' + Object.keys(THEMES).map(function (k) {
        var t = THEMES[k];
        return '<button class="card tcard' + (CFG.theme === k ? ' on' : '') + '" data-k="theme" data-v="' + k + '"><span class="sw4" style="background:' + t[1] + '">' +
          t[2].map(function (c, i) { return '<i style="background:' + c + ';width:' + [90, 60, 75][i] + '%"></i>'; }).join('') + '</span>' + t[0] + '</button>'; }).join('') + '</div>' + glassBlock() +
      label('Вид плиток в полном режиме') + segment('look', Object.keys(LOOKS).map(function (k) { return [k, LOOKS[k]]; }), CFG.look) +
      label('Цвет цифр') + segment('mono', [[false, 'Свой у каждого'], [true, 'Один']], CFG.mono) +
      label('Размер', CFG.scale + '%') + segment('scale', SCALES.map(function (v) { return [v, v]; }), CFG.scale);
  },
  tiles: function () {
    var m = curMode();
    return label('Плитки режима') + segment('mode', Object.keys(MODES).map(function (k) { return [k, MODES[k]]; }), m) + tilesHint(m) + '<div class="tgrid">' +
      modeIds(m).map(function (id) {
        var o = TILE_OPTS[id] && TILE_OPTS[id](), on = isOn(m, id), name = tileName(m, id);
        return '<div class="trow' + (on ? '' : ' off') + (o && setState.open === id ? ' open' : '') + '" data-id="' + id + '" data-m="' + (MINI_TINT[id] || id) + '"><div class="m">' + I(id === 'space' ? 'disk' : id) +
          '<span class="nm">' + name + '</span>' + (o ? '<button class="chev" data-open="' + id + '" title="Параметры">' + ICONS.chev + '</button>' : '') +
          toggle('tile:' + id, on, name) + '</div>' + (o ? '<div class="opts">' + o + '</div>' : '') + '</div>';
      }).join('') + '</div>' + setRow('Расположение', 'Порядок и набор плиток этого режима', ghost('tiles', 'Как в начале'));
  },
  alarm: function () {
    return Object.keys(THR_ROWS).filter(function (k) { return k !== 'claude' || claudeOn(); }).map(function (k) {
      var r = THR_ROWS[k], v = CFG.thr[k];
      return '<div class="thr" data-m="' + r[0] + '"><div class="t">' + I(r[0]) + '<span>' + r[1] + '</span><b>' + v + r[2] + '</b></div><div class="zone" style="--t:' + zonePos(v) + '%"><div class="tr"></div>' +
        '<div class="now" data-now="' + k + '" hidden></div><input type="range" min="50" max="100" value="' + v + '" data-thr="' + k + '" aria-label="' + r[1] + '"></div></div>';
    }).join('') + '<p class="hint">Черта: значение сейчас. Тревога включается через 3 секунды выше порога.</p><div style="height:8px"></div>' +
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

function buildSettings() {
  var el = mk('<div class="set"><div class="sh"><span>Настройки</span><button class="x" data-nodrag data-done title="Закрыть" aria-label="Закрыть">' + ICONS.hide + '</button></div><div class="stabs" data-nodrag></div><div class="sbody" data-nodrag></div></div>');
  var tabs = $('.stabs', el), body = $('.sbody', el);
  tabs.innerHTML = Object.keys(SET_TABS).map(function (k) { return '<button data-tab="' + k + '">' + I(SET_TABS[k][0]) + SET_TABS[k][1] + '</button>'; }).join('');
  function render(top) {
    var st = top ? 0 : body.scrollTop;
    $$('button', tabs).forEach(function (b) { b.classList.toggle('on', b.dataset.tab === setState.tab); });
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
  function changed() { saveCfg(); applySetBody(); }
  // Выбор в группе меняет только отметку: список не пересобирается и не мигает.
  function pick(b) {
    $$('button', b.parentNode).forEach(function (x) { x.classList.toggle('on', x === b); });
    var lab = b.parentNode.previousElementSibling, val = lab && $('[data-val]', lab);
    if (val) val.textContent = b.dataset.v + '%';
  }
  // Отметка выбранного цвета стекла; свой цвет красит последний кружок.
  function tintMarks() {
    var own = !!CFG.accent && ACCENTS.indexOf(CFG.accent) < 0, c = $('.tint.custom', body);
    $$('.tint[data-accent]', body).forEach(function (x) { x.classList.toggle('on', x.dataset.accent === CFG.accent); });
    if (c) { c.classList.toggle('on', own); c.style.background = own ? CFG.accent : ''; $('input', c).value = CFG.accent || ACCENTS[0]; }
  }

  el.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var d = b.dataset;
    if (d.sys !== 'reset' && setState.sure) { setState.sure = false; if (!d.tab) render(); }
    if (b.hasAttribute('data-done')) post('close');
    else if (d.tab) { setState.tab = d.tab; render(true); post('tab:' + d.tab); }
    else if (d.open) { setState.open = setState.open === d.open ? '' : d.open; $$('.trow', body).forEach(function (r) { r.classList.toggle('open', r.dataset.id === setState.open); }); }
    else if (d.sys === 'reset') { if (setState.sure) { setState.sure = false; CFG = defaults(); changed(); } else setState.sure = true; render(); }
    else if (d.sys === 'tiles') { resetTiles(curMode()); changed(); render(); }
    else if (d.sys) post('sys:' + d.sys);
    else if (d.k === 'mode') { setMode(d.v); changed(); if (setState.tab === 'tiles') render(true); else pick(b); }
    else if (d.accent !== undefined) { CFG.accent = d.accent; changed(); tintMarks(); }
    else if (d.k === 'theme') { CFG.theme = d.v; changed(); render(); }
    else if (d.k === 'clockView') { CFG.clockView = d.v; changed(); render(); } // у стрелок свои параметры
    else if (d.k) { CFG[d.k] = d.k === 'mono' ? d.v === 'true' : /^(scale|procN)$/.test(d.k) ? Number(d.v) : d.v; changed(); pick(b); }
  });
  el.addEventListener('change', function (e) {
    var t = e.target, k = t.dataset.k;
    if (t.hasAttribute('data-city')) applyCity(t.value);
    else if (t.dataset.thr || t.hasAttribute('data-glass') || t.hasAttribute('data-tintc')) saveCfg();
    else if (k === 'topmost') { TOPMOST = t.checked; post('topmost:' + (t.checked ? 1 : 0)); render(); }
    else if (k === 'autostart') { SYS.autostart = t.checked; post('sys:autostart:' + (t.checked ? 1 : 0)); }
    else if (k && k.indexOf('tile:') === 0) {
      var id = k.slice(5), row = t.closest('.trow');
      setOn(curMode(), id, t.checked); row.classList.toggle('off', !t.checked); changed();
      if (id === 'weather' && t.checked && !CFG.city) { setState.open = id; row.classList.add('open'); } // погоде нужен город: сразу раскрываем
      update();
    } else if (k) { CFG[k] = t.checked; changed(); }
  });
  el.addEventListener('input', function (e) {
    var t = e.target, k = t.dataset.thr;
    if (k) {
      CFG.thr[k] = Number(t.value); liveCfg();
      var z = t.closest('.thr'); $('.zone', z).style.setProperty('--t', zonePos(CFG.thr[k]) + '%'); $('.t b', z).textContent = t.value + THR_ROWS[k][2];
    } else if (t.hasAttribute('data-glass')) {
      CFG.glass = Number(t.value); liveCfg(); applySetBody(); $('[data-val]', t.previousElementSibling).textContent = t.value + '%';
    } else if (t.hasAttribute('data-tintc')) {
      CFG.accent = t.value; liveCfg(); applySetBody(); tintMarks();
    } else if (t.hasAttribute('data-city')) cityTyped(t);
  });
  render(true);
  return { el: el, update: update, render: render };
}
