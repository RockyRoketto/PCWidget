'use strict';
// Фокус-таймер (помидоро): фокус, короткий перерыв, после последнего цикла длинный.
// Время считается от отметки пуска (CFG.focusRun.start), а не тиками: не уплывает, переживает перестройку
// раскладки и перезапуск виджета (состояние лежит в настройках). Щелчок — старт и пауза, кнопка или правый щелчок — сброс.

var FOCUS_NAMES = { work: 'Фокус', short: 'Перерыв', long: 'Длинный перерыв' };
function focusDur(ph) { return focusCfg()[ph] * 60000; }
function focusState(now) {
  var r = CFG.focusRun || { ph: 'work', n: 1, start: 0, done: 0 }, dur = focusDur(r.ph);
  var spent = clamp(r.done + (r.start ? now - r.start : 0), 0, dur);
  return { ph: r.ph, n: r.n, run: !!r.start, fresh: !CFG.focusRun, paused: !!CFG.focusRun && !r.start && r.done > 0, left: dur - spent, pct: spent / dur * 100 };
}
// После фокуса — перерыв (длинный после последнего цикла), после перерыва — следующий фокус.
function focusNext(r) {
  var cy = focusCfg().cycles;
  if (r.ph === 'work') return { ph: r.n >= cy ? 'long' : 'short', n: r.n };
  return { ph: 'work', n: r.ph === 'long' || r.n >= cy ? 1 : r.n + 1 };
}
function focusTime(ms) {
  var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return (h ? h + ':' + two(m) : String(m)) + ':' + two(s % 60);
}
function focusTitle(st) { return st.ph === 'work' ? 'Фокус ' + st.n + ' из ' + focusCfg().cycles : FOCUS_NAMES[st.ph]; }

function focusToggle() {
  var now = Date.now(), r = CFG.focusRun;
  if (!r) CFG.focusRun = { ph: 'work', n: 1, start: now, done: 0 };
  else if (r.start) { r.done += now - r.start; r.start = 0; }
  else r.start = now;
  focusSound(null); // щелчок разрешает звук на будущее
  saveCfg(); focusDraw();
}
function focusReset() { CFG.focusRun = null; saveCfg(); focusDraw(); }

// Отрезок кончился: следующий ждёт щелчка или (в настройках) идёт сам с момента конца прошлого,
// так что за время, пока виджет был закрыт, могло пройти несколько отрезков. Звук и уведомление — если конец был недавно.
function focusCheck() {
  var r = CFG && CFG.focusRun, now = Date.now(), ended = null, guard = 0;
  while (r && r.start && r.done + now - r.start >= focusDur(r.ph) && guard++ < 50) {
    var at = r.start + focusDur(r.ph) - r.done, nx = focusNext(r);
    ended = { ph: r.ph, at: at };
    r = CFG.focusRun = { ph: nx.ph, n: nx.n, start: focusCfg().auto ? at : 0, done: 0 };
  }
  if (!ended) return;
  saveCfg(); focusDraw();
  if (now - ended.at > 120000) return;
  focusSound(ended.ph === 'work' ? [988, 784, 659] : [659, 784, 988]);
  if (CFG.notify) post('notify:' + (ended.ph === 'work' ? 'Фокус окончен: ' + FOCUS_NAMES[r.ph].toLowerCase() + ' ' + focusCfg()[r.ph] + ' мин' : 'Перерыв окончен: пора за дело'));
}
setInterval(focusCheck, 500);

// Мягкий звон из трёх нот WebAudio, без файлов. Без нот — только будит звук (нужен жест пользователя).
var focusAudio = null;
function focusSound(notes) {
  var C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  try {
    if (!focusAudio) focusAudio = new C();
    if (focusAudio.state === 'suspended') focusAudio.resume();
    if (!notes) return;
    var a = focusAudio, t0 = a.currentTime + .05;
    notes.forEach(function (f, i) {
      var o = a.createOscillator(), g = a.createGain(), t = t0 + i * .22;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.14, t + .03);
      g.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + 1.5);
    });
  } catch (e) { /* без звука */ }
}
document.addEventListener('pointerdown', function () { if (CFG && CFG.focusRun) focusSound(null); }, true);

// Перерисовать сразу после щелчка, не дожидаясь секундного тика.
function focusDraw() { if (view && dataReady) view.tick(); }
// Щелчок по плитке или строке: старт и пауза; при правке плиток щелчок не трогает таймер (таскают плитку).
function focusBind(el) {
  if (editing) return;
  el.setAttribute('data-nodrag', '');
  el.addEventListener('click', function (e) { if (e.target.closest('.fz-rs')) focusReset(); else focusToggle(); });
  el.addEventListener('contextmenu', function (e) { if (!CFG.focusRun) return; e.preventDefault(); e.stopPropagation(); focusReset(); });
  el.title = 'Щелчок: старт и пауза · правый щелчок: сброс';
}

