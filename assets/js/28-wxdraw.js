'use strict';
// Кадры фона погоды (подключение, палитра, матрица — в 27-wxbg.js). Единицы — макетные: o.W×o.H, около 420×300.
// Сила (o.pw: 1..3) меняет густоту и скорость; у облачности 1 — переменная: пара облаков и солнце.
// Здесь общий посев частиц, выбор формы по теме и набор soft — мягкий, «как в природе» (Лист, основа для табло).
// Солнце и луна всех наборов — ореол вокруг значка погоды (28b-wxhalo.js).

var WX_MUL = [1, .55, 1, 1.6];

function wxSeed(o) {
  var W = o.W, H = o.H, R = wxR, A = Math.max(.4, Math.min(3, W * H / 126000)), m = WX_MUL[o.pw] || 1, i;
  o.ps = []; o.sp = []; o.cl = []; o.stars = []; o.seg = null; o.ft = -1e9; o.next = performance.now() + 1500; o.lv = null; o.hp = [R() * 7, R() * 7];
  if (wxSky(o) && o.night) for (i = 0; i < 40 * A; i++) {
    var s = { x: R() * W, y: R() * H * .7, s: R(), ph: R() * 7 };
    if (!wxNearIcon(o, s.x, s.y)) o.stars.push(s);
  }
  if (o.st === 'cloud') {
    var n = o.pw === 1 ? 3 : 7;
    for (i = 0; i < n; i++) {
      var far = o.pw === 1 ? i === 0 : i < 3;
      o.ps.push({ far: far, k: i % 6, x: R() * (W + 300) - 150, y: far ? H * (-.05 + R() * .2) : H * (.1 + R() * .4), v: far ? .12 : .28 + R() * .1, s: far ? .75 : 1 + R() * .25, a: far ? .6 : 1 });
    }
    o.ps.sort(function (a, b) { return (b.far ? 1 : 0) - (a.far ? 1 : 0); });
  } else if (o.st === 'fog') {
    for (i = 0; i < 7; i++) o.ps.push({ k: i % 5, x: R() * W - 200, y: H * (i / 6) - 60, v: .15 + R() * .3, ph: R() * 7 });
  } else if (o.st === 'rain' || o.st === 'storm') {
    var storm = o.st === 'storm';
    wxOvercast(o, storm ? 6 : 4, storm ? .5 : .2);
    for (i = 0; i < (storm ? 140 : 90) * A * m; i++) o.ps.push({ x: R() * W * 1.3, y: R() * H, z: i % 3, gy: H * (.82 + R() * .18) });
  } else if (o.st === 'snow') {
    wxOvercast(o, 3, .12);
    var sn = 75 * A * m;
    for (i = 0; i < sn; i++) o.ps.push({ x: R() * W, y: R() * H, z: i < sn * .53 ? 0 : i < sn * .87 ? 1 : 2, w: R() * 7, rt: R() * 7, s: R() });
  }
}
function wxSky(o) { return o.st === 'sun' || (o.st === 'cloud' && o.pw === 1); }
function wxOvercast(o, n, v) {
  for (var i = 0; i < n; i++) o.cl.push({ k: i % 4, x: (i / n) * (o.W + 300) - 200 + wxR() * 60, y: -o.H * .25 + wxR() * o.H * .18, v: v * (.7 + wxR() * .6), s: .9 + wxR() * .4 });
}
// Тучи (o.cl) из спрайтов arr; cloud-частицы (o.ps) — из k.clouds.
function wxClouds(o, g, dt, arr, alpha) {
  o.cl.forEach(function (p) {
    p.x += p.v * dt; var img = arr[p.k], w = img.width * p.s; if (p.x > o.W + 20) p.x = -w;
    g.globalAlpha = alpha; g.drawImage(img, p.x, p.y, w, img.height * p.s);
  });
  g.globalAlpha = 1;
}
function wxDrift(o, g, dt, k) {
  o.ps.forEach(function (p) {
    p.x += p.v * dt; var img = k.clouds[p.k], w = img.width * p.s; if (p.x > o.W + 20) p.x = -w;
    g.globalAlpha = k.cla * p.a; g.drawImage(img, p.x, p.y, w, img.height * p.s);
  });
  g.globalAlpha = 1;
}
function wxBolt(x, y, yEnd, w, out, depth) {
  var px = x, py = y;
  while (py < yEnd) {
    var nx = px + (wxR() - .5) * 34, ny = py + 12 + wxR() * 18;
    out.push([px, py, nx, ny, w]);
    if (depth < 2 && wxR() < .18) wxBolt(nx, ny, ny + (yEnd - ny) * (.3 + wxR() * .3), w * .5, out, depth + 1);
    px = nx; py = ny;
  }
}
// Яркость грозы: двойная вспышка с затуханием; новая молния раз в 2.5–6.5 с.
function wxFlash(o, t) {
  if (t > o.next) { o.ft = t; o.seg = []; wxBolt(o.W * (.2 + wxR() * .6), 0, o.H * (.75 + wxR() * .2), 4, o.seg, 0); o.next = t + 2500 + wxR() * 4000; }
  var e = t - o.ft; return e < 70 ? 1 : e < 130 ? .15 : e < 200 ? .75 : Math.max(0, .75 * (1 - (e - 200) / 450));
}
// Брызги и круги от капель ближнего слоя.
function wxSplash(o, p) { o.sp.push({ x: p.x, y: p.gy, r: 1, a: 1, d: [[p.x, p.gy, -1 - wxR() * 1.5, -2 - wxR() * 2], [p.x, p.gy, 1 + wxR() * 1.5, -2 - wxR() * 2]] }); }
// Капли по слоям: каждой зовётся line(p, L) для отрисовки, упавшие ближние — в брызги.
function wxFall(o, dt, wind, sp, storm, z, line) {
  o.ps.forEach(function (p) {
    if (p.z !== z) return;
    var v = ((storm ? 8 : 6) + z * 4) * sp; p.y += v * dt; p.x -= v * wind * dt;
    if (p.y > (z === 2 ? p.gy : o.H + 20)) {
      if (z === 2) wxSplash(o, p);
      p.y = -20 - wxR() * 40; p.x = wxR() * o.W * 1.3; p.gy = o.H * (.82 + wxR() * .18);
    }
    line(p, 6 + z * 9);
  });
}

