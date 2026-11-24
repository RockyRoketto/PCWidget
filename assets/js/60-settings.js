'use strict';
// Окно настроек внутри самого виджета. Всё применяется сразу, onChange(relayout) перестраивает виджет.

function toggleHTML(checked, attrs) {
  return '<label class="sw" data-nodrag><input type="checkbox" ' + (checked ? 'checked ' : '') + (attrs || '') + '><i></i></label>';
}

function buildSettings(onChange, onDone) {
  var curMode = CFG.mode === 'full' ? 'full' : CFG.compact;
  var el = mk('<div class="settings" data-nodrag>' +
    '<div class="s-head" data-drag><span class="t-ico">' + ICONS.gear + '</span><b>Настройки</b><button class="btn" data-nodrag data-act="done">Готово</button></div>' +
    '<h5>Размер</h5><div class="seg" data-seg="mode">' +
      '<button data-v="full">Полный</button><button data-v="column">Компакт: колонка</button><button data-v="strip">Компакт: полоска</button></div>' +
    '<h5>Тема</h5><div class="seg wrap" data-seg="theme">' +
      Object.keys(THEMES).map(function (k) { return '<button data-v="' + k + '">' + THEMES[k] + '</button>'; }).join('') + '</div>' +
    '<h5>Плитки (перетащи, чтобы поменять порядок)</h5><div class="tlist"></div>' +
    '<h5>Пороги тревоги</h5><div class="thr">' +
      [['cpuTemp', 'Температура CPU, °'], ['gpuTemp', 'Температура GPU, °'], ['mem', 'Память, %'], ['disk', 'Заполненность диска, %']].map(function (p) {
        return '<label><span>' + p[1] + '</span><input type="number" min="1" max="200" data-thr="' + p[0] + '" value="' + CFG.thr[p[0]] + '"></label>';
      }).join('') + '</div>' +
    '<h5>Часы и погода</h5><div class="thr"><label style="grid-column:span 2"><span>Город для погоды (название)</span><input type="text" maxlength="60" data-city value="' + esc(CFG.city) + '"></label></div>' +
    '<div class="orow"><span>24-часовой формат</span>' + toggleHTML(CFG.clock24, 'data-opt="clock24"') + '</div>' +
    '<div class="orow"><span>Секунды в часах</span>' + toggleHTML(CFG.clockSec, 'data-opt="clockSec"') + '</div>' +
    '<div class="orow"><span>Уведомления Windows при тревоге</span>' + toggleHTML(CFG.notify, 'data-opt="notify"') + '</div>' +
    '<div class="orow"><span>Поверх всех окон</span>' + toggleHTML(TOPMOST, 'data-opt="topmost"') + '</div>' +
  '</div>');

  // сегменты
  function markSeg(name, val) {
    [].forEach.call(el.querySelectorAll('[data-seg=' + name + '] button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === val); });
  }
  markSeg('mode', curMode); markSeg('theme', CFG.theme);
  el.querySelector('[data-seg=mode]').addEventListener('click', function (e) {
    var v = e.target.getAttribute && e.target.getAttribute('data-v'); if (!v) return;
    if (v === 'full') CFG.mode = 'full'; else { CFG.mode = 'compact'; CFG.compact = v; }
    markSeg('mode', v); onChange();
  });
  el.querySelector('[data-seg=theme]').addEventListener('click', function (e) {
    var v = e.target.getAttribute && e.target.getAttribute('data-v'); if (!v) return;
    CFG.theme = v; markSeg('theme', v); onChange();
  });

  // список плиток с перетаскиванием
  var list = el.querySelector('.tlist');
  CFG.tiles.forEach(function (t) {
    list.appendChild(mk('<div class="trow" data-id="' + t.id + '"><span class="grip">' + ICONS.grip + '</span><span class="tn">' + TILE_NAMES[t.id] + '</span>' + toggleHTML(t.on) + '</div>'));
  });
  function commitOrder() {
    var byId = {}; CFG.tiles.forEach(function (t) { byId[t.id] = t; });
    CFG.tiles = [].map.call(list.children, function (r) { return byId[r.getAttribute('data-id')]; });
    onChange();
  }
  list.addEventListener('change', function (e) {
    var row = e.target.closest('.trow'); if (!row) return;
    CFG.tiles.forEach(function (t) { if (t.id === row.getAttribute('data-id')) t.on = e.target.checked; });
    onChange(); syncWeather();
  });
  list.addEventListener('pointerdown', function (e) {
    var grip = e.target.closest('.grip'); if (!grip) return;
    var row = grip.parentNode; row.classList.add('drag');
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события без захвата */ }
    var move = function (ev) {
      var over = document.elementFromPoint(ev.clientX, ev.clientY);
      var tgt = over && over.closest ? over.closest('.trow') : null;
      if (!tgt || tgt === row || tgt.parentNode !== list) return;
      var r = tgt.getBoundingClientRect();
      list.insertBefore(row, ev.clientY < r.top + r.height / 2 ? tgt : tgt.nextSibling);
    };
    var up = function () {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up);
      row.classList.remove('drag'); commitOrder();
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
  });

  // пороги и переключатели
  el.addEventListener('change', function (e) {
    var t = e.target, thr = t.getAttribute('data-thr'), opt = t.getAttribute('data-opt');
    if (t.hasAttribute('data-city')) { CFG.city = t.value.trim(); onChange(true); syncWeather(); return; }
    if (thr) {
      var v = Number(t.value);
      if (isFinite(v) && v > 0 && v <= 200) { CFG.thr[thr] = v; Alarm.reset(); onChange(true); } else t.value = CFG.thr[thr];
    } else if (opt === 'notify') { CFG.notify = t.checked; onChange(true); }
    else if (opt === 'clock24') { CFG.clock24 = t.checked; onChange(true); }
    else if (opt === 'clockSec') { CFG.clockSec = t.checked; onChange(true); }
    else if (opt === 'topmost') { TOPMOST = t.checked; post('topmost:' + (t.checked ? 1 : 0)); }
  });
  el.querySelector('[data-act=done]').addEventListener('click', onDone);
  return el;
}
