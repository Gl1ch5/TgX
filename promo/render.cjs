// Renders promo/trailer.html frame by frame into an MP4.
// node promo/render.cjs v|h [--stills 1,5,12] [--fps 30]
//   v → build/telex-vertical.mp4 (1080×1920)   h → build/telex-youtube.mp4 (1920×1080)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const f = process.argv[2] === 'h' ? 'h' : 'v';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const fps = Number(arg('fps', 30));
const stills = arg('stills', null);
const BUILD = path.join(__dirname, 'build');
const [W, H] = f === 'v' ? [1080, 1920] : [1920, 1080];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, 'trailer.html') + '?f=' + f);
  await p.evaluate(() => window.ready);
  const duration = await p.evaluate(() => window.DURATION);

  if (stills) {
    for (const t of stills.split(',').map(Number)) {
      await p.evaluate((t) => window.render(t), t);
      await p.screenshot({ path: path.join(BUILD, `still-${f}-${t}.jpg`), type: 'jpeg', quality: 80 });
    }
    await b.close();
    return;
  }

  const out = path.join(BUILD, f === 'v' ? 'video-vertical.mp4' : 'video-youtube.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(duration * fps);
  for (let i = 0; i < frames; i++) {
    await p.evaluate((t) => window.render(t), i / fps);
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`\r${f}: ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`\n${out}`);
  await b.close();
})();
