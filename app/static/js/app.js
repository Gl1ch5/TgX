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
import { getPrefs, setPref, onPrefsChange, applyAppearance, resolvedTheme } from './core/prefs.js';
import { initNav, registerView, go, back } from './core/nav.js';
import { avatarHtml } from './components/avatar.js';
import { initDock, setDockActive } from './components/dock.js';
import { loadPhoto } from './components/postCard.js';
import { tapReaction, sendReaction } from './components/reactions.js';
import { openPostMenu, quickReact, pickReaction, closeMenus, copyPostLink, sharePost, forwardToSaved, togglePostFavorite } from './components/postMenu.js';
import { openViewer, closeViewer, isViewerOpen, viewerKey } from './components/mediaViewer.js';
import { toggleAudio, seekAudio } from './components/audioPlayer.js';
import { setupStoriesBar, loadStories, renderStories, openStackStories } from './components/stories.js';
import { isStoryOpen, closeStoryViewer, storyKey } from './components/storyViewer.js';
import {
  openAuthModal, closeAuthModal, switchAuthTab, generateQRLogin,
  submitQRPassword, sendPhoneCode, submitPhoneCode, submitPhonePassword,
  authBack, authNext, authPickCountry, authQr, authResend,
} from './components/authModal.js';
import { initWallpaperEngine, applyWallpaper, openWallpaperModal, closeWallpaperModal, refreshWallpaper, WALLPAPERS } from './components/wallpaperTheme.js';
import * as wall from './views/wall.js';
import * as thread from './views/thread.js';
import * as settings from './views/settings.js';
import { APP_VERSION } from './version.js';
import { tgDialog } from './core/dialog.js';
import { maybeOnboard, resetOnboarding } from './components/onboarding.js';
import { startMods, reapplyModVars, listMods, disableAllMods } from './core/mods.js';
import { ext } from './core/ext.js';
import * as profile from './views/profile.js';
import * as channel from './views/channel.js';
import { captureLogs, initDevtools, postNative } from './core/devtools.js';
import { t, applyDocumentLanguage, translateTree } from './i18n.js';

captureLogs();

state.EMOJI_PICKER_LIST = EMOJI_PICKER_LIST;

const WALL_KEYS = new Set(['excludedChannels', 'showGroups', 'feedSize']);
const RENDER_KEYS = new Set(['autoloadPhotos', 'autoplayGifs', 'autoplayVideos']);
let wallDirty = false;
let rerenderWall = false;

