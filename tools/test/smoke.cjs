// Browser smoke test for the whole UI, no Telegram account needed (the API layer is stubbed).
//   npm i -D playwright && npx playwright install chromium     (once)
//   node tools/test/smoke.cjs                  → all checks
//   node tools/test/smoke.cjs --shots out/     → also saves screenshots
// Fails (exit 1) on: any uncaught page error, a Cyrillic string left in a non-Russian UI,
// a missing key in the dictionaries, a broken login flow.
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '../../app/static');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

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

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  ✗', msg); };
const ok = (msg) => console.log('  ✓', msg);

(async () => {
  const [srv, port] = await serve();
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch();
  const LANGS = { ru: 'ru-RU', en: 'en-US', es: 'es-ES', pt: 'pt-BR', uk: 'uk-UA' };
  const PAGES = ['root', 'chat', 'theme', 'language', 'namecolor', 'power', 'wall', 'data', 'devices', 'about', 'developer'];

  for (const scheme of ['dark', 'light']) {
    for (const [code, locale] of Object.entries(LANGS)) {
      const label = `${code}/${scheme}`;
      console.log(label);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem('telex.prefs', JSON.stringify({ workerMode: false, migration: 1 })));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); // no real network
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForTimeout(1200);

      const theme = await page.evaluate(() => document.documentElement.dataset.theme);
      theme === scheme ? ok(`theme follows the device (${theme})`) : fail(`${label}: data-theme is ${theme}`);

      await page.evaluate(async () => {
        const { state } = await import('./js/state.js');
        const { api } = await import('./js/api.js');
        state.isAuth = true;
        state.user = { id: 777, name: 'Pavel', phone: '79991234567', username: 'pavel', avatar: null };
        api.getSessions = async () => [];
        window.TelegramX.updateAuthUI();
      });

      const leftovers = new Set();
      const scan = async (where) => {
        if (code === 'ru' || code === 'uk') return; // Cyrillic is expected there
        const found = await page.evaluate(() => {
          const out = [];
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (w.nextNode()) {
            const n = w.currentNode;
            if (/[А-Яа-яЁё]/.test(n.nodeValue) && n.parentElement && !n.parentElement.closest('script,style,[data-lang-name]')) out.push(n.nodeValue.trim());
          }
          document.querySelectorAll('[placeholder],[title],[aria-label]').forEach((e) => ['placeholder', 'title', 'aria-label'].forEach((a) => { const v = e.getAttribute(a); if (v && /[А-Яа-яЁё]/.test(v)) out.push(`${a}:${v}`); }));
          return out;
        });
        found.filter((t) => !['Русский', 'Українська'].includes(t)).forEach((t) => leftovers.add(`${where}: ${t.slice(0, 70)}`));
      };

      await scan('wall');
      for (const p of PAGES) {
        await page.evaluate((pg) => window.TelegramX.openSettingsPage(pg), p);
        await page.waitForTimeout(150);
        await scan(`settings/${p}`);
        if (shotsDir && p === 'chat') await page.screenshot({ path: path.join(shotsDir, `chat-${code}-${scheme}.png`) });
      }
      await page.evaluate(() => window.TelegramX.setView('profile'));
      await page.waitForTimeout(200);
      await scan('profile');

      // login flow (API stubbed): phone → code → 2FA
      await page.evaluate(async () => {
        const { api } = await import('./js/api.js');
        window.__calls = [];
        api.requestCode = async (phone) => { window.__calls.push(['code', phone]); return { status: 'code_sent', via_app: true }; };
        api.signInCode = async (c) => { window.__calls.push(['sign', c]); return { status: 'error', message: 'x' }; };
        window.TelegramX.openAuthModal();
      });
      await page.waitForTimeout(250);
      await scan('login/phone');
      await page.keyboard.type('79507451238', { delay: 5 });
      await page.click('#auth-fab');
      await page.waitForTimeout(300);
      await scan('login/code');
      await page.keyboard.type('12345', { delay: 5 });
      await page.waitForTimeout(300);
      const calls = await page.evaluate(() => JSON.stringify(window.__calls));
      calls === '[["code","+79507451238"],["sign","12345"]]' ? ok('login flow calls the API in order') : fail(`${label}: login calls ${calls}`);
      await page.evaluate(() => window.TelegramX.closeAuthModal());

      leftovers.size ? [...leftovers].slice(0, 8).forEach((l) => fail(`${label}: untranslated ${l}`)) : ok('no untranslated text');
      errors.length ? errors.slice(0, 5).forEach((e) => fail(`${label}: page error ${e}`)) : ok('no page errors');
      await ctx.close();
    }
  }
  await browser.close();
  srv.close();
  console.log(failures.length ? `\n${failures.length} problem(s)` : '\nALL GOOD');
  process.exit(failures.length ? 1 : 0);
})();