function wxDraw(o, t, dt) {
  wxFit(o);
  var k = o.kit, st = o.st, g = o.g;
  if (o.off) { if (!o.offg || o.offg.canvas !== o.off) o.offg = o.off.getContext('2d'); g = o.offg; } // матрица: сцена во внеэкранный холст
  if (k.style.persist && !o.off && o.drawn) { // послесвечение: прошлый кадр не стирается, а гаснет
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,' + (1 - Math.pow(1 - k.style.persist, dt)) + ')'; g.fillRect(0, 0, o.W, o.H); g.restore();
  } else g.clearRect(0, 0, o.W, o.H);
  o.drawn = true;
  var K = k.kind, f = function (n) { return K[n] || WX_KINDS.soft[n]; };
  if (wxSky(o)) f(o.night ? 'night' : 'sky')(o, g, t, dt, k, st === 'sun' ? 1 : .6);
  if (st === 'cloud') wxCloudsAside(o, g, dt, k, f('cloud'));
  else if (st === 'fog') f('fog')(o, g, t, dt, k);
  else if (st === 'rain' || st === 'storm') f('rain')(o, g, t, dt, k, st === 'storm');
  else if (st === 'snow') f('snow')(o, g, t, dt, k);
  if (o.off) wxMatrix(o);
}

