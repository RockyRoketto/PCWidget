'use strict';
// Значок вентилятора GPU: крутится тем быстрее, чем выше обороты (Stats.gpu.fan, %). Нет данных — значка нет,
// 0% — стоит, при «уменьшить движение» в Windows тоже стоит. Вращение — одна анимация transform на элементе
// (её ведёт композитор, страница в нём не участвует); скорость меняет updatePlaybackRate без скачка угла.
// Вращение шагами, а не плавное: так кадров не больше 30 в секунду и нагрузка в несколько раз меньше.

var FAN_TURN = 1000, FAN_STEPS = 30; // мс на оборот при 100% и шагов в обороте
var stillMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function fanOn(d) { return !!(CFG.gpuFan && d && d.fan != null); }

// Сколько лопастей и их форма по темам.
var FAN_SHAPE = {
  sheet: [7, 'M32 29C29 18 35 7 46 7C51 18 45 28 34.5 32Z'],
  gauge: [5, 'M30 27L27 9Q35 5 43 10L35 28Z'],
  fill: [5, 'M31 28C22 17 29 4 43 7C51 17 45 28 35 31Z'],
  lcd: [4, 'M28 24V7h15l-7 17Z'],
  osc: [3, 'M30 27L26 6Q36 3 44 8L35 28Z'],
  bp: [6, 'M31 28L30 8L42 10L35 29Z'],
  pixel: [4, 'M30 28V8h4V4h8v8h-4v8h-4v8Z']
};
function fanSvg() {
  var s = FAN_SHAPE[CFG.theme] || FAN_SHAPE.sheet, blades = '';
  for (var i = 0; i < s[0]; i++) blades += '<path d="' + s[1] + '" transform="rotate(' + (360 / s[0] * i).toFixed(2) + ' 32 32)"/>';
  return '<svg viewBox="0 0 64 64" aria-hidden="true">' + blades + '<circle cx="32" cy="32" r="6"/></svg>';
}

function fanViz() {
  var el = mk('<span class="fanv"><span class="ring"><span class="rot">' + fanSvg() + '</span></span><span class="lbl">вентилятор<b></b></span></span>');
  var rot = $('.rot', el), val = $('b', el), anim = null, pct = 0, set = 0; // set — последняя заданная скорость (новая вступает с задержкой в кадр)
  function spin() {
    var rate = stillMQ && stillMQ.matches ? 0 : clamp(pct, 0, 100) / 100;
    if (!rate) { if (anim) anim.pause(); return; }
    if (!anim) {
      anim = rot.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: FAN_TURN, iterations: Infinity, easing: 'steps(' + FAN_STEPS + ')' });
      anim.playbackRate = rate;
    } else if (set !== rate) anim.updatePlaybackRate(rate);
    set = rate;
    if (anim.playState === 'paused') anim.play();
  }
  // «уменьшить движение» переключили на ходу; удалённый значок отписывается
  function change() { if (el.isConnected) spin(); else stillMQ.removeEventListener('change', change); }
  if (stillMQ && stillMQ.addEventListener) stillMQ.addEventListener('change', change);
  function move(parent, before, where) {
    var cls = 'fanv at-' + where;
    if (el.className !== cls) el.className = cls;
    if (el.parentNode !== parent) parent.insertBefore(el, before);
  }
  return {
    el: el,
    // Место в плитке: во всю ширину — между числами, в высокой половинке — своей строкой, иначе значок у названия.
    place: function (cell, tile) {
      var h = Number(tile.getAttribute('data-h')) || 2, md = $('.md', cell);
      if (h > 1 && wide(tile)) move(md, $('.v2', md), 'md');
      else if (h > 2) move(cell, md.nextSibling, 'row');
      else move($('.nm', cell), null, 'hd');
    },
    inRow: function (row, before) { move(row, before, 'cr'); }, // строка колонки
    set: function (v) {
      pct = v; val.textContent = Math.round(v) + '%';
      el.title = 'Вентилятор ' + Math.round(v) + '%';
      spin();
    },
    remove: function () {
      if (anim) anim.cancel();
      if (stillMQ && stillMQ.removeEventListener) stillMQ.removeEventListener('change', change);
      el.remove();
    }
  };
}
