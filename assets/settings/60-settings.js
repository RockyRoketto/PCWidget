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
    (GRID_MODES[curMode()] ? '<label class="ol">Прогноз на неделю' + toggle('wxDays', CFG.wxDays, 'Прогноз на неделю') + '</label><div class="hint">Виден, когда плитка во всю ширину</div>' : ''); },
  energy: function () {
    return '<div class="ol">Тариф, ₽ за кВт·ч<input class="txt num-in" type="number" min="0" max="1000" step="0.01" data-tariff value="' + (CFG.tariff || '') + '" placeholder="0" aria-label="Тариф, рублей за киловатт-час"></div>' +
      '<div class="hint">Считаются только процессор и видеокарта: весь ПК от розетки берёт больше. Пусто — без стоимости.</div>';
  },
  procs: function () { return !GRID_MODES[curMode()] ? '' : '<div class="ol">Строк в списке<span style="width:110px">' + segment('procN', [[3, '3'], [5, '5']], CFG.procN) + '</span></div>'; }
};
TILE_OPTS.claude = function () { return thinOpt('claude') + '<div data-cl>' + claudeOpts() + '</div>'; };
// Высота плитки: обычная или тонкая (в один модуль). Только в Панели и Широкой.
function thinOpt(id) {
  return GRID_MODES[curMode()] ? '<div class="ol">Высота<span style="width:150px">' + segment('thin:' + id, [[0, 'Обычная'], [1, 'Тонкая']], CFG.thin[id] ? 1 : 0) + '</span></div>' : '';
}
['cpu', 'gpu', 'mem', 'net'].forEach(function (id) { TILE_OPTS[id] = function () { return thinOpt(id); }; });
// Лимиты пишет маленький мод внутри Claude Code; кнопка кладёт его в ~/.claude/skills или убирает.
function claudeOpts() {
  var c = S && S.claude, has = !!(c && c.limits), fresh = has && Date.now() / 1000 - c.limitsAt < 7 * 86400;
  var hint = function (t, cls) { return '<div class="hint' + (cls || '') + '">' + t + '</div>'; }, err = SYS.claudeErr ? hint('Не вышло: ' + esc(SYS.claudeErr), ' bad') : '';
  if (SYS.claude === 'on') return '<div class="ol">Лимиты подключены' + ghost('claudemod:0', 'Отключить') + '</div>' + (has ? '' : hint('Перезапусти Claude и отправь сообщение в чате Code')) + err;
  if (SYS.claude !== 'off') return hint('Claude Code на этом ПК не найден');
  if (fresh) return hint('Лимиты уже приходят, подключать не нужно', ' s-ok');
  return '<div class="ol">Лимиты' + ghost('claudemod:1', 'Подключить') + '</div>' + hint('Виджет положит маленький мод в папку .claude/skills. Настройки Claude не меняются, токены не тратятся.') + err;
}
var setState = { tab: 'look', open: '', sure: false };

// Свой цвет плитки: «как было», готовые и любой.
function colorOpts(key) {
  var cur = CFG.tileColors[key] || '', own = cur && TILE_TINTS.indexOf(cur) < 0;
  var b = function (v, name, cls) { return '<button class="tint sm' + (cls || '') + (cur === v ? ' on' : '') + '" data-tc="' + v + '" title="' + name + '" aria-label="' + name + '"' + (v ? ' style="background:' + v + '"' : '') + '></button>'; };
  return '<div class="tints sm" data-for="' + key + '">' + b('', 'Цвет темы', ' multi') + TILE_TINTS.map(function (c) { return b(c, 'Цвет ' + c); }).join('') +
    '<label class="tint sm custom' + (own ? ' on' : '') + '" title="Свой цвет"' + (own ? ' style="background:' + cur + '"' : '') + '><input type="color" data-tcc value="' + (cur || TILE_TINTS[1]) + '" aria-label="Свой цвет"></label></div>';
}
function modeCards() {
  return '<div class="cards c5">' + Object.keys(MODES).map(function (m) {
    return '<button class="card' + (curMode() === m ? ' on' : '') + '" data-k="mode" data-v="' + m + '">' + PICS[m] + MODES[m] + '</button>'; }).join('') + '</div>';
}
// Как переставлять: сразу на виджете, правка включена, пока открыта эта вкладка.
function tilesHint(m) {
  var what = GRID_MODES[m] ? 'плитки' : m === 'column' ? 'строки' : 'блоки';
  return '<p class="hint how">Перетаскивай ' + what + ' прямо на виджете, крестик убирает.' + (GRID_MODES[m] ? ' Длинную к краю — станет короткой.' : '') + ' <button class="lnk" data-sys="tiles">Как в начале</button></p>';
}

