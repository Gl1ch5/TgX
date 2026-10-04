// Renders build/icon.svg -> build/icon.png (512) and build/icon.ico (16..256).
// Uses Electron's offscreen rendering, so no extra native deps are needed:
//   npx electron scripts/make-icons.js
// Run with plain `node` and it re-launches itself under Electron.
const path = require('path');
const fs = require('fs');

if (!process.versions.electron) {
  const { spawnSync } = require('child_process');
  const electron = require('electron');
  const args = [__filename];
  if (process.getuid && process.getuid() === 0) args.push('--no-sandbox'); // root in CI/containers
  const r = spawnSync(electron, args, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const { app, BrowserWindow, nativeImage } = require('electron');
const buildDir = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, transparent: true, frame: false,
    useContentSize: true, webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const full = img.resize({ width: 512, height: 512, quality: 'best' });
  fs.writeFileSync(path.join(buildDir, 'icon.png'), full.toPNG());
  const pngs = SIZES.map((size) => ({ size, buf: full.resize({ width: size, height: size, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico(pngs));
  console.log('icons written:', SIZES.join(','), '+ 512 png');
  app.quit();
});
