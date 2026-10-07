// Frame-time profile of transitions with a throttled CPU:  node tools/perf/perf.cjs [cpuRate=4]
const http = require('http'); const fs = require('fs'); const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '../../app/static');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const rate = Number(process.argv[2] || 4);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => localStorage.setItem('telex.prefs', JSON.stringify({ workerMode: false, migration: 1 })));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(3500);
  await page.evaluate(async () => { const { state } = await import('./js/state.js'); const { api } = await import('./js/api.js'); state.isAuth = true; state.user = { id: 1, name: 'Pavel', phone: '79991234567', username: 'p', avatar: null }; api.getSessions = async () => []; window.TelegramX.updateAuthUI(); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const measure = async (name, fn, ms = 700) => {
    await page.evaluate(() => { window.__f = []; let last = performance.now(); const loop = (t) => { window.__f.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(loop); }; window.__stop = false; requestAnimationFrame(loop); });
    await fn(); await page.waitForTimeout(ms);
    const f = await page.evaluate(() => { window.__stop = true; return window.__f; });
    const worst = Math.max(...f), long = f.filter((x) => x > 33).length;
    console.log(`${name.padEnd(34)} frames ${String(f.length).padStart(3)}  worst ${worst.toFixed(0).padStart(4)} ms  >33ms: ${long}`);
  };
  const T = (v) => page.evaluate((v) => window.TelegramX.go ? window.TelegramX.go(v) : null, v);
  await page.evaluate(() => document.querySelector('.tx-dock-tab[data-view="settings"]').click()); await page.waitForTimeout(800);
  for (const pg of ['theme', 'chat', 'wall', 'power', 'about', 'mods']) {
    await measure(`settings > ${pg}`, async () => { await page.evaluate((pg) => window.TelegramX.openSettingsPage(pg), pg); });
    await page.evaluate(() => history.back()); await page.waitForTimeout(600);
  }
  await page.evaluate(() => window.TelegramX.openSettingsPage('mods')); await page.waitForTimeout(900);
  for (const tab of ['catalog', 'installed', 'create', 'home']) await measure(`mods tab ${tab}`, async () => { await page.click(`.tx-modtabs .tx-tab[data-tab="${tab}"]`); });
  await page.evaluate(() => history.back()); await page.waitForTimeout(600);
  await measure('dock settings > profile', async () => { await page.evaluate(() => document.querySelector('.tx-dock-tab[data-view="profile"]').click()); });
  await measure('dock profile > wall', async () => { await page.evaluate(() => document.querySelector('.tx-dock-tab[data-view="wall"]').click()); });
  await browser.close(); srv.close();
})();
