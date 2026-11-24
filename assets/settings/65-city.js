'use strict';
// Город для погоды: применяется через 0.7 с после последней буквы, под полем видно, нашёлся ли он.

var City = { timer: 0, busy: false };

function cityTyped(input) {
  clearTimeout(City.timer); City.busy = true;
  var h = $('[data-hint]');
  if (h) { h.className = 'hint'; h.textContent = 'Проверяю…'; }
  City.timer = setTimeout(function () { applyCity(input.value); }, 700);
}
function applyCity(v) {
  clearTimeout(City.timer); City.busy = false;
  v = v.trim().slice(0, 60);
  if (v !== CFG.city) {
    CFG.city = v; saveCfg();
    if (S) S.weatherState = v ? 'loading' : ''; // старое состояние относилось к прежнему названию
  }
  cityHint($('[data-hint]'));
}
function cityHint(el) {
  if (!el || City.busy) return;
  var st = S && S.weatherState, w = S && S.weather, txt, cls = '';
  if (!CFG.city) txt = 'Введите название города, например «Москва»';
  else if (!weatherOn()) txt = 'Город сохранён. Включите плитку «Погода»';
  else if (st === 'ok' && w) { txt = 'Найден: ' + w.city + ', сейчас ' + Math.round(w.temp) + '°'; cls = ' s-ok'; }
  else if (st === 'notfound') { txt = 'Город не найден, попробуйте другое написание'; cls = ' bad'; }
  else if (st === 'error') { txt = 'Нет связи с сервисом погоды, повторю позже'; cls = ' bad'; }
  else txt = 'Ищу город…';
  el.className = 'hint' + cls; el.textContent = txt;
}
