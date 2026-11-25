'use strict';
// Оповещения. Тревога включается, когда значение выше порога HOLD мс подряд,
// и гаснет, когда оно упало ниже порога минимум на HYST (гистерезис). Состояние хранится по ключам.
var Alarm = (function () {
  var HOLD = 3000, HYST = 3, st = {};
  return {
    HOLD: HOLD, HYST: HYST,
    update: function (key, value, thr, now) {
      var s = st[key] || (st[key] = { on: false, since: null, fired: false });
      if (value == null || thr == null) { s.on = false; s.since = null; return false; }
      if (s.on) {
        if (value < thr - HYST) { s.on = false; s.since = null; }
      } else if (value > thr) {
        if (s.since == null) s.since = now;
        if (now - s.since >= HOLD) { s.on = true; s.fired = true; }
      } else {
        s.since = null;
      }
      return s.on;
    },
    // true один раз после включения тревоги (для уведомлений Windows)
    takeFired: function (key) { var s = st[key]; if (s && s.fired) { s.fired = false; return true; } return false; },
    isOn: function (key) { return !!(st[key] && st[key].on); },
    reset: function () { st = {}; }
  };
})();

// Пороги и подписи: ключ тревоги -> описание.
var ALARMS = {
  cpuTemp: { name: 'Температура CPU', unit: '°' },
  gpuTemp: { name: 'Температура GPU', unit: '°' },
  mem: { name: 'Память', unit: '%' },
  disk: { name: 'Заполненность диска', unit: '%' },
  claude: { name: 'Лимит Claude', unit: '%' }
};

// Пересчитывает все тревоги по снимку; возвращает список ключей, включившихся сейчас.
function evalAlarms(s, now) {
  var t = CFG.thr, fired = [];
  var chk = function (key, val, thr, label) {
    Alarm.update(key, val, thr, now);
    if (Alarm.takeFired(key)) fired.push(label);
  };
  chk('cpuTemp', s.cpu && s.cpu.temp, t.cpuTemp, 'Температура CPU ' + (s.cpu && s.cpu.temp != null ? Math.round(s.cpu.temp) + '°' : ''));
  chk('gpuTemp', s.gpu && s.gpu.temp, t.gpuTemp, 'Температура GPU ' + (s.gpu && s.gpu.temp != null ? Math.round(s.gpu.temp) + '°' : ''));
  chk('mem', s.mem && s.mem.pct, t.mem, 'Память занята на ' + (s.mem ? Math.round(s.mem.pct) + '%' : ''));
  (s.disks || []).forEach(function (d) { chk('disk:' + d.name, d.usedPct, t.disk, 'Диск ' + d.name + ' заполнен на ' + Math.round(d.usedPct) + '%'); });
  var cl = maxLimit(s);
  chk('claude', cl, t.claude, 'Лимит Claude израсходован на ' + (cl != null ? Math.round(cl) + '%' : ''));
  return fired;
}
