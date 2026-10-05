// Extra pieces of the mod API (tx.keys, tx.ambient, tx.media, tx.theme.palette / on('change')). All of them clean up after a mod stops.
import { resolvedTheme, getPrefs } from './prefs.js';

// ---------------------------------------------------------------- palette + theme change

/** The colours the app uses right now (read from CSS, so a canvas never works with stale colours). */
export function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    mode: resolvedTheme(),
    bg: v('--tx-bg'), surface: v('--tx-surface'), surface2: v('--tx-surface-2'), text: v('--tx-text'), textSecondary: v('--tx-text-2'),
    accent: v('--tx-accent'), accentFill: v('--tx-accent-fill'), glass: v('--tx-glass'), separator: v('--tx-separator'), red: v('--tx-red'), green: v('--tx-green'),
  };
}

/** fn(palette) after the day/night mode, accent, wallpaper theme or a mod's variables change. Returns an unsubscribe function. */
export function onThemeChange(fn) {
  let queued = false;
  const fire = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; try { fn(palette()); } catch (e) { console.warn('[mods] theme change', e); } }); };
  const mo = new MutationObserver(fire);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  document.addEventListener('tx:themes', fire);
  return () => { mo.disconnect(); document.removeEventListener('tx:themes', fire); };
}

// ---------------------------------------------------------------- keyboard shortcuts

const shortcuts = new Set(); // { owner, ctrl, alt, shift, key, fn }
let keysBound = false;

function parseCombo(combo) {
  const parts = String(combo).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
  const key = parts.pop();
  return { key, ctrl: parts.includes('mod') || parts.includes('ctrl') || parts.includes('cmd'), alt: parts.includes('alt'), shift: parts.includes('shift') };
}

function bindKeys() {
  if (keysBound) return;
  keysBound = true;
  window.addEventListener('keydown', (e) => {
    const typing = e.target && (e.target.isContentEditable || /^(input|textarea|select)$/i.test(e.target.tagName));
    const k = String(e.key || '').toLowerCase();
    for (const s of shortcuts) {
      if (s.key !== k || s.ctrl !== (e.ctrlKey || e.metaKey) || s.alt !== e.altKey || s.shift !== e.shiftKey) continue;
      if (typing && !s.ctrl && !s.alt) continue; // plain keys never fire while the user types
      try { if (s.fn(e) !== false) e.preventDefault(); } catch (err) { console.warn('[mods] shortcut', err); }
    }
  });
}

/** tx.keys.add('mod+shift+c', fn) — removed with the mod. */
export function keysApi(owner, onStop) {
  bindKeys();
  const mine = new Set();
  onStop(() => mine.forEach((s) => shortcuts.delete(s)));
  return {
    add(combo, fn) {
      const s = { owner, ...parseCombo(combo), fn };
      shortcuts.add(s); mine.add(s);
      return { remove: () => { shortcuts.delete(s); mine.delete(s); } };
    },
  };
}

// ---------------------------------------------------------------- ambient layer

const layers = new Map(); // key → { draw, fps, last }
let canvas = null, ctx2d = null, raf = 0, last = 0, w = 0, h = 0;

function size() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = window.innerWidth; h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(now) {
  raf = 0;
  if (!layers.size) { stopAmbient(); return; }
  if (!last) last = now - 40; // the first frame draws at once
  const dt = Math.min(100, now - last);
  if (dt >= 1000 / 30 - 2) { // one shared loop, at most 30 fps, for every mod
    last = now;
    ctx2d.clearRect(0, 0, w, h);
    const pal = palette();
    for (const [key, l] of layers) { try { ctx2d.save(); l.draw(ctx2d, w, h, dt, pal); ctx2d.restore(); } catch (e) { console.warn('[mods] ambient', key, e); layers.delete(key); } }
  }
  if (!document.hidden) raf = requestAnimationFrame(frame);
}

function startAmbient() {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'tx-ambient';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
    ctx2d = canvas.getContext('2d');
    document.body.append(canvas);
    size();
    window.addEventListener('resize', () => { if (canvas) size(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && layers.size && !raf) raf = requestAnimationFrame(frame); });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

function stopAmbient() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (canvas) { canvas.remove(); canvas = null; ctx2d = null; }
  last = 0;
}

/**
 * tx.ambient.add({ id, draw(ctx, width, height, dtMs, palette) }) → { remove() }
 * Every mod draws into ONE shared canvas under the app (z-index 2, no clicks), driven by ONE animation loop (≤ 30 fps),
 * paused when the tab is hidden and off in power-saving mode. Draw only what changes; the canvas is cleared for you.
 */
export function ambientApi(owner, onStop) {
  const mine = new Set();
  onStop(() => { mine.forEach((k) => layers.delete(k)); mine.clear(); if (!layers.size) stopAmbient(); });
  return {
    add(spec) {
      if (getPrefs().reduceMotion) return { remove() {} };
      const key = `${owner}:${spec.id || mine.size}`;
      layers.set(key, { draw: spec.draw });
      mine.add(key);
      startAmbient();
      return { remove: () => { layers.delete(key); mine.delete(key); if (!layers.size) stopAmbient(); } };
    },
  };
}

// ---------------------------------------------------------------- media of a post

const KINDS = new Set(['photo', 'video', 'gif', 'round']);
/** tx.media.of(post) → [{ type: 'photo'|'video'|'gif'|'round'|…, url, thumb, duration, size }] — the post's media in album order. */
export const mediaApi = {
  of(post) {
    return ((post && post.media_items) || []).map((i) => ({ type: i.type, url: i.url || '', thumb: i.thumb_url || i.preview || '', duration: i.duration || 0, size: i.size || 0, visual: KINDS.has(i.type) }));
  },
  urls(post) { return this.of(post).filter((i) => i.url).map((i) => i.url); },
};
