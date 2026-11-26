'use strict';
// Панель игрового режима. Go присылает оформление виджета и набор строк (__init), раз в секунду снимок (__stats).
// Чего нет (нет игры на переднем плане, нет датчика), той строки нет; нечего показать — панели нет.

var G = { corner: 'tl', rows: ['fps', 'low', 'frame', 'cpu', 'gpu', 'vram', 'power'] };
var FT = [];          // время кадра для мини-графика, мс: последние HN точек, это около 3 с
var ovEl = document.getElementById('ov');
var ovViz = null, ovSize = '';

function v(text, unit) { return '<b class="v num">' + segs(text) + (unit ? '<small>' + unit + '</small>' : '') + '</b>'; }
function row(n, val, cls) { return '<div class="r' + (cls ? ' ' + cls : '') + '"><span class="n">' + n + '</span>' + val + '</div>'; }
function tempPart(t, thr) { return t == null ? '' : ' <span class="' + level(t, thr) + '">' + segs(String(Math.round(t))) + '<small>°</small></span>'; }

// Строки панели: ключ -> html или '' (нет данных).
var OV_ROWS = {
  fps: function (s) { return s.frames ? row('FPS', v(String(Math.round(s.frames.fps))), 'big') : ''; },
  low: function (s) { return s.frames && s.frames.low1 != null ? row('1% low', v(String(Math.round(s.frames.low1)))) : ''; },
  frame: function (s) { return s.frames ? row('Кадр', v(dec(s.frames.frameMs, 1), 'мс')) + '<div class="gr"></div>' : ''; },
  cpu: function (s) {
    var c = s.cpu; if (!c) return '';
    return row('CPU', '<b class="v num">' + segs(String(Math.round(c.load))) + '<small>%</small>' + tempPart(c.temp, CFG.thr.cpuTemp) + '</b>');
  },
  gpu: function (s) {
    var g = s.gpu; if (!g) return '';
    return row('GPU', '<b class="v num">' + segs(String(Math.round(g.load))) + '<small>%</small>' + tempPart(g.temp, CFG.thr.gpuTemp) + '</b>');
  },
  vram: function (s) {
    var g = s.gpu; if (!g || g.memUsed == null) return '';
    return row('VRAM', v(dec(g.memUsed / 1024, 1) + (g.memTotal ? ' / ' + Math.round(g.memTotal / 1024) : ''), 'ГБ'));
  },
  power: function (s) {
    var w = 0, has = false;
    [s.cpu && s.cpu.power, s.gpu && s.gpu.power].forEach(function (x) { if (x != null) { w += x; has = true; } });
    return has ? row('Мощность', v(String(Math.round(w)), 'Вт')) : '';
  }
};

function ovTheme() {
  document.body.className = bodyClass();
  setThemeVars(document.body.style);
  // Время кадра: у Листа кривая, у Прибора и табло столбики, у Заливки рельеф во всю карточку.
  ovViz = CFG.theme === 'fill' ? fillViz('graph') : CFG.theme === 'sheet' || CFG.theme === 'osc' || CFG.theme === 'bp' ? lineViz() : histViz();
  ovRender();
}

function ovRender() {
  var s = S || {};
  var html = G.rows.map(function (k) { return OV_ROWS[k] ? OV_ROWS[k](s) : ''; }).join('');
  ovEl.hidden = !html;
  if (html) {
    ovEl.innerHTML = '<div class="in">' + html + '</div>';
    var gr = $('.gr', ovEl);
    if (gr && ovViz) {
      gr.appendChild(ovViz.el);
      var top = Math.max.apply(null, FT.concat([8]));
      var mx = Math.max(top * 1.15, s.frames ? s.frames.frameMs10 * 2 : 0);
      ovViz.set({ hist: FT, max: ovViz.bg ? mx * 2.2 : mx }); // рельеф Заливки ниже цифр
      if (ovViz.bg) $('.in', ovEl).insertBefore(ovViz.el, $('.in', ovEl).firstChild); // Заливка: рельеф во всю карточку
      placeFills(ovEl);
    }
  }
  var r = ovEl.hidden ? { width: 1, height: 1 } : ovEl.getBoundingClientRect();
  var size = Math.ceil(r.width) + ',' + Math.ceil(r.height);
  if (size !== ovSize) { ovSize = size; post('size:' + size); }
}

window.__init = function (o) {
  CFG = mergeCfg(o.ui);
  if (o.sys) SYS = o.sys;
  if (o.game) G = o.game;
  ovTheme();
};
window.__stats = function (s) {
  S = s;
  if (s.frames && s.frames.graph) {
    FT = FT.concat(s.frames.graph).slice(-HN);
  } else FT = [];
  ovRender();
};
if (darkMQ) darkMQ.addEventListener('change', function () { if (CFG && CFG.tone === 'auto') ovTheme(); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
post('ready');
