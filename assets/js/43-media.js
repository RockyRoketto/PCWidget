'use strict';
// «Сейчас играет»: то, что Windows показывает в системном окне громкости (браузеры, плееры).
// Go отдаёт S.media раз в секунду, позицию — на момент at; между снимками она досчитывается здесь.
// Обложка большая и приходит отдельно (__mediaArt) по просьбе «media:art», когда меняется её номер.
// Нет названия — плитка и строка скрыты; кнопки, которые источник не разрешает, скрыты.

var MEDIA_ART = { n: 0, url: '' }, mediaAsked = 0;
var mediaPend = null; // нажали пуск/паузу: до ответа источника показываем ожидаемое
window.__mediaArt = function (n, url) { MEDIA_ART = { n: n, url: url }; if (view && dataReady) view.tick(); };

function mediaOf(s) { var m = s && s.media; return m && m.title ? m : null; }
function mediaPlaying(m) {
  if (mediaPend && (mediaPend.id !== m.id || m.state !== mediaPend.from || Date.now() > mediaPend.until)) mediaPend = null;
  return mediaPend ? mediaPend.play : m.state === 'playing';
}
function mediaPos(m, now) {
  if (m.pos == null) return null;
  mediaPlaying(m); // снимает устаревшее ожидание
  var p = mediaPend ? mediaPend.pos + (mediaPend.play ? (now - mediaPend.t) / 1000 * (m.rate || 1) : 0)
    : m.pos + (m.state === 'playing' ? (now - m.at) / 1000 * (m.rate || 1) : 0);
  return clamp(p, 0, m.dur || p);
}
function mediaTime(sec) {
  sec = Math.floor(sec);
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + two(m) : m) + ':' + two(s);
}
function mediaPct(m, now) { var p = mediaPos(m, now); return p != null && m.dur ? p / m.dur * 100 : 0; }
// Обложка: номер сменился — попросить у Go. Пока не пришла — без неё.
function mediaArtUrl(m) {
  if (!m.art) return '';
  if (MEDIA_ART.n !== m.art && mediaAsked !== m.art) { mediaAsked = m.art; post('media:art'); }
  return MEDIA_ART.n === m.art ? MEDIA_ART.url : '';
}
function mediaCmd(a) {
  var m = mediaOf(S);
  if (!m) return;
  if (a === 'toggle') {
    var now = Date.now(), play = !mediaPlaying(m);
    mediaPend = { id: m.id, from: m.state, play: play, pos: mediaPos(m, now) || 0, t: now, until: now + 3000 };
  }
  post('media:cmd:' + a);
  if (view && dataReady) view.tick();
}
// Несколько источников: щелчок по имени — следующий; дойдя до текущего по версии Windows, снова следуем за Windows.
function mediaNextSrc() {
  var m = mediaOf(S), l = m && m.list;
  if (!l || l.length < 2) return;
  var i = l.map(function (x) { return x.id; }).indexOf(m.id), nx = l[(i + 1) % l.length];
  post('media:cmd:pick:' + (nx.cur ? '' : nx.id));
}

var MEDIA_BTN = {
  prev: '<path d="M5 4.5v11M15.5 4.5 7.5 10l8 5.5z"/>',
  play: '<path d="M6.5 4v12l10-6z"/>',
  pause: '<path d="M5.5 4.5h3v11h-3zM11.5 4.5h3v11h-3z"/>',
  next: '<path d="M15 4.5v11M4.5 4.5l8 5.5-8 5.5z"/>'
};
function mediaBtn(a, name) {
  return '<button class="mc-b" data-a="' + a + '" data-nodrag title="' + name + '" aria-label="' + name + '"><svg viewBox="0 0 20 20" aria-hidden="true">' +
    (a === 'toggle' ? '<g class="pl">' + MEDIA_BTN.play + '</g><g class="pa">' + MEDIA_BTN.pause + '</g>' : MEDIA_BTN[a]) + '</svg></button>';
}

// Обложка: у «Пикселей» пережата в 16×16 и растянута клетками, у остальных как есть (вид правят темы).
function mediaCover() {
  var px = CFG.theme === 'pixel', el = mk(px ? '<canvas class="mc-art" width="16" height="16"></canvas>' : '<div class="mc-art"></div>'), cur = null;
  return {
    el: el,
    set: function (url) {
      el.hidden = !url;
      if (url === cur) return;
      cur = url;
      if (!px) { el.style.backgroundImage = url ? 'url("' + url + '")' : ''; return; }
      var g = el.getContext('2d'), img = new Image();
      g.clearRect(0, 0, 16, 16);
      img.onload = function () {
        if (cur !== url) return;
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(w, h);
        if (k) g.drawImage(img, (w - k) / 2, (h - k) / 2, k, k, 0, 0, 16, 16); else g.drawImage(img, 0, 0, 16, 16);
      };
      if (url) img.src = url;
    }
  };
}

