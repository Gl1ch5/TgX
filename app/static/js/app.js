/**
 * ====================================================================
 * MAIN APPLICATION ENTRYPOINT & CONTROLLER
 * ====================================================================
 */

import { state, EMOJI_PICKER_LIST } from './state.js';
import { api } from './api.js';
import { showToast, formatNumber, escapeHtml, pluralRu } from './utils.js';
import { parseEmojis } from './emoji.js';
import { initMediaBridge } from './media.js';
import { createPostCardElement, playInlineVideo, openPostMenu, VERIFIED_BADGE_SVG } from './components/postCard.js';
import { renderChannelsList, filterChannelsList } from './components/channelsList.js';
import { avatarHtml } from './components/avatar.js';
import {
  toggleInlineComments,
  insertCommentEmoji,
  submitPostComment,
} from './components/commentsDrawer.js';
import {
  toggleReactionPicker,
  hideReactionPicker,
  sendReaction,
} from './components/reactionPicker.js';
import {
  openLightboxSingle,
  openLightboxIndex,
  prevLightboxImage,
  nextLightboxImage,
  closeLightbox,
} from './components/lightbox.js';
import {
  openAuthModal,
  closeAuthModal,
  switchAuthTab,
  generateQRLogin,
  submitQRPassword,
  sendPhoneCode,
  submitPhoneCode,
  submitPhonePassword,
} from './components/authModal.js';
import {
  openSettingsModal,
  closeSettingsModal,
  updateSettingsView,
} from './components/settingsModal.js';
import {
  initWallpaperEngine,
  applyWallpaper,
  openWallpaperModal,
  closeWallpaperModal,
  WALLPAPERS,
} from './components/wallpaperTheme.js';
import {
  openStoryViewer,
  closeStoryViewer,
  nextStory,
  prevStory,
  pauseStory,
} from './components/storiesViewer.js';

const desktop = window.matchMedia('(min-width: 1024px)');

// Setup Global Interface
window.TelegramX = {
  state,
  api,
  showToast,

  // Navigation
  setView,
  openMainMenu,
  openFavorites,
  scrollWallTop,
  openStoriesFromHeader,
  clearMediaCache,

  // Feed Controls
  switchFeedType,
  filterByChannel,
  clearChannelFilter,
  filterByTag,
  doSearch,
  clearSearch,
  toggleHeaderSearch,
  resetFeed,
  refreshFeed,
  loadFeed,
  loadChannels,
  filterChannelsList,
  copyPostLink,
  sharePost,
  forwardToSaved,
  togglePostFavorite,
  playInlineVideo,
  openPostMenu,

  // Comments
  toggleInlineComments,
  insertCommentEmoji,
  submitPostComment,

  // Reactions
  toggleReactionPicker,
  hideReactionPicker,
  sendReaction,

  // Wallpaper Engine
  initWallpaperEngine,
  applyWallpaper: (id, feedback) => { applyWallpaper(id, feedback); updateSettingsView(); },
  openWallpaperModal,
  closeWallpaperModal,
  WALLPAPERS,

  // Stories Viewer
  openStoryViewer,
  closeStoryViewer,
  nextStory,
  prevStory,
  pauseStory,
  sendStoryQuickReaction: (emoji) => {
    showToast(`Реакция ${emoji} отправлена`);
  },

  // Modals & UI
  logoutTelegram,
  updateAuthUI,
  openAuthModal,
  closeAuthModal,
  switchAuthTab,
  generateQRLogin,
  submitQRPassword,
  sendPhoneCode,
  submitPhoneCode,
  submitPhonePassword,
  openChannelsModal: () => setView('channels'),
  closeChannelsModal: () => {},
  openSettingsModal,
  closeSettingsModal,
  updateSettingsView,

  // Lightbox
  openLightboxSingle,
  openLightboxIndex,
  prevLightboxImage,
  nextLightboxImage,
  closeLightbox,
};

state.EMOJI_PICKER_LIST = EMOJI_PICKER_LIST;

const $ = (id) => document.getElementById(id);
const show = (el, on) => el && el.classList.toggle('tx-hidden', !on);

