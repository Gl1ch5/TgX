/**
 * ====================================================================
 * MAIN ENTRYPOINT — wires views, components and the global handler
 * object used by inline onclick attributes (window.TelegramX).
 * ====================================================================
 */

import { state, EMOJI_PICKER_LIST } from './state.js';
import { api } from './api.js';
import { showToast } from './utils.js';
import { initMediaBridge } from './media.js';
import { getPrefs, setPref, onPrefsChange, applyAppearance } from './core/prefs.js';
import { initNav, registerView, go, back } from './core/nav.js';
import { avatarHtml } from './components/avatar.js';
import { loadPhoto } from './components/postCard.js';
import { tapReaction, sendReaction } from './components/reactions.js';
import { openPostMenu, quickReact, pickReaction, closeMenus, copyPostLink, sharePost, forwardToSaved, togglePostFavorite } from './components/postMenu.js';
import { openViewer, closeViewer, isViewerOpen, viewerKey } from './components/mediaViewer.js';
import { toggleAudio, seekAudio } from './components/audioPlayer.js';
import {
  openAuthModal, closeAuthModal, switchAuthTab, generateQRLogin,
  submitQRPassword, sendPhoneCode, submitPhoneCode, submitPhonePassword,
} from './components/authModal.js';
import { initWallpaperEngine, applyWallpaper, openWallpaperModal, closeWallpaperModal, WALLPAPERS } from './components/wallpaperTheme.js';
import * as wall from './views/wall.js';
import * as thread from './views/thread.js';
import * as settings from './views/settings.js';
import * as profile from './views/profile.js';

state.EMOJI_PICKER_LIST = EMOJI_PICKER_LIST;

const WALL_KEYS = new Set(['excludedChannels', 'showGroups', 'feedSize']);
const RENDER_KEYS = new Set(['autoloadPhotos', 'autoplayGifs']);
let wallDirty = false;
let rerenderWall = false;

window.TelegramX = {
  state,
  api,
  showToast,

  // Navigation
  setView: (view) => go(view),
  back,
  openSettingsPage: settings.openSettingsPage,
  rerenderSettings: settings.rerenderSettings,
  openFavorites,

  // Wall
  headerLeft: wall.headerLeft,
  headerPill: wall.headerPill,
  openMainMenu,
  switchFeedType: wall.switchFeedType,
  filterByChannel: wall.filterByChannel,
  clearChannelFilter: wall.clearChannelFilter,
  filterByTag: wall.filterByTag,
  doSearch: wall.doSearch,
  clearSearch: wall.clearSearch,
  toggleHeaderSearch: wall.toggleHeaderSearch,
  resetFeed: wall.resetFeed,
  refreshFeed: wall.refreshFeed,
  loadFeed: wall.loadFeed,

  // Posts
  openPostMenu,
  quickReact,
  pickReaction,
  tapReaction,
  sendReaction,
  copyPostLink,
  sharePost,
  forwardToSaved,
  togglePostFavorite,
  loadPhoto,
  openViewer,
  toggleAudio,
  seekAudio,

  // Discussion
  openThread: thread.openThread,
  loadOlderComments: thread.loadOlderComments,
  jumpToComment: thread.jumpToComment,
  openCommentMenu: thread.openCommentMenu,
  cancelReply: thread.cancelReply,
  toggleThreadEmoji: thread.toggleThreadEmoji,
  autosizeComposer: thread.autosizeComposer,
  sendThreadComment: thread.sendThreadComment,

  // Settings
  setPref: settings.updatePref,
  setChannelOnWall: settings.setChannelOnWall,
  filterWallChannels: settings.filterWallChannels,
  terminateSession: settings.terminateSession,
  clearMediaCache,

  // Wallpapers
  applyWallpaper: (id, feedback) => { applyWallpaper(id, feedback); settings.rerenderSettings(); },
  openWallpaperModal,
  closeWallpaperModal,
  WALLPAPERS,

  // Auth
  logoutTelegram,
  updateAuthUI,
  updateSettingsView: updateAuthUI,
  openAuthModal,
  closeAuthModal,
  switchAuthTab,
  generateQRLogin,
  submitQRPassword,
  sendPhoneCode,
  submitPhoneCode,
  submitPhonePassword,
};

// ---------------- Init ----------------

