'use strict';
// Подсказки при наведении. Текст формирует страница, а рисует отдельное маленькое окно Go
// (окно виджета маленькое, плашка должна быть сбоку, на стороне, где есть место на экране).

function tl(k, v) { return '<div class="tl"><span>' + k + '</span><b>' + v + '</b></div>'; }
function over(val, thr, unit) { return val != null && val > thr ? ' <em>(выше порога ' + thr + unit + ')</em>' : ''; }

var TIPS = {
  cpu: function (s) {
    var d = s.cpu; if (!d) return '';
    return '<h3>Процессор</h3>' + tl('Загрузка', Math.round(d.load) + '%') +
      (d.temp != null ? tl('Температура', Math.round(d.temp) + '°' + over(d.temp, CFG.thr.cpuTemp, '°')) : '') +
      (d.freq != null ? tl('Частота', (d.freq / 1000).toFixed(2) + ' ГГц') : '') +
      (d.power != null ? tl('Мощность', Math.round(d.power) + ' Вт') : '');
  },
  gpu: function (s) {
    var d = s.gpu; if (!d) return '';
    return '<h3>Видеокарта</h3><div class="tn">' + esc(d.name) + '</div>' + tl('Загрузка', Math.round(d.load) + '%') +
      (d.temp != null ? tl('Температура', Math.round(d.temp) + '°' + over(d.temp, CFG.thr.gpuTemp, '°')) : '') +
      (d.memUsed != null ? tl('Память', (d.memUsed / 1024).toFixed(1) + ' из ' + (d.memTotal / 1024).toFixed(0) + ' ГБ') : '') +
      (d.power != null ? tl('Мощность', Math.round(d.power) + ' Вт') : '') +
      (d.fan != null ? tl('Вентилятор', Math.round(d.fan) + '%') : '') +
      (d.clock != null ? tl('Частота', Math.round(d.clock) + ' МГц') : '');
  },
  mem: function (s) {
    var m = s.mem; if (!m) return '';
    return '<h3>Оперативная память</h3>' + tl('Занято', m.usedGB.toFixed(1) + ' из ' + m.totalGB.toFixed(1) + ' ГБ') +
      tl('Загрузка', Math.round(m.pct) + '%' + over(m.pct, CFG.thr.mem, '%')) +
      (m.pageUsedGB != null ? tl('Файл подкачки', m.pageUsedGB.toFixed(1) + ' из ' + m.pageTotalGB.toFixed(1) + ' ГБ') : '');
  },
  net: function (s) {
    var n = s.net; if (!n) return '';
    return '<h3>Сеть</h3>' + tl('Приём', rateText(n.down)) + tl('Отдача', rateText(n.up)) +
      (n.ping != null ? tl('Пинг', Math.round(n.ping) + ' мс') : '') +
      (n.loss != null ? tl('Потери', Math.round(n.loss) + '%') : '') +
      tl('За день', sizeText(n.dayDown) + ' ↓ ' + sizeText(n.dayUp) + ' ↑') +
      tl('За месяц', sizeText(n.monthDown) + ' ↓ ' + sizeText(n.monthUp) + ' ↑');
  },
  disks: function (s) {
    if (!s.disks || !s.disks.length) return '';
    return '<h3>Диски</h3>' + s.disks.map(function (d) {
      return '<div class="tdisk"><b>' + esc(d.name) + '</b> занято ' + Math.round(d.usedPct) + '%' + over(d.usedPct, CFG.thr.disk, '%') +
        ', свободно ' + d.freeGB.toFixed(0) + ' из ' + d.totalGB.toFixed(0) + ' ГБ' +
        (d.read != null ? '<br>чтение ' + rateText(d.read) + ', запись ' + rateText(d.write) + ', занятость ' + Math.round(d.busy) + '%' : '') +
        (d.temp != null ? '<br>температура ' + Math.round(d.temp) + '°' : '') + '</div>';
    }).join('');
  },
  procs: function (s) {
    var p = s.procs; if (!p) return '';
    var l = function (a, f) { return (a || []).map(function (it) { return tl(esc(it.name), f(it.v)); }).join(''); };
    return '<h3>Топ процессов</h3><h4>CPU</h4>' + l(p.cpu, function (v) { return v.toFixed(1) + '%'; }) +
      '<h4>Память</h4>' + l(p.ram, function (v) { return sizeText(v * 1048576); }) +
      '<h4>Диск</h4>' + l(p.disk, rateText);
  },
  records: function () {
    return '<h3>Рекорды сессии</h3>' +
      (REC.cpuLoad ? tl('CPU макс.', Math.round(REC.cpuLoad) + '%' + (REC.cpuTemp != null ? ', ' + Math.round(REC.cpuTemp) + '°' : '')) : '') +
      (REC.gpuLoad ? tl('GPU макс.', Math.round(REC.gpuLoad) + '%' + (REC.gpuTemp != null ? ', ' + Math.round(REC.gpuTemp) + '°' : '')) : '') +
      (REC.mem ? tl('Память макс.', Math.round(REC.mem) + '%') : '') +
      (REC.down ? tl('Приём макс.', rateText(REC.down)) : '');
  }
};

var Tip = { row: null, timer: null, last: '' };

function tipHTML(id) { return TIPS[id] && S ? TIPS[id](S) : ''; }

function showTip() {
  var row = Tip.row; if (!row || !row.isConnected) return hideTip();
  var html = tipHTML(row.getAttribute('data-tip'));
  if (!html) return;
  var r = row.getBoundingClientRect();
  var msg = JSON.stringify({ html: html, y: r.top, h: r.height, theme: CFG.theme });
  if (msg === Tip.last) return;
  Tip.last = msg;
  post('tip:' + msg);
}
function hideTip() {
  clearTimeout(Tip.timer);
  Tip.row = null;
  if (Tip.last) { Tip.last = ''; post('tipoff'); }
}
document.addEventListener('mouseover', function (e) {
  var t = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (t === Tip.row) return;
  clearTimeout(Tip.timer);
  if (!t) return hideTip();
  Tip.row = t;
  Tip.timer = setTimeout(showTip, Tip.last ? 0 : 250);
});
document.addEventListener('mouseleave', hideTip);
document.addEventListener('mousedown', hideTip);
document.addEventListener('contextmenu', hideTip);
