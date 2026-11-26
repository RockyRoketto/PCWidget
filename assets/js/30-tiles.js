'use strict';
// Плитки Панели и Широкой. build() создаёт DOM один раз, update(s) меняет значения.
// Плитка: { el, update(s), span() — высота в модулях 52px, tick() — для часов }.
// Плитка без данных скрывается (el.hidden), раскладка потом пересчитывает ширины и высоты (45-grid.js).
// Сеть и Claude во всю ширину — две ячейки рядом, в половинке — одна ячейка со строками.

function tileBox(id, m) { return mk('<div class="tile" data-m="' + (m || id) + '"></div>'); }
function wide(el) { return el.classList.contains('w2'); }
// Тонкая: высота в модуль (data-h ставит раскладка, 45-grid.js).
function thinOn(id) { return !!(THIN_OK[id] && CFG.thin[id]); }
function thinNow(el) { return el.getAttribute('data-h') === '1'; }
function cpuDetails(d) { return [d.freq != null ? dec(d.freq / 1000, 1) + ' ГГц' : '', d.power != null ? Math.round(d.power) + ' Вт' : ''].filter(Boolean).join(' · '); }

// CPU и GPU: градусы крупно слева, загрузка справа, история загрузки. Без датчика — загрузка крупно.
function loadTile(id, details) {
  var el = tileBox(id), thrKey = id + 'Temp', c, bars;
  // индикатор меняется вместе с ячейкой: история загрузки или столбики по потокам (есть только у CPU)
  function use(on) {
    if (bars === on) return;
    var n = makeCell({ kind: on ? 'cores' : 'graph', name: id.toUpperCase() });
    if (c) { el.replaceChild(n.el, c.el); packSig = ''; } // раскладка заново покрасит «Заливку»
    else el.appendChild(n.el);
    c = n; bars = on;
  }
  use(false);
  var fan = null; // значок вентилятора (только у GPU, по настройке)
  return {
    el: el, span: function () { return thinOn(id) ? 1 : 2; },
    update: function (s) {
      var d = s[id]; el.hidden = !d; if (!d) return;
      use(coresOn(d));
      var lv = level(d.temp, CFG.thr[thrKey]);
      c.aux(details(d, !wide(el) && fanOn(d))); // в половинке значок вентилятора отнимает место у подписи
      if (fanOn(d)) { fan = fan || fanViz(); fan.place(c.el, el); fan.set(d.fan); }
      else if (fan) { fan.remove(); fan = null; }
      if (d.temp != null) { c.big(Math.round(d.temp) + '°', '', lv); c.side(Math.round(d.load), '%'); }
      else { c.big(Math.round(d.load), '%'); c.side(null); }
      c.lv(lv); c.viz({ hist: HIST[id], max: 100, pct: d.load, cores: d.cores });
      c.alarm(Alarm.isOn(thrKey));
    }
  };
}

// Часы цифрами и погода: та же ячейка, подпись внизу.
function digitalTile() {
  var el = tileBox('clock'), c = makeCell({ cap: true, cls: CFG.clockSec || !CFG.clock24 ? 'sec' : '' }), last = '';
  el.appendChild(c.el);
  function tick() {
    var d = new Date(), t = clockText(d);
    if (t === last) return;
    last = t;
    c.name(ruDate(d, { weekday: 'long' }).replace(/^./, function (x) { return x.toUpperCase(); }));
    c.aux(ruDate(d, { day: 'numeric', month: 'long' }));
    c.big(t.replace(/\s?(AM|PM)$/i, ''), /PM$/i.test(t) ? 'PM' : /AM$/i.test(t) ? 'AM' : '');
    c.side(null);
  }
  return {
    el: el, span: function () { return thinOn('clock') ? 1 : 2; }, tick: tick,
    update: function (s) { tick(); c.cap(CFG.hide.uptime && s.uptime != null ? 'ПК включён ' + uptimeText(s.uptime) : ''); }
  };
}
// Часы стрелками, виды часов тем и календарь: лицо из 25-faces.js.
function faceTile(id, f, span) {
  var el = tileBox(id), cb = mk('<div class="cb face-cb"></div>');
  cb.appendChild(f.el); el.appendChild(cb);
  return { el: el, update: f.tick, tick: f.tick, span: function () { return span; } };
}