// Кольцо: у «Листа» и «Заливки» гладкая дуга, у «Прибора» и «ЖК-табло» деления (несветящиеся бледно).
var FZ_TICKS = 30;
function focusRing() {
  var ticks = '';
  if (CFG.theme === 'gauge' || CFG.theme === 'lcd') {
    for (var i = 0; i < FZ_TICKS; i++) ticks += '<line y1="-18.5" y2="-13" transform="rotate(' + i * 360 / FZ_TICKS + ')"/>';
  }
  var el = mk('<svg class="fz-ring' + (ticks ? ' ticks' : '') + '" viewBox="-20 -20 40 40" aria-hidden="true">' +
    (ticks ? '<g class="tks">' + ticks + '</g>' : '<circle class="tr" r="16.5"/><circle class="pg" r="16.5" pathLength="100" transform="rotate(-90)"/>') +
    '<path class="play" d="M-3.2-5.5v11l8.6-5.5z"/><path class="pause" d="M-3.4-5v10M3.4-5v10"/></svg>');
  var pg = $('.pg', el), lines = $$('line', el), last = -1;
  return {
    el: el,
    set: function (st) {
      el.classList.toggle('run', st.run);
      var p = Math.round(st.pct * 10) / 10;
      if (p === last) return;
      last = p;
      if (pg) pg.style.strokeDasharray = p + ' 100';
      var k = Math.round(p / 100 * FZ_TICKS);
      lines.forEach(function (l, i) { l.classList.toggle('on', i < k); });
    }
  };
}
function focusDots(st) {
  var cy = focusCfg().cycles, done = st.ph === 'work' ? st.n - 1 : st.n, out = '';
  for (var i = 1; i <= cy; i++) out += '<i class="' + (i <= done ? 'on' : i === st.n && st.ph === 'work' && !st.fresh ? 'cur' : '') + '"></i>';
  return out;
}

TILE_BUILD.focus = function () {
  var el = tileBox('focus'), ring = focusRing(), fill = CFG.theme === 'fill' ? fillViz('level') : null;
  var c = mk('<div class="cb fz"><div class="hd"><b class="nm"></b><span class="ax"></span></div><div class="md"><span class="num v"></span></div>' +
    '<div class="fz-ft"><span class="fz-dots"></span><button class="fz-rs" data-nodrag title="Сбросить" aria-label="Сбросить">' + ICONS.reset + '</button></div></div>');
  var q = function (s) { return $(s, c); }, nm = q('.nm'), ax = q('.ax'), v = q('.v'), dots = q('.fz-dots'), rs = q('.fz-rs');
  var put = function (n, html) { if (n.__h !== html) { n.__h = html; n.innerHTML = html; } };
  q('.md').appendChild(ring.el);
  if (fill) { c.classList.add('has-vz'); c.insertBefore(fill.el, c.firstChild); }
  el.appendChild(c);
  focusBind(c);
  function draw() {
    var st = focusState(Date.now());
    put(nm, focusTitle(st));
    put(ax, st.run ? 'до ' + new Date(Date.now() + st.left).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : st.paused ? 'пауза' : '');
    put(v, segs(focusTime(st.left)));
    put(dots, focusDots(st));
    rs.hidden = st.fresh;
    c.classList.toggle('fz-on', st.run); c.classList.toggle('fz-brk', st.ph !== 'work'); c.classList.toggle('fz-paused', !st.run);
    ring.set(st);
    if (fill) fill.set({ pct: st.pct });
  }
  return { el: el, span: function () { return 2; }, tick: draw, update: draw };
};

// Строка в Колонке, Полоске и Квадрате: оставшееся время, подпись, шкала прогресса.
CSPEC.focus = { g: 'time2', m: 'focus', bar: 1, clock: true, icon: true, n: function () { return ICONS.focus; }, bind: focusBind,
  get: function () {
    var st = focusState(Date.now());
    return { v: focusTime(st.left), pct: st.pct, sm: st.paused ? 'пауза' : st.ph === 'work' ? 'фокус ' + st.n + '/' + focusCfg().cycles : 'перерыв' };
  },
  post: function (el) { var st = focusState(Date.now()); el.classList.toggle('fz-paused', !st.run); el.classList.toggle('fz-brk', st.ph !== 'work'); }
};
