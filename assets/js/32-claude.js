'use strict';
// Плитка Claude: лимиты (5 часов, неделя, отдельные модели), токены за сегодня, работающие чаты.
// Во всю ширину два главных лимита ячейками рядом, в половинке и при 3+ лимитах — строки. Без лимитов — токены.

var LIMIT_SHORT = { five_hour: '5 ч', seven_day: 'неделя' };
var LIMIT_NAMES = { five_hour: '5 часов', seven_day: 'Неделя', seven_day_opus: 'Opus', seven_day_sonnet: 'Sonnet', spend_limit: 'Бюджет' };
function limitName(k) { return LIMIT_NAMES[k] || k.replace(/^seven_day_/, '').replace(/_/g, ' '); }
function limitsOf(s) {
  var order = Object.keys(LIMIT_NAMES), at = function (l) { var i = order.indexOf(l.kind); return i < 0 ? 99 : i; };
  return (s.claude && s.claude.limits || []).slice().sort(function (a, b) { return at(a) - at(b); });
}
function limitBy(s, kind) { return limitsOf(s).filter(function (l) { return l.kind === kind; })[0]; }
function maxLimit(s) { var l = limitsOf(s); return l.length ? Math.max.apply(null, l.map(function (x) { return x.pct; })) : null; }
function limitLevel(v) { return level(v, CFG.thr.claude); }

// Когда сброс: в ближайшие сутки время, дальше день.
function resetText(l) {
  if (!l.reset) return '';
  var d = new Date(l.reset * 1000);
  if (l.reset * 1000 - Date.now() < 864e5) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: !CFG.clock24 });
  return ruDate(d, { weekday: 'short' });
}
function tokParts(n) {
  if (n >= 999500) return [dec(n / 1e6, n >= 1e7 ? 0 : 1), 'млн'];
  return n >= 1000 ? [String(Math.round(n / 1000)), 'тыс'] : [String(n), ''];
}
function todayTokens(c) { var d = c.days || []; return d.length ? d[d.length - 1].tokens : 0; }
// Чаты: точка «работает» или «ждёт» в названии.
function chatDot(c) {
  var n = c.wait || c.busy;
  if (!n) return '';
  return ' <i class="dot' + (c.wait ? ' wait' : '') + '" title="' + (c.wait ? 'ждёт ответа' : 'работает') + '"></i>' + (n > 1 ? '<small>' + n + '</small>' : '');
}

TILE_BUILD.claude = function () {
  var el = tileBox('claude'), one = makeCell({ cls: 'one lines' }), box = mk('<div class="ls"></div>');
  var two = mk('<div class="two"></div>'), a = makeCell({ kind: 'level' }), b = makeCell({ kind: 'level' }), tok = makeCell({ kind: 'level', cls: 'tok' });
  one.el.appendChild(box); two.appendChild(a.el); two.appendChild(b.el); el.appendChild(one.el); el.appendChild(two); el.appendChild(tok.el);
  var lines = makeLines(box), n = 0;
  function fillCell(c, l, title, note) {
    var lv = limitLevel(l.pct);
    c.name(title); c.aux(resetText(l) ? 'до ' + resetText(l) : '');
    c.big(Math.round(l.pct), '%', lv); c.side(null); c.note(note || '');
    c.lv(lv); c.viz({ pct: l.pct, mark: CFG.thr.claude });
  }
  return {
    el: el,
    span: function () { return thinOn('claude') ? 1 : n > 3 ? 3 : 2; },
    update: function (s) {
      var c = s.claude; el.hidden = !c; if (!c) return;
      var list = limitsOf(s), t = tokParts(todayTokens(c)), al = Alarm.isOn('claude'), dot = chatDot(c);
      n = list.length;
      el.classList.toggle('nolim', !n);
      el.classList.toggle('many', n > 2);
      var today = 'сегодня<br>' + t.join(' ');
      if (!n) {
        var days = c.days || [], mx = Math.max.apply(null, days.map(function (d) { return d.tokens; }).concat([1]));
        tok.name('Claude' + dot); tok.aux(c.ctx ? 'контекст ' + Math.round(c.ctx.pct) + '%' : '');
        tok.big(t[0], t[1]); tok.side(null); tok.note('токенов<br>сегодня');
        tok.viz({ pct: todayTokens(c) / mx * 100 });
      } else if (wide(el) && n <= 2) {
        fillCell(a, list[0], 'Claude, ' + (LIMIT_SHORT[list[0].kind] || limitName(list[0].kind)) + dot, today);
        if (list[1]) fillCell(b, list[1], 'Claude, ' + (LIMIT_SHORT[list[1].kind] || limitName(list[1].kind)), c.ctx ? 'контекст<br>' + Math.round(c.ctx.pct) + '%' : '');
        b.el.hidden = !list[1];
      } else {
        one.name('Claude' + dot); one.aux('сегодня ' + t.join(' '));
        lines(list.map(function (l) {
          var r = resetText(l);
          return { n: thinNow(el) ? LIMIT_SHORT[l.kind] || limitName(l.kind) : limitName(l.kind), m: r ? 'до ' + r : '', v: unitHtml(Math.round(l.pct), '%'), pct: l.pct, mark: CFG.thr.claude, lv: limitLevel(l.pct) };
        }));
      }
      [one, a, b, tok].forEach(function (x) { x.alarm(al); });
    }
  };
};
