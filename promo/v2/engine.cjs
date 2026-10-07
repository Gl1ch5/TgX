// Frame-exact recorder: the page runs on virtual time (CDP), one screenshot per 1/30 s, so every real animation of the app is captured smoothly.
const fs = require('fs');
const path = require('path');
const FPS = 30;
const pad = (n) => String(n).padStart(5, '0');

class Rec {
  constructor(page, dir, { quality = 88 } = {}) { this.page = page; this.dir = dir; this.quality = quality; this.n = 0; this.acc = 0; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); }
  /** Browser flags needed for frame control (the page only renders when we ask for a frame). */
  static ARGS = ['--enable-begin-frame-control', '--run-all-compositor-stages-before-draw', '--disable-new-content-rendering-timeout', '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-checker-imaging'];
  async init() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    await this.cdp.send('HeadlessExperimental.enable');
    this.pumping = true; // while the page is being set up, produce frames in the background
    this.pump = (async () => { while (this.pumping) { await this.cdp.send('HeadlessExperimental.beginFrame', {}).catch(() => {}); await new Promise((r) => setTimeout(r, 16)); } })();
  }
  async start() {
    this.pumping = false; await this.pump;
    await this.cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
    await this.page.evaluate(() => {
      const css = document.createElement('style');
      css.textContent = '.__tap{position:fixed;z-index:2147483647;pointer-events:none;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.75);box-shadow:0 0 24px rgba(120,160,255,.5)}';
      document.head.appendChild(css);
      // loading/playing media stalls frames under virtual time: videos stay inert (their poster/thumbnail is what is shown)
      Object.defineProperty(HTMLMediaElement.prototype, 'src', { set() {}, get() { return ''; } });
      const sa = Element.prototype.setAttribute; Element.prototype.setAttribute = function (k, v) { if (this.tagName === 'VIDEO' && k === 'src') return; return sa.call(this, k, v); };
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      document.querySelectorAll('video').forEach((v) => { v.removeAttribute('src'); v.load(); });
      const cv = document.createElement('style'); cv.textContent = '*{content-visibility:visible !important}'; document.head.appendChild(cv); // content-visibility stalls frames under virtual time
      window.__tap = (x, y, hold = 0) => {
        const d = document.createElement('div'); d.className = '__tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d);
        d.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: .22 }, { transform: 'scale(.85)', opacity: 1, offset: .5 + hold }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 520 + hold * 1000, easing: 'ease-out' }).onfinish = () => d.remove();
      };
    });
    for (let i = 0; i < 4; i++) await this.advance(); // warm-up so animations are in step with the clock
  }
  async advance() {
    this.acc += 1000 / FPS; const b = Math.floor(this.acc); this.acc -= b;
    await new Promise((res) => {
      const done = () => { clearTimeout(to); this.cdp.off('Emulation.virtualTimeBudgetExpired', done); res(); };
      const to = setTimeout(() => { this.stalls = (this.stalls || 0) + 1; done(); }, 4000); // the event can get lost: do not hang forever
      this.cdp.on('Emulation.virtualTimeBudgetExpired', done);
      this.cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: b }).catch(() => {});
    });
  }
  async tick() {
    await this.advance();
    const r = await this.cdp.send('HeadlessExperimental.beginFrame', { screenshot: { format: 'jpeg', quality: this.quality } });
    fs.writeFileSync(path.join(this.dir, pad(this.n++) + '.jpg'), Buffer.from(r.screenshotData, 'base64'));
  }
  async frames(n, fn) { for (let i = 0; i < n; i++) { if (fn) await fn(n > 1 ? i / (n - 1) : 1, i); await this.tick(); } }
  wait(sec) { return this.frames(Math.round(sec * FPS)); }
  /** Scroll along keyframes [[sec, y], ...] with ease-in-out between them. */
  async scroll(keys) {
    let y0 = await this.page.evaluate(() => window.scrollY);
    for (const [sec, y1] of keys) {
      const ease = (k) => 1 - Math.pow(1 - k, 3);
      const from = y0;
      await this.frames(Math.max(1, Math.round(sec * FPS)), (k) => this.page.evaluate((y) => window.scrollTo(0, y), from + (y1 - from) * ease(k)));
      y0 = y1;
    }
  }
  async tap(x, y, fn) { await this.page.evaluate(([x, y]) => window.__tap(x, y), [x, y]); await this.frames(8); if (fn) await fn(); }
  async rect(sel) { return this.page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, sel); }
  async tapEl(sel, dx = 0, dy = 0) {
    const r = await this.rect(sel); if (!r) throw new Error('no element ' + sel);
    await this.tap(r.cx + dx, r.cy + dy, () => this.page.evaluate((s) => document.querySelector(s).click(), sel));
  }
}
module.exports = { Rec, FPS };
