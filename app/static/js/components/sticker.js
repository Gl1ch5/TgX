/**
 * ====================================================================
 * STICKERS & CUSTOM (PREMIUM) EMOJI
 * Static .webp, video .webm and animated .tgs (gzipped Lottie JSON).
 * Markup is rendered as lightweight placeholders and "hydrated" later.
 * ====================================================================
 */

import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { getPrefs } from '../core/prefs.js';

const TGS = 'application/x-tgsticker';
const lottieCache = new Map(); // url -> Promise<animationData>
let lottieLoader = null;

export function loadLottie() {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (!lottieLoader) {
    lottieLoader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/lottie_light.min.js';
      s.onload = () => resolve(window.lottie);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return lottieLoader;
}

async function tgsData(url) {
  if (!lottieCache.has(url)) {
    lottieCache.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    })());
  }
  return lottieCache.get(url);
}

/** Placeholder for a sticker-like asset; call hydrateStickers() after inserting. */
export function stickerHtml(url, mime, cls = 'tx-sticker') {
  return `<span class="${cls}" data-src="${escapeHtml(url)}" data-mime="${escapeHtml(mime || '')}"></span>`;
}

async function mount(el) {
  if (el.dataset.mounted) return;
  el.dataset.mounted = '1';
  const src = el.dataset.src;
  const mime = el.dataset.mime;
  const still = getPrefs().reduceMotion;
  try {
    if (mime === TGS) {
      const [lottie, data] = await Promise.all([loadLottie(), tgsData(src)]);
      el.textContent = '';
      const anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: !still, animationData: data });
      el._anim = anim;
    } else if (mime === 'video/webm') {
      el.innerHTML = `<video src="${escapeHtml(src)}" ${still ? '' : 'autoplay'} loop muted playsinline></video>`;
    } else {
      el.innerHTML = `<img src="${escapeHtml(src)}" alt="" draggable="false" />`;
    }
  } catch (e) {
    console.warn('[TeleX] sticker failed', src, e);
  }
}

// Only animate what is on screen
const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const el = entry.target;
    if (entry.isIntersecting) {
      mount(el);
      if (el._anim && !getPrefs().reduceMotion) el._anim.play();
      el.querySelector('video')?.play().catch(() => {});
    } else {
      if (el._anim) el._anim.pause();
      el.querySelector('video')?.pause();
    }
  }
}, { rootMargin: '200px' }) : null;

export async function hydrateStickers(root = document) {
  const nodes = root.querySelectorAll('.tx-sticker:not([data-observed]), .tx-cemoji-media:not([data-observed])');
  nodes.forEach((el) => {
    el.dataset.observed = '1';
    if (observer) observer.observe(el);
    else mount(el);
  });

  // Custom emoji (in text and reactions): resolve documents first
  const pending = [...root.querySelectorAll('.tx-cemoji[data-id]:not([data-resolved])')];
  if (!pending.length) return;
  pending.forEach((el) => { el.dataset.resolved = '1'; });
  const ids = [...new Set(pending.map((el) => el.dataset.id))];
  let docs = {};
  try {
    docs = await api.getCustomEmoji(ids);
  } catch (e) {
    console.warn('[TeleX] custom emoji', e);
    return;
  }
  for (const el of pending) {
    const doc = docs[el.dataset.id];
    if (!doc) continue;
    el.innerHTML = stickerHtml(doc.url, doc.mime, 'tx-cemoji-media');
  }
  hydrateStickers(root);
}
