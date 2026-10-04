/**
 * ====================================================================
 * INLINE AUTOPLAY — short videos and GIFs play muted while on screen,
 * pause when scrolled away (like Telegram). The countdown badge shows
 * the remaining time.
 * ====================================================================
 */

import { formatDuration } from '../utils.js';

const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting && e.intersectionRatio >= 0.5) {
      if (!v.src && v.dataset.src) v.src = v.dataset.src;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }
}, { threshold: [0, 0.5] }) : null;

// Warm-up: start buffering a bit before the video scrolls into view.
const preloader = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const v = e.target;
    if (!v.src && v.dataset.src) {
      v.preload = 'auto';
      v.src = v.dataset.src;
    }
    preloader.unobserve(v);
  }
}, { rootMargin: '600px 0px' }) : null;

function tick(v) {
  const pill = v.parentElement && v.parentElement.querySelector('.tx-countdown');
  if (!pill || !v.duration) return;
  pill.textContent = formatDuration(Math.max(0, v.duration - v.currentTime));
}

export function observeAutoplay(root = document) {
  root.querySelectorAll('video[data-autoplay]:not([data-observed])').forEach((v) => {
    v.dataset.observed = '1';
    v.muted = true;
    v.addEventListener('timeupdate', () => tick(v));
    if (observer) {
      observer.observe(v);
      preloader.observe(v);
    } else {
      v.src = v.dataset.src;
      v.play().catch(() => {});
    }
  });
}

/** Current position of the inline copy, so the viewer can continue from it. */
export function inlineTime(postId, idx) {
  const v = document.querySelector(`video[data-autoplay="${CSS.escape(`${postId}:${idx}`)}"]`);
  return v && v.currentTime > 0.3 ? v.currentTime : 0;
}

export function pauseAll() {
  document.querySelectorAll('video[data-autoplay]').forEach((v) => v.pause());
}

export function resumeVisible() {
  const h = window.innerHeight;
  document.querySelectorAll('video[data-autoplay]').forEach((v) => {
    const r = v.getBoundingClientRect();
    const visible = r.height && Math.min(r.bottom, h) - Math.max(r.top, 0) >= r.height * 0.5;
    if (visible && v.src) v.play().catch(() => {});
  });
}
