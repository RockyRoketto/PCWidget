'use strict';
// Часы по темам (25c — стрелки, 25d — цифры): общие куски. Циферблат в координатах от центра, радиус 100.
// Цвета — только переменные темы, поэтому светлый и тёмный тон без отдельных правок.

var CK_R = Math.PI / 180;
function ckF(n) { return (+n).toFixed(1); }
function ckPt(a, r) { return [ckF(Math.sin(a * CK_R) * r), ckF(-Math.cos(a * CK_R) * r)]; }
// линия цветом переменной (ckS('text', 2)), заливка (ckFi('a')); op — прозрачность
function ckS(v, w, op) { return ' style="stroke:var(--' + v + ')" stroke-width="' + w + '" fill="none"' + (op != null ? ' opacity="' + op + '"' : ''); }
function ckFi(v, op) { return ' style="fill:var(--' + v + ')"' + (op != null ? ' opacity="' + op + '"' : ''); }
function ckLn(a, r1, r2, st) { var p = ckPt(a, r1), q = ckPt(a, r2); return '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '"' + st + '/>'; }
function ckTicks(n, fn) { var o = ''; for (var i = 0; i < n; i++) o += fn(i, i * 360 / n) || ''; return o; }
function ckRot(a, s) { return '<g transform="rotate(' + ckF(a) + ')">' + s + '</g>'; }
function ckDot(a, r, rad, st) { var p = ckPt(a, r); return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + rad + '"' + st + '/>'; }
function ckText(a, r, t, size, st) { var p = ckPt(a, r); return '<text x="' + p[0] + '" y="' + p[1] + '" font-size="' + size + '"' + st + '>' + t + '</text>'; }
function ckArc(r, a0, a1) {
  if (a1 - a0 >= 359.9) return 'M0 ' + -r + 'A' + r + ' ' + r + ' 0 1 1 0 ' + r + 'A' + r + ' ' + r + ' 0 1 1 0 ' + -r;
  var p = ckPt(a0, r), q = ckPt(a1, r);
  return 'M' + p[0] + ' ' + p[1] + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + q[0] + ' ' + q[1];
}
function ckPie(r, a) { return a <= 0 ? '' : a >= 359.9 ? '<circle r="' + r + '"' : '<path d="M0 0L' + ckArc(r, 0, a).slice(1) + 'Z"'; }
// Время: углы стрелок и строки с учётом 24/12 часов.
function ckTime(d) {
  var H = d.getHours(), M = d.getMinutes(), S = d.getSeconds();
  return { H: H, M: M, S: S, h: H % 12 * 30 + M / 2, m: M * 6 + S / 10, s: S * 6, hh: CFG.clock24 ? two(H) : String(H % 12 || 12), mm: two(M), ss: two(S) };
}
function ckDay(d) { return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 864; } // доля дня, %
function ckCap(d) { return ruDate(d, { weekday: 'short', day: 'numeric', month: 'long' }); }
function ckWd(d) { return ruDate(d, { weekday: 'long' }); }
function ckDm(d) { return ruDate(d, { day: 'numeric', month: 'long' }); }
// Справа от циферблата во всю ширину — как у классических стрелок.
function ckAside(d) { return '<div class="aside"><b class="awd">' + ckWd(d) + '</b><span class="adt">' + ckDm(d) + '</span></div>'; }
function ckDial(svg, d) { return '<svg class="dial" viewBox="-100 -100 200 200">' + svg + '</svg>' + ckAside(d); }

// ---- семь сегментов: горят .on, остальные призраками (--ghost) ----
var CK_SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
var CK_SEGP = (function () {
  var w = 12, h = 22, t = 2.6, g = .7, L = t / 2, R = w - t / 2, T = t / 2, M = h / 2, B = h - t / 2, q = t / 2;
  function hz(a, b, y) { return [a, y, a + q, y - q, b - q, y - q, b, y, b - q, y + q, a + q, y + q].join(' '); }
  function vt(a, b, x) { return [x, a, x + q, a + q, x + q, b - q, x, b, x - q, b - q, x - q, a + q].join(' '); }
  return { a: hz(L + g, R - g, T), g: hz(L + g, R - g, M), d: hz(L + g, R - g, B), f: vt(T + g, M - g, L), b: vt(T + g, M - g, R), e: vt(M + g, B - g, L), c: vt(M + g, B - g, R) };
})();
function ckSegG(str, x) {
  var o = '', i, k, ch, on;
  x = x || 0;
  for (i = 0; i < str.length; i++) {
    ch = str[i];
    if (ch === ':') { o += '<rect class="sg on" x="' + x + '" y="6" width="2.6" height="2.6"/><rect class="sg on" x="' + x + '" y="14" width="2.6" height="2.6"/>'; x += 6; continue; }
    on = CK_SEG[ch] || '';
    o += '<g transform="translate(' + x + ') skewX(-6)">';
    for (k in CK_SEGP) o += '<polygon class="sg' + (on.indexOf(k) >= 0 ? ' on' : '') + '" points="' + CK_SEGP[k] + '"/>';
    o += '</g>';
    x += 15.5;
  }
  return { g: o, w: x - 3.5 };
}
function ckSeg(str, hpx) { var s = ckSegG(str); return '<svg class="seg7" viewBox="-1 -1 ' + ckF(s.w + 2) + ' 24" style="height:' + ckF(hpx) + 'px;width:' + ckF(hpx * (s.w + 2) / 24) + 'px">' + s.g + '</svg>'; }

// ---- клетки 3×5 (шрифт PX5 из 21b-pixel.js) ----
function ckPx(str, c, col, colon) {
  var o = '', x = 0, i, ch, rows, y, j;
  for (i = 0; i < str.length; i++) {
    ch = str[i]; rows = PX5[ch];
    if (!rows) continue;
    if (ch === ':' && colon === false) { x += 2 * c; continue; }
    for (y = 0; y < 5; y++) for (j = 0; j < rows[y].length; j++) if (rows[y][j] === '1') o += '<rect x="' + (x + j * c) + '" y="' + y * c + '" width="' + ckF(c - .6) + '" height="' + ckF(c - .6) + '"/>';
    x += (rows[0].length + 1) * c;
  }
  return '<svg class="pxt" viewBox="0 0 ' + (x - c) + ' ' + 5 * c + '" style="width:' + (x - c) + 'px;height:' + 5 * c + 'px;fill:var(--' + col + ')">' + o + '</svg>';
}
// Сетка клеток 25×25 поверх циферблата: put(x, y, переменная цвета).
function ckGrid(fill) {
  var cells = {}, o = '', k, p;
  fill(function (x, y, col) { cells[x + ',' + y] = col; });
  for (k in cells) { p = k.split(','); o += '<rect x="' + (p[0] * 8 - 100) + '" y="' + (p[1] * 8 - 100) + '" width="7" height="7"' + ckFi(cells[k]) + '/>'; }
  return o;
}
function ckLine(x0, y0, x1, y1, put) {
  var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, e2;
  for (;;) { put(x0, y0); if (x0 === x1 && y0 === y1) break; e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
function ckHand(put, a, len, col) {
  ckLine(12, 12, Math.round(12 + Math.sin(a * CK_R) * len), Math.round(12 - Math.cos(a * CK_R) * len), function (x, y) { put(x, y, col); });
}

// ---- лицо ----
// Размер берётся из места, которое дали: широкая (w), высокая (t) или обычная (s); k — масштаб шрифтов от него.
var CK_BASE = { s: [136, 88], w: [304, 88], t: [136, 148] };
function ckFace(kind, draw) {
  var el = mk('<div class="face ck ck-' + kind + '"></div>'), last = '';
  return {
    el: el,
    tick: function () {
      var d = new Date(), W = el.clientWidth, H = el.clientHeight;
      var lay = W >= 250 ? 'w' : H >= 140 ? 't' : 's', b = CK_BASE[lay];
      var k = W && H ? Math.max(.75, Math.min(1.6, W / b[0], H / b[1])) : 1;
      var key = d.toTimeString().slice(0, 8) + lay + k.toFixed(2) + CFG.clock24;
      if (key === last) return;
      last = key;
      el.className = 'face ck ck-' + kind + ' ' + lay;
      el.innerHTML = draw(d, lay, k);
    }
  };
}
// Размер шрифта по раскладке: z(lay, k, обычная, широкая, высокая).
function ckZ(lay, k, s, w, t) { return Math.round((lay === 's' ? s : lay === 'w' ? w : t) * k); }
