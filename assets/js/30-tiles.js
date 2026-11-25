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
// Кольцо: дуга по значению, цвет по заполненности; тревога и «тепло» перебивают.
function setRing(svg, pct, lv) {
  var fg = $('.fg', svg);
  fg.setAttribute('stroke-dasharray', (clamp(pct, 0, 100) * .75).toFixed(1) + ' 100');
  fg.style.visibility = pct > 0 ? '' : 'hidden'; // круглый конец рисует точку и у нуля
  fg.style.setProperty('--fill', lv === 'hot' ? 'var(--hot)' : fillColor(pct));
  svg.classList.toggle('lv-warm', lv === 'warm'); svg.classList.toggle('lv-hot', lv === 'hot');
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
    '<div class="big"><span class="num temp"></span><span class="num load"><span class="v">0</span><small>%</small></span></div>' +
    '<div class="side"><span></span><span></span></div>' + bar('lbar') + graphSvg() + '<div class="foot"><span>&nbsp;</span><span></span></div></div></div>');
  var v = $('.v', el), t = $('.temp', el), g = $('.graph', el), rg = $('.ring', el), lb = $('.lbar', el);
  var foot = $('.foot', el), ft = $$('.foot span', el), sd = $$('.side span', el);
  return {
    el: el,
    update: function (s) {
      var d = s[id]; el.hidden = !d; if (!d) return;
      v.textContent = Math.round(d.load);
      t.textContent = d.temp != null ? Math.round(d.temp) + '°' : '';
      t.className = 'num temp s-' + level(d.temp, CFG.thr[thrKey]);
      drawGraph(g, HIST[id], 100); setBar(lb, d.load);
      setRing(rg, d.load);
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
    var el = mk('<div class="tile mid wxt" data-tip="weather"><div class="wx"><span class="wi"></span><span class="num">0°</span>' +
      '<div class="wt"><b class="wc"></b><span class="wd"></span><span class="wf"></span></div></div><div class="wdays"></div></div>');
    var days = '';
    function t(v) { return String(Math.round(v)).replace('-', '−') + '°'; }
    function dayHtml(d, i) {
      var p = d.date.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
      return '<div class="wday' + (i ? '' : ' now') + '"><span class="dn">' + ruDate(dt, { weekday: 'short' }) + '</span><span class="di">' + (ICONS[d.icon] || '') + '</span><b>' + t(d.max) + '</b><span class="dl">' + t(d.min) + '</span></div>';
    }
    return {
      el: el,
      update: function (s) {
        var w = s.weather; el.hidden = !w; if (!w) return;
        var list = w.days || [], now = list[0];
        $('.wi', el).innerHTML = ICONS[w.icon] || '';
        $('.num', el).textContent = t(w.temp);
        $('.wc', el).textContent = w.city;
        $('.wd', el).textContent = w.desc ? w.desc.charAt(0).toUpperCase() + w.desc.slice(1) : '';
        $('.wf', el).innerHTML = '<span>Ощущается <b>' + t(w.feels) + '</b></span>' + (now ? '<span><i>↑</i><b>' + t(now.max) + '</b> <i>↓</i><b>' + t(now.min) + '</b></span>' : '');
        var key = CFG.wxDays && list.length ? JSON.stringify(list) : '';
        if (key === days) return;
        days = key;
        $('.wdays', el).innerHTML = key ? list.map(dayHtml).join('') : '';
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
    var el = mk('<div class="tile mem" data-m="mem" data-tip="mem">' + head('mem', badge() + '<span class="gb"></span><span class="num memv">0<small>%</small></span>') + bar() + '<div class="mring"><div class="mtxt"><span class="num mu"></span><span class="mof"></span></div>' +
      '<div class="mr">' + ring() + '<span class="num mp">0<small>%</small></span></div></div><div class="cap sub">&nbsp;</div></div>');
    return {
      el: el,
      update: function (s) {
        var m = s.mem; el.hidden = !m; if (!m) return;
        $('.gb', el).innerHTML = $('.sub', el).innerHTML = m.usedGB.toFixed(1) + '<span class="gl"> из ' + m.totalGB.toFixed(0) + '</span> ГБ';
        $('.memv', el).innerHTML = $('.mp', el).innerHTML = Math.round(m.pct) + '<small>%</small>';
        $('.mu', el).innerHTML = m.usedGB.toFixed(1) + '<small> ГБ</small>';
        $('.mof', el).innerHTML = 'из <b>' + m.totalGB.toFixed(0) + '</b> ГБ';
        var lv = Alarm.isOn('mem') ? 'hot' : '';
        setBar($('.bar', el), m.pct, lv); setRing($('.ring', el), m.pct, lv);
        setAlarm(el, Alarm.isOn('mem'), '');
      }
    };
  },

  net: function () {
    var r = function (ic, k) { return '<div class="rate r-' + ic + '">' + I(ic) + '<span class="num ' + k + '">0</span><small class="' + k + 'u">КБ/с</small></div>'; };
    var el = mk('<div class="tile net" data-m="net" data-tip="net">' + head('net', '<span class="ls s-hot"></span><span class="pg"></span>') +
      '<div class="rates">' + r('down', 'dn') + r('up', 'up') + '</div>' + netSvg() + '<div class="foot"><span>&nbsp;</span><span></span></div></div>');
    var ft = $$('.foot span', el);
    return {
      el: el,
      update: function (s) {
        var n = s.net; el.hidden = !n; if (!n) return;
        var a = rateParts(n.down), b = rateParts(n.up);
        $('.dn', el).textContent = a[0]; $('.dnu', el).textContent = a[1]; $('.up', el).textContent = b[0]; $('.upu', el).textContent = b[1];
        $('.pg', el).innerHTML = n.ping != null ? '<span class="pgl">пинг </span><b class="s-' + pingLevel(n.ping) + '">' + Math.round(n.ping) + '</b> мс' : '';
        $('.ls', el).innerHTML = n.loss ? '<span class="lw">потери </span>' + Math.round(n.loss) + '%' : '';
        // корень сжимает разброс: приём и отдача видны на одной шкале
        var q = Math.sqrt, mx = q(Math.max.apply(null, HIST.down.concat(HIST.up, [102400])));
        drawNet($('.graph', el), HIST.down.map(q), HIST.up.map(q), mx);
        var d = sizeParts(n.dayDown + n.dayUp), m = sizeParts(n.monthDown + n.monthUp);
        ft[0].innerHTML = '<span>Сегодня</span> <span>' + unit(d[0], d[1]) + '</span>'; ft[1].innerHTML = 'Месяц ' + unit(m[0], m[1]);
      }
    };
  },

  disks: function () {
    var row = function (n) { return mk('<div class="dr"><div class="dl1"><b class="ltr">' + esc(n) + '</b><span class="io"></span><span class="fr">&nbsp;</span></div>' + bar() + ring() + '</div>'); };
    var el = mk('<div class="tile dsk" data-m="disks" data-tip="disks">' + head('disks', badge()) + '<div class="rows"></div></div>');
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
          var lv = on ? 'hot' : d.usedPct >= thr - 5 ? 'warm' : '';
          setBar($('.bar', r), d.usedPct, lv); setRing($('.ring', r), d.usedPct, lv);
          $('.fr', r).innerHTML = '<span class="frl">своб. </span>' + unit(d.freeGB.toFixed(0), 'ГБ');
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
    var el = mk('<div class="tile prt">' + head('procs', '<span class="tabs" data-nodrag>' + tabs.map(function (t) { return '<button data-k="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</span>') + '<div class="pl"></div></div>');
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
      return load ? '<span data-m="' + n.toLowerCase() + '"><small>' + n + '</small>' + Math.round(load) + '%</span>' : '';
    };
    return { el: el, update: function () { $('.rec', el).innerHTML = cell('CPU', REC.cpuTemp, REC.cpuLoad, CFG.thr.cpuTemp) + cell('GPU', REC.gpuTemp, REC.gpuLoad, CFG.thr.gpuTemp); } };
  },

  uptime: function () {
    var el = mk('<div class="tile"><div class="cap">' + TILE_NAMES.uptime + '</div><div class="rec">&nbsp;</div></div>');
    return { el: el, update: function (s) { $('.rec', el).textContent = uptimeText(s.uptime); } };
  }
};
