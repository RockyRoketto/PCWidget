'use strict';
// Части плиток. Анатомия одна на всё: шапка (название и подробность), главное число, индикатор внизу.
// Индикатор у каждой темы свой, место у всех одно:
//   Лист — кривая (graph, net) или полоса (level);  Прибор — деления или столбики;  Заливка — фон ячейки.

// kind: graph (история 0..100), net (история скоростей), level (заполненность), run (тонкая полоса в строке).
function makeViz(kind) {
  var t = CFG.theme;
  if (t === 'fill') return fillViz(kind);
  if (t === 'gauge') return kind === 'net' ? histViz() : tickViz(kind === 'run');
  if (t === 'lcd') return kind === 'graph' || kind === 'net' ? histViz() : tickViz(kind === 'run');
  if (kind === 'graph' || kind === 'net') return lineViz();
  var el = mk('<div class="bar' + (kind === 'run' ? ' thin' : '') + '"><i></i></div>'), i = el.firstChild;
  return { el: el, set: function (o) { i.style.width = clamp(o.pct, 0, 100) + '%'; } };
}

// Лист: линия и заливка под ней в координатах 100x30.
function lineViz() {
  var el = mk('<svg class="graph" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path class="a"/><path class="l"/></svg>');
  var a = el.firstChild, l = el.lastChild;
  return {
    el: el,
    set: function (o) {
      var h = o.hist;
      if (!h || h.length < 2) return;
      var st = 100 / (HN - 1), x0 = 100 - (h.length - 1) * st;
      var p = 'M' + h.map(function (v, i) { return (x0 + i * st).toFixed(1) + ',' + (29 - Math.min(v / o.max, 1) * 27).toFixed(1); }).join('L');
      l.setAttribute('d', p); a.setAttribute('d', p + 'L100,30L' + x0.toFixed(1) + ',30Z');
    }
  };
}

// Прибор: шкала из делений шагом ~5px. Заполненные деления целые, порог отмечен.
function tickViz(thin) {
  var el = mk('<div class="tk' + (thin ? ' thin' : '') + '"><i></i><b></b></div>'), fill = el.firstChild, mark = el.lastChild;
  return {
    el: el,
    set: function (o) {
      var w = el.clientWidth, n = Math.max(1, Math.round(w / 5)), k = Math.round(clamp(o.pct, 0, 100) / 100 * n);
      fill.style.width = (w ? k * w / n : 0) + 'px';
      mark.hidden = o.mark == null || !w;
      if (o.mark != null && w) mark.style.left = Math.min(n - 1, Math.round(o.mark / 100 * n)) * w / n + 'px';
    }
  };
}
// Прибор, скорости: столбики последних значений.
function histViz() {
  var el = mk('<svg class="hist" preserveAspectRatio="none" aria-hidden="true"><path/></svg>'), p = el.firstChild;
  return {
    el: el,
    set: function (o) {
      var n = Math.max(8, Math.round((el.clientWidth || 136) / 5)), h = o.hist.slice(-n), d = '';
      el.setAttribute('viewBox', '0 0 ' + n * 5 + ' 24');
      h.forEach(function (v, i) {
        var y = Math.max(2, Math.min(v / o.max, 1) * 24), x = (n - h.length + i) * 5;
        d += 'M' + x + ',24h3v-' + y.toFixed(1) + 'h-3z';
      });
      p.setAttribute('d', d);
    }
  };
}

// Заливка: кусок общего на весь виджет градиента. Рельеф истории или уровень снизу, в строке слева направо.
function fillViz(kind) {
  if (kind === 'run') {
    var r = mk('<div class="fill"><i class="run"></i></div>'), ri = r.firstChild;
    return { el: r, bg: true, set: function (o) { ri.style.width = 'calc(' + clamp(o.pct, 0, 100) + '% + 5px)'; } };
  }
  if (kind === 'level') {
    var e = mk('<div class="fill"><i class="lvl"></i></div>'), li = e.firstChild;
    return { el: e, bg: true, set: function (o) { li.style.height = 'calc(' + clamp(o.pct, 0, 100) + '% + 8px)'; } };
  }
  var el = mk('<div class="fill"><i class="area"></i></div>'), ar = el.firstChild;
  return {
    el: el, bg: true,
    set: function (o) {
      var h = o.hist;
      if (!h || h.length < 2) return;
      var st = 100 / (HN - 1), x0 = 100 - (h.length - 1) * st, m = o.max * (kind === 'net' ? 1.55 : 1); // рельеф сети ниже цифр
      var P = h.map(function (v, i) { return [(x0 + i * st).toFixed(1), (100 - Math.min(v / m, 1) * 96).toFixed(1)]; });
      ar.style.clipPath = 'polygon(' + P.map(function (p) { return p[0] + '% ' + p[1] + '%'; }).join(',') + ',100% 100%,' + x0.toFixed(1) + '% 100%)';
    }
  };
}
// Цвет градиента в точке t (0..1), точки стоят на 0, 48% и 100%.
function palAt(stops, t) {
  var k = t < .48 ? t / .48 : (t - .48) / .52, a = rgbOf(stops[t < .48 ? 0 : 1]), b = rgbOf(stops[t < .48 ? 1 : 2]);
  return '#' + a.map(function (v, i) { return (256 + Math.round(v + (b[i] - v) * clamp(k, 0, 1))).toString(16).slice(1); }).join('');
}
// Цвет заливки — точка общего градиента (155°) в центре её карточки. Градиент растянут не на весь виджет,
// а от первой залитой карточки до последней: так палитра используется целиком, а соседи получают соседние оттенки.
function placeFills(root) {
  if (CFG.theme !== 'fill' || !root.isConnected) return;
  var st = palStops(), dx = Math.sin(155 * Math.PI / 180), dy = -Math.cos(155 * Math.PI / 180);
  var list = $$('.fill', root).map(function (f) {
    var r = f.parentNode.getBoundingClientRect();
    return { f: f, w: r.width, p: (r.left + r.width / 2) * dx + (r.top + r.height / 2) * dy };
  }).filter(function (x) { return x.w; });
  if (!list.length) return;
  var lo = Math.min.apply(null, list.map(function (x) { return x.p; })), hi = Math.max.apply(null, list.map(function (x) { return x.p; }));
  list.forEach(function (x) { x.f.style.setProperty('--solid', palAt(st, hi > lo ? (x.p - lo) / (hi - lo) : .5)); });
}

