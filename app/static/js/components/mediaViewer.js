/**
 * ====================================================================
 * FULLSCREEN MEDIA VIEWER — Telegram style
 * Top bar (back · channel · date · share · menu), "N из M" counter,
 * caption, custom video controls (seek bar, 00:00 / 00:12), swipes.
 * ====================================================================
 */

import { state } from '../state.js';
import { escapeHtml, formatPostText, showToast } from '../utils.js';
import { galleryOf } from './postCard.js';
import { inlineTime, pauseAll, resumeVisible } from './autoplay.js';
import { t, locale } from '../i18n.js';

let view = null; // { post, items, index, el, video }

function fmt(sec) {
  if (!Number.isFinite(sec)) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function dateLabel(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return t('сегодня в {a}', {a: time});
  if (d.toDateString() === yesterday.toDateString()) return t('вчера в {a}', {a: time});
  return t('{a} в {b}', {a: d.toLocaleDateString(locale(), { day: 'numeric', month: 'long' }), b: time});
}

export function openViewer(postId, index = 0) {
  const post = state.posts.find((p) => p.id === postId) || (state.extraPosts || []).find((p) => p.id === postId) || (state.threadPost && state.threadPost.id === postId ? state.threadPost : null);
  if (!post) return;
  const items = galleryOf(post);
  if (!items.length) return;
  closeViewer();

  const el = document.createElement('div');
  el.className = 'tx-viewer';
  el.innerHTML = `
    <div class="tx-viewer-bg"></div>
    <div class="tx-viewer-top">
      <button class="tx-icon-btn" data-act="close" title="${t('Назад')}"><i class="icon icon-arrow-left"></i></button>
      <div class="tx-viewer-title"><b></b><span>${escapeHtml(dateLabel(post.date))}</span></div>
      <button class="tx-icon-btn" data-act="share" title="${t('Поделиться')}"><i class="icon icon-share-filled"></i></button>
      <a class="tx-icon-btn" data-act="download" title="${t('Скачать')}" download><i class="icon icon-download"></i></a>
    </div>
    <div class="tx-viewer-counter"></div>
    <div class="tx-viewer-stage"></div>
    <button class="tx-viewer-nav prev" data-act="prev"><i class="icon icon-arrow-right" style="transform:scaleX(-1)"></i></button>
    <button class="tx-viewer-nav next" data-act="next"><i class="icon icon-arrow-right"></i></button>
    <div class="tx-viewer-bottom">
      <div class="tx-viewer-caption post-text"></div>
      <div class="tx-seek-row tx-hidden">
        <button class="tx-icon-btn" data-act="toggle" title="${t('Пауза')}"><i class="icon icon-pause"></i></button>
        <div class="tx-seek"><div class="tx-seek-track"><div class="tx-seek-buf"></div><div class="tx-seek-fill"></div></div><div class="tx-seek-thumb"></div></div>
        <span class="tx-seek-time">00:00 / 00:00</span>
      </div>
    </div>`;
  el.querySelector('.tx-viewer-title b').textContent = post.channel?.title || t('Канал');
  el.querySelector('.tx-viewer-caption').innerHTML = formatPostText(post.text, post.text_html);
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  view = { post, items, index, el, video: null };
  pauseAll();
  bind(el);
  show(index);
  openFrom(sourceFor(post.id, index), items[index]);
  history.pushState({ ...(history.state || {}), viewer: true }, '');
}

// ---------------- Telegram-style open/close morph ----------------

const EASE_OPEN = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
const EASE_CLOSE = 'cubic-bezier(0.4, 0, 0.2, 1)';

function reduceMotion() {
  return document.body.classList.contains('tx-reduce-motion');
}

/** The on-screen tile the media was opened from (feed or discussion). */
function sourceFor(postId, idx) {
  const nodes = document.querySelectorAll(`[data-viewer="${CSS.escape(`${postId}:${idx}`)}"]`);
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) return n;
  }
  return null;
}

