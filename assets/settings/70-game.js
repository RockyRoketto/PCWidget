'use strict';
// Игровой режим во вкладке «Система»: включить, горячая клавиша, угол, строки, главный виджет.
// Настройки живут в Go (Settings.game), сюда приходят в SYS.gameCfg, обратно уходят сообщением «game:{…}».

var GAME_ROWS = { fps: 'FPS', low: '1% low', frame: 'Время кадра', cpu: 'CPU', gpu: 'GPU', vram: 'Видеопамять', power: 'Мощность' };
var GAME_CORNERS = [['tl', 'Слева вверху'], ['tr', 'Справа вверху'], ['bl', 'Слева внизу'], ['br', 'Справа внизу']];

function gameCfgNow() {
  var g = SYS.gameCfg || {};
  return { corner: g.corner || 'tl', rows: g.rows || Object.keys(GAME_ROWS), hideMain: !!g.hideMain, noSummary: !!g.noSummary, key: g.key == null ? 'Ctrl+Shift+F' : g.key };
}

function gameBlock() {
  var g = gameCfgNow();
  var chips = Object.keys(GAME_ROWS).map(function (k) {
    return '<button class="gchip' + (g.rows.indexOf(k) >= 0 ? ' on' : '') + '" data-grow="' + k + '">' + GAME_ROWS[k] + '</button>';
  }).join('');
  var corners = '<div class="seg">' + GAME_CORNERS.map(function (c) {
    return '<button data-gcorner="' + c[0] + '" class="' + (g.corner === c[0] ? 'on' : '') + '" title="' + c[1] + '" aria-label="' + c[1] + '"><i class="gcn ' + c[0] + '"></i></button>';
  }).join('') + '</div>';
  var hide = '<div class="seg">' + [[0, 'Остаётся'], [1, 'Прячется']].map(function (o) {
    return '<button data-ghide="' + o[0] + '" class="' + (g.hideMain === !!o[0] ? 'on' : '') + '">' + o[1] + '</button>';
  }).join('') + '</div>';
  var sum = '<div class="seg">' + [[0, 'Показывать'], [1, 'Не нужен']].map(function (o) {
    return '<button data-gsum="' + o[0] + '" class="' + (g.noSummary === !!o[0] ? 'on' : '') + '">' + o[1] + '</button>';
  }).join('') + '</div>';
  return label('Игровой режим') +
    setRow('Показ поверх игры', 'Игра в окне или в окне без рамки. Полноэкранный эксклюзивный режим перекрыть нельзя', '<span class="sw"><input type="checkbox" data-gon aria-label="Игровой режим"' + (SYS.game ? ' checked' : '') + '><i></i></span>') +
    '<div class="ol">Горячая клавиша<input class="txt key-in" type="text" readonly data-gkey value="' + esc(g.key || '') + '" placeholder="Нет" aria-label="Горячая клавиша игрового режима"></div>' +
    '<div class="hint' + (SYS.gameKeyErr ? ' bad' : '') + '">' + esc(SYS.gameKeyErr || 'Щёлкни поле и нажми сочетание. Backspace — без клавиши') + '</div>' +
    '<div class="ol gsp">Угол экрана<span style="width:150px">' + corners + '</span></div>' +
    '<div class="ol gsp">Главный виджет<span style="width:170px">' + hide + '</span></div>' +
    '<div class="ol gsp" title="Карточка с FPS и графиком, когда игру закрыли или режим выключен">Итог после игры<span style="width:170px">' + sum + '</span></div>' +
    '<div class="lab">Строки</div><div class="gchips">' + chips + '</div>';
}

function sendGame(g) { SYS.gameCfg = g; post('game:' + JSON.stringify(g)); }

// Сочетание из нажатия: модификаторы и буква, цифра или F-клавиша. Одни модификаторы — ждём дальше.
function comboOf(e) {
  var k = e.code || '', key = '';
  if (/^Key[A-Z]$/.test(k)) key = k.slice(3);
  else if (/^Digit[0-9]$/.test(k)) key = k.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) key = k;
  if (!key) return '';
  var m = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '') + (e.metaKey ? 'Win+' : '');
  return m || key.charAt(0) === 'F' && key.length > 1 ? m + key : '';
}

// Обработчики раньше общих (фаза перехвата): элементы блока не должны попасть в CFG виджета.
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-grow],[data-gcorner],[data-ghide],[data-gsum]');
  if (!b) return;
  e.stopPropagation();
  var g = gameCfgNow();
  if (b.dataset.grow) {
    var k = b.dataset.grow, on = g.rows.indexOf(k) < 0;
    g.rows = Object.keys(GAME_ROWS).filter(function (x) { return x === k ? on : g.rows.indexOf(x) >= 0; });
    b.classList.toggle('on', on);
  } else {
    if (b.dataset.gcorner) g.corner = b.dataset.gcorner;
    else if (b.dataset.gsum) g.noSummary = b.dataset.gsum === '1';
    else g.hideMain = b.dataset.ghide === '1';
    $$('button', b.parentNode).forEach(function (x) { x.classList.toggle('on', x === b); });
  }
  sendGame(g);
}, true);
document.addEventListener('change', function (e) {
  if (!e.target.hasAttribute('data-gon')) return;
  e.stopPropagation();
  post('sys:game');
}, true);
document.addEventListener('keydown', function (e) {
  var t = e.target;
  if (!t.hasAttribute || !t.hasAttribute('data-gkey')) return;
  if (e.key === 'Tab') return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape' || e.key === 'Enter') { t.blur(); return; }
  var g = gameCfgNow(), c = e.key === 'Backspace' || e.key === 'Delete' ? '' : comboOf(e);
  if (c === '' && !(e.key === 'Backspace' || e.key === 'Delete')) return;
  t.value = c; g.key = c; sendGame(g); t.blur();
}, true);
