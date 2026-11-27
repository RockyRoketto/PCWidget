'use strict';
// Компактные режимы: Колонка (строки), Полоска (то же в ряд), Квадрат (ячейки 2 в ряд).
// Строка: название, середина (градусы или подпись), значение, тонкая шкала внизу — та же, что в плитках.
// get -> { v: значение, u: единица, t: температура, thr: её порог, pct: шкала, sm: подпись, lv: цвет значения }

function loadCell(key, thrKey) {
  return function (s) { var d = s[key]; return d && { v: Math.round(d.load), u: '%', t: d.temp, thr: CFG.thr[thrKey], pct: d.load }; };
}
function limitCell(kind) {
  return function (s) { var l = limitBy(s, kind); return l && { v: Math.round(l.pct), u: '%', pct: clamp(l.pct, 0, 100), lv: limitLevel(l.pct), sm: resetText(l), mark: CFG.thr.claude }; };
}
function limitAlarm(kind) { return function () { var l = S && limitBy(S, kind); return !!l && Alarm.isOn('claude') && l.pct >= CFG.thr.claude - Alarm.HYST; }; }
function rateCell(bps) { var p = rateParts(bps); return { v: p[0], u: p[1] }; }
function anyDiskAlarm() { return (S && S.disks || []).some(function (d) { return Alarm.isOn('disk:' + d.name); }); }
function shortUptime(sec) {
  var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? d + ' д ' + h + ' ч' : h ? h + ' ч ' + m + ' м' : m + ' мин';
}

// n — название, g — группа (между группами в колонке тонкая черта), face — лицо часов или календаря в колонке.
var CSPEC = {
  clock: { g: 'time', n: function () { return ruDate(new Date(), { weekday: 'short', day: 'numeric' }); }, clock: true, face: function () { return CFG.clockView === 'digital' && !CFG.clockD ? null : clockFace(); },
    get: function () { return { v: clockText(new Date()) }; } },
  weather: { g: 'time', n: function (s) { return s.weather ? ICONS[s.weather.icon] || '' : ''; }, icon: true,
    get: function (s) { var w = s.weather; return w && { v: Math.round(w.temp) + '°', sm: 'ощ. ' + Math.round(w.feels) + '°' }; } },
  calendar: { g: 'time', n: function () { return ''; }, face: calendarFace,
    get: function () { var d = new Date(); return { v: ruDate(d, { day: 'numeric', month: 'short' }).replace('.', ''), sm: ruDate(d, { weekday: 'short' }) }; } },
  cpu: { g: 'load', m: 'cpu', bar: 1, n: 'CPU', alarm: function () { return Alarm.isOn('cpuTemp'); }, get: loadCell('cpu', 'cpuTemp') },
  gpu: { g: 'load', m: 'gpu', bar: 1, n: 'GPU', alarm: function () { return Alarm.isOn('gpuTemp'); }, get: loadCell('gpu', 'gpuTemp') },
  mem: { g: 'load', m: 'mem', bar: 1, n: 'RAM', alarm: function () { return Alarm.isOn('mem'); },
    get: function (s) { return s.mem && { v: Math.round(s.mem.pct), u: '%', pct: s.mem.pct, sm: Math.round(s.mem.usedGB) + ' ГБ', mark: CFG.thr.mem }; } },
  energy: { g: 'load', m: 'energy', n: function () { return ICONS.energy; }, icon: true,
    get: function (s) { var e = s.energy; return e && { v: Math.round(e.power), u: 'Вт', sm: costText(e.dayWh) || whParts(e.dayWh).join(' ') }; } },
  down: { g: 'net', m: 'net', n: '↓', get: function (s) { return s.net && rateCell(s.net.down); } },
  up: { g: 'net', m: 'net', n: '↑', get: function (s) { return s.net && rateCell(s.net.up); } },
  ping: { g: 'net', m: 'net', n: 'Пинг', get: function (s) { return s.net && s.net.ping != null ? { v: Math.round(s.net.ping), u: 'мс', lv: pingLevel(s.net.ping) } : null; } },
  disk: { g: 'disk', m: 'disks', n: 'Диск', alarm: anyDiskAlarm,
    get: function (s) {
      var list = (s.disks || []).filter(function (d) { return d.read != null; });
      return list.length ? rateCell(Math.max.apply(null, list.map(function (d) { return Math.max(d.read, d.write); }))) : null;
    } },
  space: { g: 'disk', m: 'disks', bar: 1, alarm: anyDiskAlarm, n: function (s) { var d = fullest(s); return d ? esc(d.name.replace(':', '')) : ''; },
    get: function (s) { var d = fullest(s); return d && { v: Math.round(d.usedPct), u: '%', pct: d.usedPct, sm: gbParts(d.freeGB).join(' '), mark: CFG.thr.disk }; } },
  claude: { g: 'claude', m: 'claude', bar: 1, n: 'Claude', alarm: limitAlarm('five_hour'), get: limitCell('five_hour') },
  claudew: { g: 'claude', m: 'claude', bar: 1, n: 'Неделя', alarm: limitAlarm('seven_day'), get: limitCell('seven_day') },
  uptime: { g: 'time2', n: 'ПК', get: function (s) { return s.uptime != null ? { v: shortUptime(s.uptime) } : null; } }
};
function fullest(s) { return (s.disks || []).slice().sort(function (a, b) { return b.usedPct - a.usedPct; })[0]; }