TILE_BUILD.media = function () {
  var el = tileBox('media'), cover = mediaCover(), fill = CFG.theme === 'fill';
  var c = mk('<div class="cb mc"><div class="hd"><b class="nm" data-nodrag></b><span class="ax"></span></div>' +
    '<div class="mc-mid"><div class="mc-tx"><b class="mc-t"></b><span class="mc-a"></span></div></div>' +
    '<div class="mc-pg"></div><div class="mc-ft"><span class="mc-tm"></span><span class="mc-bt">' +
    mediaBtn('prev', 'Назад') + mediaBtn('toggle', 'Пуск или пауза') + mediaBtn('next', 'Вперёд') + '</span></div></div>');
  var q = function (s) { return $(s, c); }, nm = q('.nm'), ax = q('.ax'), t = q('.mc-t'), a = q('.mc-a'), tm = q('.mc-tm'), pg = q('.mc-pg');
  var bt = {}; $$('.mc-b', c).forEach(function (b) { bt[b.getAttribute('data-a')] = b; });
  var vz = makeViz('run');
  if (vz.bg) { c.insertBefore(vz.el, c.firstChild); c.classList.add('has-vz'); } else pg.appendChild(vz.el);
  q('.mc-mid').insertBefore(cover.el, q('.mc-tx'));
  el.appendChild(c);
  var put = function (n, html) { if (n.__h !== html) { n.__h = html; n.innerHTML = html; } };
  if (!editing) {
    c.addEventListener('click', function (e) {
      var b = e.target.closest('.mc-b');
      if (b) mediaCmd(b.getAttribute('data-a'));
      else if (e.target.closest('.nm')) mediaNextSrc();
    });
  }
  function draw() {
    var m = mediaOf(S); el.hidden = !m; if (!m) return;
    var now = Date.now(), pos = mediaPos(m, now), play = mediaPlaying(m), many = m.list && m.list.length > 1;
    put(nm, esc(m.src) + (many ? ' <small>' + (m.list.map(function (x) { return x.id; }).indexOf(m.id) + 1) + '/' + m.list.length + '</small>' : ''));
    nm.classList.toggle('mc-sw', !!many);
    nm.title = many ? 'Щелчок: другой источник' : '';
    put(ax, play ? '' : m.state === 'paused' ? 'пауза' : m.state === 'stopped' ? 'стоп' : '');
    put(t, esc(m.title)); t.title = m.title;
    var who = [m.artist, wide(el) && m.album !== m.title ? m.album : ''].filter(Boolean).join(' — ');
    put(a, esc(who)); a.hidden = !who;
    cover.set(mediaArtUrl(m));
    put(tm, pos != null ? mediaTime(pos) + (m.dur ? ' / ' + mediaTime(m.dur) : '') : '');
    pg.hidden = !m.dur && !vz.bg;
    vz.set({ pct: mediaPct(m, now) });
    bt.prev.hidden = !m.prev; bt.next.hidden = !m.next;
    bt.toggle.hidden = !(m.play || m.pause);
    c.classList.toggle('mc-on', play);
  }
  return { el: el, span: function () { return thinOn('media') ? 1 : 2; }, update: draw, tick: draw };
};

// Строка Колонки, Полоски и Квадрата: значок (щелчок — пуск и пауза), название, время, шкала.
CSPEC.media = { g: 'media', m: 'media', bar: 1, clock: true, icon: true, stripSm: true,
  n: function (s) { var m = mediaOf(s); return m && mediaPlaying(m) ? ICONS.media : '<svg class="ico" viewBox="0 0 20 20" fill="currentColor">' + MEDIA_BTN.pause + '</svg>'; },
  get: function (s) {
    var m = mediaOf(s); if (!m) return null;
    var now = Date.now(), pos = mediaPos(m, now);
    return { v: pos != null ? mediaTime(pos) : '', pct: mediaPct(m, now), sm: esc(m.title) + (m.artist ? ' · ' + esc(m.artist) : '') };
  },
  bind: function (el) {
    if (editing) return;
    el.addEventListener('click', function () { mediaCmd('toggle'); });
    el.title = 'Щелчок: пуск и пауза';
  },
  post: function (el) { var m = mediaOf(S); el.classList.toggle('mc-paused', !!m && !mediaPlaying(m)); }
};
