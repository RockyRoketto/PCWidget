'use strict';
// Карточки по наведению для остальных плиток: Диски, Погода, Часы и Календарь, ПК включён, Claude; у Сети — трафик.
// Графики собирает 95-hover.js (parts), здесь — блоки без графика (more): строки, полосы заполнения, дни прогноза.

HV_GET.dr = function (s) { return hvDiskSum(s, 'read'); };
HV_GET.dw = function (s) { return hvDiskSum(s, 'write'); };
['dr', 'dw'].forEach(function (k) { HSER[k] = { f: [], c: [], sum: 0, n: 0, lo: null, hi: null, k: 0 }; });
function hvDiskSum(s, f) {
  var a = (s.disks || []).filter(function (d) { return d[f] != null; });
  return a.length ? a.reduce(function (t, d) { return t + d[f]; }, 0) : null;
}

// ---- кирпичики ----
function hvBox(title, inner) { return inner ? '<div class="hc-s hc-more">' + (title ? '<div class="hc-tt"><span class="hc-n">' + title + '</span></div>' : '') + inner + '</div>' : ''; }
function hvRow(k, v, cls) { return v == null || v === '' ? '' : '<div class="hc-r"><span>' + k + '</span><b class="num ' + (cls || '') + '">' + v + '</b></div>'; }
// Полоса заполнения: подпись слева, значение справа, под ней шкала и пояснение.
function hvBar(name, val, pct, lv, note) {
  return '<div class="hc-bar' + (lv ? ' ' + lv : '') + '"><div class="hc-r"><span>' + name + '</span><b class="num ' + (lv || '') + '">' + val + '</b></div>' +
    '<div class="hc-tr"><i style="width:' + clamp(pct, 0, 100).toFixed(1) + '%"></i></div>' + (note ? '<div class="hc-nt">' + note + '</div>' : '') + '</div>';
}
function hvDeg2(v) { return String(Math.round(v)).replace('-', '−') + '°'; }
function hvCap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
function hvTime(d) { return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: !CFG.clock24 }); }

// ---- Сеть: трафик за день и месяц, потери — только когда есть ----
HV_CARDS.net.more = function (s) {
  var n = s.net; if (!n) return '';
  var dl = function (a, b) { return '↓ ' + sizeText(a) + ' · ↑ ' + sizeText(b); };
  return hvBox('Трафик', hvRow('Сегодня', dl(n.dayDown, n.dayUp)) + hvRow('За месяц', dl(n.monthDown, n.monthUp)) +
    (n.loss != null && n.loss > 0 ? hvRow('Потери пакетов', Math.round(n.loss) + '%', n.loss >= 5 ? 'hot' : 'warm') : ''));
};

// ---- Диски: чтение и запись графиком, заполнение каждого ----
HV_CARDS.disks = { name: 'Диски', parts: [hvRate('dr', 'Чтение'), hvRate('dw', 'Запись')], more: function (s) {
  return hvBox('Место', (s.disks || []).map(function (d) {
    var lv = level(d.usedPct, CFG.thr.disk);
    return hvBar(esc(d.name) + (d.temp != null ? ' <small class="' + level(d.temp, 60) + '">' + Math.round(d.temp) + '°</small>' : ''), Math.round(d.usedPct) + '%', d.usedPct, lv,
      'свободно ' + gbParts(d.freeGB).join(' ') + ' из ' + gbParts(d.totalGB).join(' '));
  }).join(''));
} };

