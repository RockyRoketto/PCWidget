'use strict';
// Профили на вкладке «Вид»: применить щелчком, сохранить текущий, переименовать, удалить, в файл и из файла.
// Файлы пишет и читает Go (стандартные диалоги Windows), ответ приходит в window.__prof.

var Prof = { edit: -2, del: -1, msg: '', bad: false }; // edit: -2 — ничего не правим, -1 — новый, иначе номер

function profIcon(d) { return '<span class="i"><svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg></span>'; }
var PROF_ICONS = {
  save: profIcon('<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 16.5h12"/>'),
  load: profIcon('<path d="M10 12V3M6.5 6.5 10 3l3.5 3.5M4 16.5h12"/>')
};

function profEditRow(i) {
  var v = i >= 0 ? CFG.profiles[i].name : profFreeName('Профиль ' + (CFG.profiles.length + 1));
  return '<div class="prof edit"><input class="txt" type="text" maxlength="' + PROF_NAME + '" data-profname value="' + esc(v) + '" aria-label="Название профиля">' +
    '<button class="btn" data-prof="ok">' + (i >= 0 ? 'Готово' : 'Сохранить') + '</button></div>';
}
function profBlock() {
  var cur = curProfile(), n = CFG.profiles.length, full = n >= PROF_MAX;
  var rows = CFG.profiles.map(function (p, i) {
    if (Prof.edit === i) return profEditRow(i);
    var sure = Prof.del === i;
    return '<div class="prof' + (i === cur ? ' on' : '') + '"><button class="pn" data-prof="use" data-i="' + i + '" title="Применить">' +
      '<span>' + esc(p.name) + '</span>' + (i === cur ? I('check') : '') + '</button>' +
      '<button class="pi" data-prof="ren" data-i="' + i + '" title="Переименовать" aria-label="Переименовать">' + I('pen') + '</button>' +
      '<button class="pi" data-prof="exp" data-i="' + i + '" title="Сохранить в файл" aria-label="Сохранить в файл">' + PROF_ICONS.save + '</button>' +
      '<button class="pi' + (sure ? ' sure' : '') + '" data-prof="del" data-i="' + i + '" title="Удалить" aria-label="Удалить">' + (sure ? 'Удалить?' : I('hide')) + '</button></div>';
  }).join('');
  if (Prof.edit === -1) rows += profEditRow(-1);
  return label('Профили', n ? n + ' из ' + PROF_MAX : ' ') + (rows ? '<div class="profs">' + rows + '</div>' : '<p class="hint">Профиль запоминает тему, цвета, режим и плитки. Пороги, город и тариф не меняются.</p>') +
    '<div class="pacts"><button class="btn ghost" data-prof="new"' + (full || Prof.edit === -1 ? ' disabled' : '') + '>Сохранить текущий как…</button>' +
    '<button class="btn ghost" data-prof="imp"' + (full ? ' disabled' : '') + ' title="Загрузить из файла">' + PROF_ICONS.load + 'Из файла…</button></div>' +
    (Prof.msg ? '<div class="hint' + (Prof.bad ? ' bad' : '') + '">' + esc(Prof.msg) + '</div>' : full ? '<div class="hint">Больше шести не помещается: удалите ненужный</div>' : '');
}
function profSay(t, bad) { Prof.msg = t || ''; Prof.bad = !!bad; }

// Имя из поля: новый профиль или переименование.
function profCommit(input) {
  var name = profName(input.value), i = Prof.edit;
  if (i === -2) return false; // поле уже убрали
  Prof.edit = -2;
  if (!name) return true;
  if (i === -1) { if (addProfile(name, CFG) >= 0) profSay('Сохранён «' + CFG.profiles[CFG.profiles.length - 1].name + '»'); }
  else if (CFG.profiles[i] && CFG.profiles[i].name !== name) {
    var was = CFG.profiles[i].name; CFG.profiles[i].name = '';
    CFG.profiles[i].name = was.toLowerCase() === name.toLowerCase() ? name : profFreeName(name);
  }
  saveCfg();
  return true;
}
function profCancel() {
  if (Prof.edit === -2 && Prof.del < 0) return false;
  Prof.edit = -2; Prof.del = -1;
  return true;
}
// Щелчок по кнопке профилей. Возвращает true, если окно надо перерисовать.
function profClick(b) {
  var act = b.dataset.prof, i = Number(b.dataset.i), p = CFG.profiles[i];
  var del = Prof.del; Prof.del = -1;
  if (act !== 'ok') profSay('');
  if (act === 'use' && applyProfile(i)) { saveCfg(); applySetBody(); }
  else if (act === 'new') Prof.edit = -1;
  else if (act === 'ren' && p) Prof.edit = i;
  else if (act === 'ok') { var inp = $('[data-profname]'); if (inp) profCommit(inp); }
  else if (act === 'del' && p) {
    if (del !== i) Prof.del = i;
    else { CFG.profiles.splice(i, 1); Prof.edit = -2; saveCfg(); profSay('Удалён «' + p.name + '»'); }
  } else if (act === 'exp' && p) post('prof:export:' + JSON.stringify(p));
  else if (act === 'imp') post('prof:import');
  return true;
}
// Поле имени: фокус сразу в нём, текст выделен.
function profFocus(body) {
  var inp = $('[data-profname]', body);
  if (inp && document.activeElement !== inp) { inp.focus(); inp.select(); }
}

// Ответ Go: файл записан, прочитан или не вышло.
window.__prof = function (r) {
  if (r && r.imp) {
    if (CFG.profiles.length >= PROF_MAX) profSay('Уже шесть профилей: удалите ненужный', true);
    else { var i = addProfile(r.imp.name, r.imp.cfg); saveCfg(); profSay('Загружен «' + CFG.profiles[i].name + '». Щёлкните, чтобы применить'); }
  } else if (r) profSay(r.msg, r.bad);
  if (settings && setState.tab === 'look') settings.render();
};
