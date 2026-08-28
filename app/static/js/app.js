/**
 * ====================================================================
 * MAIN APPLICATION ENTRYPOINT & CONTROLLER (Telegram Native)
 * ====================================================================
 */

import { state, EMOJI_PICKER_LIST } from './state.js';
import { api } from './api.js';
import { showToast, formatNumber } from './utils.js';
import { parseEmojis } from './emoji.js';
import { createPostCardElement } from './components/postCard.js';
import { renderChannelsBar } from './components/storiesBar.js';
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
  openChannelsModal,
  closeChannelsModal,
  filterChannelsModalList,
} from './components/channelsModal.js';
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

// Setup Global Interface
window.TelegramX = {
  state,
  api,
  showToast,
  
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
  copyPostLink,
  forwardToSaved,
  togglePostFavorite,
  
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
  applyWallpaper,
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
    showToast(`Реакция на историю ${emoji} отправлена ✨`);
  },

  // Modals & UI
  toggleUserMenu,
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
  openChannelsModal,
  closeChannelsModal,
  filterChannelsModalList,
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

// Expose state constant for post cards
state.EMOJI_PICKER_LIST = EMOJI_PICKER_LIST;

export async function initApp() {
  // Initialize Wallpaper Engine
  initWallpaperEngine();

  setupInfiniteScroll();
  setupKeyboardShortcuts();
  
  await checkAuthStatus();
  await loadFeed();
  loadChannels();
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox-modal');
    if (lightbox && !lightbox.classList.contains('hidden')) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevLightboxImage(e);
      if (e.key === 'ArrowRight') nextLightboxImage(e);
    }
    const storyModal = document.getElementById('story-viewer-modal');
    if (storyModal && !storyModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeStoryViewer();
      if (e.key === 'ArrowLeft') prevStory();
      if (e.key === 'ArrowRight') nextStory();
    }
    if (e.key === 'Escape') {
      closeWallpaperModal();
      closeChannelsModal();
      closeSettingsModal();
      closeAuthModal();
      toggleHeaderSearch(false);
    }
  });
}

function setupInfiniteScroll() {
  const sentinel = document.getElementById('feed-sentinel');
  if (!sentinel) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !state.isLoadingFeed && state.hasMore && state.posts.length > 0) {
        loadMorePosts();
      }
    });
  }, { rootMargin: '300px' });

  observer.observe(sentinel);
}

async function checkAuthStatus() {
  try {
    const data = await api.getAuthStatus();
    state.isAuth = data.is_authorized;
    state.user = data.user;
    updateAuthUI();
    updateSettingsView();
  } catch (e) {
    console.error('Auth check error', e);
  }
}

export function updateAuthUI() {
  const dockAvatar = document.getElementById('dock-user-avatar');
  const feedEmptyState = document.getElementById('feed-empty-state');

  if (state.isAuth && state.user) {
    if (feedEmptyState) feedEmptyState.classList.add('hidden');

    if (dockAvatar) {
      if (state.user.avatar) {
        dockAvatar.innerHTML = `<img src="${state.user.avatar}" class="w-full h-full object-cover" />`;
      } else {
        dockAvatar.innerHTML = `<div class="w-full h-full bg-[#3390ec] flex items-center justify-center text-white font-bold text-[10px]">${(state.user.name || 'U').charAt(0)}</div>`;
      }
    }
  } else {
    if (dockAvatar) dockAvatar.innerHTML = `<i class="icon icon-user text-xs text-slate-300"></i>`;

    if (state.posts.length === 0 && feedEmptyState) {
      feedEmptyState.classList.remove('hidden');
    }
  }
}

export function switchFeedType(type) {
  state.feedType = type;
  loadFeed();
}

export function filterByChannel(channelId, channelTitle) {
  state.activeChannelId = channelId;
  const ch = state.channels.find(c => c.id === channelId);

  const titleEl = document.getElementById('header-main-title');
  const subEl = document.getElementById('header-sub-title');
  const backBtn = document.getElementById('header-back-btn');
  const verifiedBadge = document.getElementById('header-verified-badge');

  if (titleEl) titleEl.innerHTML = parseEmojis(channelTitle || (ch ? ch.title : 'Канал'));
  if (subEl) subEl.innerText = ch && ch.username ? `@${ch.username} · канал` : 'Канал';
  if (backBtn) backBtn.classList.remove('hidden');

  if (verifiedBadge) {
    verifiedBadge.classList.toggle('hidden', !(ch && ch.verified));
  }

  loadFeed();
  renderChannelsBar();
}

