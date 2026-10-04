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

let view = null; // { post, items, index, el, video }

function fmt(sec) {
  if (!Number.isFinite(sec)) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function dateLabel(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return `сегодня в ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `вчера в ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${time}`;
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
      <button class="tx-icon-btn" data-act="close" title="Назад"><i class="icon icon-arrow-left"></i></button>
      <div class="tx-viewer-title"><b></b><span>${escapeHtml(dateLabel(post.date))}</span></div>
      <button class="tx-icon-btn" data-act="share" title="Поделиться"><i class="icon icon-share-filled"></i></button>
      <a class="tx-icon-btn" data-act="download" title="Скачать" download><i class="icon icon-download"></i></a>
    </div>
    <div class="tx-viewer-counter"></div>
    <div class="tx-viewer-stage"></div>
    <button class="tx-viewer-nav prev" data-act="prev"><i class="icon icon-arrow-left"></i></button>
    <button class="tx-viewer-nav next" data-act="next"><i class="icon icon-arrow-right"></i></button>
    <div class="tx-viewer-bottom">
      <div class="tx-viewer-caption post-text"></div>
      <div class="tx-seek-row tx-hidden">
        <button class="tx-icon-btn" data-act="toggle" title="Пауза"><i class="icon icon-pause"></i></button>
        <div class="tx-seek"><div class="tx-seek-track"><div class="tx-seek-buf"></div><div class="tx-seek-fill"></div></div><div class="tx-seek-thumb"></div></div>
        <span class="tx-seek-time">00:00 / 00:00</span>
      </div>
    </div>`;
  el.querySelector('.tx-viewer-title b').textContent = post.channel?.title || 'Канал';
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
  view.index = (index + items.length) % items.length;
  const item = items[view.index];
  const stage = el.querySelector('.tx-viewer-stage');
  const seekRow = el.querySelector('.tx-seek-row');
  const counter = el.querySelector('.tx-viewer-counter');
  counter.textContent = items.length > 1 ? `${view.index + 1} из ${items.length}` : '';
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

  // Swipe: left/right = next/prev; drag down to dismiss (follows the finger)
  let start = null;
  const stage = el.querySelector('.tx-viewer-stage');
  const bg = el.querySelector('.tx-viewer-bg');
  stage.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, axis: null };
  });
  stage.addEventListener('pointermove', (e) => {
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
  navigator.clipboard.writeText(view.post.tg_url).then(() => showToast('Ссылка скопирована'));
}
