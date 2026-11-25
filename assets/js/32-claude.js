'use strict';
// Плитка Claude: лимиты (5 часов, неделя, отдельные модели), токены по дням, работающие чаты.
// Узкая и широкая собраны из одних блоков, раскладку меняет css/claude.css. Нет лимитов — показываются токены.

var LIMIT_NAMES = { five_hour: '5 часов', seven_day: 'Неделя', seven_day_opus: 'Opus', seven_day_sonnet: 'Sonnet', spend_limit: 'Бюджет' };
function limitName(k) { return LIMIT_NAMES[k] || k.replace(/^seven_day_/, '').replace(/_/g, ' '); }
function limitsOf(s) {
  var order = Object.keys(LIMIT_NAMES), at = function (l) { var i = order.indexOf(l.kind); return i < 0 ? 99 : i; };
  return (s.claude && s.claude.limits || []).slice().sort(function (a, b) { return at(a) - at(b); });
}
function limitBy(s, kind) { return limitsOf(s).filter(function (l) { return l.kind === kind; })[0]; }
function maxLimit(s) { var l = limitsOf(s); return l.length ? Math.max.apply(null, l.map(function (x) { return x.pct; })) : null; }
function limitLevel(v) { var lv = level(v, CFG.thr.claude); return lv === 'ok' ? '' : lv; }

// Когда сброс: в ближайшие сутки время, дальше день.
function resetText(l) {
  if (!l.reset) return '';
  var d = new Date(l.reset * 1000);
  if (l.reset * 1000 - Date.now() < 864e5) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: !CFG.clock24 });
  return ruDate(d, { weekday: 'short' }) + ' ' + d.getDate() + '.' + two(d.getMonth() + 1);
}
function spanText(sec) { // «2 ч 17 мин»
  var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? d + ' д ' + h + ' ч' : h ? h + ' ч ' + m + ' мин' : Math.max(m, 1) + ' мин';
}
function tokParts(n) {
  if (n >= 999500) return [(n / 1e6).toFixed(n >= 1e7 ? 0 : 1), 'млн'];
  return n >= 1000 ? [Math.round(n / 1000), 'тыс'] : [n, ''];
}
function tokText(n) { return tokParts(n).join(' ').trim(); }
function todayTokens(c) { var d = c.days || []; return d.length ? d[d.length - 1].tokens : 0; }

// Столбики за неделю, последний = сегодня.
function dayBars(days) {
  var mx = Math.max.apply(null, days.map(function (d) { return d.tokens; }).concat([1]));
  return days.map(function (d, i) {
    return '<i class="' + (i === days.length - 1 ? 'now' : '') + '" style="height:' + (d.tokens ? Math.max(d.tokens / mx * 100, 8) : 0).toFixed(0) + '%"></i>';
  }).join('');
}

TILE_BUILD.claude = function () {
  var el = mk('<div class="tile cla" data-m="claude" data-tip="claude">' + head('claude', badge() + '<span class="cst"><i></i><span class="cn"></span><span class="cw"></span></span>') +
    '<div class="cls"></div><div class="cweek"><div class="ct"><span class="num"></span><span class="cap">токенов сегодня</span></div><div class="cbars"></div></div>' +
    '<div class="foot"><span class="ft0">&nbsp;</span><span class="ft1"></span></div></div>');
  var box = $('.cls', el), built = [], kinds = '', bars = '';
  function block(l) {
    return mk('<div class="cl"><span class="ln">' + esc(limitName(l.kind)) + '</span><span class="lr"></span>' + ring() + '<span class="num lv"><span class="v">0</span><small>%</small></span>' + bar() + '</div>');
  }
  return {
    el: el,
    update: function (s) {
      var c = s.claude; el.hidden = !c; if (!c) return;
      var list = limitsOf(s), key = list.map(function (l) { return l.kind; }).join();
      if (key !== kinds || !built.length) {
        kinds = key; box.innerHTML = '';
        built = list.map(function (l) { var b = block(l); box.appendChild(b); return b; });
      }
      list.forEach(function (l, i) {
        var b = built[i], lv = limitLevel(l.pct), fg = $('.fg', b), n = $('.lv', b);
        $('.v', b).textContent = Math.round(l.pct);
        n.classList.toggle('s-warm', lv === 'warm'); n.classList.toggle('s-hot', lv === 'hot');
        var r = resetText(l); $('.lr', b).innerHTML = r && '<span class="till">до </span>' + r;
        b.classList.toggle('lv-warm', lv === 'warm'); b.classList.toggle('lv-hot', lv === 'hot');
        fg.setAttribute('stroke-dasharray', (clamp(l.pct, 0, 100) * .75).toFixed(1) + ' 100');
        fg.style.visibility = l.pct > 0 ? '' : 'hidden'; // круглый конец рисует точку и у нуля
        setBar($('.bar', b), l.pct, lv);
      });
      el.classList.toggle('nolim', !list.length);
      el.classList.toggle('odd', list.length % 2 === 1);

      var t = tokParts(todayTokens(c)), d = JSON.stringify(c.days || []);
      $('.ct .num', el).innerHTML = t[0] + (t[1] ? '<small> ' + t[1] + '</small>' : '');
      if (d !== bars) { bars = d; $('.cbars', el).innerHTML = dayBars(c.days || []); }
      $('.ft0', el).innerHTML = '<span>Сегодня</span> <span>' + unit(t[0], t[1]) + '</span>';
      $('.ft1', el).innerHTML = c.ctx ? 'Контекст ' + unit(Math.round(c.ctx.pct), '%') : '';

      var st = $('.cst', el), n = c.wait || c.busy, al = Alarm.isOn('claude');
      st.hidden = !n || al;
      st.classList.toggle('wait', !!c.wait);
      $('.cn', st).textContent = n > 1 ? n : '';
      $('.cw', st).textContent = c.wait ? (n > 1 ? ' ждут' : 'ждёт') : n > 1 ? ' работают' : 'работает';
      setAlarm(el, al, 'лимит');
    }
  };
};