export function clearChannelFilter() {
  state.activeChannelId = null;

  const titleEl = document.getElementById('header-main-title');
  const subEl = document.getElementById('header-sub-title');
  const backBtn = document.getElementById('header-back-btn');
  const verifiedBadge = document.getElementById('header-verified-badge');

  if (titleEl) titleEl.innerText = 'Стена каналов';
  if (subEl) subEl.innerText = 'Все публикации ваших каналов';
  if (backBtn) backBtn.classList.add('hidden');
  if (verifiedBadge) verifiedBadge.classList.add('hidden');

  loadFeed();
  renderChannelsBar();
}

export function toggleHeaderSearch(show) {
  const normalView = document.getElementById('header-normal-view');
  const searchBar = document.getElementById('header-search-bar');
  const input = document.getElementById('search-input');

  if (show) {
    if (normalView) normalView.classList.add('hidden');
    if (searchBar) searchBar.classList.remove('hidden');
    if (input) input.focus();
  } else {
    if (searchBar) searchBar.classList.add('hidden');
    if (normalView) normalView.classList.remove('hidden');
    clearSearch();
  }
}

export function filterByTag(tag) {
  toggleHeaderSearch(true);
  const input = document.getElementById('search-input');
  if (input) input.value = tag;
  doSearch();
}

export function doSearch() {
  const input = document.getElementById('search-input');
  const q = input ? input.value.trim() : '';
  state.searchQuery = q;
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);
  loadFeed();
}

export function clearSearch() {
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  state.searchQuery = '';
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  loadFeed();
}

export function resetFeed() {
  state.feedType = 'all';
  state.activeChannelId = null;
  state.searchQuery = '';
  toggleHeaderSearch(false);
  clearChannelFilter();
}

export async function refreshFeed() {
  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('animate-spin');
  await loadFeed(true);
  await loadChannels(true);
  if (icon) setTimeout(() => icon.classList.remove('animate-spin'), 500);
  showToast('Стена обновлена ✨');
}

export async function loadFeed(forceRefresh = false) {
  if (state.isLoadingFeed) return;
  state.isLoadingFeed = true;

  const loader = document.getElementById('feed-loader');
  const postsContainer = document.getElementById('posts-container');
  const emptyState = document.getElementById('feed-empty-state');
  const sentinelText = document.getElementById('sentinel-text');

  if (state.posts.length === 0 && loader) {
    loader.classList.remove('hidden');
  }
  if (sentinelText) sentinelText.innerText = '';

  try {
    const data = await api.getFeed({
      feedType: state.feedType,
      channelId: state.activeChannelId,
      searchQuery: state.searchQuery,
      limit: 40,
      refresh: forceRefresh,
    });

    state.posts = data.posts || [];
    state.hasMore = data.has_more || false;
    state.nextOffset = data.next_offset || null;
    if (loader) loader.classList.add('hidden');

    if (state.posts.length === 0) {
      if (!state.isAuth && emptyState) {
        emptyState.classList.remove('hidden');
      } else if (postsContainer) {
        postsContainer.innerHTML = `
          <div class="p-10 text-center text-[#8a8a90] tg-post-card rounded-2xl">
            <i class="icon icon-channel text-3xl mb-2.5 block opacity-40 text-[#3390ec]"></i>
            <p class="text-sm font-medium text-slate-200">Публикаций пока нет</p>
            <p class="text-xs text-[#8a8a90] mt-1">Каналы еще не опубликовали новые посты или измените фильтр</p>
          </div>
        `;
      }
      if (sentinelText) sentinelText.innerText = '';
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      renderPosts();
      if (sentinelText) sentinelText.innerText = state.hasMore ? '' : 'Конец стены каналов';
      preloadVisibleComments();
    }

    if (data.channels && data.channels.length > 0) {
      state.channels = data.channels;
      renderChannelsBar();
    }

  } catch (e) {
    console.error('Feed loading error', e);
    if (loader) loader.classList.add('hidden');
  } finally {
    state.isLoadingFeed = false;
  }
}

