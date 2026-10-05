// Headless smoke test for the desktop shell (dev/CI tool, NOT part of the package).
//   xvfb-run -a npx electron scripts/smoke.js [--no-sandbox] [--proxy-server=...] [--ignore-certificate-errors]
// Proxy / certificate switches are passed on the command line by the tester only;
// the shipped app (src/main.js) never sets them.
// SMOKE_MODE=offline expects the local "Нет соединения" page instead of the site.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, shell, BrowserWindow } = require('electron');

const mode = process.env.SMOKE_MODE || 'online';
const userData = process.env.SMOKE_USERDATA || fs.mkdtempSync(path.join(os.tmpdir(), 'telex-smoke-'));
app.setPath('userData', userData);

const external = [];
shell.openExternal = async (url) => { external.push(url); };

const errors = [];
const result = { mode, userData, external, errors };
function finish(ok, extra) {
  Object.assign(result, extra, { ok });
  console.log('SMOKE_RESULT ' + JSON.stringify(result, null, 2));
  app.exit(ok ? 0 : 1);
}
setTimeout(() => finish(false, { reason: 'timeout' }), 90000);

app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents;
  wc.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
  wc.on('render-process-gone', (_ev, d) => finish(false, { reason: 'render-process-gone', d }));
  wc.on('preload-error', (_ev, p, err) => errors.push('preload: ' + err.message));

  let checked = false;
  wc.on('did-finish-load', async () => {
    if (checked) return;
    const url = wc.getURL();
    if (mode === 'offline') {
      if (!url.startsWith('file:')) return;
      checked = true;
      const info = await wc.executeJavaScript(
        '({ h1: document.querySelector("h1").textContent, btn: document.querySelector("button").textContent, bridge: typeof window.telex?.retry, bg: getComputedStyle(document.body).backgroundColor })');
      // "Повторить" must re-request the live site (it fails again here, by design).
      const retried = new Promise((r) => wc.once('did-start-navigation', (ev) => r(ev.url)));
      await wc.executeJavaScript('document.getElementById("retry").click()');
      const retryUrl = await Promise.race([retried, new Promise((r) => setTimeout(() => r(null), 5000))]);
      return finish(info.h1 === 'Нет соединения' && info.btn === 'Повторить' && info.bridge === 'function' && retryUrl === 'https://telex-web.ru/app/static/',
        { url, info, retryUrl, visible: win.isVisible() });
    }
    checked = true;
    let controller = false;
    for (let i = 0; i < 60 && !controller; i++) {
      controller = await wc.executeJavaScript('!!navigator.serviceWorker.controller');
      if (!controller) await new Promise((r) => setTimeout(r, 500));
    }
    const page = await wc.executeJavaScript(
      '({ title: document.title, swScope: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL, bridge: typeof window.telex, prevLs: localStorage.getItem("__telex_smoke"), ls: (()=>{try{localStorage.setItem("__telex_smoke","1");return localStorage.getItem("__telex_smoke")}catch(e){return String(e)}})() })');
    // Navigation policy: window.open to an outside site must go to the OS browser, no new window.
    await wc.executeJavaScript('window.open("https://t.me/durov"); void 0');
    await new Promise((r) => setTimeout(r, 1000));
    const windows = BrowserWindow.getAllWindows().length;
    const ok = controller && page.bridge === 'undefined' && external.includes('https://t.me/durov') && windows === 1 && win.isVisible();
    finish(ok, { url, controller, page, windows, visible: win.isVisible(), title: win.getTitle() });
  });
});

require('../src/main.js');