window.TelegramX = {
  maybeOnboard,
  aiKeySave: settings.aiKeySave, modToggleChannel: settings.modToggleChannel, aiKeyClear: settings.aiKeyClear,
  state,
  api,
  showToast,

  // Navigation
  setView: (view) => go(view),
  back,
  openSettingsPage: settings.openSettingsPage,
  rerenderSettings: settings.rerenderSettings,
  openFavorites,

  openSettingsMenu: settings.openSettingsMenu,

  // Thread extras
  prefetchComments: thread.prefetchComments,
  toggleThreadSearch: thread.toggleThreadSearch,
  searchThread: thread.searchThread,
  threadJumpDown: thread.threadJumpDown,

  // Channel
  openChannelPage: channel.openChannelPage,
  openChannelPageMenu: channel.openChannelPageMenu,
  switchChannelTab: channel.switchChannelTab,
  toggleChannelMute: () => channel.toggleChannelMute(),
  copyChannelLink: (id) => channel.copyChannelLink(id),
  openChannelDiscussion: channel.openChannelDiscussion,
  leaveChannelConfirm: () => channel.leaveChannelConfirm(),
  openChannelStory: channel.openChannelStory,
  openChannelMedia: channel.openChannelMedia,
  openChannelMenu: wall.openChannelMenu,
  jumpToPinned: wall.jumpToPinned,
  toggleWallChannelMute: wall.toggleWallChannelMute,
  activeChannel: wall.activeChannel,

  // Developer / about
  devPing: settings.devPing,
  devReconnect: settings.devReconnect,
  devExportLogs: settings.devExportLogs,
  devCopyDiagnostics: settings.devCopyDiagnostics,
  devClearLogs: settings.devClearLogs,
  devExportSession: settings.devExportSession,
  devToggleImport: settings.devToggleImport,
  devImportSession: settings.devImportSession,
  devHardReload: settings.devHardReload,
  checkAppUpdate: settings.checkAppUpdate,
  installModFile: settings.installModFile, installModText: settings.installModText, toggleMod: settings.toggleMod, deleteMod: settings.deleteMod, modSet: settings.modSet, installOfficial: settings.installOfficialMod, installPreset: settings.installPresetMod, setModsTab: settings.setModsTab, setModsQuery: settings.setModsQuery, setModsCat: settings.setModsCat, installCommunity: settings.installCommunityMod, copyAiPrompt: settings.copyAiPrompt, installFromClipboard: settings.installFromClipboard,
  setWorkerMode: settings.setWorkerMode,

  // Profile
  openProfilePage: profile.openProfilePage,
  openProfileMenu: profile.openProfileMenu,
  copyText: profile.copyText,
  pickProfilePhoto: profile.pickProfilePhoto,
  uploadProfilePhoto: profile.uploadProfilePhoto,
  saveProfile: profile.saveProfile,
  openMyStory: profile.openMyStory,

  // Wall
  headerLeft: wall.headerLeft,
  headerPill: wall.headerPill,
  focusSearch: wall.focusSearch,
  openStackStories,
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
  setColorTheme: settings.setColorTheme,
  setThemeMode: settings.setThemeMode,
  toggleDayNight: settings.toggleDayNight,
  setAccent: settings.setAccent,
  setNameColor: settings.setNameColor,
  openChatSettingsMenu: settings.openChatSettingsMenu,
  setLanguage: settings.setLanguage,
  filterLanguages: settings.filterLanguages,
  toggleLanguageSearch: settings.toggleLanguageSearch,
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
  startLive,
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
  authBack,
  authNext,
  authPickCountry,
  authQr,
  authResend,
};

// ---------------- Init ----------------

async function initApp() {
  applyDocumentLanguage();
  document.documentElement.dataset.appVersion = APP_VERSION;
  translateTree(document.body);
  applyAppearance();
  initWallpaperEngine();
  document.addEventListener('tx:themes', () => { applyAppearance(); reapplyModVars(); settings.rerenderSettings(); });
  startMods();
  // "Auto" theme follows the device live (sunset → dark, sunrise → light).
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (getPrefs().theme !== 'auto') return;
      applyAppearance();
      refreshWallpaper();
      postNative('theme:' + resolvedTheme());
      settings.rerenderSettings();
    });
  } catch {}
  postNative('theme:' + resolvedTheme());
  api.warmUp();
  initDock();
  window.addEventListener('tx:view', (e) => { setDockActive(e.detail.view, e.detail.prev); ext.emit('view', e.detail.view); });

  onPrefsChange((p, key) => {
    applyAppearance(p);
    if (WALL_KEYS.has(key) || key === null) wallDirty = true;
    if (RENDER_KEYS.has(key)) rerenderWall = true;
    if (key === 'syncRead' && p.syncRead) showToast(t('Просмотренные посты будут отмечаться прочитанными'));
  });

  registerView('wall', {
    enter: (params) => {
      if (wall.syncChannelMode(params)) return;
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
  registerView('channel', { enter: channel.enterChannel });

  initNav(() => {
    closeMenus();
    if (isStoryOpen()) {
      closeStoryViewer();
      return true;
    }
    if (isViewerOpen()) {
      closeViewer();
      return true;
    }
    return false;
  });

  wall.setupInfiniteScroll();
  wall.initFeedSwipe();
  setupStoriesBar();
  initDevtools();
  setupKeyboard();
  setupResilience();
  setupMediaFadeIn();
  api.onReadChange(() => wall.loadChannels());

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
  if (state.isAuth) {
    await wall.loadChannels();
    startLive();
    loadStories(true);
    maybeOnboard();
  }
}

function startLive() {
  api.startLive({
    onPosts: wall.onLivePosts,
    onEdit: wall.onLiveEdit,
    onReactions: wall.onLiveReactions,
    onViews: wall.onLiveViews,
  });
}

/**
 * Coming back to the tab/app: re-check the Telegram connection and refresh.
 * Also retry images that failed while the connection was down.
 */
/** Media fade in (with a blur-to-sharp settle) once loaded; until then the tile shimmers. */
const FADE_IN = '.tx-media, .tx-round, .tx-pf-cell, .tx-media-cell, .tx-webpage, .tx-story-media, .tx-wp';
function setupMediaFadeIn() {
  const tileOf = (el) => el.closest('.tx-media-tap, .tx-grid > *, .tx-round, .tx-pf-cell, .tx-media-cell');
  const done = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement || el instanceof HTMLVideoElement)) return;
    if (!el.closest(FADE_IN)) return;
    el.classList.add('is-loaded');
    tileOf(el)?.classList.add('has-loaded');
  };
  // A failed load keeps the blurred preview (the retry logic tries again) but stops the shimmer.
  const failed = (e) => {
    const el = e.target;
    if (el instanceof HTMLImageElement && el.closest(FADE_IN)) tileOf(el)?.classList.add('has-error');
  };
  document.addEventListener('load', done, true);
  document.addEventListener('loadeddata', done, true);
  document.addEventListener('error', failed, true);
  // Cards are built off-DOM: a cached image can finish loading before it is
  // inserted, and that load event never reaches the document. Catch those here.
  const markReady = (root) => {
    root.querySelectorAll?.('img:not(.is-loaded)').forEach((img) => {
      if (img.complete && img.naturalWidth && img.closest(FADE_IN)) done({ target: img });
    });
  };
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => { if (n.nodeType === 1) markReady(n.tagName === 'IMG' ? n.parentNode : n); });
  }).observe(document.body, { childList: true, subtree: true });
}

