'use strict';
// Параметры фокус-таймера в окне плитки: длительности в минутах, число циклов, следующий отрезок сам.
// Поля помечены data-fz (не data-k), поэтому общий обработчик настроек их не трогает.

var FOCUS_FIELDS = [['work', 'Фокус, мин'], ['short', 'Перерыв, мин'], ['long', 'Длинный, мин'], ['cycles', 'Циклов']];
TILE_OPTS.focus = function () {
  var f = focusCfg();
  return '<div class="fzset">' + FOCUS_FIELDS.map(function (x) {
    var l = FOCUS_LIM[x[0]];
    return '<label class="ol">' + x[1] + '<input class="txt num-in" type="number" min="' + l[0] + '" max="' + l[1] + '" step="1" data-fz="' + x[0] + '" value="' + f[x[0]] + '" aria-label="' + x[1] + '"></label>';
  }).join('') + '</div>' +
    '<label class="ol">Следующий отрезок сам<span class="sw"><input type="checkbox" data-fz="auto" aria-label="Следующий отрезок запускается сам"' + (f.auto ? ' checked' : '') + '><i></i></span></label>' +
    '<div class="hint">Щелчок по плитке: старт и пауза, правый щелчок: сброс. Уведомление в конце отрезка — если включены уведомления Windows на вкладке «Тревоги».</div>';
};
document.addEventListener('change', function (e) {
  var t = e.target, k = t.dataset && t.dataset.fz;
  if (!k) return;
  var f = CFG.focus = JSON.parse(JSON.stringify(focusCfg()));
  if (k === 'auto') f.auto = t.checked;
  else {
    var l = FOCUS_LIM[k], v = Math.round(Number(String(t.value).replace(',', '.')));
    f[k] = isFinite(v) ? clamp(v, l[0], l[1]) : FOCUS_DEF[k];
    t.value = f[k];
    if (k === 'cycles' && CFG.focusRun && CFG.focusRun.n > f.cycles) CFG.focusRun.n = f.cycles;
  }
  saveCfg();
});
