/**
 * ====================================================================
 * VIEW: WALL — the channel feed, its header, tabs and search
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, formatNumber, escapeHtml, pluralRu } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { getPrefs, isChannelExcluded } from '../core/prefs.js';
import { go } from '../core/nav.js';
import { createPostCardElement, VERIFIED_BADGE_SVG } from '../components/postCard.js';
import { avatarHtml } from '../components/avatar.js';
import { hydrateStickers } from '../components/sticker.js';
import { observeAutoplay } from '../components/autoplay.js';

const $ = (id) => document.getElementById(id);
const show = (el, on) => el && el.classList.toggle('tx-hidden', !on);

// ---------------- Header ----------------

function wallChannels() {
  const p = getPrefs();
  return state.channels.filter((c) => (c.is_broadcast || p.showGroups) && !isChannelExcluded(c.id));
}

export function updateHeader() {
  const ch = state.activeChannelId ? state.channels.find((c) => c.id === state.activeChannelId) : null;
  const stack = $('header-stack');
  const leftIcon = $('header-left-icon');

  if (state.activeChannelId) {
    leftIcon.className = 'icon icon-arrow-left';
    stack.innerHTML = avatarHtml(ch || { id: state.activeChannelId }, 'md');
    stack.querySelector('.tx-avatar').style.boxShadow = 'none';
    $('header-main-title').innerHTML = parseEmojis(ch ? ch.title : 'Канал');
    $('header-verified-badge').innerHTML = ch && ch.verified ? VERIFIED_BADGE_SVG : '';
    const n = ch && ch.participants_count;
    $('header-sub-title').textContent = n
      ? `${formatNumber(n)} ${pluralRu(n, 'подписчик', 'подписчика', 'подписчиков')}`
      : ch && ch.username ? `@${ch.username}` : 'канал';
  } else {
    leftIcon.className = 'icon icon-search';
    const list = wallChannels();
    stack.innerHTML = list.slice(0, 3).map((c) => avatarHtml(c)).join('');
    $('header-main-title').textContent = 'Стена';
    $('header-verified-badge').innerHTML = '';
    $('header-sub-title').textContent = state.isAuth
      ? (list.length ? `${list.length} ${pluralRu(list.length, 'канал', 'канала', 'каналов')}` : 'загрузка каналов…')
      : 'все ваши каналы';
  }
}

export function headerLeft() {
  if (state.activeChannelId) clearChannelFilter();
  else toggleHeaderSearch($('header-search-bar').classList.contains('tx-hidden'));
}

export function headerPill() {
  if (state.activeChannelId) {
    const ch = state.channels.find((c) => c.id === state.activeChannelId);
    if (ch && ch.username) window.open(`https://t.me/${ch.username}`, '_blank', 'noopener');
    return;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function renderUnread() {
  const total = wallChannels().filter((c) => !c.muted).reduce((n, c) => n + (c.unread_count || 0), 0);
  const label = total > 999 ? '999+' : String(total);
  ['dock-unread-badge', 'tab-unread-badge'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.textContent = label;
    show(el, total > 0);
  });
}

function updateTabs() {
  document.querySelectorAll('#feed-tabs .tx-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.feed === state.feedType));
}

// ---------------- Seen tracking (marks posts read in Telegram) ----------------

const seenTimers = new Map();
const seenObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const el = e.target;
    if (e.isIntersecting) {
      if (!seenTimers.has(el)) {
        seenTimers.set(el, setTimeout(() => {
          seenObserver.unobserve(el);
          seenTimers.delete(el);
          api.markSeen(Number(el.dataset.channel), Number(el.dataset.msg));
        }, 900));
      }
    } else if (seenTimers.has(el)) {
      clearTimeout(seenTimers.get(el));
      seenTimers.delete(el);
    }
  }
}, { threshold: 0.5 });

function track(card) {
  if (state.isAuth) seenObserver.observe(card);
}

// ---------------- Feed ----------------

export function renderPosts() {
  const container = $('posts-container');
  if (!container) return;
  container.innerHTML = '';
  seenTimers.forEach(clearTimeout);
  seenTimers.clear();
  appendPosts(state.posts);
}

export function appendPosts(posts) {
  const container = $('posts-container');
  if (!container) return;
  const frag = document.createDocumentFragment();
  const cards = posts.map((p) => createPostCardElement(p));
  cards.forEach((c) => frag.appendChild(c));
  container.appendChild(frag);
  cards.forEach(track);
  hydrateStickers(container);
  observeAutoplay(container);
}

// Telegram-style floating "jump" button (like the chat page-down button):
// glass circle with an arrow and an accent counter of new posts.
let jumpApply = null;
let jumpCount = 0;

function jumpButton() {
  let btn = $('tx-jump');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'tx-jump';
    btn.className = 'tx-jump tx-glass';
    btn.title = 'Наверх';
    btn.innerHTML = '<i class="icon icon-arrow-left"></i><span class="tx-badge tx-hidden"></span>';
    btn.onclick = () => {
      const apply = jumpApply;
      jumpApply = null;
      jumpCount = 0;
      if (apply) apply();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updateJump();
    };
    document.getElementById('app').appendChild(btn);
    window.addEventListener('scroll', updateJump, { passive: true });
  }
  return btn;
}

function updateJump() {
  const btn = jumpButton();
  const badge = btn.querySelector('.tx-badge');
  badge.textContent = jumpCount > 99 ? '99+' : String(jumpCount);
  show(badge, jumpCount > 0);
  btn.classList.toggle('is-visible', jumpCount > 0 || window.scrollY > 1200);
}

function showNewPostsPill(count, apply) {
  jumpCount = count;
  jumpApply = apply;
  updateJump();
}

export async function loadFeed(forceRefresh = false) {
  if (state.isLoadingFeed) return;
  state.isLoadingFeed = true;
  let refreshAfterCache = false;

  const loader = $('feed-loader');
  const sentinelText = $('sentinel-text');
  if (state.posts.length === 0 && state.isAuth) show(loader, true);
  show(sentinelText, false);

  try {
    const data = await api.getFeed({
      feedType: state.feedType,
      channelId: state.activeChannelId,
      searchQuery: state.searchQuery,
      limit: 40,
      refresh: forceRefresh,
    });
    const posts = data.posts || [];
    const apply = () => {
      state.posts = posts;
      state.hasMore = data.has_more || false;
      state.nextOffset = data.next_offset || null;
      renderFeed();
    };

    // Background refresh while the user is reading: offer instead of jumping.
    const prevTop = state.posts[0];
    const fresh = prevTop ? posts.filter((p) => p.timestamp > prevTop.timestamp).length : 0;
    if (forceRefresh && fresh > 0 && window.scrollY > 300 && state.feedType === 'all') {
      showNewPostsPill(fresh, apply);
    } else {
      apply();
    }

    if (data.from_cache && state.isAuth) refreshAfterCache = true;
    if (data.channels && data.channels.length) {
      state.channels = data.channels;
      updateHeader();
      renderUnread();
    }
  } catch (e) {
    console.error('Feed loading error', e);
  } finally {
    show(loader, false);
    state.isLoadingFeed = false;
  }

  if (refreshAfterCache) loadFeed(true);
}

function renderFeed() {
  const container = $('posts-container');
  const sentinelText = $('sentinel-text');
  show($('feed-empty-state'), !state.isAuth && state.posts.length === 0 && state.feedType !== 'favorites');

  if (state.posts.length === 0) {
    const text = state.feedType === 'favorites'
      ? 'Нажмите на пост и выберите «В закладки» — он появится здесь'
      : state.searchQuery ? 'По запросу ничего не найдено' : 'Публикаций пока нет';
    container.innerHTML = state.isAuth || state.feedType === 'favorites'
      ? `<div class="tx-empty"><span class="tx-service">${escapeHtml(text)}</span></div>`
      : '';
    return;
  }
  renderPosts();
  container.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
  if (sentinelText) {
    sentinelText.textContent = state.hasMore ? '' : 'Вы всё прочитали';
    show(sentinelText, !state.hasMore);
  }
}

export async function loadMorePosts() {
  if (state.isLoadingFeed || !state.hasMore || !state.nextOffset) return;
  state.isLoadingFeed = true;
  const spinner = $('sentinel-spinner');
  show(spinner, true);
  try {
    const data = await api.getFeed({
      feedType: state.feedType,
      channelId: state.activeChannelId,
      searchQuery: state.searchQuery,
      offsetDate: state.nextOffset,
      limit: 30,
    });
    const known = new Set(state.posts.map((p) => p.id));
    const fresh = (data.posts || []).filter((p) => !known.has(p.id));
    if (fresh.length) {
      state.posts.push(...fresh);
      state.hasMore = data.has_more;
      state.nextOffset = data.next_offset;
      appendPosts(fresh);
    } else {
      state.hasMore = false;
    }
    const t = $('sentinel-text');
    t.textContent = 'Вы всё прочитали';
    show(t, !state.hasMore);
  } catch (e) {
    console.error('Load more error', e);
  } finally {
    show(spinner, false);
    state.isLoadingFeed = false;
  }
}

export function setupInfiniteScroll() {
  const sentinel = $('feed-sentinel');
  if (!sentinel) return;
  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !state.isLoadingFeed && state.hasMore && state.posts.length) loadMorePosts();
  }, { rootMargin: '800px' }).observe(sentinel);
}

export async function loadChannels(forceRefresh = false) {
  try {
    const data = await api.getChannels(forceRefresh);
    if (data.channels) {
      state.channels = data.channels;
      updateHeader();
      renderUnread();
    }
  } catch (e) {
    console.error('Channels load error', e);
  }
}

// ---------------- Filters ----------------

export function switchFeedType(type) {
  state.feedType = type;
  updateTabs();
  window.scrollTo({ top: 0 });
  loadFeed();
}

export function filterByChannel(channelId) {
  state.activeChannelId = Number(channelId);
  state.feedType = 'all';
  updateTabs();
  updateHeader();
  go('wall');
  window.scrollTo({ top: 0 });
  loadFeed();
}

export function clearChannelFilter() {
  state.activeChannelId = null;
  updateHeader();
  window.scrollTo({ top: 0 });
  loadFeed();
}

export function toggleHeaderSearch(on) {
  show($('header-search-bar'), on);
  if (on) $('search-input').focus();
  else if (state.searchQuery) clearSearch();
}

export function filterByTag(tag) {
  toggleHeaderSearch(true);
  $('search-input').value = '#' + tag;
  doSearch();
}

export function doSearch() {
  state.searchQuery = $('search-input').value.trim();
  loadFeed();
}

export function clearSearch() {
  $('search-input').value = '';
  state.searchQuery = '';
  loadFeed();
}

export function resetFeed() {
  state.feedType = 'all';
  state.searchQuery = '';
  state.activeChannelId = null;
  updateTabs();
  toggleHeaderSearch(false);
  updateHeader();
  loadFeed();
}

export async function refreshFeed() {
  await loadChannels(true);
  await loadFeed(true);
  showToast('Стена обновлена');
}

// ---------------- Live updates ----------------

let pendingLive = [];

function matchesView(p) {
  if (state.searchQuery) return false;
  const ch = state.channels.find((c) => c.id === p.channel_id) || p.channel || {};
  if (!ch.is_broadcast && !getPrefs().showGroups) return false;
  if (state.activeChannelId && p.channel_id !== state.activeChannelId) return false;
  if (!state.activeChannelId && isChannelExcluded(p.channel_id)) return false;
  if (state.feedType === 'media') return ['photo', 'video', 'gif', 'album'].includes(p.media_type);
  return state.feedType === 'all';
}

function prependPosts(posts) {
  const container = $('posts-container');
  if (!container) return;
  const known = new Set(state.posts.map((p) => p.id));
  const fresh = posts.filter((p) => !known.has(p.id)).sort((a, b) => b.timestamp - a.timestamp);
  if (!fresh.length) return;
  state.posts.unshift(...fresh);
  container.querySelector('.tx-empty')?.remove();
  const cards = fresh.map((p) => {
    const card = createPostCardElement(p);
    card.classList.add('tx-appear');
    return card;
  });
  container.prepend(...cards);
  cards.forEach(track);
  hydrateStickers(container);
  observeAutoplay(container);
}

export function onLivePosts(posts) {
  const visible = posts.filter(matchesView);
  if (!visible.length) return;
  const atTop = window.scrollY < 300 && document.getElementById('app').dataset.view === 'wall';
  if (atTop && !pendingLive.length) {
    prependPosts(visible);
    return;
  }
  pendingLive.push(...visible);
  showNewPostsPill(pendingLive.length, () => {
    const batch = pendingLive;
    pendingLive = [];
    prependPosts(batch);
  });
}

export function onLiveEdit(post) {
  const i = state.posts.findIndex((p) => p.id === post.id);
  if (i < 0) return;
  state.posts[i] = { ...post, is_favorite: state.posts[i].is_favorite };
  document.querySelectorAll(`[id="post-card-${post.id}"]`).forEach((old) => {
    const card = createPostCardElement(state.posts[i]);
    old.replaceWith(card);
    hydrateStickers(card);
    observeAutoplay(card);
  });
}

export function onLiveReactions(postId, reactions) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  post.reactions = reactions;
  import('../components/reactions.js').then((m) => m.renderReactions(post));
}

export function onLiveViews(postId, views) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  post.views = views;
  document.querySelectorAll(`[id="post-card-${postId}"] .tx-views`).forEach((el) => { el.textContent = formatNumber(views); });
}
