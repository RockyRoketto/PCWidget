'use strict';
// Лица часов (цифры, стрелки; свои варианты тем — 25b..25d) и календаря (день, неделя, месяц): одни и те же в плитках и в колонке.
// Лицо: { el, tick() }. tick зовётся раз в секунду и трогает DOM, только если что-то изменилось.

function two(n) { return (n < 10 ? '0' : '') + n; }
function ruDate(d, o) { return d.toLocaleDateString('ru-RU', o); }

// ---- цифры ----
function digitalFace() {
  var el = mk('<div class="face"><div class="num clk">00:00</div><div class="cap">&nbsp;</div></div>'), last = '';
  if (CFG.clockSec || !CFG.clock24) $('.clk', el).style.fontSize = '25px';
  return {
    el: el,
    tick: function () {
      var d = new Date(), t = clockText(d);
      if (t === last) return;
      last = t;
      if (CFG.theme === 'pixel') $('.clk', el).innerHTML = segs(t); else $('.clk', el).textContent = t;
      $('.cap', el).textContent = ruDate(d, { weekday: 'short', day: 'numeric', month: 'long' });
    }
  };
}

// ---- стрелки ---- координаты от центра, радиус 100
function dialSvg() {
  var out = '', i, a, p = function (r) { return 'x="' + (Math.sin(a) * r).toFixed(1) + '" y="' + (-Math.cos(a) * r).toFixed(1) + '"'; };
  for (i = 0; i < 60; i++) if (i % 5) out += '<line class="dtk" y1="-99" y2="-93" transform="rotate(' + i * 6 + ')"/>';
  for (i = 1; i <= 12; i++) {
    a = i * Math.PI / 6;
    out += '<text class="mn" ' + p(96) + '>' + two(i * 5) + '</text><text class="hn" ' + p(72) + '>' + i + '</text>';
  }
  return out;
}
function hand(cls, len) { return '<g class="' + cls + '"><line class="stem" y1="0" y2="-20"/><line class="blade" y1="-21" y2="-' + len + '"/></g>'; }
function analogFace() {
  var el = mk('<div class="face"><svg class="dial" viewBox="-100 -100 200 200">' + dialSvg() +
    (CFG.clockDate ? '<text class="dt" x="30" y="0"><tspan class="wd"></tspan><tspan class="dd" dx="4"></tspan></text>' : '') + hand('hh', 50) + hand('mh', 82) +
    '<circle class="hub" r="5.5"/>' + (CFG.clockHand ? '<g class="sech"><line y1="17" y2="-97"/></g><circle class="pin" r="4"/>' : '') + '</svg>' +
    '<div class="aside"><b class="awd"></b><span class="adt"></span></div></div>'); // справа от циферблата, когда плитка во всю ширину
  var hh = $('.hh', el), mh = $('.mh', el), sh = $('.sech', el), prev = null, last = '', day = '';
  function rot(n, a) { n.style.transform = 'rotate(' + a + 'deg)'; }
  return {
    el: el,
    tick: function () {
      var d = new Date(), s = d.getSeconds(), m = d.getMinutes(), k = d.getHours() + ':' + m + ':' + Math.floor(s / 10);
      if (sh && prev !== (s * 6 || 360)) {
        if (prev === null || prev === 360) { // без перехода: первый показ и сброс полного оборота
          sh.style.transition = 'none'; rot(sh, prev === null ? s * 6 : 0);
          void el.offsetWidth; sh.style.transition = '';
        }
        var first = prev === null;
        prev = s * 6 || 360; // ноль секунд = 360, чтобы стрелка не отматывалась назад
        if (!first) rot(sh, prev);
      }
      if (k === last) return;
      last = k;
      rot(mh, m * 6 + Math.floor(s / 10)); rot(hh, d.getHours() % 12 * 30 + m / 2);
      if (day === d.toDateString()) return;
      day = d.toDateString();
      $('.awd', el).textContent = ruDate(d, { weekday: 'long' });
      $('.adt', el).textContent = ruDate(d, { day: 'numeric', month: 'long' });
      if (!$('.wd', el)) return;
      $('.wd', el).textContent = ruDate(d, { weekday: 'short' }).toUpperCase();
      $('.dd', el).textContent = d.getDate();
    }
  };
}
function clockFace() {
  if (CFG.clockView === 'analog') return CFG.clockA ? themedAnalog(CFG.clockA) : analogFace();
  return CFG.clockD ? themedDigital(CFG.clockD) : digitalFace();
}

// ---- календарь ----
var WDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function monday(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
// Дни сетки: неделя или целые недели, накрывающие месяц.
function calDays(d, view) {
  var from = monday(view === 'week' ? d : new Date(d.getFullYear(), d.getMonth(), 1)), out = [], x;
  var end = addDays(view === 'week' ? from : monday(new Date(d.getFullYear(), d.getMonth() + 1, 0)), 7);
  for (x = from; x < end; x = addDays(x, 1)) out.push(x);
  return out;
}
function monthName(d) { return ruDate(d, { month: 'long' }) + ' ' + d.getFullYear(); }
// Сегодня крупно: весь вид «День», а у недели и месяца во всю ширину — слева от сетки.
function todayHtml(d, cls) {
  return '<div class="' + cls + '"><span class="num cnum">' + d.getDate() + '</span><div><b>' + ruDate(d, { weekday: 'long' }) + '</b><span>' + monthName(d) + '</span></div></div>';
}
function calHtml(d) {
  if (CFG.calView === 'day') return todayHtml(d, 'cday');
  return todayHtml(d, 'cday ctoday') + '<div class="cmain"><div class="chead">' + monthName(d) + '</div><div class="cgrid">' +
    WDAYS.map(function (w, i) { return '<span class="cw' + (i > 4 ? ' we' : '') + '">' + w + '</span>'; }).join('') +
    calDays(d, CFG.calView).map(function (x) {
      var off = CFG.calView === 'month' && x.getMonth() !== d.getMonth(), now = x.toDateString() === d.toDateString();
      return '<span class="cd' + (x.getDay() % 6 ? '' : ' we') + (off ? ' off' : '') + (now ? ' now' : '') + '"><i>' + x.getDate() + '</i></span>';
    }).join('') + '</div></div>';
}
function calendarFace() {
  if (CFG.calV) return calThemed(CFG.calV); // виды тем: 25e-calkit.js
  var el = mk('<div class="face cal ' + CFG.calView + '"></div>'), day = '';
  return {
    el: el,
    tick: function () {
      var d = new Date();
      if (day === d.toDateString()) return;
      day = d.toDateString();
      el.innerHTML = calHtml(d);
    }
  };
}
