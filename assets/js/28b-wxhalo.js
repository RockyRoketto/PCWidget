'use strict';
// Солнце и луна фона погоды. В правом углу плитки стоит значок погоды (.wi), поэтому второй фигуры (диска, месяца,
// циферблата) фон не рисует: значок сам читается светилом, а вокруг него — свечение и большие кольца в стиле темы
// (ring в наборе форм). Облака и звёзды под значок не заходят.

// o.ib — прямоугольник значка в единицах макета (меряется в wxFit); деление на масштаб — если карточка увеличена.
function wxIconBox(o) {
  var el = o.cb.querySelector('.wi'), a = o.cb.getBoundingClientRect(), b = el && el.getBoundingClientRect();
  if (!b || !b.width) { o.ib = { x0: o.W - 120, y0: 24, x1: o.W - 24, y1: 120 }; return; }
  var u = 2 / (a.width / o.cb.offsetWidth || 1), x = (b.left - a.left) * u - o.cb.clientLeft * 2, y = (b.top - a.top) * u - o.cb.clientTop * 2;
  o.ib = { x0: x, y0: y, x1: x + b.width * u, y1: y + b.height * u };
}
function wxNearIcon(o, x, y) { var b = o.ib; return x > b.x0 - 24 && x < b.x1 + 24 && y > b.y0 - 24 && y < b.y1 + 24; }

// Ореол с центром в значке; f — доля яркости (в переменную облачность свет слабее). r — сторона значка.
function wxHalo(o, g, t, k, night, f) {
  var b = o.ib, x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2, r = b.x1 - b.x0, col = night ? k.p : k.sun;
  var A = (night ? .2 : .4) * f * (.92 + .08 * Math.sin(t / 2200));
  if (!k.kind.noGlow) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r * 3.4);
    gr.addColorStop(0, 'rgba(' + col + ',' + A + ')'); gr.addColorStop(.4, 'rgba(' + col + ',' + A * .45 + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, o.W, o.H);
  }
  if (k.kind.ring) { g.save(); k.kind.ring(o, g, t, { x: x, y: y, r: r, col: col, a: A }); g.restore(); }
}
// Два кольца вокруг значка (дальнее бледнее); dash — штрихи пунктира, медленно ползут по окружности.
function wxRings(g, t, h, dash) {
  g.strokeStyle = 'rgba(' + h.col + ',' + h.a * .8 + ')'; g.lineWidth = 2;
  if (dash) { g.setLineDash(dash); g.lineDashOffset = t / 300; }
  g.beginPath(); g.arc(h.x, h.y, h.r * 1.7, 0, 7); g.stroke();
  g.globalAlpha = .5; g.beginPath(); g.arc(h.x, h.y, h.r * 2.5, 0, 7); g.stroke();
}

// Облака рисуются отдельным слоем, чтобы растаять вокруг значка, не задев свечение под ними.
function wxCloudsAside(o, g, dt, k, draw) {
  if (!o.layer || o.layer.width !== o.W || o.layer.height !== o.H) o.layer = wxCanvas(o.W, o.H);
  var lg = o.layer.getContext('2d'); lg.clearRect(0, 0, o.W, o.H);
  draw(o, lg, 0, dt, k);
  wxHole(o, lg);
  g.drawImage(o.layer, 0, 0);
}
// Мягко стирает нарисованное вокруг значка: под ним пусто, дальше плавно возвращается.
function wxHole(o, g) {
  var b = o.ib, r = (b.x1 - b.x0) / 2, R = r * 2.2;
  var gr = g.createRadialGradient(0, 0, r, 0, 0, R);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.35, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalCompositeOperation = 'destination-out'; g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.restore();
}