function setupResilience() {
  let lastCheck = Date.now();
  const revive = async () => {
    if (!state.isAuth || Date.now() - lastCheck < 5000) return;
    lastCheck = Date.now();
    const reconnected = await api.ensureAlive();
    if (reconnected || document.getElementById('app').dataset.view === 'wall') wall.loadFeed(true);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revive(); });
  window.addEventListener('tx:resume', revive);
  window.addEventListener('online', revive);
  setInterval(() => { if (document.visibilityState === 'visible' && state.isAuth) api.ensureAlive(); }, 60000);

  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('media/')) return;
    const tries = Number(img.dataset.retry || 0);
    if (tries >= 3) return;
    img.dataset.retry = String(tries + 1);
    setTimeout(() => { img.src = src.replace(/[?#].*$/, '') + `?r=${tries + 1}`; }, 1500 * (tries + 1));
  }, true);
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (storyKey(e) || viewerKey(e)) return;
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
  if (!state.isAuth) state.stories = [];
  renderStories();
  if (state.isAuth) loadStories();
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
    ['reload', t('Обновить стену'), () => wall.refreshFeed()],
    ['search', t('Поиск публикаций'), () => wall.toggleHeaderSearch(true)],
    ['channel', t('Каналы на стене'), () => go('settings', { page: 'wall' })],
    ['brush', t('Обои'), () => openWallpaperModal()],
    ['st-features', t('Моды'), () => go('settings', { page: 'mods' })],
    ...(listMods().some((m) => m.enabled) ? [['reload', t('Отключить все моды'), () => { disableAllMods(); showToast(t('Моды отключены')); }]] : []),
    state.isAuth ? ['logout', t('Выйти'), () => logoutTelegram()] : ['user', t('Войти в Telegram'), () => openAuthModal()],
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
  showToast(t('Кэш очищен'));
  settings.rerenderSettings();
  wall.loadFeed(true);
}

async function logoutTelegram() {
  if (!(await tgDialog({ title: t('Выйти'), text: t('Выйти из Telegram на этом устройстве?'), ok: t('Выйти'), danger: true }))) return;
  await api.logout();
  resetOnboarding();
  Object.assign(state, { isAuth: false, user: null, posts: [], channels: [], cachedComments: {}, activeChannelId: null, feedType: 'all' });
  profile.resetProfile();
  wall.renderPosts();
  go('wall');
  updateAuthUI();
  showToast(t('Вы вышли из аккаунта'));
}

// Modules may finish evaluating after DOMContentLoaded (tg.js awaits the chosen
// Telegram implementation), so start right away if the document is already parsed.
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initApp);
else initApp();
