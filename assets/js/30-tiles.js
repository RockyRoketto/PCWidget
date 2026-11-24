'use strict';
// Плитки полного режима. build() создаёт DOM один раз, update(s) только меняет значения.

function head(id, extra, name) {
  return '<div class="t-head"><span class="t-ico">' + ICONS[id] + '</span><span class="t-name">' + (name || TILE_NAMES[id]) + '</span>' + (extra || '') + '</div>';
}
function bar(cls) { return '<div class="bar ' + (cls || '') + '"><i></i></div>'; }
function setBar(el, pct) { $('i', el).style.width = Math.max(0, Math.min(100, pct)) + '%'; }
function spark(cls) { return '<svg class="spark ' + (cls || '') + '" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points=""/></svg>'; }
function ring() { return '<svg class="ring" viewBox="0 0 36 36"><circle class="r-bg" cx="18" cy="18" r="15"/><circle class="r-fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="0 100"/></svg>'; }
function setRing(el, pct) { $('.r-fg', el).setAttribute('stroke-dasharray', Math.max(0, Math.min(100, pct)).toFixed(1) + ' 100'); }

// Плитка с крупным числом (CPU, GPU).
function bigTile(id, key, getSub, getAlarm) {
  var el = mk('<div class="tile half" data-tile="' + id + '" data-tip="' + id + '">' + head(id) +
    '<div class="t-big"><span class="v">0</span><small>%</small></div><div class="t-sub"></div>' + spark(id) + ring() + '</div>');
  var v = $('.v', el), sub = $('.t-sub', el), pl = $('polyline', el);
  return {
    el: el,
    update: function (s) {
      var d = s[key];
      el.hidden = !d;
      if (!d) return;
      v.textContent = Math.round(d.load);
      sub.textContent = getSub(d);
      pl.setAttribute('points', sparkPoints(HIST[key], 100));
      setRing(el, d.load);
      el.classList.toggle('alarm', Alarm.isOn(getAlarm));
    }
  };
}

function cpuSub(d) {
  var p = [];
  if (d.temp != null) p.push(Math.round(d.temp) + '°');
  if (d.freq != null) p.push((d.freq / 1000).toFixed(1) + ' ГГц');
  if (d.power != null) p.push(Math.round(d.power) + ' Вт');
  return p.join(' · ');
}
function gpuSub(d) {
  var p = [];
  if (d.temp != null) p.push(Math.round(d.temp) + '°');
  if (d.memUsed != null && d.memTotal != null) p.push((d.memUsed / 1024).toFixed(1) + '/' + (d.memTotal / 1024).toFixed(0) + ' ГБ');
  if (d.power != null) p.push(Math.round(d.power) + ' Вт');
  return p.join(' · ');
}