function rectOf(r) {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function fitRect(aspect) {
  const W = innerWidth;
  const H = innerHeight;
  let w = W;
  let h = W / aspect;
  if (h > H) { h = H; w = H * aspect; }
  return { left: (W - w) / 2, top: (H - h) / 2, width: w, height: h };
}

function ghostSrc(node) {
  if (!node) return '';
  const img = node.tagName === 'IMG' ? node : node.querySelector('img');
  if (img && img.currentSrc) return img.currentSrc;
  const v = node.tagName === 'VIDEO' ? node : node.querySelector('video');
  if (v && v.videoWidth) {
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return c.toDataURL('image/jpeg', 0.85);
    } catch {}
  }
  return (v && v.poster) || '';
}

function makeGhost(src, rect, radius) {
  const g = document.createElement('div');
  g.className = 'tx-viewer-ghost';
  Object.assign(g.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${radius}px` });
  g.innerHTML = `<img src="${escapeHtml(src)}" alt="" />`;
  document.body.appendChild(g);
  return g;
}

function frames(from, to, rFrom, rTo) {
  const f = (r, rad) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${rad}px` });
  return [f(from, rFrom), f(to, rTo)];
}

function openFrom(source, item) {
  const el = view.el;
  const bg = el.querySelector('.tx-viewer-bg');
  const src = ghostSrc(source);
  if (reduceMotion() || !source || !src) {
    bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    el.querySelector('.tx-viewer-stage').animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE_OPEN });
    return;
  }
  const from = rectOf(source.getBoundingClientRect());
  const aspect = item.width && item.height ? item.width / item.height : from.width / from.height;
  const to = fitRect(aspect);
  const ghost = makeGhost(src, from, 6);
  el.classList.add('is-morphing');
  const dur = 280;
  bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: 'ease-out' });
  el.querySelectorAll('.tx-viewer-top, .tx-viewer-bottom, .tx-viewer-counter').forEach((n) => n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: 'ease-out' }));
  const a = ghost.animate(frames(from, to, 6, 0), { duration: dur, easing: EASE_OPEN, fill: 'forwards' });
  a.finished.then(() => {
    el.classList.remove('is-morphing');
    requestAnimationFrame(() => ghost.remove());
  });
}

