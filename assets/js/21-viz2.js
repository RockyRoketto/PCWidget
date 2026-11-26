'use strict';
// Индикаторы «Чертежа» (выбор по теме — makeViz в 22-parts.js, вид — theme-bp.css).
// История: тонкая линия, пик отмечен выноской с полкой и значением. Заполненность: штриховка до значения
// и размерная линия со стрелками над ней; в строках только тонкая штриховка. Порог — красный штрих.

// Где поставить выноску пика: индекс наибольшего значения и сторона полки (у правого края — влево, у верха — вниз).
function bpPeak(h, max) {
  var i = 0;
  for (var j = 1; j < h.length; j++) if (h[j] >= h[i]) i = j;
  var x = 100 - (h.length - 1 - i) * 100 / (HN - 1), y = (29 - Math.min(h[i] / max, 1) * 27) / 30 * 100;
  return { v: h[i], x: x, y: y, left: x > 62, down: y < 45 };
}

function bpGraphViz(kind) {
  var line = lineViz(), el = mk('<div class="bpg" aria-hidden="true"><span class="pk" hidden><i></i><b></b><span></span></span></div>');
  el.insertBefore(line.el, el.firstChild);
  var pk = $('.pk', el), lab = $('span', pk);
  return {
    el: el,
    set: function (o) {
      line.set(o);
      var h = o.hist;
      pk.hidden = kind !== 'graph' || !h || h.length < 2 || !(Math.max.apply(null, h) > 0); // у сети единицы разные: без выноски
      if (pk.hidden) return;
      var p = bpPeak(h, o.max);
      pk.style.left = p.x + '%'; pk.style.top = p.y + '%';
      pk.className = 'pk' + (p.left ? ' l' : '') + (p.down ? ' d' : '');
      lab.textContent = 'max ' + Math.round(p.v) + '%';
    }
  };
}

function bpDimViz(thin) {
  var el = mk('<div class="bpd' + (thin ? ' thin' : '') + '" aria-hidden="true"><i></i><b></b><u class="z"></u><u class="e"></u><s hidden></s></div>');
  var fill = el.childNodes[0], dim = el.childNodes[1], end = el.childNodes[3], mark = el.childNodes[4];
  return {
    el: el,
    set: function (o) {
      var p = clamp(o.pct || 0, 0, 100);
      fill.style.width = dim.style.width = p + '%';
      end.style.left = 'calc(' + p + '% - 1px)';
      dim.classList.toggle('short', (el.clientWidth || 136) * p / 100 < 16); // стрелкам нужно место
      mark.hidden = o.mark == null;
      if (o.mark != null) mark.style.left = clamp(o.mark, 0, 100) + '%';
    }
  };
}
