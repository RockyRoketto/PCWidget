'use strict';
// Плитки полного режима. build() создаёт DOM один раз, update(s) только меняет значения.
// Плитка без данных скрывается (el.hidden), раскладка потом пересчитывает ширины (45-grid.js).

function head(id, right) {
  return '<div class="th">' + I(id) + '<b>' + TILE_NAMES[id] + '</b><span class="sp"></span>' + (right || '') + '</div>';
}
function bar(cls) { return '<div class="bar ' + (cls || '') + '"><i></i></div>'; }
function setBar(el, pct, lv) {
  $('i', el).style.width = clamp(pct, 0, 100) + '%';
  el.classList.toggle('lv-warm', lv === 'warm'); el.classList.toggle('lv-hot', lv === 'hot');
}
function badge() { return '<span class="badge">' + I('warn') + '<span></span></span>'; }
function setAlarm(el, on, text) { el.classList.toggle('alarm', !!on); $('.badge span:last-child', el).textContent = text; }
function ring() {
  var c = function (cls, dash) { return '<circle class="' + cls + '" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="' + dash + '" transform="rotate(135 18 18)" stroke-linecap="round"/>'; };
  return '<svg class="ring" viewBox="0 0 36 36">' + c('bg', '75 100') + c('fg', '0 100') + '</svg>';
}

// CPU и GPU: загрузка и температура крупно, график, строка деталей.
function bigTile(id, details) {
  var thrKey = id + 'Temp';
  var el = mk('<div class="tile bigt" data-m="' + id + '" data-tip="' + id + '">' + head(id, badge()) + '<div class="duo">' + ring() +
    '<div class="big"><span class="num load"><span class="v">0</span><small>%</small></span><span class="num temp"></span></div>' +
    '<div class="side"><span></span><span></span></div>' + bar('lbar') + graphSvg() + '<div class="foot"><span>&nbsp;</span><span></span></div></div></div>');
  var v = $('.v', el), t = $('.temp', el), g = $('.graph', el), fg = $('.fg', el), lb = $('.lbar', el);
  var foot = $('.foot', el), ft = $$('.foot span', el), sd = $$('.side span', el);
  return {
    el: el,
    update: function (s) {
      var d = s[id]; el.hidden = !d; if (!d) return;
      v.textContent = Math.round(d.load);
      t.textContent = d.temp != null ? Math.round(d.temp) + '°' : '';
      t.className = 'num temp s-' + level(d.temp, CFG.thr[thrKey]);
      drawGraph(g, HIST[id], 100); setBar(lb, d.load);
      fg.setAttribute('stroke-dasharray', (d.load * .75).toFixed(1) + ' 100');
      var x = details(d).filter(Boolean);
      [0, 1].forEach(function (i) { ft[i].innerHTML = sd[i].innerHTML = x[i] || ''; });
      foot.hidden = !x.length;
      setAlarm(el, Alarm.isOn(thrKey), 'выше ' + CFG.thr[thrKey] + '°');
    }
  };
}
function unit(v, u) { return '<b>' + v + '</b> ' + u; }
function powerText(d) { return d.power != null ? unit(Math.round(d.power), 'Вт') : ''; }

// Часы и календарь: лицо из 25-faces.js, от данных не зависит.
function faceTile(f, sq) {
  var el = mk('<div class="tile mid' + (sq ? ' sq' : '') + '"></div>');
  el.appendChild(f.el);
  return { el: el, update: f.tick, tick: f.tick };
}