// Индикатор строки: шкала по нижнему краю (у «Заливки» фон) или столбики по потокам.
function rowViz(el, mode, bars) {
  var vz = makeViz(bars ? 'cores' : mode === 'square' && CFG.theme === 'fill' ? 'level' : 'run');
  vz.el.classList.add('lo');
  if (vz.bg) el.insertBefore(vz.el, el.firstChild); else el.appendChild(vz.el);
  el.classList.toggle('has-cores', bars);
  return vz;
}

var COMPACT_CLS = { column: 'col', strip: 'strip', square: 'sqr' };
function buildCompact(mode) {
  var list = CFG.mini[mode].filter(function (t) { return t.on; }), strip = mode === 'strip';
  var root = mk('<div class="mini ' + COMPACT_CLS[mode] + (editing ? ' editing' : '') + '"></div>');
  var items = list.map(function (t, i) {
    var sp = CSPEC[t.id], face = mode === 'column' && sp.face ? sp.face() : null, prev = i > 0 && CSPEC[list[i - 1].id];
    var el = mk('<div class="cr" data-id="' + t.id + '"' + (sp.m ? ' data-m="' + sp.m + '"' : '') + '><b class="n"></b><span class="s"></span><span class="num v"></span></div>');
    var vz = sp.bar ? rowViz(el, mode, false) : null;
    if (mode === 'column' && prev && prev.g !== sp.g) el.classList.add('sep');
    if (editing) { el.setAttribute('data-nodrag', ''); el.appendChild(editButton()); }
    root.appendChild(el);
    if (sp.bind) sp.bind(el);
    if (face) { el.classList.add('facerow'); $$('.n, .s, .v', el).forEach(function (n) { n.remove(); }); el.appendChild(face.el); }
    return { id: t.id, sp: sp, face: face, el: el, vz: vz, bars: false, n: $('.n', el), v: $('.v', el), s: $('.s', el) };
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
        if (mode === 'column') e.classList.toggle('sep', !!prev && prev.g !== CSPEC[t.id].g);
        prev = CSPEC[t.id];
      });
    });
  function put(n, html) { if (n.__h !== html) { n.__h = html; n.innerHTML = html; } }
  function draw(it, s) {
    if (it.face) return it.face.tick();
    var d = it.sp.get(s);
    it.el.hidden = !d; if (!d) return;
    var name = typeof it.sp.n === 'function' ? it.sp.n(s) : it.sp.n;
    put(it.n, name);
    it.n.classList.toggle('ico', !!it.sp.icon);
    put(it.v, segs(d.v) + (d.u ? '<small>' + d.u + '</small>' : ''));
    var temp = d.t != null, lv = temp ? level(d.t, d.thr) : d.lv || '';
    it.v.className = 'num v' + (!temp && d.lv ? ' ' + d.lv : '');
    put(it.s, temp ? segs(Math.round(d.t)) + '°' : mode === 'strip' && !it.sp.stripSm ? '' : d.sm || '');
    it.s.className = 's' + (temp ? ' num t ' + lv : '');
    setLv(it.el, lv);
    // в колонке у CPU вместо шкалы могут быть столбики по потокам
    var bars = mode === 'column' && it.id === 'cpu' && coresOn(s.cpu);
    if (bars !== it.bars) { it.vz.el.remove(); it.vz = rowViz(it.el, mode, bars); it.bars = bars; }
    if (it.vz) it.vz.set({ pct: d.pct || 0, mark: d.mark, cores: bars ? s.cpu.cores : null });
    it.el.classList.toggle('alarm', !!(it.sp.alarm && it.sp.alarm()));
    // в колонке у GPU перед градусами значок вентилятора
    if (mode === 'column' && it.id === 'gpu') {
      if (fanOn(s.gpu)) { it.fan = it.fan || fanViz(); it.fan.inRow(it.el, it.s); it.fan.set(s.gpu.fan); }
      else if (it.fan) { it.fan.remove(); it.fan = null; }
    }
    if (it.sp.post) it.sp.post(it.el);
  }
  return {
    el: root,
    tick: function () { if (S) items.forEach(function (it) { if (it.face || it.sp.clock) draw(it, S); }); },
    update: function (s) {
      items.forEach(function (it) { draw(it, s); });
      // Ширина значений в полоске только растёт: она не дёргается, когда «9%» сменяется на «100%».
      if (strip) items.forEach(function (it) {
        it.vw = Math.max(it.vw || 0, it.v.offsetWidth); it.v.style.minWidth = it.vw + 'px';
        it.sw = Math.max(it.sw || 0, it.s.offsetWidth); it.s.style.minWidth = it.sw + 'px';
      });
      placeFills(root);
    }
  };
}
