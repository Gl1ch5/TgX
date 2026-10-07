/**
 * ====================================================================
 * VIEW: WALL — the channel feed, its header, tabs and search
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { ext } from '../core/ext.js';
import { postNative } from '../core/devtools.js';
import { showToast, formatNumber, escapeHtml } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { getPrefs, isChannelExcluded } from '../core/prefs.js';
import { go } from '../core/nav.js';
import { channelFull, cachedChannelFull, openChannelPage, toggleChannelMute, copyChannelLink, leaveChannelConfirm } from './channel.js';
import { openPopup } from '../components/postMenu.js';
import { createPostCardElement, VERIFIED_BADGE_SVG } from '../components/postCard.js';
import { avatarHtml } from '../components/avatar.js';
import { hydrateStickers } from '../components/sticker.js';
import { observeAutoplay } from '../components/autoplay.js';
import { warmComments } from './thread.js';
import { t, tn } from '../i18n.js';

const $ = (id) => document.getElementById(id);
const show = (el, on) => el && el.classList.toggle('tx-hidden', !on);

// ---------------- Header ----------------

function wallChannels() {
  const p = getPrefs();
  return state.channels.filter((c) => (c.is_broadcast || p.showGroups) && !isChannelExcluded(c.id));
}

export function updateHeader() {
  const ch = state.activeChannelId ? state.channels.find((c) => c.id === state.activeChannelId) : null;
  $('screen-wall').classList.toggle('is-channel', !!state.activeChannelId);
  if (!state.activeChannelId) return;

  const stack = $('header-stack');
  stack.innerHTML = avatarHtml(ch || { id: state.activeChannelId }, 'md');
  stack.querySelector('.tx-avatar').style.boxShadow = 'none';
  $('header-main-title').innerHTML = parseEmojis(ch ? ch.title : t('Канал'));
  $('header-verified-badge').innerHTML = ch && ch.verified ? VERIFIED_BADGE_SVG : '';
  const n = ch && ch.participants_count;
  $('header-sub-title').textContent = n
    ? tn(['{n} подписчик', '{n} подписчика', '{n} подписчиков'], n, { n: formatNumber(n) })
    : ch && ch.username ? `@${ch.username}` : t('канал');
  renderChannelExtras();
  const id = state.activeChannelId;
  if (!cachedChannelFull(id) && state.isAuth) channelFull(id).then(() => { if (state.activeChannelId === id) renderChannelExtras(); }).catch(() => {});
}

/** Pinned message bar and the bottom "mute" pill of the channel view. */
function renderChannelExtras() {
  const id = state.activeChannelId;
  const full = cachedChannelFull(id);
  const ch = state.channels.find((c) => c.id === id) || full || {};
  const bar = $('channel-pinned');
  const pin = full && full.pinned;
  if (pin) {
    bar.innerHTML = `
      <span class="tx-pinned-line"></span>
      ${pin.thumb ? `<img class="tx-pinned-thumb" src="${escapeHtml(pin.thumb)}" alt="" />` : ''}
      <span class="tx-pinned-body"><b>${t('Закреплённое сообщение')}</b><span>${pin.kind ? `<em>${pin.kind}</em> ` : ''}${parseEmojis(pin.text || '')}</span></span>
      <i class="icon icon-pin tx-pinned-icon"></i>`;
  }
  show(bar, !!pin);
  const muted = full ? full.muted : ch.muted;
  $('channel-mute-btn').textContent = muted ? t('Включить звук') : t('Убрать звук');
}

export function activeChannel() {
  return state.activeChannelId;
}

export async function toggleWallChannelMute() {
  await toggleChannelMute(state.activeChannelId);
  renderChannelExtras();
}

