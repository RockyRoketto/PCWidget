'use strict';
// Компактный режим: «колонка» (строки: иконка, значение, температура) и «полоска» (то же в одну строку).
// get -> { v: значение, u: единица, t: температура, thr: её порог, pct: полоска загрузки, sm: подпись справа,
//          lv: цвет значения, icon: другая иконка, letter: буква вместо иконки }

function loadCell(key, thrKey) {
  return function (s) { var d = s[key]; return d && { v: Math.round(d.load), u: '%', t: d.temp, thr: CFG.thr[thrKey], pct: d.load }; };
}
function limitCell(kind) {
  return function (s) { var l = limitBy(s, kind); return l && { v: Math.round(l.pct), u: '%', pct: clamp(l.pct, 0, 100), lv: limitLevel(l.pct), sm: resetText(l) }; };
}
function limitAlarm(kind) { return function () { var l = S && limitBy(S, kind); return !!l && Alarm.isOn('claude') && l.pct >= CFG.thr.claude - Alarm.HYST; }; }
function rateCell(bps) { var p = rateParts(bps); return { v: p[0], u: p[1], rate: true }; }
function anyDiskAlarm() { return (S && S.disks || []).some(function (d) { return Alarm.isOn('disk:' + d.name); }); }
function shortUptime(sec) {
  var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? d + ' д ' + h + ' ч' : h ? h + ' ч ' + m + ' м' : m + ' мин';
}

