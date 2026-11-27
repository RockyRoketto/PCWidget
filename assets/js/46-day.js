'use strict';
// «Куда ушёл день»: программы, которые сегодня дольше всех были на переднем плане.
// Go отдаёт S.day раз в секунду; значки приходят по номеру (__dayIcon) по просьбе «day:icon:<номер>».

var DAY_ICONS = {}, dayAsked = {};
window.__dayIcon = function (n, url) { DAY_ICONS[n] = url; if (view && dataReady) { view.update(S); view.tick(); } };

function dayOf(s) { var d = s && s.day; return d && d.apps && d.apps.length ? d : null; }
// Своё название из настроек важнее найденного.
function dayName(n) { return Object.prototype.hasOwnProperty.call(CFG.dayNames, n) ? CFG.dayNames[n] : n; }
// short — для узких мест: «3:12», «45 м».
function dayTime(sec, short) {
  if (!short) return sec < 60 ? '<1 мин' : shortUptime(sec);
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
  return h ? h + ':' + two(m) : sec < 60 ? '<1 м' : m + ' м';
}
// Значок программы; пока его нет (или у программы его нет вовсе) — первая буква названия.
function dayIcon(a) {
  var url = a.icon ? DAY_ICONS[a.icon] : '';
  if (a.icon && !url && !dayAsked[a.icon]) { dayAsked[a.icon] = 1; post('day:icon:' + a.icon); }
  return url ? '<i class="dy-ic" style="background-image:url(' + url + ')"></i>' : '<i class="dy-ic dy-no">' + esc(dayName(a.name).charAt(0).toUpperCase()) + '</i>';
}

TILE_BUILD.day = function () {
  var el = tileBox('day'), c = makeCell({ name: TILE_NAMES.day, cls: 'lines' }), box = mk('<div class="ls"></div>');
  c.el.appendChild(box); el.appendChild(c.el);
  var lines = makeLines(box);
  return {
    el: el, span: function () { return CFG.dayN > 3 ? 3 : 2; },
    update: function (s) {
      var d = dayOf(s); el.hidden = !d; if (!d) return;
      var max = d.apps[0].sec, out = [], short = !wide(el);
      c.name(short ? 'За день' : TILE_NAMES.day); // в половинке длинное название вытесняет итог
      c.aux(dayTime(d.total, short));
      for (var i = 0; i < CFG.dayN; i++) { // строк всегда поровну, чтобы плитка не меняла высоту
        var a = d.apps[i];
        out.push(a ? { n: dayIcon(a) + '<span title="' + esc(dayName(a.name)) + '">' + esc(dayName(a.name)) + '</span>', v: dayTime(a.sec, short), pct: a.sec / max * 100 } : { n: '&nbsp;', v: '', pct: 0 });
      }
      lines(out);
    }
  };
};

// Строка Колонки, Полоски и Квадрата: значок и название главной программы, всего за день.
CSPEC.day = { g: 'time2', m: 'day', icon: true, stripSm: true,
  n: function (s) { var d = dayOf(s); return d ? dayIcon(d.apps[0]) : ''; },
  get: function (s) { var d = dayOf(s); return d && { v: dayTime(d.total, CFG.mode !== 'strip'), sm: esc(dayName(d.apps[0].name)) }; }
};