export async function initApp() {
  initWallpaperEngine();
  setupInfiniteScroll();
  setupKeyboardShortcuts();
  desktop.addEventListener('change', () => setView($('app').dataset.view));

  try {
    await initMediaBridge();
  } catch (e) {
    console.error('Media bridge init failed', e);
  }

  await checkAuthStatus();
  renderChannelsList();
  await loadFeed();
  if (state.isAuth) loadChannels();
}

// ---------------- Navigation ----------------

export function setView(view) {
  const app = $('app');
  if (!app) return;
  app.dataset.view = view;
  const active = desktop.matches && view === 'wall' ? 'channels' : view;
  document.querySelectorAll('.tx-dock-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === active));
  if (view === 'settings' || view === 'profile') updateSettingsView();
  if (!desktop.matches) window.scrollTo({ top: 0 });
}

export function scrollWallTop() {
  const main = $('main-scroll');
  if (desktop.matches && main) main.scrollTo({ top: 0, behavior: 'smooth' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function openFavorites() {
  setView('wall');
  if (state.activeChannelId) clearChannelFilter(false);
  switchFeedType('favorites');
}

export function openStoriesFromHeader() {
  const ch = state.channels.find((c) => state.posts.some((p) => p.channel_id === c.id && p.media_items?.length));
  if (ch) openStoryViewer(ch.id);
}

function closeMenus() {
  document.querySelectorAll('.tx-menu').forEach((m) => m.remove());
}

export function openMainMenu(event) {
  if (event) event.stopPropagation();
  closeMenus();
  const items = [
    ['reload', 'Обновить стену', () => refreshFeed()],
    ['brush', 'Обои', () => openWallpaperModal()],
    ['channel', 'Каналы', () => setView('channels')],
    state.isAuth
      ? ['logout', 'Выйти', () => logoutTelegram()]
      : ['user', 'Войти в Telegram', () => openAuthModal()],
  ];
  const menu = document.createElement('div');
  menu.className = 'tx-menu';
  menu.innerHTML = items.map(([icon, label], i) => `<button data-i="${i}"><i class="icon icon-${icon}"></i>${label}</button>`).join('');
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const i = e.target.closest('button')?.dataset.i;
    closeMenus();
    if (i != null) items[i][2]();
  });
  document.body.appendChild(menu);
  const rect = event.currentTarget.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
}

// ---------------- Setup ----------------

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    const lightbox = $('lightbox-modal');
    if (lightbox && !lightbox.classList.contains('hidden')) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevLightboxImage(e);
      if (e.key === 'ArrowRight') nextLightboxImage(e);
    }
    const storyModal = $('story-viewer-modal');
    if (storyModal && !storyModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeStoryViewer();
      if (e.key === 'ArrowLeft') prevStory();
      if (e.key === 'ArrowRight') nextStory();
    }
    if (e.key === 'Escape') {
      closeMenus();
      closeWallpaperModal();
      closeAuthModal();
    }
  });
}

function setupInfiniteScroll() {
  const sentinel = $('feed-sentinel');
  if (!sentinel) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !state.isLoadingFeed && state.hasMore && state.posts.length > 0) {
        loadMorePosts();
      }
    });
  }, { rootMargin: '600px' });
  observer.observe(sentinel);
}

async function checkAuthStatus() {
  try {
    const data = await api.getAuthStatus();
    state.isAuth = data.is_authorized;
    state.user = data.user;
  } catch (e) {
    console.error('Auth check error', e);
  }
  updateAuthUI();
}

export function updateAuthUI() {
  updateSettingsView();
  show($('feed-empty-state'), !state.isAuth && state.posts.length === 0);
  renderChannelsList();
}

// ---------------- Header ----------------

function updateHeader() {
  const ch = state.activeChannelId ? state.channels.find((c) => c.id === state.activeChannelId) : null;
  const title = $('header-main-title');
  const sub = $('header-sub-title');
  const block = $('header-title-block');
  const avatar = $('header-avatar');

  show($('header-back-btn'), !!state.activeChannelId);
  show($('header-stack'), !state.activeChannelId && state.channels.length > 0);
  block.classList.toggle('is-channel', !!state.activeChannelId);

  if (state.activeChannelId) {
    title.innerHTML = parseEmojis(ch ? ch.title : 'Канал');
    const n = ch && ch.participants_count;
    sub.textContent = n ? `${formatNumber(n)} ${pluralRu(n, 'подписчик', 'подписчика', 'подписчиков')}` : ch && ch.username ? `@${ch.username}` : 'канал';
    show(sub, true);
    avatar.outerHTML = `<span id="header-avatar">${avatarHtml(ch || { id: state.activeChannelId }, 'sm')}</span>`;
    $('header-verified-badge').innerHTML = ch && ch.verified ? VERIFIED_BADGE_SVG : '';
    show($('header-verified-badge'), !!(ch && ch.verified));
  } else {
    title.textContent = 'Стена';
    show(sub, false);
    avatar.outerHTML = '<div id="header-avatar" class="tx-hidden"></div>';
    show($('header-verified-badge'), false);
  }
}