async function initApp() {
  applyAppearance();
  initWallpaperEngine();

  onPrefsChange((p, key) => {
    applyAppearance(p);
    if (WALL_KEYS.has(key) || key === null) wallDirty = true;
    if (RENDER_KEYS.has(key)) rerenderWall = true;
    if (key === 'syncRead' && p.syncRead) showToast('Просмотренные посты будут отмечаться прочитанными');
  });

  registerView('wall', {
    enter: () => {
      if (wallDirty) {
        wallDirty = false;
        wall.updateHeader();
        wall.renderUnread();
        wall.loadFeed(true);
      } else if (rerenderWall) {
        rerenderWall = false;
        wall.renderPosts();
      }
    },
  });
  registerView('thread', { enter: thread.enterThread });
  registerView('settings', { enter: settings.enterSettings });
  registerView('profile', { enter: profile.enterProfile });

  initNav(() => {
    closeMenus();
    if (isViewerOpen()) {
      closeViewer();
      return true;
    }
    return false;
  });

  wall.setupInfiniteScroll();
  setupKeyboard();
  api.onReadChange(() => wall.renderUnread());

  try {
    await initMediaBridge();
  } catch (e) {
    console.error('Media bridge init failed', e);
  }

  // Show the last known account instantly, then verify with Telegram.
  const cached = api.cachedUser();
  if (cached) {
    state.isAuth = true;
    state.user = cached;
  }
  updateAuthUI();
  wall.updateHeader();

  try {
    const data = await api.getAuthStatus();
    state.isAuth = data.is_authorized;
    state.user = data.user;
  } catch (e) {
    console.error('Auth check error', e);
  }
  updateAuthUI();
  await wall.loadFeed();
  if (state.isAuth) await wall.loadChannels();
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (viewerKey(e)) return;
    if (e.key === 'Escape') {
      closeMenus();
      closeWallpaperModal();
      closeAuthModal();
    }
  });
}

// ---------------- Shared actions ----------------

export function updateAuthUI() {
  const dock = document.getElementById('dock-user-avatar');
  if (dock) {
    if (state.isAuth && state.user) {
      const tmp = document.createElement('span');
      tmp.innerHTML = avatarHtml(state.user);
      tmp.firstElementChild.id = 'dock-user-avatar';
      dock.replaceWith(tmp.firstElementChild);
    } else {
      dock.className = 'tx-avatar tx-peer-5';
      dock.innerHTML = '<i class="icon icon-user" style="font-size:15px"></i>';
    }
  }
  document.getElementById('feed-empty-state')?.classList.toggle('tx-hidden', state.isAuth || state.posts.length > 0);
  wall.updateHeader();
  wall.renderUnread();
  const view = document.getElementById('app').dataset.view;
  if (view === 'settings') settings.rerenderSettings();
  if (view === 'profile') profile.renderProfile();
}

function openFavorites() {
  go('wall');
  if (state.activeChannelId) state.activeChannelId = null;
  wall.updateHeader();
  wall.switchFeedType('favorites');
}

function openMainMenu(event) {
  if (event) event.stopPropagation();
  closeMenus();
  const items = [
    ['reload', 'Обновить стену', () => wall.refreshFeed()],
    ['search', 'Поиск публикаций', () => wall.toggleHeaderSearch(true)],
    ['channel', 'Каналы на стене', () => go('settings', { page: 'wall' })],
    ['brush', 'Обои', () => openWallpaperModal()],
    state.isAuth ? ['logout', 'Выйти', () => logoutTelegram()] : ['user', 'Войти в Telegram', () => openAuthModal()],
  ];
  const menu = document.createElement('div');
  menu.className = 'tx-ctx';
  menu.innerHTML = `<div class="tx-menu">${items.map(([icon, label], i) => `<button data-i="${i}"><i class="icon icon-${icon}"></i>${label}</button>`).join('')}</div>`;
  const backdrop = document.createElement('div');
  backdrop.className = 'tx-ctx-backdrop';
  backdrop.style.background = 'transparent';
  backdrop.onclick = closeMenus;
  menu.addEventListener('click', (e) => {
    const i = e.target.closest('[data-i]')?.dataset.i;
    if (i == null) return;
    closeMenus();
    items[i][2]();
  });
  document.body.append(backdrop, menu);
  const r = event.currentTarget.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;
}

async function clearMediaCache() {
  await api.clearCache();
  showToast('Кэш очищен');
  settings.rerenderSettings();
  wall.loadFeed(true);
}

async function logoutTelegram() {
  if (!confirm('Выйти из Telegram на этом устройстве?')) return;
  await api.logout();
  Object.assign(state, { isAuth: false, user: null, posts: [], channels: [], cachedComments: {}, activeChannelId: null, feedType: 'all' });
  profile.resetProfile();
  wall.renderPosts();
  go('wall');
  updateAuthUI();
  showToast('Вы вышли из аккаунта');
}

window.addEventListener('DOMContentLoaded', initApp);