// g — группа: между разными группами в колонке тонкая линия. cls — ширина значения в полоске.
var CSPEC = {
  clock: { g: 'time', icon: 'clock', cls: 'vt', clock: true, face: function () { return CFG.clockView === 'digital' ? null : clockFace(); }, get: function () { var d = new Date(); return { v: clockText(d), sm: d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }) }; } },
  weather: { g: 'time', tip: 'weather', icon: 'weather', cls: 'vt', get: function (s) { var w = s.weather; return w && { v: Math.round(w.temp) + '°', icon: w.icon, sm: 'ощ. ' + Math.round(w.feels) + '°' }; } },
  calendar: { g: 'time', icon: 'calendar', cls: 'vt', face: calendarFace, get: function () { return { v: new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') }; } },
  cpu: { g: 'load', m: 'cpu', icon: 'cpu', load: true, alarm: function () { return Alarm.isOn('cpuTemp'); }, get: loadCell('cpu', 'cpuTemp') },
  gpu: { g: 'load', m: 'gpu', icon: 'gpu', load: true, alarm: function () { return Alarm.isOn('gpuTemp'); }, get: loadCell('gpu', 'gpuTemp') },
  mem: { g: 'load', m: 'mem', icon: 'mem', load: true, alarm: function () { return Alarm.isOn('mem'); },
    get: function (s) { return s.mem && { v: Math.round(s.mem.pct), u: '%', pct: s.mem.pct, sm: s.mem.usedGB.toFixed(0) + ' ГБ' }; } },
  down: { g: 'net', m: 'net', icon: 'down', get: function (s) { return s.net && rateCell(s.net.down); } },
  up: { g: 'net', m: 'net', icon: 'up', get: function (s) { return s.net && rateCell(s.net.up); } },
  ping: { g: 'net', m: 'net', icon: 'ping', cls: 'vv', get: function (s) { return s.net && s.net.ping != null ? { v: Math.round(s.net.ping), u: 'мс', rate: true, lv: pingLevel(s.net.ping) } : null; } },
  disk: { g: 'disk', m: 'disks', icon: 'disk', alarm: anyDiskAlarm,
    get: function (s) {
      var list = (s.disks || []).filter(function (d) { return d.read != null; });
      return list.length ? rateCell(Math.max.apply(null, list.map(function (d) { return Math.max(d.read, d.write); }))) : null;
    } },
  space: { g: 'disk', m: 'disks', icon: 'disk', load: true, alarm: anyDiskAlarm, // самый заполненный диск
    get: function (s) {
      var d = (s.disks || []).slice().sort(function (a, b) { return b.usedPct - a.usedPct; })[0];
      return d && { v: Math.round(d.usedPct), u: '%', pct: d.usedPct, sm: d.freeGB.toFixed(0) + ' ГБ', letter: d.name.replace(':', '') };
    } },
  claude: { g: 'claude', m: 'claude', icon: 'claude', load: true, alarm: limitAlarm('five_hour'), get: limitCell('five_hour') },
  claudew: { g: 'claude', m: 'claude', icon: 'claudew', load: true, alarm: limitAlarm('seven_day'), get: limitCell('seven_day') },
  uptime: { g: 'time2', icon: 'uptime', cls: 'vt', get: function (s) { return s.uptime != null ? { v: shortUptime(s.uptime), small: true } : null; } }
};

function buildCompact(strip) {
  var mode = strip ? 'strip' : 'column', list = CFG.mini[mode].filter(function (t) { return t.on; });
  var root = mk('<div class="' + (strip ? 'strip' : 'col') + (editing ? ' editing' : '') + '"></div>');
  var items = list.map(function (t, i) {
    var sp = CSPEC[t.id], face = !strip && sp.face ? sp.face() : null, prev = i > 0 && CSPEC[list[i - 1].id];
    var el = mk('<div class="' + (strip ? 'sb' : 'cr') + '" data-id="' + t.id + '"' + (sp.m ? ' data-m="' + sp.m + '"' : '') + (sp.tip || sp.m ? ' data-tip="' + (sp.tip || sp.m) + '"' : '') + '>' + I(sp.icon) +
      '<span class="num ' + (sp.cls || (sp.load ? 'vv' : 'vr')) + '">0</span><span class="s"></span>' + (sp.load ? '<span class="mb"><i></i></span>' : '') + '</div>');
    if (!strip && prev && prev.g !== sp.g) el.classList.add('sep');
    if (editing) { el.setAttribute('data-nodrag', ''); el.appendChild(editButton()); }
    root.appendChild(el);
    if (face) { el.classList.add('facerow'); $$('.i, .num, .s', el).forEach(function (n) { n.remove(); }); el.appendChild(face.el); }
    return { sp: sp, face: face, el: el, ic: $('.i', el), v: $('.num', el), s: $('.s', el), mb: $('.mb i', el) };
  });
  if (!items.length) root.appendChild(emptyNote());
  editEvents(root, '[data-id]', function (id) { setOn(mode, id, false); },
    function (rects, x, y, id) { return dropMini(rects, x, y, id, strip); },
    function (id, d) { moveMini(mode, id, d.to, d.how === 'after'); },
    function () {
      var prev = null;
      CFG.mini[mode].filter(function (t) { return t.on; }).forEach(function (t) {
        var e = $('[data-id="' + t.id + '"]', root);
        if (!e) return;
        root.appendChild(e);
        if (!strip) e.classList.toggle('sep', !!prev && prev.g !== CSPEC[t.id].g);
        prev = CSPEC[t.id];
      });
    });
  function draw(it, s) {
    if (it.face) return it.face.tick();
    var d = it.sp.get(s), inline = strip || !d || !d.rate; // в колонке единица скорости стоит справа
    it.el.hidden = !d; if (!d) return;
    it.v.innerHTML = d.v + (inline && d.u ? '<small>' + d.u + '</small>' : '');
    it.v.classList.toggle('sml', !!d.small);
    ['ok', 'warm', 'hot'].forEach(function (l) { it.v.classList.toggle('s-' + l, d.lv === l); });
    var ic = d.letter ? '<b class="let">' + esc(d.letter) + '</b>' : d.icon ? ICONS[d.icon] : '';
    if (ic && it.ico !== ic) { it.ico = ic; it.ic.innerHTML = ic; }
    var temp = d.t != null;
    it.el.classList.toggle('hast', temp);
    it.s.className = 's ' + (temp ? 's-' + level(d.t, d.thr) : 'u');
    it.s.textContent = temp ? Math.round(d.t) + '°' : strip ? '' : d.rate ? d.u : d.sm || '';
    if (it.mb) it.mb.style.width = clamp(d.pct, 0, 100) + '%';
    it.el.classList.toggle('alarm', !!(it.sp.alarm && it.sp.alarm()));
  }
  return {
    el: root,
    tick: function () { if (S) items.forEach(function (it) { if (it.face || it.sp.clock) draw(it, S); }); },
    update: function (s) {
      items.forEach(function (it) { draw(it, s); });
      // Ширина значений только растёт: полоска не дёргается, когда «9%» сменяется на «100%».
      if (strip) items.forEach(function (it) {
        it.vw = Math.max(it.vw || 0, it.v.offsetWidth); it.v.style.minWidth = it.vw + 'px';
        it.sw = Math.max(it.sw || 0, it.s.offsetWidth); it.s.style.minWidth = it.sw + 'px';
      });
    }
  };
}
