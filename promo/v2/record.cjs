// node promo/v2/record.cjs <scene|all> [ru|en]   → promo/v2/build/clips-<lang>/<scene>/00000.jpg …
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const { setup } = require('./demo.cjs');
const { Rec } = require('./engine.cjs');
const LANG = process.argv[3] === 'en' ? 'en' : 'ru';
const OUT = path.join(__dirname, 'build', `clips-${LANG}`);
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.5, locale: LANG === 'en' ? 'en-US' : 'ru-RU' };
const desktop = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: phone.locale };

const noVT = (p) => p.evaluate(() => { document.startViewTransition = (fn) => { fn(); return { finished: Promise.resolve(), ready: Promise.resolve() }; }; }); // tab switches: instant, no half-drawn snapshot

const SCENES = {
  // the wall: a long, smooth scroll
  async feed(r, p) {
    await r.wait(0.5);
    await r.scroll([[1.5, 620], [0.35, 640], [1.6, 1500], [0.3, 1520], [1.5, 2500], [0.3, 2520], [1.6, 3500]]);
    await r.wait(0.4);
  },
  // long tap on the text → the menu with reactions
  async react(r, p) {
    await r.scroll([[1.0, 300]]);
    await r.wait(0.3);
    const t = await r.rect('#post-card-1_10 .post-text');
    await r.tap(t.cx, t.cy, () => p.evaluate(() => document.querySelector('#post-card-1_10 .tx-bubble').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 500 }))));
    await r.wait(1.3);
    await r.tapEl('.tx-ctx-reactions button:nth-child(3)');
    await r.wait(1.8);
  },
  // tap the comments row of the first post → the thread slides in → scroll to the newest comments
  async comments(r, p) {
    await r.scroll([[0.9, 330]]);
    await r.wait(0.3);
    await r.tapEl('#post-card-1_10 [onclick*="openThread"]');
    await r.settle();
    await r.wait(1.6);
    await r.scroll([[1.4, 600]]);
    await r.wait(1.0);
  },
  // stories: tap the avatars in the header, watch two stories, tap to the next one
  async stories(r, p) {
    await r.wait(0.5);
    await r.tap(50, 28, () => p.evaluate(() => window.TelegramX.openStackStories()));
    await r.settle();
    await r.wait(2.3);
    await r.tap(330, 420, () => p.evaluate(() => document.querySelector('.tx-story-frame')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 340, clientY: 420 }))));
    await r.wait(2.2);
  },
  // the channel page, opened by tapping the channel name
  async channel(r, p) {
    await r.wait(0.4);
    await r.tap(30, 191, () => p.evaluate(() => window.TelegramX.openChannelPage(1)));
    await r.settle();
    await r.wait(1.8);
    await r.scroll([[1.6, 420]]);
    await r.wait(1.0);
  },
  // the media viewer: tap the first photo of the album, then the next arrow
  async viewer(r, p) {
    await r.wait(0.4);
    await r.tapEl('[data-viewer="1_10:0"]');
    await r.settle();
    await r.wait(1.6);
    await r.tapEl('.tx-viewer-nav.next');
    await r.wait(1.0);
    await r.tapEl('.tx-viewer-nav.next');
    await r.wait(1.2);
  },
  // the desktop layout
  async desktop(r, p) {
    await r.wait(0.6);
    await r.scroll([[1.6, 700], [0.4, 720], [1.6, 1500], [0.4, 1520]]);
    await r.wait(0.4);
  },
  // colour themes of the chat: tap the tiles, the preview and the wallpaper change live
  async themes(r, p) {
    await noVT(p);
    await p.evaluate(() => { window.TelegramX.setView('settings'); });
    await r.wait(0.3);
    await p.evaluate(() => window.TelegramX.openSettingsPage('chat'));
    await r.settle();
    await r.wait(1.2);
    await r.scroll([[0.8, 260]]);
    for (const i of [2, 4, 6, 8]) {
      await r.tapEl(`.tx-theme-tile:nth-child(${i})`);
      await p.evaluate((i) => document.querySelector(`.tx-theme-tile:nth-child(${i})`).click(), i);
      await r.wait(0.9);
    }
  },
  // the mods store: install Snowfall and Liquid glass, then see them on the wall
  async mods(r, p) {
    await noVT(p);
    await r.wait(0.3);
    await r.tap(194, 810, () => p.evaluate(() => window.TelegramX.setView('settings')));
    await r.settle(800);
    await r.wait(0.6);
    await p.evaluate(() => window.TelegramX.openSettingsPage('mods'));
    await r.settle();
    await r.wait(1.2);
    await r.tapEl('.tx-modtabs .tx-tab[data-tab="catalog"]');
    await r.settle(800);
    await r.wait(1.0);
    for (const id of ['snowfall', 'liquid-glass']) {
      await r.scroll([[0.5, id === 'snowfall' ? 220 : 250]]);
      await r.tapEl(`[onclick*="installOfficial('${id}')"]`);
      await r.wait(0.9);
      await r.tapEl('.tx-dialog .is-main');
      await r.wait(1.3);
    }
    await r.tap(194, 810, () => p.evaluate(() => window.TelegramX.setView('wall')));
    await r.settle();
    await r.wait(1.0);
    await r.scroll([[1.6, 500]]);
    await r.wait(1.6);
  },
};

(async () => {
  const which = process.argv[2] || 'all';
  const names = which === 'all' ? Object.keys(SCENES) : which.split(',');
  const b = await chromium.launch({ args: Rec.ARGS });
  for (const name of names) {
    const ctx = await b.newContext(name === 'desktop' ? desktop : phone);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  page error:', e.message));
    const r = new Rec(p, path.join(OUT, name));
    await r.init();
    await setup(p, LANG);
    await r.start();
    await SCENES[name](r, p);
    console.log(name, r.n, 'frames');
    await ctx.close();
  }
  await b.close();
})();