export function jumpToPinned() {
  const full = cachedChannelFull(state.activeChannelId);
  if (!full || !full.pinned) return;
  const card = $(`post-card-${state.activeChannelId}_${full.pinned.msg_id}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const b = card.querySelector('.tx-bubble');
    b.classList.remove('is-highlight');
    void b.offsetWidth;
    b.classList.add('is-highlight');
    return;
  }
  const ch = state.channels.find((c) => c.id === state.activeChannelId) || full;
  window.open(ch.username ? `https://t.me/${ch.username}/${full.pinned.msg_id}` : `https://t.me/c/${state.activeChannelId}/${full.pinned.msg_id}`, '_blank', 'noopener');
}

export function openChannelMenu(event) {
  const id = state.activeChannelId;
  const ch = state.channels.find((c) => c.id === id) || {};
  const full = cachedChannelFull(id);
  const muted = full ? full.muted : ch.muted;
  openPopup(event.currentTarget, {
    items: [
      { icon: muted ? 'unmute' : 'mute', label: muted ? t('Включить уведомления') : t('Выключить уведомления'), run: toggleWallChannelMute },
      { icon: 'search', label: t('Поиск'), run: () => toggleHeaderSearch(true) },
      { icon: 'info-filled', label: t('Информация о канале'), run: () => openChannelPage(id) },
      { icon: 'link', label: t('Копировать ссылку'), run: () => copyChannelLink(id) },
      { icon: 'open-in-new-tab', label: t('Открыть в Telegram'), run: () => window.open(ch.username ? `https://t.me/${ch.username}` : `https://t.me/c/${id}`, '_blank', 'noopener') },
      { icon: 'logout', label: t('Покинуть канал'), danger: true, run: () => leaveChannelConfirm(id) },
    ],
  });
}

export function headerLeft() {
  if (state.activeChannelId) clearChannelFilter();
}

export function headerPill() {
  if (state.activeChannelId) {
    openChannelPage(state.activeChannelId);
    return;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Search icon in the bar: bring the search pill back and focus it. */
export function focusSearch() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => $('search-input').focus({ preventScroll: true }), 260);
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

let tabsObserver = null;

/** Put the sliding pill under the active tab (called on switch and whenever a tab changes size, e.g. its badge appears). */
function placeIndicator(animate = true) {
  const nav = $('feed-tabs');
  const ind = nav && nav.querySelector('.tx-tab-ind');
  const active = nav && nav.querySelector('.tx-tab.is-active');
  if (!ind || !active || !active.offsetWidth) return;
  if (!animate) ind.style.transition = 'none';
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  if (!animate) requestAnimationFrame(() => { ind.style.transition = ''; });
}

function updateTabs() {
  const nav = $('feed-tabs');
  if (!nav) return;
  let active = null;
  nav.querySelectorAll('.tx-tab').forEach((t) => { const on = t.dataset.feed === state.feedType; t.classList.toggle('is-active', on); if (on) active = t; });
  // a pill slides under the active tab
  let ind = nav.querySelector('.tx-tab-ind');
  if (!ind) { ind = document.createElement('i'); ind.className = 'tx-tab-ind'; nav.prepend(ind); nav.classList.add('has-ind'); }
  if (!tabsObserver && window.ResizeObserver) {
    // a badge appearing or changing width resizes its tab: the pill follows without animating
    tabsObserver = new ResizeObserver(() => placeIndicator(false));
    nav.querySelectorAll('.tx-tab').forEach((t) => tabsObserver.observe(t));
  }
  const first = !ind.dataset.ready;
  placeIndicator(!first);
  ind.dataset.ready = '1';
  if (active && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2, behavior: reduceMotion() ? 'auto' : 'smooth' });
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

// Posts that stay on screen get their comments loaded in the background.
const warmTimers = new Map();
const warmObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const el = e.target;
    if (e.isIntersecting) {
      if (!warmTimers.has(el)) {
        warmTimers.set(el, setTimeout(() => {
          warmTimers.delete(el);
          warmComments(el.dataset.post);
        }, 500));
      }
    } else if (warmTimers.has(el)) {
      clearTimeout(warmTimers.get(el));
      warmTimers.delete(el);
    }
  }
}, { threshold: 0.3 });

function track(card) {
  if (!state.isAuth) return;
  seenObserver.observe(card);
  if (card.dataset.post && card.querySelector('.tx-comments-row')) warmObserver.observe(card);
}

// ---------------- Feed ----------------

export function renderPosts() {
  const container = $('posts-container');
  if (!container) return;
  container.innerHTML = '';
  seenTimers.forEach(clearTimeout);
  seenTimers.clear();
  warmTimers.forEach(clearTimeout);
  warmTimers.clear();
  warmObserver.disconnect();
  appendPosts(state.posts);
}

function reduceMotion() {
  return document.body.classList.contains('tx-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A new post slides in like a new message in Telegram: the space opens
 * smoothly (posts below glide down), the bubble grows in, and a soft
 * gradient sheen sweeps across it once.
 */
function animateArrival(card, i = 0) {
  if (reduceMotion()) return;
  const h = card.offsetHeight;
  const ease = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
  card.style.overflow = 'hidden';
  const a = card.animate([
    { height: '0px', opacity: 0, marginBottom: '0px' },
    { height: `${h}px`, opacity: 1, marginBottom: getComputedStyle(card).marginBottom },
  ], { duration: 420, delay: i * 70, easing: ease, fill: 'backwards' });
  const bubble = card.querySelector('.tx-bubble');
  bubble?.animate([
    { transform: 'translateY(-10px) scale(0.96)', transformOrigin: 'left top' },
    { transform: 'none', transformOrigin: 'left top' },
  ], { duration: 460, delay: i * 70, easing: ease, fill: 'backwards' });
  a.finished.then(() => {
    card.style.overflow = '';
    bubble?.classList.add('tx-sheen');
    setTimeout(() => bubble?.classList.remove('tx-sheen'), 1300);
  }, () => {});
}

/** First paint of the feed: cards rise in one after another. */
function staggerIn(cards) {
  if (reduceMotion()) return;
  cards.slice(0, 6).forEach((card, i) => {
    card.style.setProperty('--i', i);
    card.classList.add('tx-enter');
    card.addEventListener('animationend', () => card.classList.remove('tx-enter'), { once: true });
  });
}

let firstRender = true;

export function appendPosts(posts) {
  const container = $('posts-container');
  if (!container) return;
  const frag = document.createDocumentFragment();
  const cards = posts.map((p) => createPostCardElement(p));
  if (firstRender && cards.length) {
    firstRender = false;
    staggerIn(cards);
  }
  cards.forEach((c) => frag.appendChild(c));
  container.appendChild(frag);
  cards.forEach(track);
  cards.forEach((c, i) => ext.emit('post', { el: c, post: posts[i] }));
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
    btn.title = t('Наверх');
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
    let raf = 0;
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateJump(); }); }, { passive: true });
  }
  return btn;
}

