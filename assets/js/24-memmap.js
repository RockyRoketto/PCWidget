'use strict';
// Карта памяти в плитке «Память»: блоки процессов (раскладка в 23-treemap.js).
// Цвет — акцент темы или свой цвет плитки, чем крупнее процесс, тем плотнее; форму правят темы.

function memMapOn(s) { return !!(CFG.memMap && s.mem && s.procs && s.procs.map && s.procs.map.length); }

// Подпись появляется, только когда блок для неё достаточно велик, и в любом случае обрезается по блоку.
var MAP_NAME_W = 34, MAP_OTHER_W = 48, MAP_NAME_H = 15, MAP_SIZE_H = 29, MAP_UNIT_W = 44;

function memMapViz() {
  var el = mk('<div class="tmap" aria-hidden="true"></div>'), nodes = {}, order = [];
  return {
    el: el,
    set: function (o) {
      var w = el.clientWidth, h = el.clientHeight, list = memOrder(o.procs || [], order), seen = {};
      order = list.map(function (p) { return p.name; });
      memBlocks(list, o.used, w, h, w * h > 20000 ? 11 : 6).forEach(function (b, i) {
        var key = b.other ? '*' : '+' + b.name, n = nodes[key];
        if (!n) { n = nodes[key] = mk('<i><b></b><span></span></i>'); el.appendChild(n); }
        seen[key] = 1;
        n.className = b.other ? 'other' : '';
        n.style.left = b.x + 'px'; n.style.top = b.y + 'px'; n.style.width = b.w + 'px'; n.style.height = b.h + 'px';
        // плотность по месту в списке: 1 у крупнейшего, 0 с пятого
        n.style.setProperty('--k', Math.max(0, 1 - i / 4).toFixed(2));
        var pw = b.w - 2, ph = b.h - 2, name = pw >= (b.other ? MAP_OTHER_W : MAP_NAME_W) && ph >= MAP_NAME_H;
        n.firstChild.textContent = name ? b.name : '';
        n.lastChild.textContent = name && ph >= MAP_SIZE_H ? dec(b.v / 1024, 1) + (pw >= MAP_UNIT_W ? ' ГБ' : '') : '';
      });
      Object.keys(nodes).forEach(function (k) { if (!seen[k]) { el.removeChild(nodes[k]); delete nodes[k]; } });
    }
  };
}
