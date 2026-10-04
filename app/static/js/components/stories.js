/**
 * ====================================================================
 * COMPONENT: STORIES BAR — Telegram's main-screen header
 * Collapsed: a stack of ringed avatars next to the "TeleX" title.
 * Pull down at the top: the full row of story avatars with names,
 * which folds back into the stack as you scroll.
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { escapeHtml, showToast, haptic } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { avatarHtml } from './avatar.js';
import { openStoryViewer } from './storyViewer.js';

const $ = (id) => document.getElementById(id);
const ROW_H = 100;
const REFRESH_MS = 5 * 60 * 1000;

let expanded = false;
let lastLoad = 0;

/** Segmented ring like Telegram: one arc per story, colored while unseen. */
export function storyRing(peer) {
  const n = Math.max(1, peer.stories.length);
  const gap = n > 1 ? Math.min(12, 90 / n) : 0;
  const seg = 360 / n;
  let arcs = '';
  for (let i = 0; i < n; i++) {
    const s = peer.stories[i];
    const unread = s && s.id > peer.max_read_id;
    const len = Math.max(1, seg - gap);
    const stroke = unread ? (s.close_friends ? 'url(#tx-story-cf)' : 'url(#tx-story-grad)') : 'var(--tx-story-read)';
    arcs += `<circle cx="50" cy="50" r="47" pathLength="360" stroke="${stroke}" stroke-dasharray="${len} ${360 - len}" stroke-dashoffset="${-(i * seg + gap / 2)}" class="${unread ? 'is-unread' : ''}"/>`;
  }
  return `<svg class="tx-story-ring" viewBox="0 0 100 100" aria-hidden="true">${arcs}</svg>`;
}

function stackPeers() {
  const peers = (state.stories || []).filter((p) => !p.is_self);
  const list = peers.length ? peers : state.stories || [];
  return list.slice(0, 3);
}

function tileHtml(peer) {
  return `
    <button class="tx-story-tile ${peer.unread ? 'is-unread' : ''}" data-key="${escapeHtml(peer.key)}">
      <span class="tx-story-ava">${storyRing(peer)}${avatarHtml(peer)}</span>
      <span class="tx-story-name">${parseEmojis(peer.name)}</span>
    </button>`;
}

function selfTileHtml() {
  const me = state.user || {};
  return `
    <button class="tx-story-tile is-self" data-key="self">
      <span class="tx-story-ava">${avatarHtml({ id: me.id, name: me.name, avatar: me.avatar })}<span class="tx-story-add"><i class="icon icon-add"></i></span></span>
      <span class="tx-story-name">Моя история</span>
    </button>`;
}

export function renderStories() {
  const top = $('wall-top');
  if (!top) return;
  const peers = state.stories || [];
  const has = state.isAuth && peers.length > 0;
  top.classList.toggle('has-stories', has);

  $('stories-stack').innerHTML = has
    ? stackPeers().map((p) => `<span class="tx-stack-item ${p.unread ? 'is-unread' : ''}">${storyRing(p)}${avatarHtml(p)}</span>`).join('')
    : '';

  const self = peers.find((p) => p.is_self);
  const others = peers.filter((p) => !p.is_self);
  $('stories-row').querySelector('.tx-stories-scroll').innerHTML = has
    ? (self ? tileHtml(self) : selfTileHtml()) + others.map(tileHtml).join('')
    : '';
  if (!has && expanded) setExpanded(false);
  applyProgress();
}

export async function loadStories(force = false) {
  if (!state.isAuth) return;
  if (!force && Date.now() - lastLoad < 30000) return;
  lastLoad = Date.now();
  try {
    state.stories = await api.getStories();
    renderStories();
  } catch (e) {
    console.warn('[TeleX] stories', e);
  }
}

// ---------------- Opening ----------------

function openPeer(key, sourceEl) {
  const peers = state.stories || [];
  const idx = peers.findIndex((p) => p.key === key);
  if (idx < 0) return;
  openStoryViewer(peers, idx, {
    source: sourceEl,
    sourceFor: (k) => {
      const tile = expanded && document.querySelector(`.tx-story-tile[data-key="${CSS.escape(k)}"] .tx-avatar`);
      return tile || document.querySelector('#stories-stack .tx-avatar');
    },
    onChange: renderStories,
  });
}

export function openStackStories() {
  const peers = (state.stories || []).filter((p) => !p.is_self);
  const first = peers.find((p) => p.unread) || peers[0];
  if (first) openPeer(first.key, $('stories-stack').querySelector('.tx-avatar'));
}

// ---------------- Expand / collapse ----------------

