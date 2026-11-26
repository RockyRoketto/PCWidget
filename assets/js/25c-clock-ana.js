'use strict';
// Стрелки по темам: два своих циферблата у каждой (вариант 1 и 2, вариант 0 — классический из 25-faces.js).
// Функция (дата) -> svg циферблата; секундная стрелка — по настройке clockHand.

var CK_ANA = {
  sheet: [
    function (d) { // минимал: только риски, тонкая секундная цветом акцента
      var t = ckTime(d), sec = CFG.clockHand;
      return '<circle r="96"' + ckFi('text', .05) + '/>' +
        ckTicks(60, function (i, a) {
          return i % 5 ? ckLn(a, 92, 90, ckS('text', 1.4, .3) + ' stroke-linecap="round"') : ckLn(a, 92, i % 15 ? 82 : 76, ckS('text', i % 15 ? 2.2 : 3.2) + ' stroke-linecap="round"');
        }) +
        ckRot(t.h, '<line y1="6" y2="-48"' + ckS('text', 7) + ' stroke-linecap="round"/>') + ckRot(t.m, '<line y1="6" y2="-76"' + ckS('text', 4.5) + ' stroke-linecap="round"/>') +
        (sec ? ckRot(t.s, '<line y1="16" y2="-86"' + ckS('accent', 1.6) + ' stroke-linecap="round"/>') : '') +
        '<circle r="4.5"' + ckFi('text') + '/>' + (sec ? '<circle r="2"' + ckFi('accent') + '/>' : '');
    },
    function (d) { // кольцо: секунды идут дугой, крупные 12/3/6/9
      var t = ckTime(d);
      return '<circle r="91"' + ckS('track', 5) + '/>' + (CFG.clockHand ? '<path d="' + ckArc(91, 0, t.s || .01) + '"' + ckS('accent', 5) + ' stroke-linecap="round"/>' : '') +
        [12, 3, 6, 9].map(function (n, i) { return ckText(i * 90, 68, n, 22, ckFi('text') + ' font-weight="300"'); }).join('') +
        ckTicks(12, function (i, a) { return i % 3 ? ckDot(a, 70, 2, ckFi('text', .45)) : ''; }) +
        ckRot(t.h, '<line y2="-42"' + ckS('text', 5) + ' stroke-linecap="round"/>') + ckRot(t.m, '<line y2="-62"' + ckS('text', 3) + ' stroke-linecap="round"/>') +
        '<circle r="4"' + ckFi('accent') + '/>';
    }
  ],
  gauge: [
    function (d) { // прибор: шкала, стрелки-ланцеты, секундная с противовесом
      var t = ckTime(d);
      return '<circle r="97" style="fill:var(--sheet);stroke:var(--track)" stroke-width="2"/>' +
        ckTicks(60, function (i, a) { return ckLn(a, 92, i % 5 ? 86 : 76, ckS('text', i % 5 ? 1 : 2.6)); }) +
        ckTicks(12, function (i, a) { return ckText(a, 62, i || 12, i % 3 ? 15 : 20, ckFi('text', i % 3 ? .7 : 1) + ' font-weight="' + (i % 3 ? 400 : 600) + '"'); }) +
        ckRot(t.h, '<polygon points="-5,10 5,10 3.5,-38 0,-48 -3.5,-38"' + ckFi('text') + '/>') + ckRot(t.m, '<polygon points="-3.8,12 3.8,12 2.5,-66 0,-80 -2.5,-66"' + ckFi('text') + '/>') +
        (CFG.clockHand ? ckRot(t.s, '<line y1="22" y2="-88"' + ckS('hot', 1.6) + '/><circle cy="20" r="4.5"' + ckFi('hot') + '/>') : '') +
        '<circle r="5"' + ckFi('hot') + '/><circle r="2"' + ckFi('sheet') + '/>';
    },
    function (d) { // хронограф: дорожка минут, малый циферблат секунд внизу
      var t = ckTime(d);
      return '<circle r="97" style="fill:var(--sheet);stroke:var(--track)" stroke-width="2"/><circle r="91"' + ckS('text', 1, .5) + '/><circle r="84"' + ckS('text', 1, .5) + '/>' +
        ckTicks(60, function (i, a) { return ckLn(a, 91, 84, ckS('text', i % 5 ? .8 : 2.4)); }) +
        [[0, 12], [90, 3], [270, 9]].map(function (x) { return ckText(x[0], 68, x[1], 20, ckFi('text') + ' font-weight="600"'); }).join('') +
        '<g transform="translate(0 44)"><circle r="24" style="fill:var(--tile);stroke:var(--track)"/>' + ckTicks(12, function (i, a) { return ckLn(a, 22, i % 3 ? 19 : 16, ckS('text', 1)); }) +
        ckRot(t.s, '<line y1="4" y2="-20"' + ckS('warm', 1.6) + '/>') + '<circle r="2.2"' + ckFi('warm') + '/></g>' +
        ckRot(t.h, '<polygon points="-6,8 6,8 0,-50"' + ckFi('text') + '/><line y2="-40"' + ckS('tile', 1.4) + '/>') +
        ckRot(t.m, '<polygon points="-4.5,10 4.5,10 0,-80"' + ckFi('text') + '/><line y2="-68"' + ckS('tile', 1.2) + '/>') + '<circle r="5"' + ckFi('text') + '/>';
    }
  ],
  fill: [
    function (d) { // сектор: минуты заливают круг, часовая стрелка поверх
      var t = ckTime(d), p = ckPie(96, t.m);
      return '<circle r="96"' + ckFi('text', .08) + '/>' + (p ? p + ckFi('warm', .9) + '/>' : '') +
        ckTicks(12, function (i, a) { return ckDot(a, 84, i % 3 ? 2.5 : 4, ckFi('pop', .55)); }) +
        ckRot(t.h, '<line y2="-50"' + ckS('text', 12) + ' stroke-linecap="round"/>') + '<circle r="10"' + ckFi('text') + '/><circle r="4"' + ckFi('pop') + '/>';
    },
    function (d) { // плотный: заливной диск, текущий час — крупная точка
      var t = ckTime(d), hr = t.H % 12;
      return '<circle r="96"' + ckFi('ok') + '/>' +
        ckTicks(12, function (i, a) { return ckDot(a, 80, hr === i ? 9 : 4, ckFi('pop', hr === i ? 1 : .4)); }) +
        ckRot(t.h, '<line y2="-46"' + ckS('pop', 13) + ' stroke-linecap="round"/>') + ckRot(t.m, '<line y2="-70"' + ckS('pop', 8) + ' stroke-linecap="round"/>') +
        (CFG.clockHand ? ckRot(t.s, '<line y1="14" y2="-80"' + ckS('hot', 3) + ' stroke-linecap="round"/>') + '<circle r="7"' + ckFi('hot') + '/>' : '<circle r="6"' + ckFi('pop') + '/>');
    }
  ],
  lcd: [
    function (d) { // ана-диги: кольцо из 60 сегментов набирает секунды, число в окошке
      var t = ckTime(d), s = ckSegG(two(d.getDate()));
      return ckTicks(60, function (i, a) { return ckLn(a, 92, i % 5 ? 82 : 74, ' class="sg' + (i <= t.S ? ' on' : '') + '" style="stroke:currentColor" stroke-width="' + (i % 5 ? 4 : 5) + '"'); }) +
        '<g transform="translate(34 -12) scale(.95)"><rect x="-3" y="-3" width="' + ckF(s.w + 6) + '" height="28"' + ckS('text', 1, .5) + '/>' + s.g + '</g>' +
        ckRot(t.h, '<line y2="-44"' + ckS('text', 7) + '/>') + ckRot(t.m, '<line y2="-66"' + ckS('text', 4.5) + '/>') + '<rect x="-5" y="-5" width="10" height="10"' + ckFi('text') + '/>';
    },
    function (d) { // точки: стрелки из точек матрицы, секунда — квадратик на краю
      var t = ckTime(d), hp = Math.round(t.h / 6) % 60, o = '', i, r, lit;
      for (i = 0; i < 60; i++) for (r = 22; r <= 84; r += 9) { lit = i === t.M || (i === hp && r <= 58); o += ckDot(i * 6, r, 2.4, ' class="sg' + (lit ? ' on' : '') + '" style="fill:currentColor"'); }
      o += ckTicks(60, function (i, a) {
        var p = ckPt(a, 95), on = CFG.clockHand && i === t.S;
        return '<rect x="' + ckF(p[0] - 2) + '" y="' + ckF(p[1] - 2) + '" width="4" height="4"' + ckFi('text', on ? 1 : i % 5 ? .08 : .45) + '/>';
      });
      return o + '<rect x="-6" y="-6" width="12" height="12"' + ckFi('text') + '/>';
    }
  ],
  osc: [
    function (d) { // луч: окружность лучом, у секундной гаснущий след
      var t = ckTime(d), tr = '', k;
      if (CFG.clockHand) for (k = 1; k <= 10; k++) tr += ckRot((t.S - k) * 6, '<line y2="-86"' + ckS('a', 1.2, ckF((1 - k / 11) * .45)) + '/>');
      return '<circle r="90"' + ckS('a', 1.6) + '/>' + ckTicks(12, function (i, a) { return ckLn(a, 90, i % 3 ? 82 : 74, ckS('a', 1.6)); }) + tr +
        ckRot(t.h, '<line y2="-46"' + ckS('ch2', 3) + '/>') + ckRot(t.m, '<line y2="-72"' + ckS('a', 2.2) + '/>') +
        (CFG.clockHand ? ckRot(t.s, '<line y2="-86"' + ckS('ch3', 1.4) + '/>') : '') + '<circle r="3"' + ckFi('a') + '/>' +
        '<text x="-62" y="-88" font-size="10"' + ckFi('a', .7) + '>CH1</text>';
    },
    function (d) { // вектор: полярная сетка, стрелки векторами с точкой на конце
      var t = ckTime(d), m = ckPt(t.m, 72), h = ckPt(t.h, 46);
      return '<g' + ckS('axis', 1) + '><circle r="30"/><circle r="60"/><circle r="88"/>' + ckTicks(12, function (i, a) { return ckLn(a, 0, 96, ''); }) + '</g>' +
        ckTicks(12, function (i, a) { var p = ckPt(a, 78); return '<rect x="' + ckF(p[0] - 4) + '" y="' + ckF(p[1] - 4) + '" width="8" height="8"' + ckS('a', 1, .5) + '/>'; }) +
        (CFG.clockHand ? '<path d="' + ckArc(88, Math.max(0, t.s - 90), t.s || .01) + '"' + ckS('ch3', 3, .35) + '/>' + ckDot(t.s, 88, 4, ckFi('ch3')) : '') +
        '<line x2="' + h[0] + '" y2="' + h[1] + '"' + ckS('ch2', 2.4) + '/><circle cx="' + h[0] + '" cy="' + h[1] + '" r="5"' + ckFi('ch2') + '/>' +
        '<line x2="' + m[0] + '" y2="' + m[1] + '"' + ckS('a', 2) + '/><circle cx="' + m[0] + '" cy="' + m[1] + '" r="4.5"' + ckFi('a') + '/><circle r="2.5"' + ckFi('a') + '/>';
    }
  ],
  bp: [
    function (d) { // деталь: осевые линии, полые стрелки, выноска радиуса
      var t = ckTime(d), p = ckPt(225, 86);
      return '<g' + ckS('ln', 1) + '><circle r="86" stroke-width="1.4"/><circle r="78" stroke-width=".6"/><line x1="-98" x2="98" stroke-width=".6" stroke-dasharray="12 3 2 3"/><line y1="-98" y2="98" stroke-width=".6" stroke-dasharray="12 3 2 3"/></g>' +
        ckTicks(60, function (i, a) { return ckLn(a, 86, i % 5 ? 82 : 72, ckS('ln', i % 5 ? .6 : 1.4)); }) +
        [[0, 12], [90, 3], [180, 6], [270, 9]].map(function (x) { return ckText(x[0], 60, x[1], 13, ckFi('text')); }).join('') +
        ckRot(t.h, '<polygon points="-5,8 5,8 3,-46 0,-52 -3,-46" style="fill:var(--sheet);stroke:var(--text)" stroke-width="1.2"/>') +
        ckRot(t.m, '<polygon points="-3.5,10 3.5,10 2,-70 0,-76 -2,-70" style="fill:var(--sheet);stroke:var(--text)" stroke-width="1.2"/>') +
        (CFG.clockHand ? ckRot(t.s, '<line y1="14" y2="-84"' + ckS('hot', 1) + '/>') : '') + '<circle r="4" style="fill:var(--sheet);stroke:var(--text)"/>' +
        '<polyline points="' + p.join(',') + ' -82,82 -100,82"' + ckS('ln', .7) + '/><text x="-91" y="75" font-size="9"' + ckFi('text') + '>R86</text>';
    },
    function (d) { // угломер: шкала в градусах, угол между стрелками подписан
      var t = ckTime(d), ang = Math.round(((t.m - t.h) % 360 + 360) % 360), lp = ckPt(t.h + ang / 2, 30);
      return '<circle r="90"' + ckS('ln', 1.2) + '/>' + ckTicks(120, function (i, a) { return ckLn(a, 90, i % 10 ? i % 5 ? 87 : 84 : 80, ckS('ln', i % 10 ? .5 : 1)); }) +
        [0, 90, 180, 270].map(function (a) { return ckText(a, 70, a + '°', 10, ckFi('text', .8)); }).join('') +
        '<path d="' + ckArc(22, t.h, t.h + ang) + '"' + ckS('warm', 1) + ' stroke-dasharray="3 2"/><text x="' + lp[0] + '" y="' + lp[1] + '" font-size="9"' + ckFi('warm') + '>' + ang + '°</text>' +
        ckRot(t.h, '<line y2="-48"' + ckS('text', 1.6) + '/><path d="M-4 -42L0 -50L4 -42"' + ckS('text', 1.4) + '/>') +
        ckRot(t.m, '<line y2="-74"' + ckS('text', 1.2) + '/><path d="M-4 -68L0 -76L4 -68"' + ckS('text', 1.2) + '/>') +
        (CFG.clockHand ? ckRot(t.s, '<line y2="-88"' + ckS('hot', .8) + '/>') : '') + '<circle r="3"' + ckS('text', 1) + '/>';
    }
  ],
  pixel: [
    function (d) { // круг из клеток, стрелки отрезками по клеткам
      var t = ckTime(d);
      return ckGrid(function (put) {
        var x, y, a;
        for (y = 0; y < 25; y++) for (x = 0; x < 25; x++) if (Math.abs(Math.hypot(x - 12, y - 12) - 11.4) < .55) put(x, y, 'rim');
        for (x = 0; x < 12; x++) { a = x * 30 * CK_R; put(Math.round(12 + Math.sin(a) * 9.6), Math.round(12 - Math.cos(a) * 9.6), x % 3 ? 'dim' : 'yel'); }
        ckHand(put, t.m, 8.6, 'blue'); ckHand(put, t.h, 5.4, 'pink');
        if (CFG.clockHand) { a = t.s * CK_R; put(Math.round(12 + Math.sin(a) * 11.4), Math.round(12 - Math.cos(a) * 11.4), 'mint'); }
        put(12, 12, 'text');
      });
    },
    function (d) { // блоки: часы загораются блоками по кругу, минутная внутри
      var t = ckTime(d), h12 = t.H % 12 || 12, o = '', i, p;
      for (i = 1; i <= 12; i++) { p = ckPt(i * 30, 80); o += '<rect x="' + ckF(p[0] - 10) + '" y="' + ckF(p[1] - 10) + '" width="20" height="20"' + ckFi(i > h12 ? 'track' : i <= 4 ? 'mint' : i <= 8 ? 'yel' : 'pink') + '/>'; }
      return o + ckGrid(function (put) {
        ckHand(put, t.m, 7.2, 'blue');
        if (CFG.clockHand) { var a = t.s * CK_R; put(Math.round(12 + Math.sin(a) * 7.5), Math.round(12 - Math.cos(a) * 7.5), 'text'); }
        put(12, 12, 'pink');
      });
    }
  ]
};
function themedAnalog(n) {
  var draw = (CK_ANA[CFG.theme] || CK_ANA.sheet)[n - 1];
  return ckFace('a', function (d) { return ckDial(draw(d), d); });
}
