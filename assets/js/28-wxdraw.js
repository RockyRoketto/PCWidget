'use strict';
// Кадры фона погоды (подключение и спрайты — в 27-wxbg.js). Единицы — макетные: o.W×o.H, около 420×300.
// Сила (o.pw: 1..3) меняет густоту и скорость; у облачности 1 — переменная: пара облаков и солнце.

var WX_MUL = [1, .55, 1, 1.6];

function wxSeed(o) {
  var W = o.W, H = o.H, R = wxR, A = Math.max(.4, Math.min(3, W * H / 126000)), m = WX_MUL[o.pw] || 1, i;
  o.ps = []; o.sp = []; o.cl = []; o.stars = []; o.seg = null; o.ft = -1e9; o.next = performance.now() + 1500;
  var sky = o.st === 'sun' || (o.st === 'cloud' && o.pw === 1);
  if (sky && o.night) for (i = 0; i < 40 * A; i++) o.stars.push({ x: R() * W, y: R() * H * .7, s: R(), ph: R() * 7 });
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
function wxOvercast(o, n, v) {
  for (var i = 0; i < n; i++) o.cl.push({ k: i % 4, x: (i / n) * (o.W + 300) - 200 + wxR() * 60, y: -o.H * .25 + wxR() * o.H * .18, v: v * (.7 + wxR() * .6), s: .9 + wxR() * .4 });
}
function wxClouds(o, g, dt, arr, alpha) {
  o.cl.forEach(function (p) {
    p.x += p.v * dt; var img = arr[p.k], w = img.width * p.s; if (p.x > o.W + 20) p.x = -w;
    g.globalAlpha = alpha; g.drawImage(img, p.x, p.y, w, img.height * p.s);
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

function wxDraw(o, t, dt) {
  wxFit(o);
  var g = o.g, W = o.W, H = o.H, k = o.kit, st = o.st;
  g.clearRect(0, 0, W, H); o.drawn = true;
  var sky = st === 'sun' || (st === 'cloud' && o.pw === 1);
  if (sky) { if (o.night) wxNight(o, g, t, k); else wxSun(g, t, W, k, st === 'sun' ? 1 : .6); }
  if (st === 'cloud') {
    o.ps.forEach(function (p) {
      p.x += p.v * dt; var img = k.clouds[p.k], w = img.width * p.s; if (p.x > W + 20) p.x = -w;
      g.globalAlpha = k.cla * p.a; g.drawImage(img, p.x, p.y, w, img.height * p.s);
    });
    g.globalAlpha = 1;
  } else if (st === 'fog') {
    g.fillStyle = 'rgba(' + k.p + ',' + (k.dark ? .06 : .08) + ')'; g.fillRect(0, 0, W, H);
    o.ps.forEach(function (p) {
      var img = k.fogs[p.k]; p.x += p.v * dt; if (p.x > W) p.x = -img.width;
      g.globalAlpha = (k.dark ? .2 : .26) * (.65 + .35 * Math.sin(t / 4000 + p.ph)); g.drawImage(img, p.x, p.y, img.width, img.height * 1.1);
    });
    g.globalAlpha = 1;
  } else if (st === 'rain' || st === 'storm') wxRain(o, g, t, dt, k, st === 'storm');
  else if (st === 'snow') wxSnow(o, g, t, dt, k);
}

function wxSun(g, t, W, k, f) {
  var sx = W - 50, sy = 30, H = 300, br = .9 + .1 * Math.sin(t / 2200), a = k.sa * f, gr = g.createRadialGradient(sx, sy, 0, sx, sy, H * 1.1);
  gr.addColorStop(0, 'rgba(' + k.sun + ',' + a * br + ')'); gr.addColorStop(.12, 'rgba(' + k.sun + ',' + a * .7 * br + ')');
  gr.addColorStop(.4, 'rgba(' + k.sun + ',' + a * .18 + ')'); gr.addColorStop(1, 'rgba(' + k.sun + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H * 2);
  g.save(); g.globalAlpha = (.35 + .12 * Math.sin(t / 3100)) * (a / .55); g.translate(sx, sy); g.rotate(t / 60000);
  g.drawImage(k.rays, -k.rays.width / 2, -k.rays.height / 2); g.restore();
  if (f < 1) return;
  g.save(); g.globalAlpha = .10 + .05 * Math.sin(t / 1800); g.fillStyle = 'rgb(' + k.sun + ')';
  [[.45, 14], [.7, 8], [1, 22]].forEach(function (b) { g.beginPath(); g.arc(sx - W * .55 * b[0], sy + 210 * b[0], b[1], 0, 7); g.fill(); });
  g.restore();
}
// Ночью вместо солнца — мерцающие звёзды и слабое свечение луны в том же углу.
function wxNight(o, g, t, k) {
  var mx = o.W - 50, my = 30, gr = g.createRadialGradient(mx, my, 0, mx, my, 120);
  gr.addColorStop(0, 'rgba(' + k.p + ',.22)'); gr.addColorStop(.18, 'rgba(' + k.p + ',.12)'); gr.addColorStop(1, 'rgba(' + k.p + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, o.W, o.H);
  g.fillStyle = 'rgb(' + k.p + ')';
  o.stars.forEach(function (s) {
    g.globalAlpha = (.15 + s.s * .35) * (.55 + .45 * Math.sin(t / (900 + s.s * 900) + s.ph));
    var r = 1 + s.s * 1.6; g.fillRect(s.x - r / 2, s.y - r / 2, r, r);
  });
  g.globalAlpha = 1;
}

function wxRain(o, g, t, dt, k, storm) {
  var W = o.W, H = o.H, I = 0, sp = .8 + o.pw * .1;
  if (storm) {
    if (t > o.next) { o.ft = t; o.seg = []; wxBolt(W * (.2 + wxR() * .6), 0, H * (.75 + wxR() * .2), 4, o.seg, 0); o.next = t + 2500 + wxR() * 4000; }
    var e = t - o.ft; I = e < 70 ? 1 : e < 130 ? .15 : e < 200 ? .75 : Math.max(0, .75 * (1 - (e - 200) / 450)); // двойная вспышка с затуханием
  }
  wxClouds(o, g, dt, k.darkC, k.dka);
  if (I > 0) { g.fillStyle = 'rgba(' + k.fl + ',' + I * .3 + ')'; g.fillRect(0, 0, W, H); wxClouds(o, g, 0, k.lit, I * .7); }
  var wind = storm ? .35 : .22, base = k.base;
  for (var z = 0; z < 3; z++) {
    g.strokeStyle = 'rgba(' + k.p + ',' + Math.min(1, base * (.25 + z * .25) + I * .3) + ')'; g.lineWidth = .9 + z * .7; g.beginPath();
    o.ps.forEach(function (p) {
      if (p.z !== z) return;
      var v = ((storm ? 8 : 6) + z * 4) * sp; p.y += v * dt; p.x -= v * wind * dt;
      if (p.y > (z === 2 ? p.gy : H + 20)) {
        if (z === 2) o.sp.push({ x: p.x, y: p.gy, r: 1, a: 1, d: [[p.x, p.gy, -1 - wxR() * 1.5, -2 - wxR() * 2], [p.x, p.gy, 1 + wxR() * 1.5, -2 - wxR() * 2]] });
        p.y = -20 - wxR() * 40; p.x = wxR() * W * 1.3; p.gy = H * (.82 + wxR() * .18);
      }
      var L = 6 + z * 9; g.moveTo(p.x, p.y); g.lineTo(p.x + L * wind, p.y - L);
    });
    g.stroke();
  }
  g.lineWidth = 1.2;
  o.sp = o.sp.filter(function (s) { // круги и брызги от капель ближнего слоя
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
}

function wxSnow(o, g, t, dt, k) {
  var W = o.W, H = o.H, gust = Math.sin(t / 4000) * .7 + Math.sin(t / 1700) * .25, sp = .8 + o.pw * .1;
  wxClouds(o, g, dt, k.clouds, k.cla * .6);
  o.ps.forEach(function (p) {
    p.w += (.02 + p.z * .01) * dt; p.rt += .01 * dt;
    p.y += (.35 + p.z * .45 + p.s * .2) * sp * dt; p.x += (Math.sin(p.w) * (.3 + p.z * .3) + gust * (.4 + p.z * .4)) * dt;
    if (p.y > H + 12) { p.y = -12; p.x = wxR() * W; }
    if (p.x > W + 12) p.x = -12; if (p.x < -12) p.x = W + 12;
    var r = p.z === 0 ? 1.2 + p.s : p.z === 1 ? 2 + p.s * 1.5 : 4 + p.s * 4;
    if (p.z === 2) { g.globalAlpha = k.dark ? .35 : .28; g.drawImage(k.dot, p.x - r * 1.6, p.y - r * 1.6, r * 3.2, r * 3.2); } // ближние — размытые
    else { g.globalAlpha = p.z === 0 ? .45 : .75; g.drawImage(k.dot, p.x - r, p.y - r, r * 2, r * 2); }
  });
  g.globalAlpha = 1;
}