function applyProgress() {
  const top = $('wall-top');
  if (!top) return;
  const p = expanded ? Math.min(1, Math.max(0, window.scrollY / ROW_H)) : 1;
  top.style.setProperty('--story-p', p.toFixed(3));
  top.classList.toggle('is-expanded', expanded);
}

function setExpanded(on, { instant = false } = {}) {
  if (expanded === on) return;
  const top = $('wall-top');
  if (on && !top.classList.contains('has-stories')) return;
  const stackRect = $('stories-stack').getBoundingClientRect();
  expanded = on;
  applyProgress();
  if (on) {
    if (!instant) animateExpand(stackRect);
    loadStories();
  }
}

/** Avatars fly out of the stack into the row, the row opens, the stack fades. */
function animateExpand(stackRect) {
  if (document.body.classList.contains('tx-reduce-motion')) return;
  const ease = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
  $('stories-row').animate([{ height: '0px' }, { height: `${ROW_H}px` }], { duration: 340, easing: ease });
  $('stories-stack').animate([{ maxWidth: '110px', marginRight: '12px', opacity: 1, transform: 'none' }, { maxWidth: '0px', marginRight: '0px', opacity: 0, transform: 'scale(0.6)' }], { duration: 300, easing: ease });
  const tiles = [...$('stories-row').querySelectorAll('.tx-story-tile')];
  tiles.forEach((tile, i) => {
    const r = tile.getBoundingClientRect();
    const fromX = stackRect.width ? stackRect.left + Math.min(i, 2) * 22 + 18 - (r.left + r.width / 2) : -40;
    const fromY = stackRect.height ? stackRect.top + stackRect.height / 2 - (r.top + 38) : -60;
    tile.animate([
      { opacity: 0, transform: `translate(${fromX}px, ${fromY}px) scale(0.5)` },
      { opacity: 1, transform: 'none' },
    ], { duration: 380, delay: Math.min(i, 6) * 18, easing: ease, fill: 'backwards' });
  });
}

export function setupStoriesBar() {
  const top = $('wall-top');
  if (!top) return;

  top.querySelector('.tx-stories-scroll').addEventListener('click', (e) => {
    const tile = e.target.closest('.tx-story-tile');
    if (!tile) return;
    if (tile.dataset.key === 'self') {
      showToast('Публикуйте истории в приложении Telegram — здесь они появятся сразу');
      return;
    }
    openPeer(tile.dataset.key, tile.querySelector('.tx-avatar'));
  });

  // Pull down at the very top to reveal the row (touch) or scroll up (wheel).
  let startY = null;
  window.addEventListener('touchstart', (e) => {
    startY = window.scrollY <= 0 && document.getElementById('app').dataset.view === 'wall' ? e.touches[0].clientY : null;
  }, { passive: true });
  // Pull at the top: first the stories open; pulling again refreshes the feed.
  window.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    const hasStories = top.classList.contains('has-stories') && !state.activeChannelId;
    if (!expanded && hasStories && dy > 56) {
      startY = null;
      haptic();
      setExpanded(true);
    } else if ((expanded || !hasStories) && dy > 110) {
      startY = null;
      haptic(12);
      window.TelegramX.refreshFeed();
    }
  }, { passive: true });
  let wheelPull = 0;
  window.addEventListener('wheel', (e) => {
    if (expanded || state.activeChannelId || window.scrollY > 0 || document.getElementById('app').dataset.view !== 'wall') {
      wheelPull = 0;
      return;
    }
    wheelPull = e.deltaY < 0 ? wheelPull - e.deltaY : 0;
    if (wheelPull > 80) {
      wheelPull = 0;
      setExpanded(true);
    }
  }, { passive: true });

  // Scrolling folds the row into the stack; once it is fully hidden, drop it
  // from the layout and compensate the scroll so nothing jumps.
  let snapTimer = null;
  window.addEventListener('scroll', () => {
    top.classList.toggle('is-scrolled', window.scrollY > 4);
    if (!expanded) return;
    applyProgress();
    if (window.scrollY >= ROW_H) {
      expanded = false;
      applyProgress();
      window.scrollTo(0, window.scrollY - ROW_H);
      return;
    }
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      if (!expanded || window.scrollY <= 0 || window.scrollY >= ROW_H) return;
      window.scrollTo({ top: window.scrollY > ROW_H / 2 ? ROW_H : 0, behavior: 'smooth' });
    }, 140);
  }, { passive: true });

  setInterval(() => { if (document.visibilityState === 'visible') loadStories(true); }, REFRESH_MS);
  window.addEventListener('tx:resume', () => loadStories());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadStories(); });
}
