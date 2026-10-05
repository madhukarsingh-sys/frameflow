// Demo-only: paints landscape "photos" on a canvas so the demo needs no image
// hosting and works offline. It also shows two Frameflow features in use:
// a custom `source` function and an `imageUrl` resolver that returns a
// Promise and is asked for exactly the pixel width each tile needs.
(function () {
  'use strict';

  var TOTAL = 480;     // photos in the demo album
  var PAGE = 30;       // photos per "network" page
  var MAX_W = 1600;    // largest image the generator will paint

  function rng(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PALETTES = [
    { name: 'dawn', sky: ['#2d3a64', '#c86b6b', '#f5c28a'], sun: '#ffe2b0', land: ['#8a6a86', '#5a4a6b', '#3e3552', '#221c30'], mist: '#f2c9a0' },
    { name: 'midday', sky: ['#3d7bc4', '#8fc0e8', '#d8ecf7'], sun: '#ffffff', land: ['#8fb0c0', '#5c8a7a', '#3f6b52', '#244632'], mist: '#e6f2f8' },
    { name: 'dusk', sky: ['#1d1b3a', '#7a3b69', '#f08a5d'], sun: '#ffd27a', land: ['#8a4a6a', '#5a2f52', '#36203b', '#1a1020'], mist: '#f3a07a' },
    { name: 'night', sky: ['#05070f', '#0f1b33', '#2a3d63'], sun: '#f1f0e0', land: ['#24344d', '#1a263b', '#111b2c', '#080d17'], mist: '#3a4d70', stars: true },
    { name: 'fog', sky: ['#8e9aa1', '#c3cbcf', '#e3e7e8'], sun: '#f4f4f0', land: ['#b3bcbf', '#949fa3', '#727f84', '#4c575c'], mist: '#e8ecec' },
    { name: 'desert', sky: ['#4f86b8', '#a9cbe0', '#f3dcb5'], sun: '#fff3d6', land: ['#e0ae7e', '#c07c4e', '#94573a', '#5e3420'], mist: '#f6dfc0' },
    { name: 'snow', sky: ['#1f4f73', '#6fa9c9', '#cfe8f0'], sun: '#ffffff', land: ['#e8f3f8', '#bcd7e5', '#8bb2c7', '#587f98'], mist: '#eaf6fa' },
    { name: 'forest', sky: ['#3c5a4a', '#93b49a', '#e3ead0'], sun: '#fbf7e0', land: ['#7d9a70', '#4c6b45', '#2f4a2f', '#182a1a'], mist: '#dfe8cf' },
  ];
  var SHAPES = [[3, 2], [3, 2], [2, 3], [4, 5], [16, 9], [1, 1], [5, 4], [21, 9], [9, 16]];
  var FIRST = ['Quiet', 'Far', 'Low', 'Upper', 'North', 'Long', 'Still', 'High', 'Old', 'East'];
  var PLACE = ['ridge', 'pass', 'valley', 'basin', 'saddle', 'shoulder', 'divide', 'spur', 'col', 'bench'];
  var WHEN = { dawn: 'at first light', midday: 'at midday', dusk: 'at dusk', night: 'after dark', fog: 'in fog', desert: 'in dry heat', snow: 'after snowfall', forest: 'above the trees' };

  function describe(i) {
    var r = rng(i * 7919 + 13);
    var shape = SHAPES[Math.floor(r() * SHAPES.length)];
    var pal = PALETTES[Math.floor(r() * PALETTES.length)];
    var name = FIRST[Math.floor(r() * FIRST.length)] + ' ' + PLACE[Math.floor(r() * PLACE.length)];
    return {
      id: i,
      seed: i * 104729 + 7,
      palette: pal.name,
      w: shape[0] * 1000,
      h: shape[1] * 1000,
      color: pal.sky[1],
      alt: name + ' ' + WHEN[pal.name],
      caption: name + ' ' + WHEN[pal.name] + '. Frame ' + (i + 1) + ' of ' + TOTAL + '.',
    };
  }

  function paint(item, width) {
    var pal = PALETTES.filter(function (p) { return p.name === item.palette; })[0];
    var w = Math.max(16, Math.min(MAX_W, Math.round(width)));
    var h = Math.max(16, Math.round(w * item.h / item.w));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var r = rng(item.seed);
    var horizon = h * (0.55 + r() * 0.15);

    var sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, pal.sky[0]); sky.addColorStop(0.55, pal.sky[1]); sky.addColorStop(1, pal.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    if (pal.stars) {
      g.fillStyle = '#ffffff';
      var sr = rng(item.seed + 1);
      for (var s = 0; s < 140; s++) {
        g.globalAlpha = 0.25 + sr() * 0.75;
        var sz = (0.4 + sr() * 1.1) * w / 800;
        g.fillRect(sr() * w, sr() * horizon * 0.9, sz, sz);
      }
      g.globalAlpha = 1;
    }

    var sx = w * (0.15 + r() * 0.7), sy = horizon * (0.35 + r() * 0.45), sR = Math.min(w, h) * (0.04 + r() * 0.05);
    var glow = g.createRadialGradient(sx, sy, 0, sx, sy, sR * 7);
    glow.addColorStop(0, pal.sun); glow.addColorStop(0.15, pal.sun + 'aa'); glow.addColorStop(1, pal.sun + '00');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.fillStyle = pal.sun; g.beginPath(); g.arc(sx, sy, sR, 0, Math.PI * 2); g.fill();

    for (var L = 0; L < 4; L++) {
      var base = horizon - h * 0.12 + L * h * (0.1 + r() * 0.05);
      var amp = h * (0.16 - L * 0.025);
      var f1 = 1 + r() * 2, f2 = 3 + r() * 4, f3 = 9 + r() * 10;
      var p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
      g.beginPath(); g.moveTo(0, h);
      for (var x = 0; x <= w; x += Math.max(1, w / 240)) {
        var t = x / w;
        var y = base - amp * (0.55 * Math.sin(t * f1 * 6.28 + p1) + 0.3 * Math.sin(t * f2 * 6.28 + p2) + 0.15 * Math.sin(t * f3 * 6.28 + p3));
        g.lineTo(x, y);
      }
      g.lineTo(w, h); g.closePath();
      g.fillStyle = pal.land[L]; g.fill();
      if (L < 3) {
        var mist = g.createLinearGradient(0, base - amp, 0, base + amp * 1.5);
        mist.addColorStop(0, pal.mist + '00'); mist.addColorStop(1, pal.mist + '55');
        g.fillStyle = mist; g.fillRect(0, base - amp, w, amp * 2.5);
      }
    }
    return c.toDataURL('image/jpeg', 0.84);
  }

  // Paint on demand, newest request first, a few milliseconds at a time, so
  // fast scrolling never blocks the page. Results are cached (LRU).
  var cache = new Map();
  var stack = [];
  var busy = false;
  var CACHE_MAX = 260;

  function pump() {
    if (busy) return;
    busy = true;
    setTimeout(function run() {
      var start = performance.now();
      while (stack.length && performance.now() - start < 10) {
        var job = stack.pop();
        try { job.resolve(paint(job.item, job.width)); } catch (e) { job.reject(e); }
      }
      if (stack.length) setTimeout(run, 0);
      else busy = false;
    }, 0);
  }

  function imageUrl(item, width) {
    var w = Math.min(MAX_W, width);
    var key = item.id + ':' + w;
    if (cache.has(key)) {
      var hit = cache.get(key);
      cache.delete(key); cache.set(key, hit);
      return hit;
    }
    var p = new Promise(function (resolve, reject) {
      stack.push({ item: item, width: w, resolve: resolve, reject: reject });
      pump();
    });
    cache.set(key, p);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return p;
  }

  // Pretends to be an API: a short delay, then 30 items, then an empty page.
  function source(ctx) {
    var start = (ctx.page - 1) * PAGE;
    return new Promise(function (resolve) {
      setTimeout(function () {
        var items = [];
        for (var i = start; i < Math.min(TOTAL, start + PAGE); i++) items.push(describe(i));
        resolve(items);
      }, 250 + Math.random() * 350);
    });
  }

  window.FrameflowDemo = { source: source, imageUrl: imageUrl, total: TOTAL };
})();
