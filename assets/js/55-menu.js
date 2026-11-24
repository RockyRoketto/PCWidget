'use strict';
// Меню правой кнопки и трея. Страница собирает разметку, показывает её окно подсказки (tip_windows.go),
// оно же присылает нажатия: команды data-cmd обрабатывает Go, остальное возвращается сюда через __cmd.

function menuHTML() {
  var seg = Object.keys(MODES).map(function (m) {
    return '<button data-cmd="mode:' + m + '" class="' + (curMode() === m ? 'on' : '') + '">' + PICS[m] + MODES[m] + '</button>';
  }).join('');
  var dots = Object.keys(THEMES).map(function (k) {
    var t = THEMES[k];
    return '<button data-cmd="theme:' + k + '" title="' + t[0] + '" class="' + (CFG.theme === k ? 'on' : '') + '" style="background:linear-gradient(135deg,' + t[2][0] + ' 45%,' + t[1] + ' 46%)"></button>';
  }).join('');
  var item = function (icon, text, cmd, on) {
    return '<button class="mi" data-cmd="' + cmd + '">' + I(icon) + '<span>' + text + '</span>' + (on ? '<span class="i ck">' + ICONS.check + '</span>' : '') + '</button>';
  };
  return '<div class="menu"><div class="seg">' + seg + '</div><div class="dots"><span>Тема</span>' + dots + '</div><hr>' +
    item('pen', 'Изменить плитки', 'edit') + item('gear', 'Настройки', 'settings') + item('pin', 'Поверх всех окон', 'topmost', TOPMOST) + '<hr>' +
    (SYS.sensors && !SYS.driver ? item('install', 'Датчик температуры CPU…', 'driver') : '') +
    (SYS.installed ? '' : item('install', 'Установить на ПК…', 'install')) +
    item('eye', SYS.visible === false ? 'Показать' : 'Скрыть в трей', 'toggle') + item('power', 'Выход', 'exit') + '</div>';
}

// Go просит меню и заодно сообщает состояние системы.
window.__menu = function (sys) {
  SYS = sys; TOPMOST = sys.topmost;
  post('menuhtml:' + JSON.stringify(tipPayload(menuHTML())));
};