/** Animate back into the tile (or fade/scale out if it's off-screen), then remove. */
function closeAnimated(done) {
  const el = view.el;
  const media = el.querySelector('.tx-viewer-stage img, .tx-viewer-stage video');
  const source = sourceFor(view.post.id, view.index);
  const bg = el.querySelector('.tx-viewer-bg');
  const chrome = el.querySelectorAll('.tx-viewer-top, .tx-viewer-bottom, .tx-viewer-counter, .tx-viewer-nav');
  chrome.forEach((n) => n.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
  const bgFrom = getComputedStyle(bg).opacity;

  if (reduceMotion() || !media) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).finished.then(done);
    return;
  }
  const from = rectOf(media.getBoundingClientRect());
  const src = ghostSrc(media);
  if (!source || !src) {
    bg.animate([{ opacity: bgFrom }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
    media.animate([{ transform: media.style.transform || 'none', opacity: 1 }, { transform: 'scale(0.85)', opacity: 0 }], { duration: 220, easing: EASE_CLOSE, fill: 'forwards' })
      .finished.then(done);
    return;
  }
  const to = rectOf(source.getBoundingClientRect());
  const ghost = makeGhost(src, from, 0);
  media.style.visibility = 'hidden';
  bg.animate([{ opacity: bgFrom }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  ghost.animate(frames(from, to, 0, 6), { duration: 260, easing: EASE_CLOSE, fill: 'forwards' }).finished.then(() => {
    done();
    requestAnimationFrame(() => ghost.remove());
  });
}

function show(index, dir = 0) {
  if (!view) return;
  const { items, el } = view;
  if (dir) {
    const stageEl = el.querySelector('.tx-viewer-stage');
    requestAnimationFrame(() => stageEl.animate(
      [{ transform: `translateX(${dir * 28}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 260, easing: EASE_OPEN },
    ));
  }
  if (view.resetZoom) view.resetZoom();
  view.index = (index + items.length) % items.length;
  const item = items[view.index];
  const stage = el.querySelector('.tx-viewer-stage');
  const seekRow = el.querySelector('.tx-seek-row');
  const counter = el.querySelector('.tx-viewer-counter');
  counter.textContent = items.length > 1 ? t('{a} из {b}', {a: view.index + 1, b: items.length}) : '';
  el.querySelectorAll('.tx-viewer-nav').forEach((b) => b.classList.toggle('tx-hidden', items.length < 2));
  el.querySelector('[data-act="download"]').href = item.full_url || item.url;

  if (view.video) view.video.pause();
  view.video = null;

  if (item.type === 'photo') {
    // Feed-size copy (already cached) first, then swap in the full-resolution photo.
    stage.innerHTML = `<div class="tx-viewer-spinner"></div><img src="${escapeHtml(item.url)}" alt="" />`;
    if (item.full_url && item.full_url !== item.url) {
      const hi = new Image();
      hi.decoding = 'async';
      hi.onload = () => {
        const img = stage.querySelector('img');
        if (img && img.getAttribute('src') === item.url) img.src = item.full_url;
      };
      hi.src = item.full_url;
    }
    stage.querySelector('img').onload = () => stage.querySelector('.tx-viewer-spinner')?.remove();
    seekRow.classList.add('tx-hidden');
    return;
  }

  stage.innerHTML = `
    <div class="tx-viewer-spinner"></div>
    <video src="${escapeHtml(item.url)}" playsinline ${item.type === 'gif' ? 'loop muted' : ''} autoplay ${item.thumb_url ? `poster="${escapeHtml(item.thumb_url)}"` : ''}></video>
    <button class="tx-viewer-big-play is-playing" data-act="toggle"><i class="icon icon-play"></i></button>`;
  const video = stage.querySelector('video');
  view.video = video;
  const resumeAt = inlineTime(view.post.id, view.index);
  if (resumeAt) video.addEventListener('loadedmetadata', () => { video.currentTime = resumeAt; }, { once: true });
  seekRow.classList.toggle('tx-hidden', item.type === 'gif');

  const spinner = stage.querySelector('.tx-viewer-spinner');
  const big = stage.querySelector('.tx-viewer-big-play');
  const toggleIcon = el.querySelector('[data-act="toggle"] .icon');
  const fill = el.querySelector('.tx-seek-fill');
  const buf = el.querySelector('.tx-seek-buf');
  const thumb = el.querySelector('.tx-seek-thumb');
  const time = el.querySelector('.tx-seek-time');
  const dur = () => video.duration || item.duration || 0;

  const paint = () => {
    const p = dur() ? video.currentTime / dur() : 0;
    fill.style.width = `${p * 100}%`;
    thumb.style.left = `${p * 100}%`;
    time.textContent = `${fmt(video.currentTime)} / ${fmt(dur())}`;
    if (video.buffered.length) buf.style.width = `${(video.buffered.end(video.buffered.length - 1) / (dur() || 1)) * 100}%`;
  };
  video.addEventListener('timeupdate', paint);
  video.addEventListener('progress', paint);
  video.addEventListener('loadedmetadata', paint);
  video.addEventListener('waiting', () => spinner.classList.remove('tx-hidden'));
  video.addEventListener('playing', () => spinner.classList.add('tx-hidden'));
  video.addEventListener('canplay', () => spinner.classList.add('tx-hidden'));
  video.addEventListener('play', () => { big.classList.add('is-playing'); toggleIcon.className = 'icon icon-pause'; });
  video.addEventListener('pause', () => { big.classList.remove('is-playing'); toggleIcon.className = 'icon icon-play'; });
  video.play().catch(() => big.classList.remove('is-playing'));
  paint();
}

function togglePlay() {
  const v = view && view.video;
  if (!v) return;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}

function bind(el) {
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') return back();
    if (act === 'prev') return show(view.index - 1, -1);
    if (act === 'next') return show(view.index + 1, 1);
    if (act === 'toggle') return togglePlay();
    if (act === 'share') return window.TelegramX.sharePost(view.post.id);
    if (act === 'download') return;
    if (e.target.closest('.tx-seek, .tx-viewer-caption a')) return;
    el.classList.toggle('is-chrome-hidden');
  });

  // Seek bar drag
  const seek = el.querySelector('.tx-seek');
  const seekTo = (clientX) => {
    const v = view && view.video;
    if (!v || !v.duration) return;
    const r = seek.getBoundingClientRect();
    v.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * v.duration;
  };
  seek.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    seek.setPointerCapture(e.pointerId);
    seekTo(e.clientX);
    const move = (ev) => seekTo(ev.clientX);
    seek.addEventListener('pointermove', move);
    seek.addEventListener('pointerup', () => seek.removeEventListener('pointermove', move), { once: true });
  });

  // Gestures on the stage:
  //  - pinch with two fingers / mouse wheel = zoom, drag = pan while zoomed,
  //    double tap = zoom in at that point (or back out), like Telegram;
  //  - not zoomed: swipe left/right = next/prev, drag down = dismiss.
  const stage = el.querySelector('.tx-viewer-stage');
  const bg = el.querySelector('.tx-viewer-bg');
  const pointers = new Map();
  const zoom = { z: 1, tx: 0, ty: 0 };
  let start = null;  // swipe / dismiss
  let pinch = null;
  let pan = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  const MAX_ZOOM = 5;

  const media = () => stage.querySelector('img, video');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const center = () => {
    const r = stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  };
  const applyZoom = (animate) => {
    const m = media();
    if (!m) return;
    m.style.transition = animate ? 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none';
    m.style.transform = zoom.z > 1.001 ? `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.z})` : '';
    el.classList.toggle('is-zoomed', zoom.z > 1.01);
  };
  const clampPan = () => {
    const m = media();
    if (!m) return;
    const c = center();
    const maxX = Math.max(0, (m.offsetWidth * zoom.z - c.w) / 2);
    const maxY = Math.max(0, (m.offsetHeight * zoom.z - c.h) / 2);
    zoom.tx = clamp(zoom.tx, -maxX, maxX);
    zoom.ty = clamp(zoom.ty, -maxY, maxY);
  };
  /** Zoom to `z`, keeping the screen point (px, py) fixed. */
  const zoomAt = (z, px, py, base = { z: zoom.z, tx: zoom.tx, ty: zoom.ty }) => {
    const c = center();
    const nz = clamp(z, 1, MAX_ZOOM);
    const k = nz / base.z;
    zoom.tx = (px - c.x) - (px - c.x - base.tx) * k;
    zoom.ty = (py - c.y) - (py - c.y - base.ty) * k;
    zoom.z = nz;
    if (nz <= 1.001) Object.assign(zoom, { z: 1, tx: 0, ty: 0 });
  };
  const resetZoom = (animate = false) => {
    Object.assign(zoom, { z: 1, tx: 0, ty: 0 });
    pinch = null;
    pan = null;
    applyZoom(animate);
  };
  view.resetZoom = resetZoom;

  const pinchInfo = () => {
    const [a, b2] = [...pointers.values()];
    return { d: Math.hypot(a.x - b2.x, a.y - b2.y) || 1, x: (a.x + b2.x) / 2, y: (a.y + b2.y) / 2 };
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-act]')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size === 2) {
      const p = pinchInfo();
      pinch = { d0: p.d, x0: p.x, y0: p.y, base: { ...zoom } };
      start = null;
      pan = null;
      stage.style.transform = '';
      return;
    }
    if (pointers.size === 1) {
      if (zoom.z > 1.01) pan = { x0: e.clientX, y0: e.clientY, tx0: zoom.tx, ty0: zoom.ty, moved: false };
      else start = { x: e.clientX, y: e.clientY, axis: null, t: Date.now() };
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const p = pinchInfo();
      // scale around the starting midpoint, then follow the fingers' movement
      zoomAt(pinch.base.z * (p.d / pinch.d0), pinch.x0, pinch.y0, pinch.base);
      zoom.tx += p.x - pinch.x0;
      zoom.ty += p.y - pinch.y0;
      if (zoom.z <= 1.001) Object.assign(zoom, { tx: 0, ty: 0 });
      applyZoom(false);
      return;
    }
    if (pan) {
      zoom.tx = pan.tx0 + (e.clientX - pan.x0);
      zoom.ty = pan.ty0 + (e.clientY - pan.y0);
      if (Math.hypot(e.clientX - pan.x0, e.clientY - pan.y0) > 6) pan.moved = true;
      applyZoom(false);
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.axis && Math.hypot(dx, dy) > 8) start.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    if (start.axis === 'y') {
      const k = Math.min(1, Math.abs(dy) / 500);
      stage.style.transform = `translate(${dx * 0.4}px, ${dy}px) scale(${1 - k * 0.25})`;
      bg.style.opacity = String(1 - k);
      el.classList.add('is-chrome-hidden');
    } else if (start.axis === 'x') {
      stage.style.transform = `translateX(${dx}px)`;
    }
  });

  const end = (e) => {
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (!had) return;

    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        if (zoom.z < 1.08) Object.assign(zoom, { z: 1, tx: 0, ty: 0 });
        clampPan();
        applyZoom(true);
        // one finger still down: continue as a pan
        const rest = [...pointers.values()][0];
        if (rest && zoom.z > 1.01) pan = { x0: rest.x, y0: rest.y, tx0: zoom.tx, ty0: zoom.ty, moved: true };
      }
      return;
    }

    if (pan) {
      const moved = pan.moved;
      pan = null;
      clampPan();
      applyZoom(true);
      if (moved) return;
    }

    // Double tap: zoom in at the point / back out
    const now = Date.now();
    const quick = !start || (!start.axis && now - start.t < 300);
    if (quick && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
      lastTap = { t: 0, x: 0, y: 0 };
      start = null;
      if (zoom.z > 1.01) resetZoom(true);
      else {
        zoomAt(2.6, e.clientX, e.clientY);
        clampPan();
        applyZoom(true);
      }
      return;
    }
    if (quick) lastTap = { t: now, x: e.clientX, y: e.clientY };

    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const axis = start.axis;
    start = null;
    if (axis === 'y' && Math.abs(dy) > 110) {
      back();
      return;
    }
    if (axis === 'x' && Math.abs(dx) > 60 && view.items.length > 1) {
      stage.style.transform = '';
      show(view.index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      return;
    }
    if (axis) {
      const current = stage.style.transform;
      stage.style.transform = '';
      stage.animate([{ transform: current }, { transform: 'none' }], { duration: 220, easing: EASE_OPEN });
      bg.animate([{ opacity: bg.style.opacity || 1 }, { opacity: 1 }], { duration: 220 });
      bg.style.opacity = '';
      el.classList.remove('is-chrome-hidden');
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  // Desktop: wheel / trackpad pinch zooms around the cursor.
  stage.addEventListener('wheel', (e) => {
    if (!media()) return;
    e.preventDefault();
    zoomAt(zoom.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX, e.clientY);
    clampPan();
    applyZoom(false);
  }, { passive: false });
}

function back() {
  if (history.state && history.state.viewer) history.back();
  else closeViewer();
}

export function closeViewer() {
  if (!view || view.closing) return;
  const v = view;
  v.closing = true;
  if (v.video) v.video.pause();
  const finish = () => {
    v.el.remove();
    if (view === v) view = null;
    document.body.style.overflow = '';
    resumeVisible();
  };
  try {
    closeAnimated(finish);
  } catch {
    finish();
  }
}

export function isViewerOpen() {
  return !!view;
}

export function viewerKey(e) {
  if (!view) return false;
  if (e.key === 'Escape') back();
  else if (e.key === 'ArrowLeft') show(view.index - 1, -1);
  else if (e.key === 'ArrowRight') show(view.index + 1, 1);
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else return false;
  return true;
}

export function copyMediaLink() {
  if (!view) return;
  navigator.clipboard.writeText(view.post.tg_url).then(() => showToast(t('Ссылка скопирована')));
}