function densityRow(text) {
  return label(text, CFG.glass + '%') + '<input class="rng" type="range" min="20" max="95" value="' + CFG.glass + '" data-glass aria-label="' + text + '">';
}
function densityBlock() {
  var t = { sheet: 'Плотность стекла', fill: 'Плотность карточек' }[CFG.theme];
  return t ? densityRow(t) : '';
}
// Цвет темы: у «Листа» акцент (из Windows, готовый или свой), у «Заливки» градиент. У «Прибора» цвет свой.
function dot(attr, v, name, bg, cls) { return '<button class="tint' + (cls || '') + '" ' + attr + '="' + v + '" title="' + name + '" aria-label="' + name + '"' + (bg ? ' style="background:' + bg + '"' : '') + '></button>'; }
function colorBlock() {
  if (CFG.theme === 'sheet') {
    return label('Акцент', ' ') + '<div class="tints">' + dot('data-acc', 'win', 'Как в Windows', SYS.accent || ACCENTS[0], ' win') + '<i class="tsep"></i>' +
      ACCENTS.map(function (c) { return dot('data-acc', c, 'Цвет ' + c, c); }).join('') +
      '<label class="tint custom" title="Свой цвет"><input type="color" data-accc aria-label="Свой цвет"></label></div>';
  }
  if (CFG.theme === 'fill') {
    return label('Градиент', ' ') + '<div class="tints">' + dot('data-pal', 'win', 'Из цвета Windows', gradOf([mixTo(SYS.accent || '#2f7df0', 255, .35), SYS.accent || '#2f7df0', mixTo(SYS.accent || '#2f7df0', 0, .3)]), ' win') + '<i class="tsep"></i>' +
      Object.keys(PALS).map(function (k) { return dot('data-pal', k, PALS[k][0], gradOf(PALS[k][1])); }).join('') + '</div>';
  }
  return '';
}
// Отметка выбранного цвета и его имя; свой акцент красит последний кружок.
function colorMarks(body) {
  var acc = $('[data-accc]', body), pal = $('[data-pal]', body), lab = (acc || pal) && (acc || pal).closest('.tints').previousElementSibling, name = '';
  if (!lab) return; // цвет темы есть только на вкладке «Вид»
  if (acc) {
    var own = CFG.accent !== 'win' && ACCENTS.indexOf(CFG.accent) < 0, c = $('[data-accc]', body).parentNode;
    $$('[data-acc]', body).forEach(function (x) { x.classList.toggle('on', x.dataset.acc === CFG.accent); });
    c.classList.toggle('on', own); c.style.background = own ? CFG.accent : '';
    $('[data-accc]', body).value = CFG.accent.charAt(0) === '#' ? CFG.accent : SYS.accent || ACCENTS[0];
    name = CFG.accent === 'win' ? 'Как в Windows' : own ? 'Свой' : '';
  } else {
    $$('[data-pal]', body).forEach(function (x) { x.classList.toggle('on', x.dataset.pal === CFG.pal); });
    name = CFG.pal === 'win' ? 'Из цвета Windows' : PALS[CFG.pal][0];
  }
  if (lab && $('[data-val]', lab)) $('[data-val]', lab).textContent = name;
}

// «О программе»: версия, обновления, страница проекта.
function aboutRows() {
  var note = SYS.updateBusy ? SYS.updateNote : SYS.update ? '<span class="s-ok">Вышла версия ' + esc(SYS.update) + '</span>' : SYS.updateNote || 'RockyRoketto · лицензия MIT';
  var act = SYS.updateBusy ? '' : SYS.update ? ghost('update', 'Обновить') : ghost('updcheck', 'Проверить');
  return setRow('PC Widget ' + esc(SYS.version || ''), note, act + ghost('github', 'GitHub')) +
    setRow('Проверять обновления', '', toggle('updates', CFG.updates, 'Проверять обновления'));
}

