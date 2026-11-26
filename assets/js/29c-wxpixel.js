'use strict';
// Погода темы «Пиксели» (pix): сцена из плотных форм своего цвета, без размытия. Выводится цветной матрицей
// (wxMatrixColor в 27-wxbg.js): клетка берёт ближайший цвет палитры — солнце жёлтое, облака цвета облаков,
// дождь голубой, снег цвета текста. Полупрозрачное ложится редкими клетками (дизеринг), анимация — шагами.

WX_KINDS.pix = {
  kit: function (k) {
    k.cla = 1; // ближние облака сплошные, дальние (p.a) — дизерингом
    k.clouds = [0, 1, 2, 3, 4, 5].map(function (i) { return wxCloud(k.cl, 200 + i * 20, 90 + i * 8, 0); });
    k.darkC = [0, 1, 2, 3].map(function (i) { return wxCloud(k.cl, 260 + i * 30, 100 + i * 10, 0); });
    k.fogs = [0, 1, 2, 3, 4].map(function () { return wxFogBand(k.cl, 420, 110, 8); });
  },
  // Солнце: круг и восемь лучей, лучи через полсекунды то длинные, то короткие.
  sky: function (o, g, t, dt, k) {
    var sx = o.W - 64, sy = 56, ph = Math.floor(t / 500) % 2;
    g.fillStyle = 'rgb(' + k.sun + ')';
    g.beginPath(); g.arc(sx, sy, 30, 0, 7); g.fill();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4, r0 = 42, r1 = (i + ph) % 2 ? 62 : 52;
      g.save(); g.translate(sx, sy); g.rotate(a); g.fillRect(r0, -5, r1 - r0, 10); g.restore();
    }
  },
  // Ночью: месяц и звёзды по одной клетке, мигают шагами; часть звёзд жёлтые.
  night: function (o, g, t, dt, k) {
    var mx = o.W - 64, my = 56;
    g.fillStyle = 'rgb(' + k.p + ')'; g.beginPath(); g.arc(mx, my, 30, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(mx - 16, my - 10, 26, 0, 7); g.fill(); g.restore();
    o.stars.forEach(function (s) {
      if (Math.sin(Math.floor(t / 400) * (1 + s.s) + s.ph) < -.3) return; // погасла на этом шаге
      g.fillStyle = 'rgb(' + (s.s > .7 ? k.sun : k.p) + ')';
      g.fillRect(Math.round(s.x / 10) * 10, Math.round(s.y / 10) * 10, 10, 10);
    });
  },
  cloud: function (o, g, t, dt, k) { wxDrift(o, g, dt, k); },
  fog: function (o, g, t, dt, k) {
    o.ps.forEach(function (p) {
      var img = k.fogs[p.k]; p.x += p.v * dt; if (p.x > o.W) p.x = -img.width;
      g.globalAlpha = .32 + .12 * Math.sin(t / 4000 + p.ph); g.drawImage(img, p.x, p.y, img.width, img.height * 1.1);
    });
    g.globalAlpha = 1;
  },
  // Дождь: тучи, капли вертикальными чёрточками, брызги клетками; в грозу — жёлтая молния, тучи во вспышку плотнее.
  rain: function (o, g, t, dt, k, storm) {
    var I = storm ? wxFlash(o, t) : 0, wind = storm ? .25 : .12, sp = .8 + o.pw * .1;
    wxClouds(o, g, dt, k.darkC, .5 + I * .4); // тучи сеткой через клетку (цифры поверх читаются), во вспышку плотнее
    g.fillStyle = 'rgb(' + k.rain + ')';
    for (var z = 0; z < 3; z++) {
      g.globalAlpha = [.45, .75, 1][z];
      wxFall(o, dt, wind, sp, storm, z, function (p, L) { g.fillRect(p.x, p.y - L * 1.6, 10, L * 1.6 + 6); }); // капля шириной в клетку
    }
    o.sp = o.sp.filter(function (s) {
      s.a -= .06 * dt; if (s.a <= 0) return false;
      g.globalAlpha = s.a;
      s.d.forEach(function (d) { d[3] += .35 * dt; d[0] += d[2] * dt; d[1] += d[3] * dt; g.fillRect(d[0], d[1], 8, 8); });
      return true;
    });
    g.globalAlpha = 1;
    if (I > .1 && o.seg) {
      g.strokeStyle = 'rgb(' + k.sun + ')'; g.lineCap = 'butt'; g.lineJoin = 'miter';
      o.seg.forEach(function (s) { g.lineWidth = s[4] * 2.5; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.stroke(); });
    }
  },
  snow: function (o, g, t, dt, k) {
    wxClouds(o, g, dt, k.clouds, .45);
    g.fillStyle = 'rgb(' + k.p + ')';
    wxFlakes(o, t, dt, function (p, r) {
      var a = r * 2.4;
      g.globalAlpha = p.z === 0 ? .5 : p.z === 1 ? .8 : 1; g.fillRect(p.x - a / 2, p.y - a / 2, a, a);
    });
    g.globalAlpha = 1;
  }
};