var TILE_BUILD = {
  clock: function () {
    var ana = CFG.clockView === 'analog';
    if (thinOn('clock') || !ana && !CFG.clockD) return digitalTile(); // стрелки и виды тем в один модуль не помещаются
    return faceTile('clock', clockFace(), ana ? 3 : 2);
  },
  calendar: function () { return faceTile('calendar', calendarFace(), CFG.calView === 'month' ? 3 : 2); },

  // Погода: слева крупно температура, ниже город и описание; справа крупно иконка и «ощущается». Прогноз во всю ширину.
  weather: function () {
    var el = tileBox('weather'), key = '';
    var c = mk('<div class="cb wx"><div class="wtop"><div class="wl"><span class="num v"></span><div class="wtx"><b class="wcity"></b><span class="wdesc"></span></div></div>' +
      '<div class="wr"><span class="wi"></span><span class="wfeel"></span></div></div><div class="wdays"></div></div>');
    var q = function (x) { return $(x, c); }, tv = q('.v'), city = q('.wcity'), dsc = q('.wdesc'), ic = q('.wi'), feel = q('.wfeel'), days = q('.wdays');
    var put = function (n, html) { if (n.__h !== html) { n.__h = html; n.innerHTML = html; } };
    el.appendChild(c);
    var bg = wxBg(c); // 27-wxbg.js
    function t(v) { return String(Math.round(v)).replace('-', '−') + '°'; }
    function dayHtml(d, i) {
      var p = d.date.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
      return '<div class="wday' + (i ? '' : ' now') + '"><span class="dn">' + ruDate(dt, { weekday: 'short' }) + '</span><span class="di">' + (ICONS[d.icon] || '') + '</span><b>' + t(d.max) + '</b><span class="dl">' + t(d.min) + '</span></div>';
    }
    var o = {
      el: el,
      span: function () { return thinOn('weather') ? 1 : wide(el) && CFG.wxDays && key ? 3 : 2; },
      update: function (s) {
        var w = s.weather; el.hidden = !w; if (!w) return;
        var list = w.days || [], now = list[0], desc = w.desc ? w.desc.charAt(0).toUpperCase() + w.desc.slice(1) : '';
        var k = CFG.wxDays && !thinOn('weather') && list.length > 1 && wide(el) ? JSON.stringify(list) : '', text = desc + (now && wide(el) ? (desc ? ', ' : '') + 'от ' + t(now.min) + ' до ' + t(now.max) : ''); // в узкой только описание
        put(tv, segs(t(w.temp))); put(city, esc(w.city)); put(dsc, esc(text)); put(ic, ICONS[w.night && w.icon === 'sun' ? 'moon' : w.icon] || ''); bg(w.icon, w.power, w.night); // ясной ночью — луна
        put(feel, (wide(el) ? 'ощущается ' : 'ощ. ') + t(w.feels)); feel.title = 'Ощущается ' + t(w.feels);
        if (k !== key) { key = k; days.innerHTML = k ? list.map(dayHtml).join('') : ''; }
        el.classList.toggle('has-days', !!key);
      }
    };
    return o;
  },

  cpu: function () { return loadTile('cpu', cpuDetails); },
  gpu: function () {
    return loadTile('gpu', function (d, short) {
      return [d.memUsed != null && d.memTotal != null ? dec(d.memUsed / 1024, 1) + (short ? '' : '/' + Math.round(d.memTotal / 1024)) + ' ГБ' : '', d.power != null ? Math.round(d.power) + ' Вт' : ''].filter(Boolean).join(' · ');
    });
  },

  // Память: сколько занято и шкала; по настройке вместо них карта процессов (в тонкой не помещается).
  mem: function () {
    var el = tileBox('mem'), c, map;
    function use(on) {
      if (map === on) return;
      var n = makeCell(on ? { kind: 'map', name: 'Память', cls: 'mapc' } : { kind: 'level', name: 'Память' });
      if (c) { el.replaceChild(n.el, c.el); packSig = ''; } // высота и цвет «Заливки» считаются заново
      else el.appendChild(n.el);
      c = n; map = on;
    }
    use(false);
    return {
      el: el, span: function () { return thinOn('mem') ? 1 : map && wide(el) ? 3 : 2; },
      update: function (s) {
        var m = s.mem; el.hidden = !m; if (!m) return;
        use(memMapOn(s) && !thinNow(el));
        var on = Alarm.isOn('mem'), lv = on ? 'hot' : level(m.pct, CFG.thr.mem);
        if (map) c.aux('<span class="' + lv + '">' + dec(m.usedGB, 1) + ' из ' + Math.round(m.totalGB) + ' ГБ' + (wide(el) ? ' · ' + Math.round(m.pct) + '%' : '') + '</span>');
        else {
          c.aux('из ' + Math.round(m.totalGB) + ' ГБ' + (m.pageUsedGB != null && wide(el) ? ' · подк. ' + num(m.pageUsedGB) : ''));
          c.big(num(m.usedGB), 'ГБ'); c.side(Math.round(m.pct), '%');
        }
        c.lv(lv); c.viz({ pct: m.pct, mark: CFG.thr.mem, procs: map ? s.procs.map : null, used: m.usedGB * 1024 }); c.alarm(on);
      }
    };
  },

  net: function () {
    var el = tileBox('net'), one = makeCell({ name: 'Сеть', cls: 'one lines' }), box = mk('<div class="ls"></div>');
    var two = mk('<div class="two"></div>'), dn = makeCell({ kind: 'net', name: 'Приём' }), up = makeCell({ kind: 'net', name: 'Отдача' });
    one.el.appendChild(box); two.appendChild(dn.el); two.appendChild(up.el); el.appendChild(one.el); el.appendChild(two);
    var lines = makeLines(box);
    return {
      el: el, span: function () { return thinOn('net') ? 1 : 2; },
      update: function (s) {
        var n = s.net; el.hidden = !n; if (!n) return;
        var q = Math.sqrt, mx = Math.max.apply(null, HIST.down.concat(HIST.up, [102400])), a = rateParts(n.down), b = rateParts(n.up);
        var ping = n.ping != null ? '<span class="' + pingLevel(n.ping) + '">пинг ' + Math.round(n.ping) + ' мс</span>' + (n.loss ? ' · <span class="hot">потери ' + Math.round(n.loss) + '%</span>' : '') : '';
        var day = sizeParts(n.dayDown + n.dayUp), mon = sizeParts(n.monthDown + n.monthUp);
        if (wide(el)) {
          var pk = rateParts(REC.down);
          dn.aux('пик ' + pk.join(' ')); dn.big(a[0], a[1]); dn.side(null); dn.note('сегодня<br>' + day.join(' '));
          up.aux(ping); up.big(b[0], b[1]); up.side(null); up.note('месяц<br>' + mon.join(' '));
          dn.viz({ hist: HIST.down.map(q), max: q(mx) }); up.viz({ hist: HIST.up.map(q), max: q(mx) });
        } else {
          one.aux(ping || 'сегодня ' + day.join(' '));
          lines([{ n: '↓', v: unitHtml(a[0], a[1]), pct: q(n.down / mx) * 100 }, { n: '↑', v: unitHtml(b[0], b[1]), pct: q(n.up / mx) * 100 }]);
        }
      }
    };
  },

  // Энергия: мощность CPU и GPU сейчас, история, набежало за день и месяц, стоимость по тарифу.
  energy: function () {
    var el = tileBox('energy'), c = makeCell({ kind: 'graph', name: 'Энергия' });
    el.appendChild(c.el);
    return {
      el: el, span: function () { return thinOn('energy') ? 1 : 2; },
      update: function (s) {
        var e = s.energy; el.hidden = !e; if (!e) return;
        var cpu = s.cpu && s.cpu.power, gpu = s.gpu && s.gpu.power, mx = Math.max.apply(null, HIST.pow.concat([100]));
        c.big(Math.round(e.power), 'Вт'); c.side(null);
        if (wide(el)) {
          c.aux([cpu != null ? 'CPU ' + Math.round(cpu) + ' Вт' : '', gpu != null ? 'GPU ' + Math.round(gpu) + ' Вт' : ''].filter(Boolean).join(' · '));
          c.note('сегодня ' + energyText(e.dayWh) + '<br>месяц ' + energyText(e.monthWh));
        } else {
          c.aux(whParts(e.dayWh).join(' '));
          c.note('сегодня' + (CFG.tariff ? '<br>' + costText(e.dayWh) : ''));
        }
        c.viz({ hist: HIST.pow, max: Math.ceil(mx / 50) * 50, pct: clamp(e.power / mx * 100, 0, 100) });
      }
    };
  },

  disks: function () {
    var el = tileBox('disks'), c = makeCell({ name: 'Диски', cls: 'lines' }), box = mk('<div class="ls"></div>'), n = 0;
    c.el.appendChild(box); el.appendChild(c.el);
    var lines = makeLines(box);
    function io(d) { return d.read == null ? '' : 'чт ' + rateText(d.read) + ' · зп ' + rateText(d.write); }
    return {
      el: el, span: function () { return thinOn('disks') ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4; },
      update: function (s) {
        var list = s.disks || [], al = false; el.hidden = !list.length; n = list.length;
        c.aux('свободно');
        c.el.classList.toggle('one', thinNow(el) && !wide(el)); // тонкая половинка: только строки, без шапки
        lines(list.map(function (d) {
          var on = Alarm.isOn('disk:' + d.name), f = gbParts(d.freeGB); al = al || on;
          return { n: esc(d.name.replace(':', '')), m: wide(el) ? io(d) : '', v: unitHtml(f[0], f[1]), pct: d.usedPct, mark: CFG.thr.disk, lv: on ? 'hot' : level(d.usedPct, CFG.thr.disk) };
        }));
        c.alarm(al);
      }
    };
  },

  procs: function () {
    var tabs = [['cpu', 'CPU'], ['ram', 'Память'], ['disk', 'Диск']], tint = { cpu: 'cpu', ram: 'mem', disk: 'disks' };
    var fmt = { cpu: function (v) { return unitHtml(dec(v, v < 10 ? 1 : 0), '%'); }, ram: function (v) { var p = sizeParts(v * 1048576); return unitHtml(p[0], p[1]); }, disk: function (v) { var p = rateParts(v); return unitHtml(p[0], p[1]); } };
    var el = tileBox('procs'), c = makeCell({ name: 'Процессы', cls: 'lines' }), box = mk('<div class="ls"></div>');
    c.el.appendChild(box); el.appendChild(c.el);
    c.aux('<span class="tabs" data-nodrag>' + tabs.map(function (t) { return '<button data-k="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</span>');
    var lines = makeLines(box);
    var o = {
      el: el, span: function () { return CFG.procN > 3 ? 3 : 2; },
      update: function (s) {
        var k = CFG.procTab, p = s && s.procs, list = p && p[k] ? p[k].slice(0, CFG.procN) : [], mx = k === 'cpu' ? 100 : list.length ? list[0].v : 1, out = [];
        el.setAttribute('data-m', tint[k]); el.hidden = !!s && !p;
        $$('.tabs button', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === k); });
        for (var i = 0; i < CFG.procN; i++) { // строк всегда поровну, чтобы плитка не меняла высоту
          var it = list[i];
          out.push(it ? { n: esc(it.name.replace(/\.exe$/i, '')), v: fmt[k](it.v), pct: clamp(it.v / mx * 100, 0, 100) } : { n: '&nbsp;', v: '', pct: 0 });
        }
        lines(out);
      }
    };
    o.update(null);
    el.addEventListener('click', function (e) {
      var k = e.target.getAttribute('data-k'); if (!k) return;
      CFG.procTab = k; saveCfg(); o.update(S);
    });
    return o;
  },

  records: function () {
    var el = tileBox('records'), c = makeCell({ name: TILE_NAMES.records, cls: 'r1' });
    el.appendChild(c.el);
    var cell = function (n, temp, load, thr) {
      if (temp != null) return n + ' <b class="' + level(temp, thr) + '">' + Math.round(temp) + '°</b>';
      return load ? n + ' <b>' + Math.round(load) + '%</b>' : '';
    };
    return { el: el, span: function () { return 1; }, update: function () { c.aux([cell('CPU', REC.cpuTemp, REC.cpuLoad, CFG.thr.cpuTemp), cell('GPU', REC.gpuTemp, REC.gpuLoad, CFG.thr.gpuTemp)].filter(Boolean).join('&ensp;')); } };
  },

  uptime: function () {
    var el = tileBox('uptime'), c = makeCell({ name: TILE_NAMES.uptime, cls: 'r1' });
    el.appendChild(c.el);
    return { el: el, span: function () { return 1; }, update: function (s) { c.aux(s.uptime != null ? '<b>' + uptimeText(s.uptime) + '</b>' : ''); } };
  }
};
