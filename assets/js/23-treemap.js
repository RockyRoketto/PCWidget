'use strict';
// Раскладка карты памяти (treemap): только расчёт, без DOM.

// Прямоугольники по числам: площадь каждого пропорциональна своему числу, все вместе заполняют w x h,
// стороны по возможности близки (squarified treemap). Числа положительные, лучше по убыванию.
// Ответ в том же порядке: [{ x, y, w, h }].
function squarify(values, x, y, w, h) {
  var total = values.reduce(function (a, v) { return a + v; }, 0), k = total > 0 ? w * h / total : 0;
  var areas = values.map(function (v) { return v * k; }), out = [], i = 0;
  // худшее отношение сторон в полосе из этих площадей вдоль стороны side
  function worst(row, side) {
    var s = 0, lo = Infinity, hi = 0;
    row.forEach(function (a) { s += a; lo = Math.min(lo, a); hi = Math.max(hi, a); });
    return Math.max(side * side * hi / (s * s), s * s / (side * side * lo));
  }
  while (i < areas.length) {
    var side = Math.min(w, h), row = [areas[i++]];
    while (i < areas.length && worst(row.concat(areas[i]), side) <= worst(row, side)) row.push(areas[i++]);
    var sum = row.reduce(function (a, v) { return a + v; }, 0), thick = side > 0 ? sum / side : 0, at = 0, tall = w >= h;
    row.forEach(function (a) {
      var len = thick > 0 ? a / thick : 0;
      out.push(tall ? { x: x, y: y + at, w: thick, h: len } : { x: x + at, y: y, w: len, h: thick });
      at += len;
    });
    if (tall) { x += thick; w -= thick; } else { y += thick; h -= thick; }
  }
  return out;
}

// Порядок процессов держится прежним, пока один не перерос соседа на десятую часть:
// иначе близкие по размеру блоки менялись бы местами каждую секунду. prev — имена в прошлом порядке.
var MAP_KEEP = 1.1;
function memOrder(list, prev) {
  var at = function (p) { var i = prev.indexOf(p.name); return i < 0 ? prev.length : i; };
  var out = list.slice().sort(function (a, b) { return at(a) - at(b) || b.v - a.v; });
  for (var i = 1; i < out.length; i++) {
    for (var j = i; j > 0 && out[j].v > out[j - 1].v * MAP_KEEP; j--) { var t = out[j]; out[j] = out[j - 1]; out[j - 1] = t; }
  }
  return out;
}

// Блоки карты: до max процессов и «Прочее» (вся остальная занятая память) полосой справа или снизу.
// procs: [{ name, v }] в МБ в нужном порядке; used — занято всего, МБ. Процесс, чей блок вышел бы меньше
// MAP_MIN пикселей, или лишний сверх max уходит в «Прочее». Если сумма всё же больше занятой (замеры в разные
// моменты, старая Windows с общими страницами), «Прочего» нет, а площади делятся между самими процессами.
var MAP_MIN = 280;
function memBlocks(procs, used, w, h, max) {
  if (!(w > 0 && h > 0)) return [];
  var top = procs.slice(0, max), sum = 0, out = [];
  var total = Math.max(used, top.reduce(function (a, p) { return a + p.v; }, 0));
  var shown = top.filter(function (p) { return p.v > 0 && p.v / total * w * h >= MAP_MIN; });
  shown.forEach(function (p) { sum += p.v; });
  var rest = Math.max(0, total - sum), side = w >= h, pw = w, ph = h;
  if (!shown.length) return rest > 0 ? [{ name: 'Прочее', v: rest, other: true, x: 0, y: 0, w: w, h: h }] : [];
  if (rest / total * (side ? w : h) < 3) rest = 0; // полоска тоньше 3px не видна
  if (rest) { if (side) pw = w * sum / (sum + rest); else ph = h * sum / (sum + rest); }
  squarify(shown.map(function (p) { return p.v; }), 0, 0, pw, ph).forEach(function (r, i) {
    r.name = shown[i].name; r.v = shown[i].v; out.push(r);
  });
  if (rest) out.push({ name: 'Прочее', v: rest, other: true, x: side ? pw : 0, y: side ? 0 : ph, w: side ? w - pw : w, h: side ? h : h - ph });
  return out;
}
