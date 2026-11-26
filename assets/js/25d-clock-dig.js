'use strict';
// Цифры по темам: два своих вида у каждой (вариант 1 и 2, вариант 0 — обычная плитка цифрами).
// Функция (дата, раскладка s|w|t, масштаб) -> html. Стили — clocks.css.

function ckHM(t, lay, sep) { return lay === 't' ? t.hh + '<br>' + t.mm : t.hh + (sep == null ? ':' : sep) + t.mm; }
function ckTwo(lay, d) { return lay === 't' ? ckWd(d) + '<br>' + ckDm(d) : ckCap(d); }
// Барабан счётчика: цифра, сменившаяся за эту секунду, въезжает снизу.
function ckDrums(now, before, cls, z) {
  var o = '', i;
  for (i = 0; i < now.length; i++) {
    var roll = before.length === now.length && now[i] !== before[i];
    o += '<i class="drum ' + cls + '" style="font-size:' + z + 'px"><b class="' + (roll ? 'roll' : '') + '">' + (roll ? '<u>' + before[i] + '</u>' : '') + '<u>' + now[i] + '</u></b></i>';
  }
  return o;
}
// Уровень: число на ячейке, которая заливается снизу на долю p.
function ckLevel(v, p, col, z) {
  return '<i class="lvl" style="font-size:' + z + 'px"><b style="height:' + ckF(p) + '%;background:var(--' + col + ')"></b><u>' + v + '</u></i>';
}