// ---- Погода: сейчас и неделя ----
HV_CARDS.weather = { name: function (s) { return s.weather ? esc(s.weather.city) : 'Погода'; }, parts: [], more: function (s) {
  var w = s.weather; if (!w) return '';
  var now = '<div class="hc-wx"><span class="hc-wi">' + (ICONS[w.night && w.icon === 'sun' ? 'moon' : w.icon] || '') + '</span><b class="num">' + segs(hvDeg2(w.temp)) + '</b>' +
    '<span class="hc-wd">' + esc(hvCap(w.desc)) + '<small>ощущается ' + hvDeg2(w.feels) + '</small></span></div>';
  var days = (w.days || []).map(function (d, i) {
    var p = d.date.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return '<div class="hc-day' + (i ? '' : ' now') + '"><span>' + (i ? ruDate(dt, { weekday: 'short' }) : 'сег') + '</span><i>' + (ICONS[d.icon] || '') + '</i><b class="num">' + hvDeg2(d.max) + '</b><small class="num">' + hvDeg2(d.min) + '</small></div>';
  }).join('');
  return hvBox('', now) + (days ? hvBox('Неделя', '<div class="hc-days">' + days + '</div>') : '');
} };

// ---- Часы и Календарь: дата целиком, неделя, полоса года ----
function isoWeek(d) {
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
HV_CARDS.date = { name: 'Сегодня', parts: [], more: function (s) {
  var d = new Date(), y = d.getFullYear(), pct = (d - new Date(y, 0, 1)) / (new Date(y + 1, 0, 1) - new Date(y, 0, 1)) * 100;
  var big = '<div class="hc-date"><b>' + esc(hvCap(ruDate(d, { weekday: 'long' }))) + '</b><span>' + esc(ruDate(d, { day: 'numeric', month: 'long', year: 'numeric' })) + '</span></div>';
  return hvBox('', big) + hvBox('', hvRow('Неделя', isoWeek(d)) + hvBar('Год', Math.floor(pct) + '%', pct, ''));
} };

// ---- ПК включён: с какого момента ----
HV_CARDS.uptime = { name: 'ПК включён', parts: [], more: function (s) {
  if (!s.uptime) return '';
  var on = new Date(Date.now() - s.uptime * 1000), today = on.toDateString() === new Date().toDateString();
  return hvBox('', hvRow('Включён', (today ? 'сегодня' : ruDate(on, { day: 'numeric', month: 'short' })) + ', ' + hvTime(on)) +
    hvRow('Работает', uptimeText(s.uptime)));
} };

// ---- Claude: лимиты со временем сброса, токены за неделю ----
HV_CARDS.claude = { name: 'Claude', parts: [], more: function (s) {
  var c = s.claude; if (!c) return '';
  var lim = limitsOf(s).map(function (l) {
    var r = l.reset ? new Date(l.reset * 1000) : null, lv = limitLevel(l.pct);
    var when = r ? 'сброс ' + (r - Date.now() < 864e5 ? 'в ' + hvTime(r) : ruDate(r, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + hvTime(r)) : '';
    return hvBar(limitName(l.kind), Math.round(l.pct) + '%', l.pct, lv, when);
  }).join('');
  var days = c.days || [], mx = Math.max.apply(null, days.map(function (d) { return d.tokens; }).concat([1]));
  var cols = days.map(function (d, i) {
    var p = d.date.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return '<div class="hc-col' + (i === days.length - 1 ? ' now' : '') + '" title="' + tokParts(d.tokens).join(' ') + '"><i style="height:' + Math.max(d.tokens ? 4 : 0, d.tokens / mx * 100).toFixed(1) + '%"></i><span>' + ruDate(dt, { weekday: 'short' }) + '</span></div>';
  }).join('');
  var week = days.reduce(function (t, d) { return t + d.tokens; }, 0);
  return hvBox('Лимиты', lim) +
    (days.length ? hvBox('', hvRow('Токены за 7 дней', tokParts(week).join(' ')) + '<div class="hc-cols">' + cols + '</div>') : '');
} };

['disks', 'disk', 'space'].forEach(function (k) { HV_IDS[k] = 'disks'; });
['clock', 'calendar'].forEach(function (k) { HV_IDS[k] = 'date'; });
HV_IDS.ping = 'net'; HV_IDS.weather = 'weather'; HV_IDS.uptime = 'uptime'; HV_IDS.claude = HV_IDS.claudew = 'claude';