var TILE_BUILD = {
  cpu: function () { return bigTile('cpu', 'cpu', cpuSub, 'cpuTemp'); },
  gpu: function () { return bigTile('gpu', 'gpu', gpuSub, 'gpuTemp'); },

  mem: function () {
    var el = mk('<div class="tile wide" data-tile="mem" data-tip="mem">' + head('mem', '<span class="t-val"></span>') + bar() + '<div class="t-sub"></div></div>');
    var val = $('.t-val', el), b = $('.bar', el), sub = $('.t-sub', el);
    return {
      el: el,
      update: function (s) {
        var m = s.mem; el.hidden = !m; if (!m) return;
        val.textContent = m.usedGB.toFixed(1) + ' из ' + m.totalGB.toFixed(0) + ' ГБ · ' + Math.round(m.pct) + '%';
        setBar(b, m.pct);
        sub.textContent = m.pageUsedGB != null ? 'подкачка ' + m.pageUsedGB.toFixed(1) + ' из ' + m.pageTotalGB.toFixed(1) + ' ГБ' : '';
        el.classList.toggle('alarm', Alarm.isOn('mem'));
      }
    };
  },

  net: function () {
    var el = mk('<div class="tile wide" data-tile="net" data-tip="net">' + head('net', '<span class="t-val"></span>') +
      '<div class="net-rates"><div><span class="arrow">' + ICONS.down + '</span><span class="v dn">0</span><small class="du">КБ/с</small></div>' +
      '<div><span class="arrow">' + ICONS.up + '</span><span class="v up">0</span><small class="uu">КБ/с</small></div></div>' +
      spark('net') + '<div class="t-sub"></div></div>');
    var dn = $('.dn', el), du = $('.du', el), up = $('.up', el), uu = $('.uu', el), val = $('.t-val', el), sub = $('.t-sub', el), pl = $('polyline', el);
    return {
      el: el,
      update: function (s) {
        var n = s.net; el.hidden = !n; if (!n) return;
        var a = rateParts(n.down), b = rateParts(n.up);
        dn.textContent = a[0]; du.textContent = a[1]; up.textContent = b[0]; uu.textContent = b[1];
        val.textContent = (n.ping != null ? 'пинг ' + Math.round(n.ping) + ' мс' : '') + (n.loss ? ' · потери ' + Math.round(n.loss) + '%' : '');
        sub.textContent = 'день ' + sizeText(n.dayDown) + ' ↓ ' + sizeText(n.dayUp) + ' ↑ · месяц ' + sizeText(n.monthDown) + ' ↓ ' + sizeText(n.monthUp) + ' ↑';
        pl.setAttribute('points', sparkPoints(HIST.down, Math.max.apply(null, HIST.down.concat([102400]))));
      }
    };
  },

  disks: function () {
    var el = mk('<div class="tile wide" data-tile="disks" data-tip="disks">' + head('disks') + '<div class="rows"></div></div>');
    var rows = $('.rows', el), built = {};
    return {
      el: el,
      update: function (s) {
        var list = s.disks || []; el.hidden = !list.length; if (!list.length) return;
        list.forEach(function (d) {
          var r = built[d.name];
          if (!r) {
            r = built[d.name] = mk('<div class="drow"><span class="dn">' + esc(d.name) + '</span>' + bar() + '<span class="dfree"></span><span class="dio"></span></div>');
            rows.appendChild(r);
          }
          setBar($('.bar', r), d.usedPct);
          $('.dfree', r).textContent = 'своб. ' + d.freeGB.toFixed(0) + ' ГБ';
          $('.dio', r).textContent = d.read != null ? 'R ' + rateText(d.read) + ' · W ' + rateText(d.write) + (d.temp != null ? ' · ' + Math.round(d.temp) + '°' : '') : '';
          r.classList.toggle('alarm', Alarm.isOn('disk:' + d.name));
        });
        el.classList.toggle('alarm', list.some(function (d) { return Alarm.isOn('disk:' + d.name); }));
      }
    };
  },

  procs: function () {
    var el = mk('<div class="tile wide" data-tile="procs" data-tip="procs">' + head('procs') +
      '<div class="pcols"><div data-k="cpu"></div><div data-k="ram"></div><div data-k="disk"></div></div></div>');
    var fmt = { cpu: function (v) { return v.toFixed(0) + '%'; }, ram: function (v) { return sizeText(v * 1048576); }, disk: rateText };
    var cap = { cpu: 'CPU', ram: 'RAM', disk: 'Диск' };
    return {
      el: el,
      update: function (s) {
        var p = s.procs; el.hidden = !p; if (!p) return;
        ['cpu', 'ram', 'disk'].forEach(function (k) {
          $('[data-k=' + k + ']', el).innerHTML = '<h4>' + cap[k] + '</h4>' + (p[k] || []).map(function (it) {
            return '<div class="pi"><span>' + esc(it.name) + '</span><b>' + fmt[k](it.v) + '</b></div>';
          }).join('');
        });
      }
    };
  },

  records: function () {
    var el = mk('<div class="tile wide slim" data-tile="records" data-tip="records">' + head('records', '<span class="t-val"></span>', 'Рекорды') + '</div>');
    var val = $('.t-val', el);
    return {
      el: el,
      update: function () {
        var p = [];
        if (REC.cpuLoad) p.push('CPU ' + Math.round(REC.cpuLoad) + '%' + (REC.cpuTemp != null ? ' ' + Math.round(REC.cpuTemp) + '°' : ''));
        if (REC.gpuLoad) p.push('GPU ' + Math.round(REC.gpuLoad) + '%' + (REC.gpuTemp != null ? ' ' + Math.round(REC.gpuTemp) + '°' : ''));
        if (REC.down) p.push('↓ ' + rateText(REC.down));
        val.textContent = p.join(' · ');
      }
    };
  },

  uptime: function () {
    var el = mk('<div class="tile wide slim" data-tile="uptime">' + head('uptime', '<span class="t-val"></span>') + '</div>');
    var val = $('.t-val', el);
    return { el: el, update: function (s) { val.textContent = uptimeText(s.uptime); } };
  }
};