// Состояние: тепло или горячо меняют цвет индикатора, тревога подсвечивает ячейку.
function setLv(el, lv) { el.classList.toggle('is-warm', lv === 'warm'); el.classList.toggle('is-hot', lv === 'hot'); }

// Ячейка: шапка, главное число (слева крупно, справа второе), подпись справа или снизу, индикатор.
// o.kind — индикатор (или нет), o.cap — подпись внизу (часы, погода).
function makeCell(o) {
  o = o || {};
  var el = mk('<div class="cb' + (o.cls ? ' ' + o.cls : '') + '"><div class="hd"><b class="nm"></b><span class="ax"></span></div>' +
    '<div class="md"><span class="num v"></span><span class="num v2"></span><span class="c2"></span></div>' + (o.cap ? '<div class="cp"></div>' : '') + '</div>');
  var q = function (s) { return $(s, el); }, nm = q('.nm'), ax = q('.ax'), v = q('.v'), v2 = q('.v2'), c2 = q('.c2'), cp = q('.cp');
  var vz = o.kind ? makeViz(o.kind) : null;
  if (vz) { el.classList.add('has-vz'); if (vz.bg) el.insertBefore(vz.el, el.firstChild); else el.appendChild(vz.el); }
  if (o.name) nm.textContent = o.name;
  var put = function (n, html) { if (n.__h !== html) { n.__h = html; n.innerHTML = html; } };
  return {
    el: el,
    name: function (t) { put(nm, t); },
    aux: function (t) { put(ax, t || ''); },
    big: function (val, unit, lv) { put(v, segs(val) + (unit ? '<small>' + unit + '</small>' : '')); v.className = 'num v' + (lv ? ' ' + lv : ''); },
    side: function (val, unit) { v2.hidden = val == null; if (val != null) put(v2, segs(val) + (unit ? '<small>' + unit + '</small>' : '')); },
    note: function (t) { put(c2, t || ''); },
    cap: function (t) { if (cp) put(cp, t || ''); },
    viz: function (d) { if (vz) vz.set(d); },
    lv: function (lv) { setLv(el, lv); },
    alarm: function (on) { el.classList.toggle('alarm', !!on); }
  };
}

// Список строк (диски, процессы, лимиты, сеть в половинке): название, середина, значение, тонкая шкала.
function makeLines(box) {
  var rows = [];
  return function (list) {
    while (rows.length > list.length) box.removeChild(rows.pop().el);
    while (rows.length < list.length) {
      var el = mk('<div class="ln"><span class="n"></span><span class="m"></span><span class="w"></span></div>'), vz = makeViz('run');
      if (vz.bg) el.insertBefore(vz.el, el.firstChild); else el.appendChild(vz.el);
      box.appendChild(el);
      rows.push({ el: el, vz: vz, n: $('.n', el), m: $('.m', el), w: $('.w', el) });
    }
    list.forEach(function (d, i) {
      var r = rows[i];
      if (r.n.__h !== d.n) { r.n.__h = d.n; r.n.innerHTML = d.n; }
      r.m.innerHTML = d.m || ''; r.w.innerHTML = d.v;
      setLv(r.el, d.lv);
      r.vz.set({ pct: d.pct, mark: d.mark });
    });
  };
}
function unitHtml(v, u) { return segs(v) + '<small>' + u + '</small>'; }

// ЖК-табло: цифры и минус из семи сегментов (a b c d e f g), несветящиеся видны бледно. Теги не трогаются.
var SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '−': 'g', '-': 'g' };
var SEG7_HTML = {};
Object.keys(SEG7).forEach(function (ch) {
  SEG7_HTML[ch] = '<span class="g7">' + 'abcdefg'.split('').map(function (x) { return SEG7[ch].indexOf(x) >= 0 ? '<i class="on"></i>' : '<i></i>'; }).join('') + '</span>';
});
function segs(v) {
  var h = String(v);
  return CFG.theme !== 'lcd' ? h : h.replace(/(<[^>]*>|&[a-z]+;)|([0-9−-])/g, function (m, tag, ch) { return tag || SEG7_HTML[ch]; });
}
