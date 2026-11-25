'use strict';
// Меню правой кнопки и трея. Страница собирает разметку, показывает её отдельное окно (popup_windows.go),
// оно присылает нажатия: команды data-cmd обрабатывает Go, остальное возвращается сюда через __cmd.

function menuHTML() {
  var seg = Object.keys(MODES).map(function (m) {
    return '<button data-cmd="mode:' + m + '" class="' + (curMode() === m ? 'on' : '') + '" title="' + MODES[m] + '">' + PICS[m] + '<span>' + MODES[m] + '</span></button>';
  }).join('');
  var themes = Object.keys(THEMES).map(function (k) {
    return '<button data-cmd="theme:' + k + '" class="' + (CFG.theme === k ? 'on' : '') + '">' + themeSwatch(k) + THEMES[k] + '</button>';
  }).join('');
  var item = function (icon, text, cmd, on) {
    return '<button class="mi" data-cmd="' + cmd + '">' + I(icon) + '<span>' + text + '</span>' + (on ? '<span class="i ck">' + ICONS.check + '</span>' : '') + '</button>';
  };
  return '<div class="menu"><div class="mseg">' + seg + '</div><div class="mthemes">' + themes + '</div><hr>' +
    item('pen', 'Изменить плитки', 'edit') + item('gear', 'Настройки', 'settings') + item('pin', 'Поверх всех окон', 'topmost', TOPMOST) + '<hr>' +
    (SYS.sensors && !SYS.driver ? item('install', 'Датчик температуры CPU…', 'driver') : '') +
    (SYS.installed ? '' : item('install', 'Установить на ПК…', 'install')) +
    item('eye', SYS.visible === false ? 'Показать' : 'Скрыть в трей', 'toggle') + item('power', 'Выход', 'exit') + '</div>';
}

// Что нужно окну меню, чтобы выглядеть как виджет.
function menuPayload(html) { return { html: html, theme: styleKey(), cls: bodyClass(), vars: themeVars(), scale: CFG.scale }; }

// Go просит меню и заодно сообщает состояние системы.
window.__menu = function (sys) {
  SYS = sys; TOPMOST = sys.topmost;
  post('menuhtml:' + JSON.stringify(menuPayload(menuHTML())));
};
