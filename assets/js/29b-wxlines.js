'use strict';
// Формы фона погоды для «Осциллографа» и «Чертежа» (общий посев и soft — в 28-wxdraw.js, tick и fill — в 29-wxstyles.js).
// phos — «Осциллограф»: всё цветом луча, у движущегося короткий след (послесвечение — WX_STYLE.persist в wxDraw):
//   у значка светящиеся кольца; облака в строку развёртки; туман — шумящие трассы;
//   дождь штрихами со свечением ближнего слоя; снег квадратными пикселями; молния цветом луча со свечением.
// line — «Чертёж»: только контуры, без заливки: у значка штрихпунктирные окружности, облака контуром,
//   дождь тонкими линиями, снежинки звёздочками из трёх черт (вращаются), туман штриховыми линиями.

// Строки развёртки: 3 единицы луча, 3 просвета.
function wxScan(g, w, h) { g.globalCompositeOperation = 'destination-out'; for (var y = 3; y < h; y += 6) g.fillRect(0, y, w, 3); }
// Контур формы толщиной lw: копии со сдвигом во все стороны минус сама форма.
function wxOutline(src, lw) {
  var o = wxCanvas(src.width + lw * 2, src.height + lw * 2), g = o.getContext('2d');
  for (var a = 0; a < 8; a++) g.drawImage(src, lw + Math.round(Math.cos(a * Math.PI / 4) * lw), lw + Math.round(Math.sin(a * Math.PI / 4) * lw));
  g.globalCompositeOperation = 'destination-out'; g.drawImage(src, lw, lw);
  return o;
}
function wxGlow(g, k, b) { g.shadowColor = 'rgba(' + k.p + ',1)'; g.shadowBlur = b; }

WX_KINDS.phos = {
  kit: function (k) {
    k.sun = k.fl = k.p; // экран одноцветный
    k.clouds = wxSet(6, function (i) { return wxCloud(k.p, 200 + i * 20, 90 + i * 8, 1, wxScan); });
    k.darkC = wxSet(4, function (i) { return wxCloud(k.p, 260 + i * 30, 100 + i * 10, 1, wxScan); }); // тучи на чёрном экране — тоже лучом
    k.lit = k.darkC;
    if (!k.dark) k.cla *= .6; // тёмный луч на светлом экране плотнее на вид
    k.dka = k.cla * .8;
  },
  ring: function (o, g, t, h) { g.shadowColor = 'rgba(' + h.col + ',1)'; g.shadowBlur = 10; wxRings(g, t, h); },
  stars: function (o, g, t, k) {
    g.fillStyle = 'rgb(' + k.p + ')';
    o.stars.forEach(function (s) { g.globalAlpha = (.2 + s.s * .45) * (.5 + .5 * Math.sin(t / (700 + s.s * 900) + s.ph)); g.fillRect(Math.round(s.x), Math.round(s.y), 3, 3); });
    g.globalAlpha = 1;
  },
  cloud: function (o, g, t, dt, k) { wxDrift(o, g, dt, k); },
  fog: function (o, g, t, dt, k) {
    g.lineWidth = 1.6;
    o.ps.forEach(function (p, i) {
      p.x += p.v * dt; var y0 = p.y + 80, ph = p.x / 60 + p.ph;
      g.strokeStyle = 'rgba(' + k.p + ',' + (k.dark ? .22 : .3) * (.6 + .4 * Math.sin(t / 4000 + p.ph)) + ')';
      g.beginPath();
      for (var x = 0; x <= o.W; x += 8) g.lineTo(x, y0 + Math.sin(x / (50 + i * 6) + ph) * 7 + (wxR() - .5) * 5); // сигнал с шумом
      g.stroke();
    });
  },
  rain: function (o, g, t, dt, k, storm) {
    var I = storm ? wxFlash(o, t) : 0, base = k.base, sp = .8 + o.pw * .1, wind = storm ? .25 : .12;
    wxClouds(o, g, dt, k.darkC, k.dka + I * .12);
    if (I > 0) { g.fillStyle = 'rgba(' + k.p + ',' + I * .04 + ')'; g.fillRect(0, 0, o.W, o.H); }
    for (var z = 0; z < 3; z++) {
      g.save(); if (z === 2) wxGlow(g, k, 6);
      g.strokeStyle = 'rgba(' + k.p + ',' + Math.min(1, base * (.25 + z * .25) + I * .3) + ')'; g.lineWidth = 1.4 + z * .6; g.beginPath();
      wxFall(o, dt, wind, sp, storm, z, function (p, L) { g.moveTo(p.x, p.y); g.lineTo(p.x + L * wind * .5, p.y - L * .5); });
      g.stroke(); g.restore();
    }
    g.fillStyle = 'rgb(' + k.p + ')';
    o.sp = o.sp.filter(function (s) { // брызги — пиксели
      s.a -= .06 * dt; if (s.a <= 0) return false;
      g.globalAlpha = s.a * base;
      s.d.forEach(function (d) { d[3] += .35 * dt; d[0] += d[2] * dt; d[1] += d[3] * dt; g.fillRect(Math.round(d[0]), Math.round(d[1]), 3, 3); });
      return true;
    });
    g.globalAlpha = 1;
    if (I > .1 && o.seg) {
      g.save(); wxGlow(g, k, 18); g.strokeStyle = 'rgba(' + k.p + ',' + I + ')'; g.lineJoin = 'round';
      o.seg.forEach(function (s) { g.lineWidth = s[4] * .7; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.stroke(); });
      g.restore();
    }
  },
  snow: function (o, g, t, dt, k) {
    wxClouds(o, g, dt, k.clouds, k.cla * .55);
    g.fillStyle = 'rgb(' + k.p + ')';
    wxFlakes(o, t, dt, function (p, r) {
      var s = Math.max(2, Math.round(r * (p.z === 2 ? 1.1 : 1.5)));
      g.globalAlpha = p.z === 2 ? .45 : p.z === 0 ? .4 : .75;
      g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    });
    g.globalAlpha = 1;
  }
};

