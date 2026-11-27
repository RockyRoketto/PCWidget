'use strict';
// Включённая плитка или строка видна всегда: пока данных нет, на её месте название и подсказка, чего ждать.
// Плитки по-прежнему сами ставят el.hidden, когда показать нечего; здесь это превращается в заглушку.

// [подсказка в плитке, короткая для строки]
function emptyHint(id) {
  if (id === 'weather') return CFG.city ? ['Загружаю погоду…', 'загрузка…'] : ['Выбери город в настройках', 'выбери город'];
  if (id === 'media') return ['Ничего не играет', 'не играет'];
  if (id === 'claude' || id === 'claudew') return ['Нет данных Claude Code', 'нет данных'];
  if (id === 'ping') return ['Нет ответа', 'нет ответа'];
  return ['Нет данных', 'нет данных'];
}

// Плитка: x = { id, b }. Звать после update и tick.
function emptyTile(x) {
  var el = x.b.el, none = el.hidden;
  el.classList.toggle('nodata', none);
  if (!none) return;
  el.hidden = false;
  if (!x.stub) {
    x.stub = mk('<div class="cb cb-nodata"><div class="hd"><b class="nm"></b></div><span class="nd-t"></span></div>');
    $('.nm', x.stub).textContent = TILE_NAMES[x.id];
    el.appendChild(x.stub);
  }
  var h = emptyHint(x.id), n = $('.nd-t', x.stub);
  var t = thinNow(el) && !wide(el) ? h[1].replace(/^./, function (c) { return c.toUpperCase(); }) : h[0];
  if (n.textContent !== t) n.textContent = t;
}

// Строка компактного режима без данных: название и короткая подсказка.
function emptyRow(it, none) {
  if (it.el.classList.contains('nodata') === none && !none) return;
  it.el.classList.toggle('nodata', none);
  // ширины в «Полоске» только растут: после заглушки считаются заново
  it.vw = it.sw = 0; it.v.style.minWidth = it.s.style.minWidth = '';
  it.n.__h = it.s.__h = it.v.__h = null;
  if (!none) return;
  it.n.className = 'n';
  it.n.textContent = typeof it.sp.n === 'string' ? it.sp.n : MINI_NAMES[it.id]; // как у строки с данными
  it.s.className = 's';
  it.s.textContent = emptyHint(it.id)[1];
  it.v.textContent = '';
  it.v.className = 'num v';
  setLv(it.el, '');
  it.el.classList.remove('alarm', 'mc-paused');
  if (it.vz) it.vz.set({ pct: 0 });
  if (it.fan) { it.fan.remove(); it.fan = null; }
}
