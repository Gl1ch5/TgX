// Snowfall: three depth layers, a slow gust of wind, soft glow. Draws into the shared tx.ambient canvas (one loop for all visual mods).
export default function (tx) {
  var flakes = [], wind = 0, t = 0;
  function build(w, h, n) {
    flakes = [];
    for (var i = 0; i < n; i++) {
      var z = Math.random();                                   // 0 = far, 1 = near
      flakes.push({ x: Math.random() * w, y: Math.random() * h, z: z, r: 0.8 + z * 2.8, v: 14 + z * 46, p: Math.random() * 6.28 });
    }
  }
  tx.ambient.add({
    id: 'snow',
    draw: function (ctx, w, h, dt, pal) {
      var n = Number(tx.config.get('amount')) || 90;
      if (flakes.length !== n) build(w, h, n);
      var k = (Number(tx.config.get('speed')) || 100) / 100;
      var gust = (Number(tx.config.get('wind')) || 0) / 100;
      t += dt / 1000;
      wind = Math.sin(t / 5) * 14 * gust + 8 * gust;
      var dark = pal.mode === 'dark';
      for (var layer = 0; layer < 3; layer++) {
        ctx.fillStyle = dark ? 'rgba(255,255,255,' + (0.35 + layer * 0.28) + ')' : 'rgba(80,120,185,' + (0.3 + layer * 0.25) + ')'; // follows day / night
        ctx.beginPath();
        for (var i = 0; i < flakes.length; i++) {
          var f = flakes[i];
          if (Math.min(2, Math.floor(f.z * 3)) !== layer) continue;
          f.y += f.v * k * dt / 1000;
          f.p += dt / 1500;
          f.x += (Math.sin(f.p) * 0.3 + wind * (0.3 + f.z) / 30) * (dt / 16);
          if (f.y > h + 6) { f.y = -6; f.x = Math.random() * w; }
          if (f.x > w + 6) f.x = -6; else if (f.x < -6) f.x = w + 6;
          ctx.moveTo(f.x + f.r, f.y);
          ctx.arc(f.x, f.y, f.r, 0, 6.2832);
        }
        ctx.fill();
      }
    }
  });
}
