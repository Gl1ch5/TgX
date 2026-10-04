/**
 * ====================================================================
 * COMPONENT: STORY VIEWER — Telegram-style full-screen stories
 * Progress bars, tap left/right, hold to pause, swipe between people,
 * swipe down to close; opens out of the avatar it was tapped on.
 * ====================================================================
 */

import { api } from '../api.js';
import { escapeHtml, formatPostText, pluralRu } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { avatarHtml } from './avatar.js';
import { pauseAll, resumeVisible } from './autoplay.js';

const PHOTO_MS = 6000;
const EASE = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

let sv = null;

export function isStoryOpen() {
  return !!sv;
}

function reduceMotion() {
  return document.body.classList.contains('tx-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ago(unix) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (s < 60) return 'только что';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${pluralRu(m, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${pluralRu(h, 'час', 'часа', 'часов')} назад`;
  return new Date(unix * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function firstUnread(peer) {
  const i = peer.stories.findIndex((s) => s.id > peer.max_read_id);
  return i < 0 ? 0 : i;
}

/**
 * @param peers   list from api.getStories()
 * @param index   which peer to start with
 * @param opts    { source: element to grow out of, sourceFor(key): element to shrink into, onChange() }
 */
export function openStoryViewer(peers, index, opts = {}) {
  if (sv) closeStoryViewer(true);
  const el = document.createElement('div');
  el.className = 'tx-story';
  el.innerHTML = `
    <div class="tx-story-bg"></div>
    <div class="tx-story-frame">
      <div class="tx-story-media"></div>
      <div class="tx-story-shade"></div>
      <div class="tx-story-bars"></div>
      <div class="tx-story-head">
        <span class="tx-story-peer"></span>
        <span class="tx-story-who"><b></b><span></span></span>
        <button class="tx-story-btn tx-hidden" data-act="mute" title="Звук"><i class="icon icon-speaker-story"></i></button>
        <button class="tx-story-btn" data-act="close" title="Закрыть"><i class="icon icon-close"></i></button>
      </div>
      <div class="tx-story-caption post-text"></div>
      <div class="tx-story-spinner tx-hidden"><span class="animate-spin"><i class="icon icon-reload"></i></span></div>
    </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  pauseAll();

  sv = {
    el, peers, opts,
    pi: index,
    si: opts.storyIndex != null ? opts.storyIndex : firstUnread(peers[index]),
    elapsed: 0,
    duration: PHOTO_MS,
    paused: false,
    held: false,
    ready: false,
    video: null,
    muted: false,
    raf: 0,
    last: 0,
  };
  bind(el);
  show();
  animateOpen(opts.source);
  history.pushState({ ...(history.state || {}), viewer: true, story: true }, '');
  sv.last = performance.now();
  sv.raf = requestAnimationFrame(tick);
}

// ---------------- Rendering ----------------

function peer() {
  return sv.peers[sv.pi];
}

function story() {
  return peer().stories[sv.si];
}

async function fillSkipped(p) {
  const ids = p.stories.filter((s) => s.skipped).map((s) => s.id);
  if (!ids.length) return;
  const full = await api.getStoriesById(p.key, ids);
  const byId = new Map(full.map((s) => [s.id, s]));
  p.stories = p.stories.map((s) => byId.get(s.id) || s).filter((s) => !s.skipped);
}

function renderBars() {
  const p = peer();
  sv.el.querySelector('.tx-story-bars').innerHTML = p.stories
    .map((_, i) => `<span class="tx-story-bar"><i style="transform:scaleX(${i < sv.si ? 1 : 0})"></i></span>`)
    .join('');
}

function setProgress(f) {
  const bar = sv.el.querySelectorAll('.tx-story-bar i')[sv.si];
  if (bar) bar.style.transform = `scaleX(${Math.min(1, f)})`;
}

async function show() {
  const p = peer();
  const s = story();
  const el = sv.el;
  sv.elapsed = 0;
  sv.ready = false;
  sv.duration = PHOTO_MS;
  if (sv.video) {
    sv.video.pause();
    sv.video.removeAttribute('src');
    sv.video.load();
    sv.video = null;
  }

  el.querySelector('.tx-story-peer').innerHTML = avatarHtml({ id: p.id, title: p.title, avatar: p.avatar }, 'sm');
  el.querySelector('.tx-story-who b').innerHTML = parseEmojis(p.is_self ? 'Моя история' : p.title);
  el.querySelector('.tx-story-who span').textContent = s ? ago(s.date) : '';
  renderBars();

  const media = el.querySelector('.tx-story-media');
  const caption = el.querySelector('.tx-story-caption');
  const spinner = el.querySelector('.tx-story-spinner');

  if (!s || s.skipped) {
    media.innerHTML = '';
    caption.innerHTML = '';
    spinner.classList.remove('tx-hidden');
    const at = { pi: sv.pi, si: sv.si };
    try {
      await fillSkipped(p);
    } catch (e) {
      console.warn('[TeleX] story load', e);
    }
    if (!sv || sv.pi !== at.pi || sv.si !== at.si) return;
    if (story() && !story().skipped) show();
    else next();
    return;
  }

  caption.innerHTML = s.caption ? formatPostText(s.caption, s.caption_html) : '';
  caption.classList.toggle('tx-hidden', !s.caption);
  spinner.classList.remove('tx-hidden');
  el.querySelector('[data-act="mute"]').classList.toggle('tx-hidden', s.type !== 'video');

  if (s.type === 'video') {
    const v = document.createElement('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.muted = sv.muted;
    if (s.thumb_url) v.poster = s.thumb_url;
    v.src = s.url;
    v.addEventListener('playing', () => { spinner.classList.add('tx-hidden'); sv && (sv.ready = true); });
    v.addEventListener('waiting', () => { if (sv) sv.ready = false; spinner.classList.remove('tx-hidden'); });
    v.addEventListener('loadedmetadata', () => { if (sv && isFinite(v.duration)) sv.duration = v.duration * 1000; });
    v.addEventListener('ended', () => next());
    media.replaceChildren(v);
    sv.video = v;
    if (s.duration) sv.duration = s.duration * 1000;
    playVideo(v);
  } else {
    const img = new Image();
    img.decoding = 'async';
    img.alt = '';
    img.onload = () => { if (sv && media.contains(img)) { sv.ready = true; spinner.classList.add('tx-hidden'); } };
    img.onerror = () => { if (sv && media.contains(img)) { sv.ready = true; spinner.classList.add('tx-hidden'); } };
    img.src = s.url;
    media.replaceChildren(img);
  }
  updateMuteIcon();
  markRead(p, s);
  preloadNext();
}

function playVideo(v) {
  if (sv.paused || sv.held) return;
  v.play().catch(() => {
    if (!sv || sv.video !== v) return;
    sv.muted = true;
    v.muted = true;
    updateMuteIcon();
    v.play().catch(() => {});
  });
}

function updateMuteIcon() {
  const i = sv.el.querySelector('[data-act="mute"] i');
  i.className = `icon ${sv.muted ? 'icon-speaker-muted-story' : 'icon-speaker-story'}`;
}

function preloadNext() {
  const p = peer();
  const nextStory = p.stories[sv.si + 1] || (sv.peers[sv.pi + 1] && sv.peers[sv.pi + 1].stories[firstUnread(sv.peers[sv.pi + 1])]);
  if (nextStory && !nextStory.skipped) {
    const img = new Image();
    img.src = nextStory.type === 'video' ? nextStory.thumb_url || '' : nextStory.url;
  }
}

const readTimers = new Map();
function markRead(p, s) {
  if (p.is_self || s.id <= p.max_read_id) return;
  p.max_read_id = s.id;
  p.unread = p.stories.some((x) => x.id > p.max_read_id);
  clearTimeout(readTimers.get(p.key));
  readTimers.set(p.key, setTimeout(() => api.readStories(p.key, p.max_read_id), 400));
  sv.opts.onChange && sv.opts.onChange();
}

// ---------------- Timing ----------------

function tick(now) {
  if (!sv) return;
  const dt = now - sv.last;
  sv.last = now;
  if (!sv.paused && !sv.held && sv.ready) {
    if (sv.video) {
      const d = sv.video.duration;
      setProgress(isFinite(d) && d > 0 ? sv.video.currentTime / d : 0);
    } else {
      sv.elapsed += dt;
      setProgress(sv.elapsed / sv.duration);
      if (sv.elapsed >= sv.duration) {
        next();
      }
    }
  }
  sv.raf = requestAnimationFrame(tick);
}

function setHeld(on) {
  sv.held = on;
  sv.el.classList.toggle('is-held', on);
  if (sv.video) {
    if (on) sv.video.pause();
    else playVideo(sv.video);
  }
}

// ---------------- Navigation ----------------

function next() {
  if (!sv) return;
  if (sv.si < peer().stories.length - 1) {
    sv.si += 1;
    show();
  } else nextPeer();
}

function prev() {
  if (!sv) return;
  if (sv.si > 0) {
    sv.si -= 1;
    show();
  } else if (sv.pi > 0) {
    switchPeer(-1, true);
  } else {
    sv.elapsed = 0;
    if (sv.video) sv.video.currentTime = 0;
  }
}

function nextPeer() {
  if (sv.pi < sv.peers.length - 1) switchPeer(1);
  else history.back();
}

function switchPeer(dir, toLast = false) {
  const frame = sv.el.querySelector('.tx-story-frame');
  sv.pi += dir;
  const p = peer();
  sv.si = toLast ? p.stories.length - 1 : firstUnread(p);
  if (reduceMotion()) {
    show();
    return;
  }
  // A quick "cube" turn between people, like Telegram.
  const out = frame.animate([
    { transform: 'none', opacity: 1 },
    { transform: `perspective(1200px) translateX(${-dir * 30}%) rotateY(${dir * 50}deg) scale(0.9)`, opacity: 0.2 },
  ], { duration: 170, easing: 'ease-in' });
  out.onfinish = () => {
    if (!sv) return;
    show();
    frame.animate([
      { transform: `perspective(1200px) translateX(${dir * 30}%) rotateY(${-dir * 50}deg) scale(0.9)`, opacity: 0.2 },
      { transform: 'none', opacity: 1 },
    ], { duration: 260, easing: EASE });
  };
}

// ---------------- Gestures ----------------

function bind(el) {
  const frame = el.querySelector('.tx-story-frame');
  let start = null;
  let holdTimer = null;

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.act === 'close') history.back();
    if (btn.dataset.act === 'mute') {
      sv.muted = !sv.muted;
      if (sv.video) sv.video.muted = sv.muted;
      updateMuteIcon();
    }
  });

  frame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-act], a')) return;
    start = { x: e.clientX, y: e.clientY, t: Date.now(), dx: 0, dy: 0, axis: null };
    holdTimer = setTimeout(() => setHeld(true), 220);
    frame.setPointerCapture?.(e.pointerId);
  });
  frame.addEventListener('pointermove', (e) => {
    if (!start) return;
    start.dx = e.clientX - start.x;
    start.dy = e.clientY - start.y;
    if (!start.axis && Math.hypot(start.dx, start.dy) > 10) {
      start.axis = Math.abs(start.dy) > Math.abs(start.dx) ? 'y' : 'x';
      clearTimeout(holdTimer);
      setHeld(true);
    }
    if (start.axis === 'y' && start.dy > 0) {
      const k = Math.min(1, start.dy / 400);
      frame.style.transform = `translateY(${start.dy}px) scale(${1 - k * 0.15})`;
      el.querySelector('.tx-story-bg').style.opacity = String(1 - k);
    } else if (start.axis === 'x') {
      frame.style.transform = `translateX(${start.dx * 0.35}px)`;
    }
  });
  const end = () => {
    if (!start) return;
    clearTimeout(holdTimer);
    const s = start;
    start = null;
    const wasHeld = sv.held;
    if (s.axis === 'y' && s.dy > 110) {
      history.back();
      return;
    }
    frame.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)';
    frame.style.transform = '';
    el.querySelector('.tx-story-bg').style.opacity = '';
    setTimeout(() => { frame.style.transition = ''; }, 240);
    setHeld(false);
    if (s.axis === 'x' && Math.abs(s.dx) > 60) {
      if (s.dx < 0) nextPeer();
      else if (sv.pi > 0) switchPeer(-1);
      return;
    }
    if (s.axis || (wasHeld && Date.now() - s.t > 250)) return;
    const rect = frame.getBoundingClientRect();
    if (s.x - rect.left < rect.width / 3) prev();
    else next();
  };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);
}

export function storyKey(e) {
  if (!sv) return false;
  if (e.key === 'Escape') history.back();
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === ' ') {
    sv.paused = !sv.paused;
    if (sv.video) sv.paused ? sv.video.pause() : playVideo(sv.video);
  } else return false;
  e.preventDefault();
  return true;
}

// ---------------- Open / close animation ----------------

function morphFrom(target) {
  const frame = sv.el.querySelector('.tx-story-frame');
  const a = target && target.getBoundingClientRect();
  const b = frame.getBoundingClientRect();
  if (!a || !a.width || !b.width) return null;
  const s = a.width / b.width;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2);
  const dy = a.top + a.height / 2 - (b.top + b.height / 2);
  return { transform: `translate(${dx}px, ${dy}px) scale(${s}, ${a.height / b.height})`, borderRadius: `${b.width / 2}px / ${b.height / 2}px` };
}

function animateOpen(source) {
  if (reduceMotion()) return;
  const frame = sv.el.querySelector('.tx-story-frame');
  const from = morphFrom(source) || { transform: 'scale(0.85)', borderRadius: '24px' };
  frame.animate([{ ...from, opacity: 0.4 }, { transform: 'none', borderRadius: getComputedStyle(frame).borderRadius, opacity: 1 }], { duration: 320, easing: EASE });
  sv.el.querySelector('.tx-story-bg').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  sv.el.querySelectorAll('.tx-story-head, .tx-story-bars, .tx-story-caption').forEach((n) => n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 80, fill: 'backwards' }));
}

export function closeStoryViewer(instant = false) {
  if (!sv) return;
  const { el, opts } = sv;
  const key = peer().key;
  cancelAnimationFrame(sv.raf);
  if (sv.video) sv.video.pause();
  sv = null;
  document.body.style.overflow = '';
  resumeVisible();
  if (instant || reduceMotion()) {
    el.remove();
    return;
  }
  const frame = el.querySelector('.tx-story-frame');
  const target = opts.sourceFor ? opts.sourceFor(key) : null;
  const visible = target && target.getBoundingClientRect().bottom > 0;
  const to = (visible && (() => {
    const a = target.getBoundingClientRect();
    const b = frame.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    return { transform: `translate(${dx}px, ${dy}px) scale(${a.width / b.width}, ${a.height / b.height})`, borderRadius: `${b.width / 2}px / ${b.height / 2}px`, opacity: 0.3 };
  })()) || { transform: `${frame.style.transform || ''} scale(0.85)`, opacity: 0 };
  el.style.pointerEvents = 'none';
  el.querySelectorAll('.tx-story-head, .tx-story-bars, .tx-story-caption').forEach((n) => { n.style.opacity = '0'; });
  el.querySelector('.tx-story-bg').animate([{ opacity: getComputedStyle(el.querySelector('.tx-story-bg')).opacity }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
  const anim = frame.animate([{ transform: frame.style.transform || 'none', opacity: 1 }, to], { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}
