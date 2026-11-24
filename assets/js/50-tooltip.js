'use strict';
// Подсказки при наведении. Текст формирует страница, а рисует отдельное маленькое окно Go
// (окно виджета маленькое, плашка должна быть сбоку, на стороне, где есть место на экране).

function kv(k, v, lv) { return '<div class="kv"><span>' + k + '</span><b' + (lv ? ' class="s-' + lv + '"' : '') + '>' + v + '</b></div>'; }
function tipTitle(id, name, note) { return '<h3>' + I(id) + name + '</h3>' + (note ? '<p>' + esc(note) + '</p>' : ''); }
function tipGraph(key) { var g = mk(graphSvg()); drawGraph(g, HIST[key], 100); return g.outerHTML; }
function tempRow(v, thr) { return v != null ? kv('Температура', Math.round(v) + '°, порог ' + thr + '°', level(v, thr)) : ''; }

var TIPS = {
  cpu: function (s) {
    var d = s.cpu; if (!d) return '';
    return tipTitle('cpu', 'Процессор', 'Загрузка за минуту') + tipGraph('cpu') + kv('В среднем', Math.round(avg(HIST.cpu)) + '%') + tempRow(d.temp, CFG.thr.cpuTemp) +
      (d.freq != null ? kv('Частота', (d.freq / 1000).toFixed(2) + ' ГГц') : '') +
      (d.power != null ? kv('Мощность', Math.round(d.power) + ' Вт') : '');
  },
  gpu: function (s) {
    var d = s.gpu; if (!d) return '';
    return tipTitle('gpu', 'Видеокарта', d.name) + tipGraph('gpu') + kv('В среднем', Math.round(avg(HIST.gpu)) + '%') + tempRow(d.temp, CFG.thr.gpuTemp) +
      (d.memUsed != null ? kv('Видеопамять', (d.memUsed / 1024).toFixed(1) + ' из ' + (d.memTotal / 1024).toFixed(0) + ' ГБ') : '') +
      (d.power != null ? kv('Мощность', Math.round(d.power) + ' Вт') : '') +
      (d.fan != null ? kv('Вентилятор', Math.round(d.fan) + '%') : '') +
      (d.clock != null ? kv('Частота', Math.round(d.clock) + ' МГц') : '');
  },
  mem: function (s) {
    var m = s.mem; if (!m) return '';
    return tipTitle('mem', 'Оперативная память', 'Занято за минуту') + tipGraph('mem') +
      kv('Занято', m.usedGB.toFixed(1) + ' из ' + m.totalGB.toFixed(1) + ' ГБ') + kv('Свободно', (m.totalGB - m.usedGB).toFixed(1) + ' ГБ') +
      (m.pageUsedGB != null ? kv('Файл подкачки', m.pageUsedGB.toFixed(1) + ' из ' + m.pageTotalGB.toFixed(1) + ' ГБ') : '');
  },
  net: function (s) {
    var n = s.net; if (!n) return '';
    return tipTitle('net', 'Сеть', 'Сплошная линия: приём, пунктир: отдача') + kv('Приём', rateText(n.down)) + kv('Отдача', rateText(n.up)) +
      (n.ping != null ? kv('Пинг', Math.round(n.ping) + ' мс', pingLevel(n.ping)) : '') +
      (n.loss != null ? kv('Потери', Math.round(n.loss) + '%', n.loss ? 'hot' : 'ok') : '') +
      kv('Сегодня', '↓ ' + sizeText(n.dayDown) + '  ↑ ' + sizeText(n.dayUp)) + kv('Месяц', '↓ ' + sizeText(n.monthDown) + '  ↑ ' + sizeText(n.monthUp));
  },
  disks: function (s) {
    if (!s.disks || !s.disks.length) return '';
    return tipTitle('disks', 'Диски') + s.disks.map(function (d, i) {
      return (i ? '<hr>' : '') + kv('<b>' + esc(d.name) + '</b> занято', Math.round(d.usedPct) + '%', Alarm.isOn('disk:' + d.name) ? 'hot' : '') +
        kv('Свободно', d.freeGB.toFixed(0) + ' из ' + d.totalGB.toFixed(0) + ' ГБ') +
        (d.read != null ? kv('Чтение', rateText(d.read)) + kv('Запись', rateText(d.write)) + (d.busy != null ? kv('Занятость', Math.round(d.busy) + '%') : '') : '') +
        (d.temp != null ? kv('Температура', Math.round(d.temp) + '°') : '');
    }).join('');
  },
  weather: function (s) {
    var w = s.weather; if (!w) return '';
    return tipTitle('weather', 'Погода', w.city) + (w.desc ? kv('Сейчас', esc(w.desc)) : '') + kv('Температура', Math.round(w.temp) + '°') + kv('Ощущается', Math.round(w.feels) + '°');
  },
  records: function () {
    return tipTitle('records', 'Пик за сессию', 'С запуска виджета') +
      (REC.cpuLoad ? kv('Загрузка CPU', Math.round(REC.cpuLoad) + '%') : '') + (REC.cpuTemp != null ? kv('Температура CPU', Math.round(REC.cpuTemp) + '°', level(REC.cpuTemp, CFG.thr.cpuTemp)) : '') +
      (REC.gpuLoad ? kv('Загрузка GPU', Math.round(REC.gpuLoad) + '%') : '') + (REC.gpuTemp != null ? kv('Температура GPU', Math.round(REC.gpuTemp) + '°', level(REC.gpuTemp, CFG.thr.gpuTemp)) : '') +
      (REC.mem ? kv('Память', Math.round(REC.mem) + '%') : '') + (REC.down ? kv('Приём', rateText(REC.down)) : '');
  }
};