function updateTabs() {
  document.querySelectorAll('#feed-tabs .tx-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.feed === state.feedType));
}

// ---------------- Feed controls ----------------

export function switchFeedType(type) {
  state.feedType = type;
  updateTabs();
  loadFeed();
}

export function filterByChannel(channelId) {
  state.activeChannelId = channelId;
  state.feedType = 'all';
  updateTabs();
  updateHeader();
  renderChannelsList();
  setView('wall');
  scrollWallTop();
  loadFeed();
}

export function clearChannelFilter(reload = true) {
  state.activeChannelId = null;
  updateHeader();
  renderChannelsList();
  if (!desktop.matches && $('app').dataset.view !== 'wall') setView('wall');
  if (reload) loadFeed();
}

export function toggleHeaderSearch(showSearch) {
  const bar = $('header-search-bar');
  const input = $('search-input');
  if (showSearch) {
    show(bar, true);
    if (input) input.focus();
  } else {
    show(bar, false);
    if (state.searchQuery) clearSearch();
  }
}

export function filterByTag(tag) {
  toggleHeaderSearch(true);
  const input = $('search-input');
  if (input) input.value = '#' + tag;
  doSearch();
}

export function doSearch() {
  const input = $('search-input');
  state.searchQuery = input ? input.value.trim() : '';
  loadFeed();
}

export function clearSearch() {
  const input = $('search-input');
  if (input) input.value = '';
  state.searchQuery = '';
  loadFeed();
}

export function resetFeed() {
  state.feedType = 'all';
  state.searchQuery = '';
  updateTabs();
  toggleHeaderSearch(false);
  setView('wall');
  clearChannelFilter();
}

export async function refreshFeed() {
  const icon = $('refresh-icon');
  if (icon) icon.classList.add('animate-spin');
  await loadFeed(true);
  await loadChannels(true);
  if (icon) setTimeout(() => icon.classList.remove('animate-spin'), 400);
  showToast('Стена обновлена');
}

export async function loadFeed(forceRefresh = false) {
  if (state.isLoadingFeed) return;
  state.isLoadingFeed = true;
  let refreshAfterCache = false;

  const loader = $('feed-loader');
  const postsContainer = $('posts-container');
  const sentinelText = $('sentinel-text');

  if (state.posts.length === 0 && state.isAuth) show(loader, true);
  if (sentinelText) sentinelText.textContent = '';

  try {
    const data = await api.getFeed({
      feedType: state.feedType,
      channelId: state.activeChannelId,
      searchQuery: state.searchQuery,
      limit: 40,
      refresh: forceRefresh,
    });

    state.posts = data.posts || [];
    if (data.from_cache && state.isAuth) refreshAfterCache = true;
    state.hasMore = data.has_more || false;
    state.nextOffset = data.next_offset || null;
    show(loader, false);

    if (state.posts.length === 0) {
      show($('feed-empty-state'), !state.isAuth);
      if (postsContainer) {
        const text = state.feedType === 'favorites'
          ? 'Отмечайте посты звёздочкой в меню ⋮ — они появятся здесь'
          : state.searchQuery ? 'По запросу ничего не найдено' : 'Публикаций пока нет';
        postsContainer.innerHTML = state.isAuth || state.feedType === 'favorites'
          ? `<div class="tx-empty"><p>${escapeHtml(text)}</p></div>`
          : '';
      }
    } else {
      show($('feed-empty-state'), false);
      renderPosts();
      if (sentinelText) sentinelText.textContent = state.hasMore ? '' : 'Вы всё прочитали';
      preloadVisibleComments();
    }

    if (data.channels && data.channels.length > 0) {
      state.channels = data.channels;
      renderChannelsList();
      updateHeader();
    }
  } catch (e) {
    console.error('Feed loading error', e);
    show(loader, false);
  } finally {
    state.isLoadingFeed = false;
  }

  // Cached wall shown instantly — now pull fresh posts from Telegram.
  if (refreshAfterCache) loadFeed(true);
}

function preloadVisibleComments() {
  state.posts.slice(0, 6).forEach((p) => {
    if (p.replies_count > 0 && !state.cachedComments[p.id]) {
      api.getComments(p.channel_id, p.msg_id)
        .then((data) => {
          if (data.comments) state.cachedComments[p.id] = data.comments;
        })
        .catch(() => {});
    }
  });
}

export async function loadMorePosts() {
  if (state.isLoadingFeed || !state.hasMore || !state.nextOffset) return;
  state.isLoadingFeed = true;

  const spinner = $('sentinel-spinner');
  const sentinelText = $('sentinel-text');
  show(spinner, true);

  try {
    const data = await api.getFeed({
      feedType: state.feedType,
      channelId: state.activeChannelId,
      searchQuery: state.searchQuery,
      offsetDate: state.nextOffset,
      limit: 30,
    });

    const newPosts = data.posts || [];
    const existingIds = new Set(state.posts.map((p) => p.id));
    const uniqueNew = newPosts.filter((p) => !existingIds.has(p.id));
    if (uniqueNew.length > 0) {
      state.posts.push(...uniqueNew);
      state.hasMore = data.has_more;
      state.nextOffset = data.next_offset;
      appendPosts(uniqueNew);
    } else {
      state.hasMore = false;
    }
    if (sentinelText) sentinelText.textContent = state.hasMore ? '' : 'Вы всё прочитали';
  } catch (e) {
    console.error('Load more error', e);
  } finally {
    show(spinner, false);
    state.isLoadingFeed = false;
  }
}

export async function loadChannels(forceRefresh = false) {
  try {
    const data = await api.getChannels(forceRefresh);
    if (data.channels) {
      state.channels = data.channels;
      renderChannelsList();
      updateHeader();
    }
  } catch (e) {
    console.error('Channels load error', e);
  }
}

export function renderPosts() {
  const container = $('posts-container');
  if (!container) return;
  container.innerHTML = '';
  state.posts.forEach((post) => container.appendChild(createPostCardElement(post)));
}

export function appendPosts(newPosts) {
  const container = $('posts-container');
  if (!container) return;
  newPosts.forEach((post) => container.appendChild(createPostCardElement(post)));
}

// ---------------- Post actions ----------------

export function copyPostLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Ссылка скопирована');
  }).catch(() => {
    showToast('Ссылка: ' + url);
  });
}

