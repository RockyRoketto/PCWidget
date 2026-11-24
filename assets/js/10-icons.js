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
    down: w('<path d="M10 3.5v11M5.5 10.5 10 15l4.5-4.5M4 17.5h12"/>'),
    up: w('<path d="M10 16.5v-11M5.5 9.5 10 5l4.5 4.5M4 2.5h12"/>'),
    net: w('<path d="M7 3v13M3.5 12.5 7 16l3.5-3.5M13 17V4M9.5 7.5 13 4l3.5 3.5"/>'),
    procs: w('<path d="M3 5h14M3 10h14M3 15h9"/>'),
    records: w('<path d="M2.5 15 7 9l3.5 3.5L17 4.5M13 4.5h4v4"/>'),
    uptime: w('<circle cx="10" cy="10" r="7"/><path d="M10 5.5V10l3 2"/>'),
    gear: w('<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'),
    grip: w('<path d="M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01" stroke-width="2.4"/>')
  };
})();