var SET_BODY = {
  look: function () {
    return label('Тема') + '<div class="cards c4">' + Object.keys(THEMES).map(function (k) {
        return '<button class="card tcard' + (CFG.theme === k ? ' on' : '') + '" data-k="theme" data-v="' + k + '">' + themeSwatch(k) + THEMES[k] + '</button>'; }).join('') + '</div>' +
      label('Оформление') + segment('tone', Object.keys(TONES).map(function (k) { return [k, TONES[k]]; }), CFG.tone) +
      colorBlock() + densityBlock() +
      label('Размер', CFG.scale + '%') + segment('scale', SCALES.map(function (v) { return [v, v]; }), CFG.scale) +
      profBlock(); // 62-profiles.js
  },
  tiles: function () {
    var m = curMode();
    return label('Режим') + modeCards() + tilesHint(m) + '<div class="tgrid">' +
      modeIds(m).map(function (id) {
        var on = isOn(m, id), name = tileName(m, id);
        return '<div class="trow' + (on ? '' : ' off') + '" data-id="' + id + '" data-m="' + colorKey(id) + '">' +
          '<div class="m"><button class="tb" data-open="' + id + '" title="Цвет и параметры">' + I(id === 'space' ? 'disk' : id) +
          '<span class="nm" title="' + name + '">' + name + '</span><i class="cdot"></i></button>' + toggle('tile:' + id, on, name) + '</div></div>';
      }).join('') + '</div><div class="tpop" hidden></div>';
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
      setRow('Антивыгорание', 'Сдвиг на пару пикселей, в простое темнее', toggle('antiburn', CFG.antiburn, 'Антивыгорание')) +
      setRow('Положение окна', '', ghost('corner', 'Вернуть в угол')) +
      setRow('Настройки', setState.sure ? 'Плитки, тема и пороги станут как в начале' : '', ghost('reset', setState.sure ? 'Точно сбросить?' : 'Сбросить')) +
      (SYS.installed ? setRow('PC Widget', 'Установлен на этот ПК', ghost('uninstall', 'Удалить…')) : setRow('PC Widget', 'Запущен без установки', ghost('install', 'Установить…'))) +
      gameBlock() +
      label('О программе') + aboutRows();
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
    colorMarks(body);
    paintRows();
    placePop();
    update();
    profFocus(body);
  }
  // Всплывающее окно плитки: цвет и её параметры. Под карточкой, а если снизу не влезает — над ней.
  function placePop() {
    var pop = $('.tpop', body); if (!pop) return;
    var id = setState.open, row = id ? $('.trow[data-id="' + id + '"]', body) : null;
    $$('.trow', body).forEach(function (r) { r.classList.toggle('open', r === row); });
    if (!row) { pop.hidden = true; pop.innerHTML = ''; setState.open = ''; return; }
    pop.innerHTML = colorOpts(colorKey(id)) + (TILE_OPTS[id] ? TILE_OPTS[id]() : '');
    pop.hidden = false;
    var below = row.offsetTop + row.offsetHeight + 4, above = row.offsetTop - pop.offsetHeight - 4;
    pop.style.top = (below + pop.offsetHeight <= body.scrollTop + body.clientHeight || above < body.scrollTop ? below : above) + 'px';
    update();
  }
  function closePop() {
    if (setState.open) { setState.open = ''; placePop(); return true; }
    if (profCancel()) { render(); return true; } // Esc отменяет правку имени профиля
    return false;
  }
  // живые части: черта текущего значения и состояние города
  function update() {
    $$('[data-now]', body).forEach(function (n) {
      var v = S ? THR_ROWS[n.getAttribute('data-now')][3](S) : null;
      n.hidden = v == null; if (v != null) n.style.left = zonePos(v) + '%';
    });
    cityHint($('[data-hint]', body));
    var cl = $('[data-cl]', body), html = cl && claudeOpts();
    if (cl && cl.dataset.was !== html) { cl.dataset.was = html; cl.innerHTML = html; }
  }
  function paintRows() { $$('.trow', body).forEach(paintTile); }
  // Цвет плитки: отметка в ряду кружков и сразу цвет иконки в списке.
  function setTileColor(row, v) {
    var key = row.dataset.for, custom = $('.custom', row), own = !!v && TILE_TINTS.indexOf(v) < 0;
    if (v) CFG.tileColors[key] = v; else delete CFG.tileColors[key];
    $$('[data-tc]', row).forEach(function (x) { x.classList.toggle('on', x.dataset.tc === v); });
    custom.classList.toggle('on', own); custom.style.background = own ? v : '';
    paintRows();
  }
  function changed() { saveCfg(); applySetBody(); }
  // Выбор в группе меняет только отметку: список не пересобирается и не мигает.
  function pick(b) {
    $$('button', b.parentNode).forEach(function (x) { x.classList.toggle('on', x === b); });
    var lab = b.parentNode.previousElementSibling, val = lab && $('[data-val]', lab);
    if (val) val.textContent = b.dataset.v + '%';
  }
  el.addEventListener('click', function (e) {
    if (setState.open && !e.target.closest('.tpop') && !e.target.closest('[data-open]')) closePop(); // щелчок мимо закрывает окно плитки
    var b = e.target.closest('button'); if (!b) return;
    var d = b.dataset;
    if (!d.prof && profCancel() && !d.tab) render();
    if (d.sys !== 'reset' && setState.sure) { setState.sure = false; if (!d.tab) render(); }
    if (b.hasAttribute('data-done')) post('close');
    else if (d.tab) { setState.tab = d.tab; render(true); post('tab:' + d.tab); }
    else if (d.prof) { profClick(b); render(); }
    else if (d.open) { setState.open = setState.open === d.open ? '' : d.open; placePop(); }
    else if (d.sys === 'reset') { if (setState.sure) { setState.sure = false; CFG = defaults(); changed(); } else setState.sure = true; render(); }
    else if (d.sys === 'tiles') { resetTiles(curMode()); changed(); render(); }
    else if (d.sys) post('sys:' + d.sys);
    else if (d.k === 'mode') { setMode(d.v); changed(); if (setState.tab === 'tiles') render(true); else pick(b); }
    else if (b.hasAttribute('data-tc')) { setTileColor(b.parentNode, d.tc); changed(); }
    else if (d.acc) { CFG.accent = d.acc; changed(); colorMarks(body); }
    else if (d.pal) { CFG.pal = d.pal; changed(); colorMarks(body); }
    else if (d.k === 'theme' || d.k === 'tone') { CFG[d.k] = d.v; changed(); render(); }
    else if (d.k && d.k.indexOf('thin:') === 0) { var tid = d.k.slice(5); if (d.v === '1') CFG.thin[tid] = 1; else delete CFG.thin[tid]; changed(); pick(b); }
    else if (d.k === 'clockView') { CFG.clockView = d.v; changed(); render(); } // у стрелок свои параметры
    else if (d.k) { CFG[d.k] = /^(scale|procN)$/.test(d.k) ? Number(d.v) : d.v; changed(); pick(b); }
  });
  el.addEventListener('change', function (e) {
    var t = e.target, k = t.dataset.k;
    if (t.hasAttribute('data-profname')) { if (profCommit(t)) render(); }
    else if (t.hasAttribute('data-city')) applyCity(t.value);
    else if (t.hasAttribute('data-tariff')) { var tf = Number(String(t.value).replace(',', '.')); CFG.tariff = isFinite(tf) && tf > 0 && tf <= 1000 ? Math.round(tf * 100) / 100 : 0; saveCfg(); }
    else if (t.dataset.thr || t.hasAttribute('data-glass') || t.hasAttribute('data-accc') || t.hasAttribute('data-tcc')) saveCfg();
    else if (k === 'topmost') { TOPMOST = t.checked; post('topmost:' + (t.checked ? 1 : 0)); render(); }
    else if (k === 'autostart') { SYS.autostart = t.checked; post('sys:autostart:' + (t.checked ? 1 : 0)); }
    else if (k && k.indexOf('tile:') === 0) {
      var id = k.slice(5), row = t.closest('.trow');
      setOn(curMode(), id, t.checked); row.classList.toggle('off', !t.checked); changed();
      if (id === 'weather' && t.checked && !CFG.city) { setState.open = id; placePop(); } // погоде нужен город: сразу открываем
      if (id === 'claude' && t.checked && SYS.claude === 'off' && !(S && S.claude && S.claude.limits)) { setState.open = id; placePop(); }
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
    } else if (t.hasAttribute('data-accc')) {
      CFG.accent = t.value.toLowerCase(); liveCfg(); applySetBody(); colorMarks(body);
    } else if (t.hasAttribute('data-tcc')) {
      setTileColor(t.closest('.tints'), t.value); liveCfg();
    } else if (t.hasAttribute('data-city')) cityTyped(t);
  });
  render(true);
  return { el: el, update: update, render: render, closePop: closePop };
}