export async function sharePost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: post.channel?.title || 'Telegram', url: post.tg_url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  copyPostLink(post.tg_url);
}

export async function forwardToSaved(channelId, msgId) {
  const data = await api.forwardToSaved(channelId, msgId);
  if (data.status === 'success') {
    showToast('Сохранено в «Избранное» Telegram');
  } else {
    showToast('Не удалось переслать: ' + (data.message || 'ошибка'));
  }
}

export async function togglePostFavorite(postId) {
  const target = state.posts.find((p) => p.id === postId);
  const data = await api.toggleFavorite(postId, target);
  if (target) target.is_favorite = data.is_favorite;
  show($(`fav-mark-${postId}`), data.is_favorite);
  if (state.feedType === 'favorites' && !data.is_favorite) {
    $(`post-card-${postId}`)?.remove();
    state.posts = state.posts.filter((p) => p.id !== postId);
  }
  showToast(data.is_favorite ? 'Добавлено в избранное' : 'Удалено из избранного');
}

export async function clearMediaCache() {
  await api.clearCache();
  state.cachedComments = {};
  showToast('Кэш очищен');
  loadFeed(true);
}

export async function logoutTelegram() {
  if (!confirm('Выйти из Telegram на этом устройстве?')) return;
  await api.logout();
  state.isAuth = false;
  state.user = null;
  state.posts = [];
  state.channels = [];
  state.cachedComments = {};
  state.activeChannelId = null;
  updateHeader();
  renderPosts();
  updateAuthUI();
  setView('wall');
  showToast('Вы вышли из аккаунта');
}

window.addEventListener('DOMContentLoaded', initApp);
