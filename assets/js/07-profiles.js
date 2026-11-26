'use strict';
// Профили: именованные снимки оформления и раскладки (CFG.profiles). Общее для виджета и окна настроек.
// В профиль входят тема, тон, акцент, градиент, плотность, режим, плитки и их порядок, цвета плиток, размер.
// Пороги, город, тариф и системное в профиль не входят. Ключи совпадают с profileKeys в profile.go.

var PROF_KEYS = ['theme', 'tone', 'accent', 'pal', 'glass', 'mode', 'scale', 'rows', 'hide', 'mini', 'tileColors', 'thin', 'cores', 'memMap', 'gpuFan'];
var PROF_MAX = 6, PROF_NAME = 32;

function profName(s) {
  return typeof s !== 'string' ? '' : s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PROF_NAME).trim();
}
// Снимок из любых настроек: лишнее отброшено, остальное проверено тем же mergeCfg.
function profOf(c) {
  var src = { ver: 3 };
  if (c && typeof c === 'object') PROF_KEYS.forEach(function (k) { if (c[k] !== undefined) src[k] = c[k]; });
  var m = mergeCfg(src), out = { ver: 3 };
  PROF_KEYS.forEach(function (k) { out[k] = m[k]; });
  // наборы плиток в одном порядке: иначе одинаковые профили не узнать по JSON
  var sorted = function (o, ids) { var r = {}; ids.forEach(function (id) { if (o[id]) r[id] = o[id]; }); return r; };
  out.hide = sorted(m.hide, TILE_IDS); out.tileColors = sorted(m.tileColors, TILE_IDS); out.thin = sorted(m.thin, Object.keys(THIN_OK));
  return out;
}
function profKey(p) { return JSON.stringify(p); }
// Список из файла настроек: не больше шести, без пустых имён и повторов.
function cleanProfiles(list) {
  var out = [], seen = {};
  (Array.isArray(list) ? list : []).forEach(function (p) {
    var n = p && profName(p.name), low = n && n.toLowerCase();
    if (!n || seen[low] || out.length >= PROF_MAX) return;
    seen[low] = 1;
    out.push({ name: n, cfg: profOf(p.cfg) });
  });
  return out;
}
// Свободное имя: «Игры», «Игры 2», …
function profFreeName(name) {
  var base = profName(name) || 'Профиль', n = base, i = 2;
  var taken = function (x) { return CFG.profiles.some(function (p) { return p.name.toLowerCase() === x.toLowerCase(); }); };
  while (taken(n)) n = base.slice(0, PROF_NAME - 3).trim() + ' ' + i++;
  return n;
}
// Какой профиль совпадает с тем, что сейчас на виджете (-1 — ни один).
function curProfile() {
  var k = profKey(profOf(CFG));
  for (var i = 0; i < CFG.profiles.length; i++) if (profKey(CFG.profiles[i].cfg) === k) return i;
  return -1;
}
function addProfile(name, cfg) {
  if (CFG.profiles.length >= PROF_MAX) return -1;
  CFG.profiles.push({ name: profFreeName(name), cfg: profOf(cfg) });
  return CFG.profiles.length - 1;
}
// Применить: ключи профиля заменяют текущие, остальные настройки не трогаются.
function applyProfile(i) {
  var p = CFG.profiles[i];
  if (!p) return false;
  var m = mergeCfg(p.cfg);
  PROF_KEYS.forEach(function (k) { CFG[k] = m[k]; });
  CFG.edgeBack = '';
  return true;
}