WX_KINDS.line = {
  kit: function (k) {
    k.sun = k.fl = k.p; // чертёж одноцветный
    k.clouds = wxSet(6, function (i) { return wxOutline(wxCloud(k.p, 200 + i * 20, 90 + i * 8, 0), 2); });
    k.darkC = wxSet(4, function (i) { return wxOutline(wxCloud(k.p, 260 + i * 30, 100 + i * 10, 0), 2); });
    k.cla = .5; k.dka = .42;
  },
  ring: function (o, g, t, h) { wxRings(g, t, h, [16, 4, 3, 4]); }, // штрихпунктир, как осевые линии
  stars: function (o, g, t, k) {
    g.lineWidth = 1.4; g.strokeStyle = 'rgb(' + k.p + ')';
    o.stars.forEach(function (s) {
      var r = 2 + s.s * 3; g.globalAlpha = (.2 + s.s * .4) * (.55 + .45 * Math.sin(t / (900 + s.s * 900) + s.ph));
      g.beginPath(); g.moveTo(s.x - r, s.y); g.lineTo(s.x + r, s.y); g.moveTo(s.x, s.y - r); g.lineTo(s.x, s.y + r); g.stroke();
    });
    g.globalAlpha = 1;
  },
  cloud: function (o, g, t, dt, k) { wxDrift(o, g, dt, k); },
  fog: function (o, g, t, dt, k) {
    g.save(); g.lineWidth = 2; g.setLineDash([22, 8]);
    o.ps.forEach(function (p, i) {
      p.x += p.v * dt; g.lineDashOffset = -p.x * (i % 2 ? 1 : -1);
      g.strokeStyle = 'rgba(' + k.p + ',' + .5 * (.6 + .4 * Math.sin(t / 4000 + p.ph)) + ')';
      g.beginPath(); for (var j = 0; j < 2; j++) { var y = p.y + 74 + j * 12; g.moveTo(0, y); g.lineTo(o.W, y); } g.stroke();
    });
    g.restore();
  },
  rain: function (o, g, t, dt, k, storm) {
    var I = storm ? wxFlash(o, t) : 0, base = k.base, sp = .8 + o.pw * .1, wind = storm ? .3 : .15;
    wxClouds(o, g, dt, k.darkC, k.dka + I * .4);
    g.lineWidth = 1.1;
    for (var z = 0; z < 3; z++) {
      g.strokeStyle = 'rgba(' + k.p + ',' + Math.min(1, base * (.3 + z * .25) + I * .2) + ')'; g.beginPath();
      wxFall(o, dt, wind, sp, storm, z, function (p, L) { g.moveTo(p.x, p.y); g.lineTo(p.x + L * wind, p.y - L); });
      g.stroke();
    }
    o.sp = o.sp.filter(function (s) { // всплеск — две короткие черты врозь
      s.r += .5 * dt; s.a -= .06 * dt; if (s.a <= 0) return false;
      g.strokeStyle = 'rgba(' + k.p + ',' + s.a * base + ')'; g.beginPath();
      g.moveTo(s.x - 2 - s.r, s.y); g.lineTo(s.x - 5 - s.r * 2, s.y - 4); g.moveTo(s.x + 2 + s.r, s.y); g.lineTo(s.x + 5 + s.r * 2, s.y - 4); g.stroke();
      return true;
    });
    if (I > .1 && o.seg) { // молния контуром: две тонкие линии
      g.save(); g.strokeStyle = 'rgba(' + k.p + ',' + I + ')'; g.lineJoin = 'miter'; g.lineWidth = 1.3;
      [-2.5, 2.5].forEach(function (d) { g.beginPath(); o.seg.forEach(function (s) { if (s[4] < 4) return; g.moveTo(s[0] + d, s[1]); g.lineTo(s[2] + d, s[3]); }); g.stroke(); });
      g.beginPath(); o.seg.forEach(function (s) { if (s[4] < 4) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); } }); g.stroke();
      g.restore();
    }
  },
  snow: function (o, g, t, dt, k) {
    wxClouds(o, g, dt, k.clouds, k.cla * .6);
    g.strokeStyle = 'rgb(' + k.p + ')'; g.lineCap = 'round';
    wxFlakes(o, t, dt, function (p, r) {
      if (p.z === 0) { g.globalAlpha = .45; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x - 2, p.y); g.lineTo(p.x + 2, p.y); g.stroke(); return; }
      var d = r * (p.z === 1 ? 1.5 : 1), a = p.rt * 3; // звёздочка из трёх черт
      g.globalAlpha = p.z === 1 ? .75 : .4; g.lineWidth = p.z === 1 ? 1.4 : 1.8; g.beginPath();
      for (var i = 0; i < 3; i++) { var c = Math.cos(a + i * Math.PI / 3) * d, s = Math.sin(a + i * Math.PI / 3) * d; g.moveTo(p.x - c, p.y - s); g.lineTo(p.x + c, p.y + s); }
      g.stroke();
    });
    g.globalAlpha = 1; g.lineCap = 'butt';
  }
};