function updateJump() {
  const btn = jumpButton();
  // back at the top by hand: the waiting posts simply appear, no need to press the button
  if (jumpApply && window.scrollY < 120 && document.getElementById('app').dataset.view === 'wall') {
    const apply = jumpApply;
    jumpApply = null;
    jumpCount = 0;
    apply();
  }
  const badge = btn.querySelector('.tx-badge');
  const label = jumpCount > 99 ? '99+' : String(jumpCount);
  if (badge.textContent !== label) badge.textContent = label;
  show(badge, jumpCount > 0);
  btn.classList.toggle('is-visible', jumpCount > 0 || window.scrollY > 1200);
}

function showNewPostsPill(count, apply) {
  jumpCount = count;
  jumpApply = apply;
  updateJump();
}

let feedToken = 0;
let updateAsked = false;
let loadingView = '';
const viewKey = () => `${state.feedType}|${state.activeChannelId}|${state.searchQuery}`;

export async function loadFeed(forceRefresh = false) {
  // The same view is already loading: nothing to do. A different view (tab switched meanwhile) always starts.
  if (state.isLoadingFeed && loadingView === viewKey()) return;
  state.isLoadingFeed = true;
  loadingView = viewKey();
  const token = ++feedToken;
  let refreshAfterCache = false;

  const loader = $('feed-loader');
  const sentinelText = $('sentinel-text');
  if (state.posts.length === 0 && state.isAuth) { show(loader, true); document.querySelector('#posts-container > .sk-wrap')?.remove(); }
  show(sentinelText, false);

  // Nothing on screen yet: paint channels as they arrive (text first, media streams in after).
  const progressive = state.posts.length === 0 || !!state.activeChannelId || !!state.searchQuery;
  const view = `${state.feedType}|${state.activeChannelId}|${state.searchQuery}`;
  try {
    const data = await api.getFeed({
      feedType: state.feedType,
      channelId: state.activeChannelId,
      searchQuery: state.searchQuery,
      limit: 40,
      refresh: forceRefresh,
      onPartial: progressive ? (partial) => {
        if (view !== `${state.feedType}|${state.activeChannelId}|${state.searchQuery}`) return;
        state.posts = partial.posts || [];
        state.hasMore = false;
        show(loader, false);
        renderFeed();
      } : null,
    });
    if (token !== feedToken) return; // another tab was opened while this one loaded
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
    if (token === feedToken) {
      show(loader, false);
      state.isLoadingFeed = false;
    }
  }

  if (!updateAsked && state.posts.length) { updateAsked = true; postNative('updateCheck'); } // Android app: look for a new version (tiny request, throttled natively)
  if (refreshAfterCache && token === feedToken) loadFeed(true);
}

