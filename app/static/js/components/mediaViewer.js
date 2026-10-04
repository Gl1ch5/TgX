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
  const post = state.posts.find((p) => p.id === postId) || (state.threadPost && state.threadPost.id === postId ? state.threadPost : null);
  if (!post) return;
  const items = galleryOf(post);
  if (!items.length) return;
  closeViewer();

  const el = document.createElement('div');
  el.className = 'tx-viewer';
  el.innerHTML = `
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
  history.pushState({ ...(history.state || {}), viewer: true }, '');
}

function show(index) {
  if (!view) return;
  const { items, el } = view;
  view.index = (index + items.length) % items.length;
  const item = items[view.index];
  const stage = el.querySelector('.tx-viewer-stage');
  const seekRow = el.querySelector('.tx-seek-row');
  const counter = el.querySelector('.tx-viewer-counter');
  counter.textContent = items.length > 1 ? `${view.index + 1} из ${items.length}` : '';
  el.querySelectorAll('.tx-viewer-nav').forEach((b) => b.classList.toggle('tx-hidden', items.length < 2));
  el.querySelector('[data-act="download"]').href = item.url;

  if (view.video) view.video.pause();
  view.video = null;

  if (item.type === 'photo') {
    stage.innerHTML = `<div class="tx-viewer-spinner"></div><img src="${escapeHtml(item.url)}" alt="" />`;
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
    if (act === 'prev') return show(view.index - 1);
    if (act === 'next') return show(view.index + 1);
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

  // Swipe: left/right = next/prev, down = close
  let start = null;
  const stage = el.querySelector('.tx-viewer-stage');
  stage.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) show(view.index + (dx < 0 ? 1 : -1));
    else if (dy > 90) back();
  });
}

function back() {
  if (history.state && history.state.viewer) history.back();
  else closeViewer();
}

export function closeViewer() {
  if (!view) return;
  if (view.video) view.video.pause();
  view.el.remove();
  view = null;
  document.body.style.overflow = '';
  resumeVisible();
}

export function isViewerOpen() {
  return !!view;
}

export function viewerKey(e) {
  if (!view) return false;
  if (e.key === 'Escape') back();
  else if (e.key === 'ArrowLeft') show(view.index - 1);
  else if (e.key === 'ArrowRight') show(view.index + 1);
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else return false;
  return true;
}

export function copyMediaLink() {
  if (!view) return;
  navigator.clipboard.writeText(view.post.tg_url).then(() => showToast('Ссылка скопирована'));
}
