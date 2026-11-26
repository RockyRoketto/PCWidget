'use strict';
// Формы фона погоды под темы (общий посев и soft — в 28-wxdraw.js).
// tick — «Прибор»: деления и штрихи, без свечения и размытия: солнце-циферблат, облака в полоску, как шкалы,
//   дождь отвесными штрихами, снег крестиками, туман пунктиром, молния цветом индикатора.
// fill — «Заливка»: залитые формы с переходом «сверху прозрачнее, книзу плотнее»: солнце — залитый круг,
//   дождь наполняет карточку снизу волнующимся уровнем, снег наметает сугроб, туман оседает внизу.

// Полоски, как деления шкал «Прибора»: 3 px штрих, 2 px просвет (в единицах макета 6 и 4).
function wxStripes(g, w, h) { g.globalCompositeOperation = 'destination-out'; for (var y = 6; y < h; y += 10) g.fillRect(0, y, w, 4); }
// Заливка по вертикали, как у карточек «Заливки».
function wxGrad(a0, a1) {
  return function (g, w, h) {
    g.globalCompositeOperation = 'destination-in'; var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,' + a0 + ')'); gr.addColorStop(1, 'rgba(0,0,0,' + a1 + ')'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
}
function wxSet(n, mk) { return [0, 1, 2, 3, 4, 5].slice(0, n).map(mk); }

WX_KINDS.tick = {
  kit: function (k) {
    k.clouds = wxSet(6, function (i) { return wxCloud(k.p, 200 + i * 20, 90 + i * 8, 0, wxStripes); });
    k.darkC = wxSet(4, function (i) { return wxCloud(k.dk, 260 + i * 30, 100 + i * 10, 0, wxStripes); });
    k.lit = wxSet(4, function (i) { return wxCloud(k.fl, 260 + i * 30, 100 + i * 10, 0, wxStripes); });
    k.cla *= 1.4; k.dka *= 1.2; // в полоску закрыто меньше места — плотнее
  },
  sky: function (o, g, t, dt, k, f) {
    var c = wxSpot(o, 70, 14), cx = c.x, cy = c.y, i, a = t / 40000; // циферблат наполовину за верхним краем
    g.lineWidth = 2; g.strokeStyle = g.fillStyle = 'rgba(' + k.sun + ',' + .5 * f + ')';
    g.beginPath(); g.arc(cx, cy, 24, 0, 7); g.globalAlpha = .45; g.fill(); g.globalAlpha = 1;
    g.beginPath();
    for (i = 0; i < 48; i++) { var an = a + i * Math.PI / 24, r1 = 38, r2 = i % 4 ? 46 : 54; g.moveTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); g.lineTo(cx + Math.cos(an) * r2, cy + Math.sin(an) * r2); }
    g.stroke();
    g.save(); g.setLineDash([6, 8]); g.lineDashOffset = t / 300; g.globalAlpha = .5; g.beginPath(); g.arc(cx, cy, 68, 0, 7); g.stroke(); g.restore();
  },
  night: function (o, g, t, dt, k) {
    var c = wxSpot(o, 52, 14), cx = c.x, cy = c.y; // крупный месяц, виден только низ
    g.fillStyle = 'rgba(' + k.p + ',.24)'; g.beginPath(); g.arc(cx, cy, 52, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx + 23, cy - 16, 47, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgb(' + k.p + ')'; g.lineWidth = 1.6;
    o.stars.forEach(function (s) {
      var r = 2 + s.s * 3; g.globalAlpha = (.15 + s.s * .35) * (.55 + .45 * Math.sin(t / (900 + s.s * 900) + s.ph));
      g.beginPath(); g.moveTo(s.x - r, s.y); g.lineTo(s.x + r, s.y); g.moveTo(s.x, s.y - r); g.lineTo(s.x, s.y + r); g.stroke();
    });
    g.globalAlpha = 1;
  },
  cloud: function (o, g, t, dt, k) { wxDrift(o, g, dt, k); },
  fog: function (o, g, t, dt, k) {
    g.save(); g.lineWidth = 2; g.setLineDash([18, 10]);
    o.ps.forEach(function (p, i) {
      p.x += p.v * dt; g.lineDashOffset = -p.x * (i % 2 ? 1 : -1);
      g.strokeStyle = 'rgba(' + k.p + ',' + (k.dark ? .22 : .28) * (.6 + .4 * Math.sin(t / 4000 + p.ph)) + ')';
      g.beginPath(); for (var j = 0; j < 3; j++) { var y = p.y + 70 + j * 10; g.moveTo(0, y); g.lineTo(o.W, y); } g.stroke();
    });
    g.restore();
  },
  rain: function (o, g, t, dt, k, storm) {
    var I = storm ? wxFlash(o, t) : 0, base = k.base, sp = .8 + o.pw * .1;
    wxClouds(o, g, dt, k.darkC, k.dka);
    if (I > 0) { g.fillStyle = 'rgba(' + k.fl + ',' + I * .15 + ')'; g.fillRect(0, 0, o.W, o.H); wxClouds(o, g, 0, k.lit, I * .5); }
    g.lineWidth = 2;
    for (var z = 0; z < 3; z++) {
      g.strokeStyle = 'rgba(' + k.p + ',' + Math.min(1, base * (.25 + z * .25) + I * .3) + ')'; g.beginPath();
      wxFall(o, dt, 0, sp, storm, z, function (p, L) { g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - L * .8); });
      g.stroke();
    }
    o.sp = o.sp.filter(function (s) { // всплеск — короткая риска по горизонтали
      s.r += .7 * dt; s.a -= .06 * dt; if (s.a <= 0) return false;
      g.fillStyle = 'rgba(' + k.p + ',' + s.a * base + ')'; g.fillRect(s.x - s.r * 2, s.y, s.r * 4, 2); return true;
    });
    if (I > .1 && o.seg) {
      g.save(); g.strokeStyle = 'rgba(' + k.sun + ',' + I + ')'; g.lineJoin = 'miter';
      o.seg.forEach(function (s) { g.lineWidth = s[4] * .7; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.stroke(); });
      g.restore();
    }
  },
  snow: function (o, g, t, dt, k) {
    wxClouds(o, g, dt, k.clouds, k.cla * .6);
    g.strokeStyle = g.fillStyle = 'rgb(' + k.p + ')'; g.lineWidth = 1.6;
    wxFlakes(o, t, dt, function (p, r) {
      if (p.z === 0) { g.globalAlpha = .45; g.fillRect(p.x, p.y, 2, 2); return; }
      g.globalAlpha = p.z === 1 ? .7 : .35; var d = r * (p.z === 1 ? 1.4 : .9);
      g.beginPath(); g.moveTo(p.x - d, p.y); g.lineTo(p.x + d, p.y); g.moveTo(p.x, p.y - d); g.lineTo(p.x, p.y + d);
      if (p.z === 2) { var e = d * .7; g.moveTo(p.x - e, p.y - e); g.lineTo(p.x + e, p.y + e); g.moveTo(p.x - e, p.y + e); g.lineTo(p.x + e, p.y - e); }
      g.stroke();
    });
    g.globalAlpha = 1;
  }
};