var TIP_DELAY = 700; // мс до появления подсказки; при переходе между плитками, пока она открыта, почти сразу
var Tip = { row: null, timer: null, last: '' };

// Что нужно окну подсказки и меню, чтобы выглядеть как виджет.
function tipPayload(html) { return { html: html, theme: CFG.theme, cls: bodyClass(), glass: CFG.glass, accent: CFG.theme === 'glass' ? CFG.accent : '', onAccent: CFG.accent ? accentOn(CFG.accent) : '', scale: CFG.scale }; }

function showTip() {
  var row = Tip.row; if (!row || !row.isConnected) return hideTip();
  var id = row.getAttribute('data-tip'), html = TIPS[id] && S && dataReady && !editing ? TIPS[id](S) : '';
  if (!html) return;
  var r = row.getBoundingClientRect(), p = tipPayload('<div class="tipbox" data-m="' + id + '">' + html + '</div>');
  p.y = r.top; p.h = r.height;
  var msg = JSON.stringify(p);
  if (msg === Tip.last) return;
  Tip.last = msg;
  post('tip:' + msg);
}
function hideTip(mute) {
  clearTimeout(Tip.timer);
  Tip.row = null;
  if (mute === true) Tip.mute = { x: null, y: null }; // перестройка раскладки: мышь не двигалась, подсказку не звать
  if (Tip.last) { Tip.last = ''; post('tipoff'); }
}
function tipTarget(e) { return e.target.closest ? e.target.closest('[data-tip]') : null; }
// После перестройки (смена темы, режима) мышь стоит на месте, но браузер шлёт mouseover новой плитке.
// Подсказки ждут настоящего движения (> 3 px от первой точки после перестройки).
document.addEventListener('mousemove', function (e) {
  var m = Tip.mute; if (!m) return;
  if (m.x === null) { m.x = e.screenX; m.y = e.screenY; return; }
  if (Math.abs(e.screenX - m.x) + Math.abs(e.screenY - m.y) > 3) {
    Tip.mute = null;
    var t = tipTarget(e);
    if (t) { Tip.row = t; Tip.timer = setTimeout(showTip, TIP_DELAY); }
  }
});
document.addEventListener('mouseover', function (e) {
  if (Tip.mute) return;
  var t = tipTarget(e);
  if (t === Tip.row) return;
  clearTimeout(Tip.timer);
  if (!t) return hideTip();
  Tip.row = t;
  Tip.timer = setTimeout(showTip, Tip.last ? 120 : TIP_DELAY);
});
document.addEventListener('mouseleave', hideTip);
document.addEventListener('mousedown', hideTip);
document.addEventListener('contextmenu', hideTip);
