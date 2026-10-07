// node promo/v2/render2.cjs v|h ru|en [--stills 2,10,20] [--fps 30] [--from s --to s]
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright');

const f = process.argv[2] === 'h' ? 'h' : 'v';
const lng = process.argv[3] === 'en' ? 'en' : 'ru';
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const fps = Number(arg('fps', 30));
const stills = arg('stills', null);
const BUILD = path.join(__dirname, 'build');
const [W, H] = f === 'v' ? [1080, 1920] : [1920, 1080];
const meta = {};
const clipsDir = path.join(BUILD, `clips-${lng}`);
for (const d of fs.readdirSync(clipsDir)) meta[d] = fs.readdirSync(path.join(clipsDir, d)).filter((x) => x.endsWith('.jpg')).length;

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('page error:', e.message));
  await p.addInitScript((m) => { window.META = m; }, meta);
  await p.goto('file://' + path.join(__dirname, 'trailer2.html') + '?f=' + f + '&l=' + lng);
  await p.evaluate(() => window.ready);
  const duration = await p.evaluate(() => window.DURATION);

  if (stills) {
    for (const t of stills.split(',').map(Number)) {
      await p.evaluate((t) => window.render(t), t);
      await p.screenshot({ path: path.join(BUILD, `still2-${f}-${lng}-${t}.jpg`), type: 'jpeg', quality: 85 });
    }
    await b.close();
    return;
  }
  const out = path.join(BUILD, `video2-${f === 'v' ? 'vertical' : 'youtube'}-${lng}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const from = Number(arg('from', 0)), to = Number(arg('to', duration));
  const frames = Math.round((to - from) * fps);
  for (let i = 0; i < frames; i++) {
    await p.evaluate((t) => window.render(t), from + i / fps);
    const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 90 === 0) process.stdout.write(`\r${f}-${lng}: ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`\n${out}`);
  await b.close();
})();