var TILE_BUILD = {
  clock: function () { return faceTile(clockFace(), CFG.clockView !== 'digital'); },
  calendar: function () { return faceTile(calendarFace(), CFG.calView === 'month'); },

  weather: function () {
    var el = mk('<div class="tile mid" data-tip="weather"><div class="wx"><div class="wl"><span class="num">0°</span><div class="cap wd1"></div><div class="cap wd2"></div></div><span class="wi"></span></div><div class="wdays"></div></div>');
    var days = '';
    function t(v) { return Math.round(v) + '°'; }
    return {
      el: el,
      update: function (s) {
        var w = s.weather; el.hidden = !w; if (!w) return;
        $('.wi', el).innerHTML = ICONS[w.icon] || '';
        $('.num', el).textContent = t(w.temp);
        $('.wd1', el).textContent = (w.desc ? w.desc.charAt(0).toUpperCase() + w.desc.slice(1) + ', ' : '') + 'ощущается ' + t(w.feels);
        $('.wd2', el).textContent = w.city;
        var key = JSON.stringify(w.days || []);
        if (key === days) return;
        days = key;
        $('.wdays', el).innerHTML = (w.days || []).map(function (d, i) {
          var p = d.date.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
          return '<div class="wday' + (i ? '' : ' now') + '"><span class="dn">' + ruDate(dt, { weekday: 'short' }) + '</span><span class="di">' + (ICONS[d.icon] || '') + '</span><b>' + t(d.max) + '</b><span class="dl">' + t(d.min) + '</span></div>';
        }).join('');
      }
    };
  },

  cpu: function () { return bigTile('cpu', function (d) { return [d.freq != null ? unit((d.freq / 1000).toFixed(1), 'ГГц') : '', powerText(d)]; }); },
  gpu: function () {
    return bigTile('gpu', function (d) {
      return [d.memUsed != null && d.memTotal != null ? '<b>' + (d.memUsed / 1024).toFixed(1) + '</b>/' + (d.memTotal / 1024).toFixed(0) + ' ГБ' : '', powerText(d)];
    });
  },

  mem: function () {
    var el = mk('<div class="tile mem" data-m="mem" data-tip="mem">' + head('mem', badge() + '<span class="gb"></span><span class="num memv">0<small>%</small></span>') + bar() + '<div class="cap sub">&nbsp;</div></div>');
    return {
      el: el,
      update: function (s) {
        var m = s.mem; el.hidden = !m; if (!m) return;
        $('.gb', el).innerHTML = $('.sub', el).innerHTML = m.usedGB.toFixed(1) + '<span class="gl"> из ' + m.totalGB.toFixed(0) + '</span> ГБ';
        $('.memv', el).innerHTML = Math.round(m.pct) + '<small>%</small>';
        setBar($('.bar', el), m.pct, Alarm.isOn('mem') ? 'hot' : '');
        setAlarm(el, Alarm.isOn('mem'), '');
      }
    };
  },

  net: function () {
    var r = function (ic, k) { return '<div class="rate">' + I(ic) + '<span class="num ' + k + '">0</span><small class="' + k + 'u">КБ/с</small></div>'; };
    var el = mk('<div class="tile net" data-m="net" data-tip="net">' + head('net', '<span class="ls s-hot"></span><span class="pg"></span>') +
      '<div class="rates">' + r('down', 'dn') + r('up', 'up') + '</div>' + graphSvg('<path class="u"/>') + '<div class="foot"><span>&nbsp;</span><span></span></div></div>');
    var ft = $$('.foot span', el);
    return {
      el: el,
      update: function (s) {
        var n = s.net; el.hidden = !n; if (!n) return;
        var a = rateParts(n.down), b = rateParts(n.up);
        $('.dn', el).textContent = a[0]; $('.dnu', el).textContent = a[1]; $('.up', el).textContent = b[0]; $('.upu', el).textContent = b[1];
        $('.pg', el).innerHTML = n.ping != null ? '<span class="pgl">пинг </span><b class="s-' + pingLevel(n.ping) + '">' + Math.round(n.ping) + '</b> мс' : '';
        $('.ls', el).textContent = n.loss ? 'потери ' + Math.round(n.loss) + '%' : '';
        // корень сжимает разброс: приём и отдача видны на одной шкале
        var q = Math.sqrt, mx = q(Math.max.apply(null, HIST.down.concat(HIST.up, [102400])));
        drawGraph($('.graph', el), HIST.down.map(q), mx);
        $('path.u', el).setAttribute('d', areaPath(HIST.up.map(q), mx)[0]);
        var d = sizeParts(n.dayDown + n.dayUp), m = sizeParts(n.monthDown + n.monthUp);
        ft[0].innerHTML = 'Сегодня ' + unit(d[0], d[1]); ft[1].innerHTML = 'Месяц ' + unit(m[0], m[1]);
      }
    };
  },

  disks: function () {
    var row = function (n) { return mk('<div class="dr"><span class="ltr">' + esc(n) + '</span>' + bar() + '<div class="foot"><span class="fr">&nbsp;</span><span class="io"></span></div></div>'); };
    var el = mk('<div class="tile" data-m="disks" data-tip="disks">' + head('disks', badge()) + '<div class="rows"></div></div>');
    var rows = $('.rows', el), built = {}, stub = row('C');
    rows.appendChild(stub);
    var io = function (t, v) { return '<span class="' + (v > 102400 ? 'on' : '') + '"><span>' + t + '</span><span>' + rateText(v) + '</span></span>'; };
    return {
      el: el,
      update: function (s) {
        var list = s.disks || [], al = false; el.hidden = !list.length;
        if (stub && list.length) { stub.remove(); stub = null; }
        var names = {};
        list.forEach(function (d) {
          names[d.name] = 1;
          var r = built[d.name]; if (!r) { r = built[d.name] = row(d.name.replace(':', '')); rows.appendChild(r); }
          var on = Alarm.isOn('disk:' + d.name), thr = CFG.thr.disk; al = al || on;
          setBar($('.bar', r), d.usedPct, on ? 'hot' : d.usedPct >= thr - 5 ? 'warm' : '');
          $('.fr', r).innerHTML = 'своб. ' + unit(d.freeGB.toFixed(0), 'ГБ');
          $('.io', r).innerHTML = d.read != null ? io('чт', d.read) + io('зп', d.write) : '';
        });
        Object.keys(built).forEach(function (k) { if (!names[k]) { built[k].remove(); delete built[k]; } }); // флешку вынули
        setAlarm(el, al, 'мало места');
      }
    };
  },

  procs: function () {
    var tabs = [['cpu', 'CPU'], ['ram', 'Память'], ['disk', 'Диск']], tint = { cpu: 'cpu', ram: 'mem', disk: 'disks' };
    var fmt = { cpu: function (v) { return v.toFixed(v < 10 ? 1 : 0) + '%'; }, ram: function (v) { return sizeText(v * 1048576); }, disk: rateText };
    var el = mk('<div class="tile">' + head('procs', '<span class="tabs" data-nodrag>' + tabs.map(function (t) { return '<button data-k="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</span>') + '<div class="pl"></div></div>');
    var o = {
      el: el,
      update: function (s) {
        var k = CFG.procTab, p = s && s.procs, list = p && p[k] ? p[k].slice(0, CFG.procN) : [], mx = k === 'cpu' ? 100 : list.length ? list[0].v : 1, html = '';
        el.setAttribute('data-m', tint[k]); el.hidden = !!s && !p;
        $$('.tabs button', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === k); });
        for (var i = 0; i < CFG.procN; i++) { // строк всегда поровну, чтобы плитка не меняла высоту
          var it = list[i];
          html += it ? '<div class="pi" style="--p:' + clamp(it.v / mx * 100, 0, 100).toFixed(0) + '%"><span>' + esc(it.name.replace(/\.exe$/i, '')) + '</span><b>' + fmt[k](it.v) + '</b></div>' : '<div class="pi" style="--p:0"><span>&nbsp;</span></div>';
        }
        $('.pl', el).innerHTML = html;
      }
    };
    o.update(null);
    $('.tabs', el).addEventListener('click', function (e) {
      var k = e.target.getAttribute('data-k'); if (!k) return;
      CFG.procTab = k; saveCfg(); o.update(S);
    });
    return o;
  },

  records: function () {
    var el = mk('<div class="tile" data-tip="records"><div class="cap">' + TILE_NAMES.records + '</div><div class="rec">&nbsp;</div></div>');
    var cell = function (n, temp, load, thr) {
      if (temp != null) return '<span><small>' + n + '</small><span class="s-' + level(temp, thr) + '">' + Math.round(temp) + '°</span></span>';
      return load ? '<span><small>' + n + '</small>' + Math.round(load) + '%</span>' : '';
    };
    return { el: el, update: function () { $('.rec', el).innerHTML = cell('CPU', REC.cpuTemp, REC.cpuLoad, CFG.thr.cpuTemp) + cell('GPU', REC.gpuTemp, REC.gpuLoad, CFG.thr.gpuTemp); } };
  },

  uptime: function () {
    var el = mk('<div class="tile"><div class="cap">' + TILE_NAMES.uptime + '</div><div class="rec">&nbsp;</div></div>');
    return { el: el, update: function (s) { $('.rec', el).textContent = uptimeText(s.uptime); } };
  }
};