function preloadVisibleComments() {
  state.posts.slice(0, 6).forEach(p => {
    if (p.replies_count > 0 && !state.cachedComments[p.id]) {
      api.getComments(p.channel_id, p.msg_id)
        .then(data => {
          if (data.comments) state.cachedComments[p.id] = data.comments;
        })
        .catch(() => {});
    }
  });
}

export async function loadMorePosts() {
  if (state.isLoadingFeed || !state.hasMore || !state.nextOffset) return;
  state.isLoadingFeed = true;

  const spinner = document.getElementById('sentinel-spinner');
  const sentinelText = document.getElementById('sentinel-text');
  if (spinner) spinner.classList.remove('hidden');

  try {
    const data = await api.getFeed({
      feedType: state.feedType,
      channelId: state.activeChannelId,
      searchQuery: state.searchQuery,
      offsetDate: state.nextOffset,
      limit: 30,
    });

    const newPosts = data.posts || [];

    if (newPosts.length > 0) {
      const existingIds = new Set(state.posts.map(p => p.id));
      const uniqueNew = newPosts.filter(p => !existingIds.has(p.id));
      state.posts.push(...uniqueNew);
      state.hasMore = data.has_more;
      state.nextOffset = data.next_offset;
      appendPosts(uniqueNew);
    } else {
      state.hasMore = false;
    }
    if (sentinelText) sentinelText.innerText = state.hasMore ? '' : 'Конец стены каналов';
  } catch (e) {
    console.error('Load more error', e);
  } finally {
    if (spinner) spinner.classList.add('hidden');
    state.isLoadingFeed = false;
  }
}

export async function loadChannels(forceRefresh = false) {
  try {
    const data = await api.getChannels(forceRefresh);
    if (data.channels) {
      state.channels = data.channels;
      renderChannelsBar();
      const countBadge = document.getElementById('channels-count-badge');
      if (countBadge) {
        countBadge.innerText = state.channels.length;
        countBadge.classList.remove('hidden');
      }
    }
  } catch (e) {
    console.error('Channels load error', e);
  }
}

export function renderPosts() {
  const container = document.getElementById('posts-container');
  if (!container) return;
  container.innerHTML = '';
  state.posts.forEach(post => {
    const card = createPostCardElement(post);
    container.appendChild(card);
  });
}

export function appendPosts(newPosts) {
  const container = document.getElementById('posts-container');
  if (!container) return;
  newPosts.forEach(post => {
    const card = createPostCardElement(post);
    container.appendChild(card);
  });
}

export function copyPostLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Ссылка скопирована в буфер обмена');
  }).catch(() => {
    showToast('Ссылка: ' + url);
  });
}

export async function forwardToSaved(channelId, msgId) {
  try {
    const data = await api.forwardToSaved(channelId, msgId);
    if (data.status === 'success') {
      showToast('Сохранено в Избранное Telegram ✨');
    }
  } catch (e) {
    console.error(e);
  }
}

export async function togglePostFavorite(postId) {
  try {
    const data = await api.toggleFavorite(postId);
    const target = state.posts.find(p => p.id === postId);
    if (target) {
      target.is_favorite = data.is_favorite;
      const btn = document.getElementById(`fav-btn-${postId}`);
      if (btn) {
        btn.innerHTML = `<i class="icon icon-star text-base ${data.is_favorite ? 'text-amber-400' : ''}"></i>`;
      }
    }
    showToast(data.is_favorite ? 'Добавлено в Избранное ⭐' : 'Удалено из Избранного');
  } catch (e) {
    console.error(e);
  }
}

export function toggleUserMenu() {
  const popover = document.getElementById('user-menu-popover');
  if (popover) popover.classList.toggle('hidden');
}

export async function logoutTelegram() {
  if (!confirm('Вы уверены, что хотите выйти из Telegram?')) return;
  try {
    await api.logout();
    state.isAuth = false;
    state.user = null;
    state.posts = [];
    state.channels = [];
    state.cachedComments = {};
    updateAuthUI();
    updateSettingsView();
    renderPosts();
    showToast('Сессия завершена');
  } catch (e) {
    console.error(e);
  }
}

// Auto-start on load
window.addEventListener('DOMContentLoaded', initApp);