var CK_DIG = {
  sheet: [
    function (d, lay, k) { // тонкие: светлое начертание, секунды мелко
      var t = ckTime(d), z = ckZ(lay, k, 44, 56, 46);
      return '<div class="sh-big" style="font-size:' + z + 'px">' + ckHM(t, lay) + (lay === 'w' ? '<sup>' + t.ss + '</sup>' : '') + '</div><div class="cap">' + ckTwo(lay, d) + '</div>';
    },
    function (d, lay, k) { // полоса дня: часы жирно, минуты тонко, под ними прожитая доля дня
      var t = ckTime(d), z = ckZ(lay, k, 36, 46, 42);
      return '<div style="font-size:' + z + 'px;line-height:1"><b class="sh-b">' + t.hh + '</b><span class="sh-c">:</span><span class="sh-l">' + t.mm + '</span></div>' +
        '<div class="sh-bar"><i style="width:' + ckF(ckDay(d)) + '%"></i></div>' + (lay === 's' ? '' : '<div class="sh-lab"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>') +
        '<div class="cap">' + ckTwo(lay, d) + '</div>';
    }
  ],
  gauge: [
    function (d, lay, k) { // барабаны: механический счётчик в рамке, секунды цветом
      var t = ckTime(d), b = ckTime(new Date(d.getTime() - 1000)), z = ckZ(lay, k, 30, 40, 32), s = lay === 'w';
      var row = function (a, c, cls, zz) { return '<span class="drums">' + ckDrums(a, c, cls, zz) + '</span>'; };
      return (lay === 't' ? '<div class="ga-box">' + row(t.hh, b.hh, '', z) + '<em style="font-size:' + z + 'px">:</em>' + row(t.mm, b.mm, '', z) + '</div>' +
        '<div class="ga-box sm">' + row(t.ss, b.ss, 'sec', Math.round(z * .7)) + '</div>' :
        '<div class="ga-box">' + row(t.hh, b.hh, '', z) + '<em style="font-size:' + z + 'px">:</em>' + row(t.mm, b.mm, '', z) +
        (s ? '<span class="drums sm">' + ckDrums(t.ss, b.ss, 'sec', Math.round(z * .62)) + '</span>' : '') + '</div>') +
        '<div class="cap">' + ckTwo(lay, d) + '</div>';
    },
    function (d, lay, k) { // шкала: крупно время, под ним линейка секунд с указателем
      var t = ckTime(d), z = ckZ(lay, k, 36, 46, 44), r = '', i;
      for (i = 0; i <= 60; i++) r += '<line x1="' + i * 2 + '" x2="' + i * 2 + '" y2="' + (i % 15 ? i % 5 ? 3 : 5 : 7) + '"' + ckS('text', i % 5 ? .4 : .8, i % 5 ? .6 : 1) + '/>';
      if (lay !== 's') [0, 15, 30, 45, 60].forEach(function (n) { r += '<text x="' + n * 2 + '" y="12" font-size="5"' + ckFi('text', .7) + '>' + n + '</text>'; });
      r += '<polygon points="' + (t.S * 2 - 2.6) + ',-4.5 ' + (t.S * 2 + 2.6) + ',-4.5 ' + t.S * 2 + ',.5"' + ckFi('hot') + '/>';
      return '<div class="ga-big" style="font-size:' + z + 'px">' + ckHM(t, lay) + '</div><svg class="ruler" viewBox="-4 -6 128 ' + (lay === 's' ? 14 : 20) + '">' + r + '</svg>' +
        (lay === 's' ? '' : '<div class="cap">' + ckTwo(lay, d) + '</div>');
    }
  ],
  fill: [
    function (d, lay, k) { // налив: цифры заполняются цветом по прожитой доле дня
      var t = ckTime(d), z = ckZ(lay, k, 46, 60, 48), p = ckF(ckDay(d));
      return '<div class="fi-big" style="font-size:' + z + 'px;background-image:linear-gradient(to top,var(--warm) ' + p + '%,color-mix(in srgb,var(--text) 22%,transparent) ' + p + '%)">' + ckHM(t, lay) + '</div>' +
        '<div class="cap">' + (lay === 's' ? ckCap(d) : 'день прошёл на ' + Math.round(p) + '%') + '</div>';
    },
    function (d, lay, k) { // уровни: часы, минуты и секунды — ячейки, налитые на свою долю
      var t = ckTime(d), z = ckZ(lay, k, 32, 40, 30), s = lay !== 's';
      return '<div class="lvls' + (lay === 't' ? ' col' : '') + '">' + ckLevel(t.hh, t.H / 24 * 100, 'warm', z) + ckLevel(t.mm, t.M / 60 * 100, 'ok', z) +
        (s ? ckLevel(t.ss, t.S / 60 * 100, 'hot', Math.round(z * .6)) : '') + '</div>' + (lay === 's' ? '' : '<div class="cap">' + ckCap(d) + '</div>');
    }
  ],
  lcd: [
    function (d, lay, k) { // сегменты: «88:88» призраками позади
      var t = ckTime(d), z = ckZ(lay, k, 40, 52, 40);
      return (lay === 't' ? ckSeg(t.hh, z) + ckSeg(t.mm, z) + ckSeg(t.ss, z * .45) :
        '<div class="row">' + ckSeg(t.hh + ':' + t.mm, z) + (lay === 'w' ? ckSeg(t.ss, z * .5) : '') + '</div>') +
        '<div class="cap up">' + ckCap(d) + '</div>';
    },
    function (d, lay, k) { // наручные: день недели в рамке, дата, время, секунды, значки режимов
      var t = ckTime(d), z = ckZ(lay, k, 32, 46, 38), wd = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'][d.getDay()];
      return '<div class="lc-top"><span>' + wd + '</span>' + ckSeg(two(d.getDate()) + '-' + two(d.getMonth() + 1), Math.round(11 * k)) + '</div>' +
        '<div class="row' + (lay === 't' ? ' col' : '') + '">' + ckSeg(t.hh + ':' + t.mm, z) + ckSeg(t.ss, z * .48) + '</div>' +
        (lay === 's' ? '' : '<div class="lc-ind"><span class="on">' + (CFG.clock24 ? '24H' : (t.H < 12 ? 'AM' : 'PM')) + '</span><span>ALM</span><span>CHR</span><span class="on">LT</span></div>');
    }
  ],
  osc: [
    function (d, lay, k) { // экран: светящиеся цифры, по сетке ходит вертикальный луч
      var t = ckTime(d), z = ckZ(lay, k, 36, 48, 42);
      return '<span class="os-ch">CH1 · ВРЕМЯ</span><span class="os-sweep" style="left:' + ckF(t.S / 60 * 100) + '%"></span>' +
        '<div class="os-big" style="font-size:' + z + 'px">' + ckHM(t, lay) + '</div><div class="cap">' + (lay === 's' ? ckCap(d) : t.ss + ' с · ' + ckCap(d)) + '</div>';
    },
    function (d, lay, k) { // развёртка: синусоида тянется по секундам, яркая точка на конце
      var t = ckTime(d), z = ckZ(lay, k, 30, 40, 40), W = 120, n = Math.max(2, Math.round(t.S / 60 * W)), p = '', x;
      var y = function (x) { return ckF(10 - Math.sin(x / W * Math.PI * 6 + t.M) * 7); };
      for (x = 0; x <= n; x++) p += (x ? 'L' : 'M') + x + ' ' + y(x);
      return '<span class="os-ch">CH1</span><span class="os-ch2">' + t.ss + ' c</span><div class="os-big" style="font-size:' + z + 'px">' + ckHM(t, lay) + '</div>' +
        '<svg class="os-wave" viewBox="0 0 ' + W + ' 20"><path d="' + p + '"' + ckS('a', 1.3) + '/><circle cx="' + n + '" cy="' + y(n) + '" r="2.2"' + ckFi('text') + '/></svg>' +
        (lay === 's' ? '' : '<div class="cap">' + ckCap(d) + '</div>');
    }
  ],
  bp: [
    function (d, lay, k) { // штамп: основная надпись чертежа на всю плитку
      var t = ckTime(d), z = ckZ(lay, k, 34, 40, 36);
      var c = function (cls, key, val) { return '<div class="' + cls + '"><small>' + key + '</small><b>' + val + '</b></div>'; };
      var date = two(d.getDate()) + '.' + two(d.getMonth() + 1);
      return '<div class="bp-st ' + lay + '"><div class="tm"><small>время</small><b style="font-size:' + z + 'px">' + ckHM(t, lay) + '</b></div>' +
        (lay === 's' ? c('', 'дата', date) + c('', 'сек', t.ss) :
          lay === 'w' ? c('', 'день', ckWd(d)) + c('', 'сек', t.ss) + c('', 'дата', date + '.' + d.getFullYear()) + c('', 'масштаб', '1:1') :
            c('', 'сек', t.ss) + c('', 'дата', date) + c('wide', 'день', ckWd(d))) + '</div>';
    },
    function (d, lay, k) { // размер: время как деталь, под ним размерная линия, штрих отмечает секунды
      var t = ckTime(d), z = ckZ(lay, k, 32, 40, 38), x = ckF(1 + t.S / 60 * 98);
      return '<span class="bp-pos">Поз. 1 — время</span><div class="bp-big" style="font-size:' + z + 'px">' + ckHM(t, lay) + '</div>' +
        '<svg class="bp-dim" viewBox="0 0 100 12"><g' + ckS('ln', .6) + '><line x1="1" x2="1" y2="12"/><line x1="99" x2="99" y2="12"/><line x1="1" x2="99" y1="6" y2="6"/></g>' +
        '<path d="M1 6l5-2v4zM99 6l-5-2v4z"' + ckFi('ln') + '/><line x1="' + x + '" x2="' + x + '" y1="2" y2="10"' + ckS('hot', 1.2) + '/></svg>' +
        '<div class="cap">s = ' + t.ss + (lay === 's' ? '' : ' · ' + ckCap(d)) + '</div>';
    }
  ],
  pixel: [
    function (d, lay, k) { // 3×5: клетками, двоеточие мигает
      var t = ckTime(d), c = ckZ(lay, k, 6, 8, 7);
      return (lay === 't' ? ckPx(t.hh, c, 'text') + ckPx(t.mm, c, 'blue') : ckPx(t.hh + ':' + t.mm, c, 'text', t.S % 2 === 0)) + '<div class="cap">' + ckCap(d) + '</div>';
    },
    function (d, lay, k) { // полоса: часы и минуты цветом, под ними 8 блоков секунд
      var t = ckTime(d), c = ckZ(lay, k, 5, 7, 6), n = Math.floor(t.S / 7.5) + 1, b = '', i;
      for (i = 0; i < 8; i++) b += '<rect x="' + i * 11 + '" width="9" height="9"' + ckFi(i >= n ? 'track' : i < 3 ? 'mint' : i < 6 ? 'yel' : 'pink') + '/>';
      return '<div class="row' + (lay === 't' ? ' col' : '') + '" style="gap:' + c * 2 + 'px">' + ckPx(t.hh, c, 'yel') + ckPx(t.mm, c, 'pink') + '</div>' +
        '<svg class="px-bar" viewBox="0 0 86 9" style="width:' + Math.round(by3(lay, 100, 150, 100) * k) + 'px">' + b + '</svg>' + (lay === 's' ? '' : '<div class="cap">' + ckCap(d) + '</div>');
    }
  ]
};
function by3(lay, s, w, t) { return lay === 's' ? s : lay === 'w' ? w : t; }
function themedDigital(n) { return ckFace('d', (CK_DIG[CFG.theme] || CK_DIG.sheet)[n - 1]); }
