'use strict';
// Компактный режим: «колонка» (строки в сетке 20 | значение | мелкая цифра) и «полоска» (всё в одну строку).

var CSPEC = {
  cpu: [{ tip: 'cpu', icon: 'cpu', alarm: function () { return Alarm.isOn('cpuTemp'); },
    get: function (s) { return s.cpu && { v: Math.round(s.cpu.load) + '%', sm: s.cpu.temp != null ? Math.round(s.cpu.temp) + '°' : '' }; } }],
  gpu: [{ tip: 'gpu', icon: 'gpu', alarm: function () { return Alarm.isOn('gpuTemp'); },
    get: function (s) { return s.gpu && { v: Math.round(s.gpu.load) + '%', sm: s.gpu.temp != null ? Math.round(s.gpu.temp) + '°' : '' }; } }],
  mem: [{ tip: 'mem', icon: 'mem', alarm: function () { return Alarm.isOn('mem'); },
    get: function (s) { return s.mem && { v: Math.round(s.mem.pct) + '%', sm: s.mem.usedGB.toFixed(0) + 'Г' }; } }],
  net: [
    { tip: 'net', icon: 'down', sep: true, get: function (s) { if (!s.net) return null; var p = rateParts(s.net.down); return { v: p[0], sm: p[1] }; } },
    { tip: 'net', icon: 'up', get: function (s) { if (!s.net) return null; var p = rateParts(s.net.up); return { v: p[0], sm: p[1] }; } }
  ],
  disks: [{ tip: 'disks', icon: 'disk', sep: true,
    alarm: function () { return (S && S.disks || []).some(function (d) { return Alarm.isOn('disk:' + d.name); }); },
    get: function (s) {
      var list = (s.disks || []).filter(function (d) { return d.read != null; });
      if (!list.length) return null;
      var mx = Math.max.apply(null, list.map(function (d) { return Math.max(d.read, d.write); })), p = rateParts(mx);
      return { v: p[0], sm: p[1] };
    } }]
};
// В полоске сеть сведена в один блок со стрелками.
var CSTRIP_NET = [{ tip: 'net', icon: 'net', sep: true, get: function (s) {
  return s.net && { v: '↓' + rateParts(s.net.down)[0] + ' ↑' + rateParts(s.net.up)[0], sm: '' };
} }];

function compactSpecs(strip) {
  var out = [];
  CFG.tiles.forEach(function (t) {
    if (!t.on) return;
    var list = strip && t.id === 'net' ? CSTRIP_NET : CSPEC[t.id];
    if (list) out = out.concat(list);
  });
  return out;
}

function buildCompact(strip) {
  var specs = compactSpecs(strip);
  var root = mk('<div class="' + (strip ? 'strip' : 'ccol') + '"></div>');
  var items = specs.map(function (sp, i) {
    var el = strip
      ? mk('<div class="sb" data-tip="' + sp.tip + '"><span class="ci">' + ICONS[sp.icon] + '</span><b class="cv"></b><small class="cs"></small></div>')
      : mk('<div class="crow" data-tip="' + sp.tip + '"><span class="ci">' + ICONS[sp.icon] + '</span><b class="cv"></b><small class="cs"></small></div>');
    if (sp.sep && i > 0) el.classList.add('sep');
    root.appendChild(el);
    return { sp: sp, el: el, v: $('.cv', el), sm: $('.cs', el) };
  });
  return {
    el: root,
    update: function (s) {
      items.forEach(function (it) {
        var d = it.sp.get(s);
        it.el.hidden = !d;
        if (!d) return;
        it.v.textContent = d.v; it.sm.textContent = d.sm;
        // Ширина значений только растёт: полоска не дёргается, когда «9%» сменяется на «100%».
        it.vw = Math.max(it.vw || 0, it.v.offsetWidth); it.v.style.minWidth = it.vw + 'px';
        it.sw = Math.max(it.sw || 0, it.sm.offsetWidth); it.sm.style.minWidth = it.sw + 'px';
        it.el.classList.toggle('alarm', !!(it.sp.alarm && it.sp.alarm()));
      });
    }
  };
}
