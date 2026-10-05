// Browser smoke test for Telegram You (no Telegram account needed: the demo service ?fake=1).
//   npm i -D playwright && npx playwright install chromium     (once)
//   npm test                 → all checks      npm test -- --shots out/   → also saves screenshots
// Fails (exit 1) on any uncaught page error, a Cyrillic string left in a non-Russian UI, or a broken flow.
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const failures = [];
const fail = (m) => { failures.push(m); console.log('  ✗', m); };
const ok = (m) => console.log('  ✓', m);

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve([srv, srv.address().port]));
  });
}

(async () => {
  const [srv, port] = await serve();
  const browser = await chromium.launch();
  const LANGS = { ru: 'ru-RU', en: 'en-US', es: 'es-ES', pt: 'pt-BR', uk: 'uk-UA' };
  for (const scheme of ['dark', 'light']) {
    for (const [code, locale] of Object.entries(LANGS)) {
      const label = `${code}/${scheme}`;
      console.log(label);
      const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, colorScheme: scheme, locale, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      await page.goto(`http://127.0.0.1:${port}/?fake=1`);
      try {
        await page.waitForSelector('.cx-row', { timeout: 8000 });
        ok('chat list renders');
        await page.click('.cx-row[data-id="u1000"]');
        await page.waitForSelector('.cx-msg', { timeout: 5000 });
        ok('conversation opens with messages');
        if (code === 'ru' || code === 'en') {
          const before = await page.locator('.cx-msg').count();
          await page.fill('#cx-input', 'тест отправки');
          await page.click('#cx-send');
          await page.waitForFunction((n) => document.querySelectorAll('.cx-msg').length > n, before, { timeout: 4000 });
          await page.waitForFunction(() => !document.querySelector('.cx-msg.pending'), null, { timeout: 4000 });
          ok('message is sent (pending → sent)');
          // mods plug into the extension points and unplug cleanly
          const modOk = await page.evaluate(async () => {
            const { installMod, removeMod } = await import('./js/ui/mods.js');
            const { ext } = await import('./js/ui/ext.js');
            const code = "export default function (tx) { tx.menu('message', 'Probe item', () => {}); tx.ext.addHook('beforeSend', (x) => x + '!'); }";
            const p = installMod({ manifest: { id: 'probe', name: 'Probe', version: '1' }, code });
            await new Promise((r) => setTimeout(r, 100));
            document.querySelector('#cx-menu button[data-v="1"]').click();
            await p;
            const has = ext.menu('message', { msg: {}, chat: {} }).some((i) => i.label === 'Probe item');
            const hooked = await ext.run('beforeSend', 'hi', {});
            removeMod('probe');
            return has && hooked === 'hi!' && !ext.menu('message', { msg: {}, chat: {} }).some((i) => i.label === 'Probe item');
          });
          modOk ? ok('a mod plugs in and is removed cleanly') : fail(`${label}: mod lifecycle failed`);
        }
        await page.click('.cx-back');
        for (const tab of ['contacts', 'settings', 'profile', 'chats']) { await page.click(`[data-tab="${tab}"]`); await page.waitForTimeout(120); }
        ok('tabs switch');
        if (code !== 'ru' && code !== 'uk') {
          const left = await page.evaluate(() => {
            const out = new Set();
            const w = document.createTreeWalker(document.getElementById('cx-app'), NodeFilter.SHOW_TEXT);
            while (w.nextNode()) { const s = w.currentNode.nodeValue.trim(); if (/[А-Яа-яЁё]/.test(s) && !w.currentNode.parentElement.closest('.cx-msgs,.cx-row-main,.cx-name,.cx-prev,.tx-avatar,.tx-avatar-ini,.ini,.cx-sect')) out.add(s); }
            return [...out];
          });
          left.length ? left.slice(0, 5).forEach((l) => fail(`${label}: untranslated "${l}"`)) : ok('no untranslated text');
        }
        if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${code}-${scheme}.png`) });
      } catch (e) { fail(`${label}: ${e.message.split('\n')[0]}`); }
      errs.length ? errs.slice(0, 5).forEach((e) => fail(`${label}: page error ${e}`)) : ok('no page errors');
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  console.log(failures.length ? `\n${failures.length} problem(s)` : '\nALL GOOD');
  process.exit(failures.length ? 1 : 0);
})();