// ---- soft: мягкие облака с размытием, свечение солнца, штрихи дождя, круглые снежинки ----
WX_KINDS.soft = {
  kit: function (k) {
    k.clouds = [0, 1, 2, 3, 4, 5].map(function (i) { return wxCloud(k.p, 200 + i * 20, 90 + i * 8, i < 3 ? 10 : 6); });
    k.darkC = [0, 1, 2, 3].map(function (i) { return wxCloud(k.dk, 260 + i * 30, 100 + i * 10, 9); });
    k.lit = [0, 1, 2, 3].map(function (i) { return wxCloud(k.fl, 260 + i * 30, 100 + i * 10, 12); });
    k.fogs = [0, 1, 2, 3, 4].map(function () { return wxFogBand(k.p, 420, 110, 16); });
  },
  sky: function (o, g, t, dt, k, f) { wxHalo(o, g, t, k, false, f); },
  // Ночью — слабый лунный свет и мерцающие звёзды (stars в наборе темы).
  night: function (o, g, t, dt, k) { wxHalo(o, g, t, k, true, 1); (k.kind.stars || WX_KINDS.soft.stars)(o, g, t, k); },
  stars: function (o, g, t, k) {
    g.fillStyle = 'rgb(' + k.p + ')';
    o.stars.forEach(function (s) {
      g.globalAlpha = (.25 + s.s * .45) * (.55 + .45 * Math.sin(t / (900 + s.s * 900) + s.ph));
      var r = 1 + s.s * 1.6; g.fillRect(s.x - r / 2, s.y - r / 2, r, r);
    });
    g.globalAlpha = 1;
  },
  cloud: function (o, g, t, dt, k) { wxDrift(o, g, dt, k); },
  fog: function (o, g, t, dt, k) {
    g.fillStyle = 'rgba(' + k.p + ',' + (k.dark ? .06 : .08) + ')'; g.fillRect(0, 0, o.W, o.H);
    o.ps.forEach(function (p) {
      var img = k.fogs[p.k]; p.x += p.v * dt; if (p.x > o.W) p.x = -img.width;
      g.globalAlpha = (k.dark ? .2 : .26) * (.65 + .35 * Math.sin(t / 4000 + p.ph)); g.drawImage(img, p.x, p.y, img.width, img.height * 1.1);
    });
    g.globalAlpha = 1;
  },
  rain: function (o, g, t, dt, k, storm) {
    var I = storm ? wxFlash(o, t) : 0, wind = storm ? .35 : .22, base = k.base, sp = .8 + o.pw * .1;
    wxClouds(o, g, dt, k.darkC, k.dka);
    if (I > 0) { g.fillStyle = 'rgba(' + k.fl + ',' + I * .3 + ')'; g.fillRect(0, 0, o.W, o.H); wxClouds(o, g, 0, k.lit, I * .7); }
    for (var z = 0; z < 3; z++) {
      g.strokeStyle = 'rgba(' + k.p + ',' + Math.min(1, base * (.25 + z * .25) + I * .3) + ')'; g.lineWidth = (.9 + z * .7) * (k.thick || 1); g.beginPath();
      wxFall(o, dt, wind, sp, storm, z, function (p, L) { g.moveTo(p.x, p.y); g.lineTo(p.x + L * wind, p.y - L); });
      g.stroke();
    }
    g.lineWidth = 1.2;
    o.sp = o.sp.filter(function (s) {
      s.r += .7 * dt; s.a -= .05 * dt; if (s.a <= 0) return false;
      g.strokeStyle = 'rgba(' + k.p + ',' + s.a * base * .8 + ')'; g.beginPath(); g.ellipse(s.x, s.y, s.r * 2, s.r * .5, 0, 0, 7); g.stroke();
      g.fillStyle = 'rgba(' + k.p + ',' + s.a * base + ')';
      s.d.forEach(function (d) { d[3] += .35 * dt; d[0] += d[2] * dt; d[1] += d[3] * dt; g.fillRect(d[0], d[1], 2, 2); });
      return true;
    });
    if (I > .1 && o.seg) {
      g.save(); g.shadowColor = 'rgba(' + k.fl + ',1)'; g.shadowBlur = 24; g.strokeStyle = 'rgba(' + k.fl + ',' + I + ')'; g.lineCap = 'round';
      o.seg.forEach(function (s) { g.lineWidth = s[4]; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.stroke(); });
      g.restore();
    }
  },
  snow: function (o, g, t, dt, k) {
    wxClouds(o, g, dt, k.clouds, k.cla * .6);
    wxFlakes(o, t, dt, function (p, r) {
      r *= k.thick ? 1.8 : 1;
      if (p.z === 2) { g.globalAlpha = k.dark ? .35 : .28; g.drawImage(k.dot, p.x - r * 1.6, p.y - r * 1.6, r * 3.2, r * 3.2); } // ближние — размытые
      else { g.globalAlpha = p.z === 0 ? .45 : .75; g.drawImage(k.dot, p.x - r, p.y - r, r * 2, r * 2); }
    });
    g.globalAlpha = 1;
  }
};
// Движение снежинок (покачивание и порывы ветра) общее для всех форм; draw(p, r) рисует одну.
function wxFlakes(o, t, dt, draw) {
  var gust = Math.sin(t / 4000) * .7 + Math.sin(t / 1700) * .25, sp = .8 + o.pw * .1;
  o.ps.forEach(function (p) {
    p.w += (.02 + p.z * .01) * dt; p.rt += .01 * dt;
    p.y += (.35 + p.z * .45 + p.s * .2) * sp * dt; p.x += (Math.sin(p.w) * (.3 + p.z * .3) + gust * (.4 + p.z * .4)) * dt;
    if (p.y > o.H + 12) { p.y = -12; p.x = wxR() * o.W; }
    if (p.x > o.W + 12) p.x = -12; if (p.x < -12) p.x = o.W + 12;
    draw(p, p.z === 0 ? 1.2 + p.s : p.z === 1 ? 2 + p.s * 1.5 : 4 + p.s * 4);
  });
}
function wxFogBand(rgb, w, h, bl) {
  var t = wxCanvas(w, h), g = t.getContext('2d'); g.fillStyle = 'rgb(' + rgb + ')';
  for (var i = 0; i < 9; i++) {
    var rx = w * (.08 + wxR() * .1), ry = h * (.15 + wxR() * .15);
    g.beginPath(); g.ellipse(rx + wxR() * (w - 2 * rx), h / 2 + (wxR() - .5) * (h - 2 * ry) * .6, rx, ry, 0, 0, 7); g.fill();
  }
  return wxBlur(t, bl);
}