WX_KINDS.fill = {
  kit: function (k) {
    k.clouds = wxSet(6, function (i) { return wxCloud(k.p, 200 + i * 20, 90 + i * 8, 2, wxGrad(.25, 1)); });
    k.darkC = wxSet(4, function (i) { return wxCloud(k.dk, 260 + i * 30, 100 + i * 10, 2, wxGrad(.4, 1)); });
    k.lit = wxSet(4, function (i) { return wxCloud(k.fl, 260 + i * 30, 100 + i * 10, 2, wxGrad(.4, 1)); });
    k.fogs = wxSet(5, function () { return wxFogBand(k.p, 420, 110, 10); });
    k.a0 = k.dark ? .22 : .16; k.a1 = k.dark ? .55 : .4; // верх и низ заливки
  },
  sky: function (o, g, t, dt, k, f) {
    var c = wxSpot(o, 110, -16), cx = c.x, cy = c.y, b = 1 + .03 * Math.sin(t / 2200);
    [[110, .45], [70, 1]].forEach(function (d) {
      var r = d[0] * b, gr = g.createLinearGradient(0, cy - r, 0, cy + r);
      gr.addColorStop(0, 'rgba(' + k.sun + ',' + k.a0 * d[1] * f + ')'); gr.addColorStop(1, 'rgba(' + k.sun + ',' + k.a1 * d[1] * f + ')');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    });
  },
  night: function (o, g, t, dt, k) {
    var c = wxSpot(o, 90, -20); // луна — большой бледный круг из-за верхнего края, с ореолом
    [[90, .35], [62, .7]].forEach(function (d) {
      var r = d[0], gr = g.createLinearGradient(0, c.y - r, 0, c.y + r);
      gr.addColorStop(0, 'rgba(' + k.p + ',' + k.a0 * d[1] * .6 + ')'); gr.addColorStop(1, 'rgba(' + k.p + ',' + k.a1 * d[1] * .6 + ')');
      g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, r, 0, 7); g.fill();
    });
    g.fillStyle = 'rgb(' + k.p + ')';
    o.stars.forEach(function (s) { g.globalAlpha = (.15 + s.s * .3) * (.55 + .45 * Math.sin(t / (900 + s.s * 900) + s.ph)); g.beginPath(); g.arc(s.x, s.y, 1 + s.s * 1.4, 0, 7); g.fill(); });
    g.globalAlpha = 1;
  },
  cloud: function (o, g, t, dt, k) { wxDrift(o, g, dt, k); },
  fog: function (o, g, t, dt, k) {
    WX_KINDS.soft.fog(o, g, t, dt, k);
    wxPool(g, o.W, o.H, o.H * .62, k.p, 0, k.a0 * .9);
  },
  rain: function (o, g, t, dt, k, storm) {
    var I = storm ? wxFlash(o, t) : 0, base = k.base, sp = .8 + o.pw * .1, wind = storm ? .25 : .12;
    var aim = o.H * (1 - .09 - .05 * o.pw), amp = storm ? 7 : 3.5; // уровень воды растёт до своей высоты
    o.lv = o.lv == null ? aim + 40 : o.lv + (aim - o.lv) * .02 * dt;
    wxClouds(o, g, dt, k.darkC, k.dka);
    if (I > 0) { g.fillStyle = 'rgba(' + k.fl + ',' + I * .25 + ')'; g.fillRect(0, 0, o.W, o.H); wxClouds(o, g, 0, k.lit, I * .6); }
    g.lineCap = 'round';
    for (var z = 0; z < 3; z++) {
      g.strokeStyle = 'rgba(' + k.p + ',' + Math.min(1, base * (.2 + z * .2) + I * .3) + ')'; g.lineWidth = 1.6 + z * 1.2; g.beginPath();
      wxFall(o, dt, wind, sp, storm, z, function (p, L) { if (z === 2) p.gy = o.lv; g.moveTo(p.x, p.y); g.lineTo(p.x + L * wind * .6, p.y - L * .6); });
      g.stroke();
    }
    g.lineCap = 'butt';
    var lv = o.lv;
    wxPool(g, o.W, o.H, lv, k.fc, k.a0 * 1.3, k.a1 * 1.2, function (x) { return Math.sin(x / 40 + t / 600) * amp + Math.sin(x / 23 - t / 900) * amp * .5; });
    o.sp = o.sp.filter(function (s) { // круги по воде и капли-брызги
      s.r += .6 * dt; s.a -= .045 * dt; if (s.a <= 0) return false;
      g.strokeStyle = 'rgba(' + k.p + ',' + s.a * base * .7 + ')'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(s.x, lv, s.r * 2.4, s.r * .6, 0, 0, 7); g.stroke();
      g.fillStyle = 'rgba(' + k.p + ',' + s.a * base + ')';
      s.d.forEach(function (d) { d[3] += .35 * dt; d[0] += d[2] * dt; d[1] += d[3] * dt; g.beginPath(); g.arc(d[0], d[1] - s.y + lv, 1.6, 0, 7); g.fill(); });
      return true;
    });
    if (I > .1 && o.seg) {
      g.save(); g.strokeStyle = 'rgba(' + k.fl + ',' + I + ')'; g.lineCap = g.lineJoin = 'round';
      o.seg.forEach(function (s) { g.lineWidth = s[4] * 1.8; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.stroke(); });
      g.restore();
    }
  },
  snow: function (o, g, t, dt, k) {
    wxClouds(o, g, dt, k.clouds, k.cla * .6);
    g.fillStyle = 'rgb(' + k.p + ')';
    wxFlakes(o, t, dt, function (p, r) { g.globalAlpha = p.z === 2 ? .3 : p.z === 0 ? .45 : .7; g.beginPath(); g.arc(p.x, p.y, r * (p.z === 2 ? 1.2 : 1), 0, 7); g.fill(); });
    g.globalAlpha = 1;
    var hgt = o.H * (.1 + .04 * o.pw), hp = o.hp; // сугроб: холмы с неровным краем
    wxPool(g, o.W, o.H, o.H - hgt, k.p, k.a0 * 1.2, k.a1 * 1.3, function (x) { return -hgt * (.25 * Math.sin(x / 70 + hp[0]) + .15 * Math.sin(x / 31 + hp[1])); });
  }
};

// Залитая область от линии y (+ волна wave(x)) до низа, сверху прозрачнее, книзу плотнее.
function wxPool(g, W, H, y, rgb, a0, a1, wave) {
  var gr = g.createLinearGradient(0, y - 10, 0, H);
  gr.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',' + a1 + ')');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, H);
  for (var x = 0; x <= W + 12; x += 12) g.lineTo(x, y + (wave ? wave(x) : 0));
  g.lineTo(W + 12, H); g.closePath(); g.fill();
}
