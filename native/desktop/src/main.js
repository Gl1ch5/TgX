'use strict';
// TeleX desktop shell: opens the live web app (always up to date) in a native window.
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session, shell, nativeTheme, Menu, net } = require('electron');

// ---- The one place that says what the app is ------------------------------
const APP_URL = 'https://telex-web.ru/app/static/';
const APP_SCOPE = 'https://telex-web.ru/'; // anything under here stays in-app
const LEGACY_SCOPE = 'https://gl1ch5.github.io/TgX/'; // the old address, redirects to the domain
const PARTITION = 'persist:telex'; // localStorage, session, Service Worker, cache survive restarts
const BG = '#000000';

// ---- Performance / memory ------------------------------------------------------
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('disk-cache-size', String(1024 * 1024 * 1024)); // 1 GiB
// Keep video/audio smooth when the window is hidden or occluded.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

app.setAppUserModelId('io.github.gl1ch5.telex');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  // ---- Window state -------------------------------------------------------------
  const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
  function loadState() {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
      if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
    } catch (_) { /* first run */ }
    return { width: 1200, height: 820 };
  }
  function visibleOnSomeDisplay(s) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return false;
    const { screen } = require('electron');
    return screen.getAllDisplays().some(({ workArea: a }) =>
      s.x + 50 < a.x + a.width && s.x + s.width - 50 > a.x &&
      s.y >= a.y - 10 && s.y + 40 < a.y + a.height);
  }
  let saveTimer = null;
  function saveState() {
    if (!win || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    const b = maximized || win.isMinimized() ? win.getNormalBounds() : win.getBounds();
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
    } catch (_) { /* not critical */ }
  }
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 400); };

  // ---- Navigation policy ---------------------------------------------------------
  const inScope = (url) => typeof url === 'string' && (url.startsWith(APP_SCOPE) || url.startsWith(LEGACY_SCOPE));
  function openExternal(url) {
    try {
      const u = new URL(url);
      if (['http:', 'https:', 'tg:', 'mailto:', 'tel:'].includes(u.protocol)) shell.openExternal(url);
    } catch (_) { /* ignore malformed */ }
  }

  function configureSession(ses) {
    ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
      const allowed = ['notifications', 'clipboard-sanitized-write', 'clipboard-read', 'media', 'fullscreen', 'persistent-storage'];
      cb(inScope(details.requestingUrl || '') && allowed.includes(permission));
    });
    ses.on('will-download', (_e, item) => {
      // Save straight into Downloads (unique name), no dialog.
      const dir = app.getPath('downloads');
      const name = item.getFilename() || 'download';
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      let target = path.join(dir, name);
      for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, `${base} (${i})${ext}`);
      item.setSavePath(target);
      item.once('done', (_ev, state) => {
        if (state === 'completed' && win && !win.isDestroyed() && process.platform === 'win32') win.flashFrame(true);
      });
    });
  }

  const OFFLINE_PAGE = path.join(__dirname, 'offline.html');
  let showingOffline = false;

  function createWindow() {
    const state = loadState();
    const opts = {
      width: Math.max(380, state.width),
      height: Math.max(600, state.height),
      minWidth: 380,
      minHeight: 600,
      title: 'TeleX',
      backgroundColor: BG,
      show: false,
      autoHideMenuBar: true,
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    };
    if (visibleOnSomeDisplay(state)) { opts.x = state.x; opts.y = state.y; }
    win = new BrowserWindow(opts);
    win.setMenuBarVisibility(false);
    if (state.maximized) win.maximize();

    win.once('ready-to-show', () => win.show());
    // Never sit invisible forever if the first paint is slow.
    setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 8000);

    win.on('resize', saveSoon);
    win.on('move', saveSoon);
    win.on('close', saveState);
    win.on('closed', () => { win = null; });
    // Keep "TeleX" as the window title regardless of the page's <title>.
    win.on('page-title-updated', (e) => e.preventDefault());

    const wc = win.webContents;

    wc.setWindowOpenHandler(({ url }) => {
      if (inScope(url)) { wc.loadURL(url).catch(() => {}); } else { openExternal(url); }
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (inScope(url)) return;
      e.preventDefault();
      openExternal(url);
    });
    wc.on('will-redirect', (e, url) => {
      if (e.isMainFrame && !inScope(url)) { e.preventDefault(); openExternal(url); }
    });

    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* ABORTED */) return;
      console.warn(`[telex] load failed ${code} ${desc} ${url}`);
      showingOffline = true;
      win.loadFile(OFFLINE_PAGE, { query: { code: String(code), desc: desc || '' } }).catch(() => {});
    });
    wc.on('did-finish-load', () => {
      if (!wc.getURL().startsWith('file:')) showingOffline = false;
    });

    // Shortcuts without a menu bar: DevTools, reload.
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const key = (input.key || '').toLowerCase();
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && key === 'i') || key === 'f12') {
        wc.toggleDevTools(); e.preventDefault();
      } else if ((ctrl && key === 'r') || key === 'f5') {
        e.preventDefault();
        if (showingOffline || wc.getURL().startsWith('file:')) wc.loadURL(APP_URL).catch(() => {});
        else if (input.shift) wc.reloadIgnoringCache();
        else wc.reload();
      }
    });

    wc.loadURL(APP_URL).catch(() => {});
    return win;
  }

  // Offline page asks to retry via the preload bridge (only exposed to the local page).
  const { ipcMain } = require('electron');
  ipcMain.on('telex:retry', (e) => {
    if (win && e.sender === win.webContents) win.webContents.loadURL(APP_URL).catch(() => {});
  });

  // Defence in depth for any webContents (e.g. DevTools-opened, iframes' popups).
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
  });

  // ---- One-time move of the web app's data to the domain ---------------------
  // localStorage (Telegram session, settings) belongs to an origin: copy the
  // telex.* keys from gl1ch5.github.io to telex-web.ru, or everyone is logged out.
  // Both origins are opened as blank local stubs (outside the Service Worker scope).
  async function migrateLegacyStorage(ses) {
    const flag = path.join(app.getPath('userData'), 'storage-migrated');
    if (fs.existsSync(flag)) return;
    const OLD = 'https://gl1ch5.github.io/__telex_migrate';
    const NEW = 'https://telex-web.ru/__telex_migrate';
    ses.protocol.handle('https', (req) => (req.url === OLD || req.url === NEW
      ? new Response('<!doctype html><html><body></body></html>', { headers: { 'content-type': 'text/html' } })
      : net.fetch(req, { bypassCustomProtocolHandlers: true })));
    const w = new BrowserWindow({ show: false, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
    const work = (async () => {
      await w.loadURL(OLD);
      const data = await w.webContents.executeJavaScript(
        '(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("telex.")) o[k] = localStorage.getItem(k); } return o; })()');
      if (data && data['telex.session']) {
        await w.loadURL(NEW);
        await w.webContents.executeJavaScript(
          `(() => { if (localStorage.getItem("telex.session")) return; const o = ${JSON.stringify(data)}; for (const k in o) localStorage.setItem(k, o[k]); })()`);
      }
    })();
    try {
      await Promise.race([work, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(flag, '1');
    } catch (_) { /* try again next start */ } finally {
      if (!w.isDestroyed()) w.destroy();
      ses.protocol.unhandle('https');
    }
  }

  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    Menu.setApplicationMenu(null);
    const ses = session.fromPartition(PARTITION);
    configureSession(ses);
    await migrateLegacyStorage(ses).catch(() => {});
    createWindow();
    app.on('activate', () => { if (!win) createWindow(); });
  });

  app.on('window-all-closed', () => app.quit());
}

module.exports = { APP_URL, APP_SCOPE, PARTITION };