function renderFeed() {
  const container = $('posts-container');
  const sentinelText = $('sentinel-text');
  show($('feed-empty-state'), !state.isAuth && state.posts.length === 0 && state.feedType !== 'favorites');

  if (state.posts.length === 0) {
    const text = state.feedType === 'favorites'
      ? t('Нажмите на пост и выберите «В закладки» — он появится здесь')
      : state.searchQuery ? t('По запросу ничего не найдено') : t('Публикаций пока нет');
    container.innerHTML = state.isAuth || state.feedType === 'favorites'
      ? `<div class="tx-empty"><span class="tx-service">${escapeHtml(text)}</span></div>`
      : '';
    return;
  }
  renderPosts();
  container.getAnimations().forEach((a) => a.cancel());
  container.animate([{ opacity: 0, transform: slideDir ? `translateX(${slideDir * 36}px)` : 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
  slideDir = 0;
  if (sentinelText) {
    sentinelText.textContent = state.hasMore ? '' : t('Вы всё прочитали');
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
    const end = $('sentinel-text');
    end.textContent = t('Вы всё прочитали');
    show(end, !state.hasMore);
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

const FEED_TABS = ['all', 'media', 'popular', 'favorites'];
let slideDir = 0;

export function switchFeedType(type) {
  if (type === state.feedType && state.posts.length) return;
  const from = FEED_TABS.indexOf(state.feedType);
  const to = FEED_TABS.indexOf(type);
  slideDir = to > from ? 1 : -1;
  const container = $('posts-container');
  // the old list leaves in the direction of the swipe, the new one enters from the other side
  if (container && !reduceMotion() && state.posts.length) {
    container.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-slideDir * 36}px)` }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
  }
  state.feedType = type;
  state.posts = [];
  state.hasMore = false;
  updateTabs();
  window.scrollTo({ top: 0 });
  loadFeed();
}

/** Next/previous tab by a swipe. */
export function stepFeedTab(delta) {
  const i = FEED_TABS.indexOf(state.feedType) + delta;
  if (i < 0 || i >= FEED_TABS.length) return false;
  switchFeedType(FEED_TABS[i]);
  return true;
}

/** Horizontal swipe over the feed switches the tab (All / Media / Popular / Favorites), like Telegram's folders. */
export function initFeedSwipe() {
  const area = $('screen-wall');
  if (!area || area.dataset.swipe) return;
  area.dataset.swipe = '1';
  updateTabs();
  setTimeout(updateTabs, 400);
  window.addEventListener('resize', updateTabs);
  let sx = 0; let sy = 0; let t0 = 0; let live = false; let dx = 0;
  const blocked = (el) => {
    for (let n = el; n && n !== area; n = n.parentElement) {
      if (n.matches && n.matches('input, textarea, pre, video, .tx-subbar, .tx-album, .tx-stories, .tx-reactions, .tx-ctx, [data-noswipe]')) return true;
      if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
    }
    return false;
  };
  area.addEventListener('touchstart', (e) => {
    live = e.touches.length === 1 && !state.activeChannelId && !blocked(e.target) && !document.querySelector('.tx-ctx, .tx-viewer');
    if (!live) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now(); dx = 0;
  }, { passive: true });
  area.addEventListener('touchmove', (e) => {
    if (!live) return;
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) { live = false; $('posts-container').style.transform = ''; return; }
    const c = $('posts-container');
    const i = FEED_TABS.indexOf(state.feedType);
    const edge = (dx > 0 && i === 0) || (dx < 0 && i === FEED_TABS.length - 1);
    if (Math.abs(dx) > 10 && c) { c.style.transition = 'none'; c.style.transform = `translateX(${dx * (edge ? 0.18 : 0.5)}px)`; c.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 500)); }
  }, { passive: true });
  const end = () => {
    const c = $('posts-container');
    if (c) { c.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1), opacity .22s'; c.style.transform = ''; c.style.opacity = ''; setTimeout(() => { c.style.transition = ''; }, 240); }
    if (!live) return;
    live = false;
    const fast = Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.3;
    if (Math.abs(dx) > (fast ? 22 : 48)) stepFeedTab(dx < 0 ? 1 : -1);
  };
  area.addEventListener('touchend', end, { passive: true });
  area.addEventListener('touchcancel', end, { passive: true });
}

export function filterByChannel(channelId) {
  const id = Number(channelId);
  const already = history.state && history.state.view === 'wall' && Number(history.state.channel) === id;
  go('wall', { channel: id }, { push: !already });
}

/** Wall screen entered (also via Back): switch channel mode on/off to match the history entry. */
export function syncChannelMode(params = {}) {
  const id = params.channel ? Number(params.channel) : null;
  if (id === state.activeChannelId) return false;
  state.activeChannelId = id;
  state.feedType = 'all';
  state.searchQuery = '';
  const input = $('search-input');
  if (input) input.value = '';
  $('screen-wall').classList.remove('is-searching');
  updateTabs();
  updateHeader();
  window.scrollTo({ top: 0 });
  loadFeed();
  return true;
}

export function clearChannelFilter() {
  if (history.state && history.state.channel) {
    history.back();
    return;
  }
  state.activeChannelId = null;
  updateHeader();
  window.scrollTo({ top: 0 });
  loadFeed();
}

export function toggleHeaderSearch(on) {
  $('screen-wall').classList.toggle('is-searching', !!on);
  const input = $('search-input');
  if (on) {
    input.focus();
    return;
  }
  input.blur();
  if (state.searchQuery) clearSearch();
  else input.value = '';
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
  showToast(t('Стена обновлена'));
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
  const cards = fresh.map((p) => createPostCardElement(p));
  container.prepend(...cards);
  cards.forEach(track);
  cards.forEach((card, i) => animateArrival(card, i));
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
