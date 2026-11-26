'use strict';
// Встроенные SVG-иконки 20x20 (контур, цвет берут из currentColor).
var ICONS = (function () {
  var w = function (body) {
    return '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  };
  var disk = w('<rect x="3" y="4" width="14" height="12" rx="2.5"/><circle cx="10" cy="10" r="3"/><circle cx="14.3" cy="13.3" r=".5"/>');
  return {
    disk: disk, disks: disk,
    cpu: w('<rect x="5" y="5" width="10" height="10" rx="2"/><rect x="8" y="8" width="4" height="4" rx=".6"/><path d="M8 2v3M12 2v3M8 15v3M12 15v3M2 8h3M2 12h3M15 8h3M15 12h3"/>'),
    gpu: w('<rect x="2" y="5" width="16" height="9" rx="1.5"/><circle cx="8" cy="9.5" r="2.6"/><path d="M13 8h3M13 11h3M5 14v2.5M15 14v2.5"/>'),
    mem: w('<rect x="2" y="5" width="16" height="8" rx="1"/><path d="M5 8h2M9 8h2M13 8h2M5 13v3M8 13v3M12 13v3M15 13v3"/>'),
    claude: w('<path d="M10 2.8v14.4M2.8 10h14.4M4.9 4.9l10.2 10.2M15.1 4.9 4.9 15.1"/>'),
    claudew: w('<path d="M8 3v11M2.5 8.5h11M4.1 4.6l7.8 7.8M11.9 4.6l-7.8 7.8M13 13h4.5l-2.6 4.5"/>'),
    down: w('<path d="M10 3.5v11M5.5 10.5 10 15l4.5-4.5M4 17.5h12"/>'),
    up: w('<path d="M10 16.5v-11M5.5 9.5 10 5l4.5 4.5M4 2.5h12"/>'),
    net: w('<path d="M7 3v13M3.5 12.5 7 16l3.5-3.5M13 17V4M9.5 7.5 13 4l3.5 3.5"/>'),
    energy: w('<path d="M11 2.5 4.5 11H10l-1 6.5L15.5 9H10z"/>'),
    procs: w('<path d="M3 5h14M3 10h14M3 15h9"/>'),
    records: w('<path d="M2.5 15 7 9l3.5 3.5L17 4.5M13 4.5h4v4"/>'),
    uptime: w('<path d="M10 3v6M6 5.2a6 6 0 1 0 8 0"/>'),
    calendar: w('<rect x="3.5" y="4.5" width="13" height="12" rx="2"/><path d="M3.5 8.5h13M7 2.8v3M13 2.8v3"/>'),
    clock: w('<circle cx="10" cy="10" r="7"/><path d="M10 5.5V10l3 2"/>'),
    weather: w('<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'),
    sun: w('<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'),
    cloud: w('<path d="M6 15.5h8.5a3 3 0 0 0 .4-6 4.6 4.6 0 0 0-8.9-1A3.6 3.6 0 0 0 6 15.5z"/>'),
    fog: w('<path d="M3 7h14M5 11h12M3 15h10"/>'),
    rain: w('<path d="M6 11.5h8.5a3 3 0 0 0 .4-6 4.6 4.6 0 0 0-8.9-1A3.6 3.6 0 0 0 6 11.5zM7 14.5l-1 2.5M11 14.5l-1 2.5M15 14.5l-1 2.5"/>'),
    snow: w('<path d="M6 11.5h8.5a3 3 0 0 0 .4-6 4.6 4.6 0 0 0-8.9-1A3.6 3.6 0 0 0 6 11.5zM7 15h.01M11 16.5h.01M15 15h.01" stroke-width="2.4"/>'),
    storm: w('<path d="M6 11h8.5a3 3 0 0 0 .4-6 4.6 4.6 0 0 0-8.9-1A3.6 3.6 0 0 0 6 11zM10.5 12l-2.5 3h3l-2 3"/>'),
    gear: w('<path d="M3 6h7M14 6h3M3 14h3M10 14h7"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="14" r="2"/>'),
    pen: w('<path d="M3.5 16.5l.8-3.6L13 4.2a1.6 1.6 0 0 1 2.3 0l.5.5a1.6 1.6 0 0 1 0 2.3L7.1 15.7z"/>'),
    hide: w('<path d="M5 5l10 10M15 5L5 15"/>'),
    game: w('<path d="M6.5 6h7a4 4 0 0 1 3.9 4.8l-.7 3.4a2 2 0 0 1-3.4 1L11.6 13H8.4l-1.7 2.2a2 2 0 0 1-3.4-1l-.7-3.4A4 4 0 0 1 6.5 6z"/><path d="M6.5 8.5v3M5 10h3"/><circle cx="13.5" cy="9.3" r=".4"/><circle cx="14.6" cy="11" r=".4"/>'),
    pin: w('<path d="M7 3h6M8 3v5l-2.5 3.5h9L12 8V3M10 11.5V17"/>'),
    power: w('<path d="M10 3v6M6 5.2a6 6 0 1 0 8 0"/>'),
    eye: w('<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.3"/>'),
    look: w('<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor"/>'),
    tiles: w('<rect x="3" y="3" width="6" height="6" rx="1.2"/><rect x="11" y="3" width="6" height="6" rx="1.2"/><rect x="3" y="11" width="14" height="6" rx="1.2"/>'),
    bell: w('<path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13zM8.5 17.3h3"/>'),
    sys: w('<rect x="2.5" y="4" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 14v3"/>'),
    chev: w('<path d="M5 8l5 5 5-5"/>'),
    warn: w('<path d="M10 3.5l7 12.5H3zM10 8.5v3.5M10 14.2v.1"/>'),
    plus: w('<path d="M10 4v12M4 10h12"/>'),
    check: w('<path d="M4 10.5l4 4 8-9"/>'),
    install: w('<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 16.5h12"/>'),
    ping: w('<path d="M2.8 8.6a10.2 10.2 0 0 1 14.4 0M5.6 11.6a6.2 6.2 0 0 1 8.8 0"/><circle cx="10" cy="15" r="1.2"/>'),
    grip: w('<path d="M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01" stroke-width="2.4"/>')
  };
})();
// Образец темы для меню и настроек: маленькая ячейка в её материале (menu.css).
function themeSwatch(k) { return '<span class="swt swt-' + k + '"><i></i></span>'; }
function I(name) { return '<span class="i">' + ICONS[name] + '</span>'; }

// Картинки режимов для настроек и меню: подложка и блоки на ней [x, y, ширина, высота].
var PICS = (function () {
  var r = function (b, o) { return '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3] + '" rx="' + (o ? 3 : 1) + '"' + (o ? ' opacity=".25"' : '') + '/>'; };
  var pic = function (back, parts) { return '<svg viewBox="0 0 40 34" fill="currentColor">' + r(back, 1) + parts.map(function (b) { return r(b); }).join('') + '</svg>'; };
  return {
    full: pic([11, 1, 18, 32], [[13, 3, 6, 6], [21, 3, 6, 6], [13, 11, 6, 6], [21, 11, 6, 6], [13, 19, 14, 5], [13, 26, 14, 5]]),
    wide: pic([1, 7, 38, 20], [[3, 9, 7, 7], [12, 9, 7, 7], [21, 9, 7, 7], [30, 9, 7, 7], [3, 18, 16, 7], [21, 18, 16, 7]]),
    column: pic([15, 1, 10, 32], [[17, 4, 6, 3], [17, 10, 6, 3], [17, 16, 6, 3], [17, 22, 6, 3], [17, 28, 6, 3]]),
    strip: pic([1, 13, 38, 8], [[3, 15, 6, 4], [11, 15, 6, 4], [19, 15, 6, 4], [27, 15, 6, 4]]),
    square: pic([9, 5, 22, 22], [[11, 7, 8, 8], [21, 7, 8, 8], [11, 17, 8, 8], [21, 17, 8, 8]])
  };
})();
