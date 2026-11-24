'use strict';
// Компактный режим: «колонка» (строки: иконка, значение, температура) и «полоска» (то же в одну строку).
// get -> { v: число, u: единица, t: температура, pct: полоска загрузки, sm: подпись справа }

function loadCell(key, thrKey) {
  return function (s) { var d = s[key]; return d && { v: Math.round(d.load), u: '%', t: d.temp, thr: CFG.thr[thrKey], pct: d.load }; };
}
function rateCell(bps) { var p = rateParts(bps); return { v: p[0], u: p[1], rate: true }; }

var CSPEC = {
  cpu: [{ m: 'cpu', icon: 'cpu', load: true, alarm: function () { return Alarm.isOn('cpuTemp'); }, get: loadCell('cpu', 'cpuTemp') }],
  gpu: [{ m: 'gpu', icon: 'gpu', load: true, alarm: function () { return Alarm.isOn('gpuTemp'); }, get: loadCell('gpu', 'gpuTemp') }],
  mem: [{ m: 'mem', icon: 'mem', load: true, alarm: function () { return Alarm.isOn('mem'); },
    get: function (s) { return s.mem && { v: Math.round(s.mem.pct), u: '%', pct: s.mem.pct, sm: s.mem.usedGB.toFixed(0) + ' ГБ' }; } }],
  net: [
    { m: 'net', icon: 'down', sep: true, get: function (s) { return s.net && rateCell(s.net.down); } },
    { m: 'net', icon: 'up', get: function (s) { return s.net && rateCell(s.net.up); } }
  ],
  disks: [{ m: 'disks', icon: 'disk', sep: true,
    alarm: function () { return (S && S.disks || []).some(function (d) { return Alarm.isOn('disk:' + d.name); }); },
    get: function (s) {
      var list = (s.disks || []).filter(function (d) { return d.read != null; });
      return list.length ? rateCell(Math.max.apply(null, list.map(function (d) { return Math.max(d.read, d.write); }))) : null;
    } }]
};

function buildCompact(strip) {
  var specs = [];
  CFG.tiles.forEach(function (t) { if (t.on && CSPEC[t.id]) specs = specs.concat(CSPEC[t.id]); });
  var root = mk('<div class="' + (strip ? 'strip' : 'col') + '"></div>');
  var items = specs.map(function (sp, i) {
    var el = mk('<div class="' + (strip ? 'sb' : 'cr') + '" data-m="' + sp.m + '" data-tip="' + sp.m + '">' + I(sp.icon) +
      '<span class="num ' + (sp.load ? 'vv' : 'vr') + '">0</span><span class="s"></span>' + (sp.load ? '<span class="mb"><i></i></span>' : '') + '</div>');
    if (!strip && sp.sep && i > 0) el.classList.add('sep');
    root.appendChild(el);
    return { sp: sp, el: el, v: $('.num', el), s: $('.s', el), mb: $('.mb i', el) };
  });
  return {
    el: root,
    update: function (s) {
      items.forEach(function (it) {
        var d = it.sp.get(s), inline = strip || !d || !d.rate; // в колонке единица скорости стоит справа
        it.el.hidden = !d; if (!d) return;
        it.v.innerHTML = d.v + (inline ? '<small>' + d.u + '</small>' : '');
        var temp = d.t != null;
        it.s.className = 's ' + (temp ? 's-' + level(d.t, d.thr) : 'u');
        it.s.textContent = temp ? Math.round(d.t) + '°' : strip ? '' : d.rate ? d.u : d.sm || '';
        if (it.mb) it.mb.style.width = clamp(d.pct, 0, 100) + '%';
        it.el.classList.toggle('alarm', !!(it.sp.alarm && it.sp.alarm()));
        if (!strip) return;
        // Ширина значений только растёт: полоска не дёргается, когда «9%» сменяется на «100%».
        it.vw = Math.max(it.vw || 0, it.v.offsetWidth); it.v.style.minWidth = it.vw + 'px';
        it.sw = Math.max(it.sw || 0, it.s.offsetWidth); it.s.style.minWidth = it.sw + 'px';
      });
    }
  };
}
