// Screenshots of the demo client at the size of an Android phone screenshot (909 px wide at 2.33x = 390 CSS px).
//   node tools/shots/shots.cjs <out dir> [dark|light]
const http = require('http'); const fs = require('fs'); const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const out = process.argv[2] || '/tmp/shots'; const scheme = process.argv[3] || 'dark';
fs.mkdirSync(out, { recursive: true });
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 858 }, deviceScaleFactor: 2.33, colorScheme: scheme, locale: 'ru-RU', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await p.goto(`http://127.0.0.1:${port}/?fake=1`);
  await p.waitForSelector('.cx-row'); await p.waitForTimeout(600);
  const shot = async (n) => { await p.waitForTimeout(350); await p.screenshot({ path: `${out}/${n}.png` }); };
  await shot('01-chats');
  for (const tab of ['contacts', 'settings', 'profile']) { await p.click(`.cx-tab[data-tab="${tab}"]`); await shot(`0${['contacts', 'settings', 'profile'].indexOf(tab) + 2}-${tab}`); }
  await p.click('.cx-tab[data-tab="chats"]'); await p.waitForTimeout(500);
  await p.click('#page-chats .cx-row[data-id="u1000"]'); await p.waitForSelector('.cx-msg'); await shot('05-chat');
  await p.click('.cx-who'); await p.waitForTimeout(900); await shot('06-user-profile');
  await p.evaluate(() => { const sc = document.querySelector('.cx-prof .cx-scroll, .cx-prof'); if (sc) sc.scrollTop = 400; }); await shot('07-user-profile-scrolled');
  await p.goto(`http://127.0.0.1:${port}/?fake=1`); await p.waitForSelector('.cx-row'); await p.waitForTimeout(500);
  await p.click('#page-chats .cx-row[data-id="c1005"]'); await p.waitForSelector('.cx-msg'); await shot('08-channel-chat');
  await p.click('.cx-who'); await p.waitForTimeout(900); await shot('09-channel-profile');
  await b.close(); srv.close();
});
