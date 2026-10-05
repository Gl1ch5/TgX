// Telegram You — boot: appearance, language, auth, tabs, live updates.
import { applyAppearance, getPrefs, onPrefsChange } from '../../js/core/prefs.js';
import { applyDocumentLanguage, translateTree } from '../../js/i18n.js';
import { S, t, on, avatar } from './store.js';
import { I } from './icons.js';
import { initList, loadFirst, render as renderList, bindOpen, onLiveRead, onLiveTyping, totalUnread } from './list.js';
import { openChat, closeChat, liveMessage, liveEdit, liveDelete, liveRead, liveTyping, liveStatus, liveReactions } from './conv.js';
import { startMods } from './mods.js';
import { initWallpaperEngine } from '../../js/components/wallpaperTheme.js';
import { renderContacts, renderSettings, renderProfile, bindOpenPages } from './pages.js';

const fake = new URLSearchParams(location.search).has('fake');
const $ = (id) => document.getElementById(id);

async function pickService() {
  if (fake) return (await import('./fake.js')).fake;
  return (await import('../../js/tg.js')).telegram;
}

// Bottom tab bar: original Telegram tab animations (lottie, outline → filled), built once and only updated.
const TABS = [['chats', 'Чаты'], ['contacts', 'Контакты'], ['settings', 'Настройки'], ['profile', 'Профиль']];
const anims = new Map();
let lottieP = null;
const loadLottie = () => lottieP || (lottieP = new Promise((res, rej) => {
  if (window.lottie) return res(window.lottie);
  const s = document.createElement('script');
  s.src = '../js/vendor/lottie_light.min.js';
  s.onload = () => res(window.lottie);
  s.onerror = rej;
  document.head.appendChild(s);
}));

function buildDock() {
  const label = { chats: t('Чаты'), contacts: t('Контакты'), settings: t('Настройки'), profile: t('Профиль') };
  $('cx-dock').innerHTML = TABS.map(([id]) => `<button class="cx-tab" data-tab="${id}"><span class="tabi" data-icon="${id}"></span><span>${label[id]}</span><span class="cx-badge tx-hidden"></span></button>`).join('');
  loadLottie().then((lottie) => {
    for (const id of ['chats', 'contacts', 'settings']) {
      fetch(`../icons/tabs/tab_${id}.json`).then((r) => r.json()).then((data) => {
        const box = document.querySelector(`.tabi[data-icon="${id}"]`);
        if (!box) return;
        const anim = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: data });
        anim.addEventListener('DOMLoaded', () => anim.goToAndStop(S.tab === id ? anim.totalFrames - 1 : 0, true));
        anims.set(id, anim);
      }).catch(() => {});
    }
  }).catch(() => {});
}

let lastTab = null;
function dock() {
  if (!$('cx-dock').firstElementChild) buildDock();
  const n = totalUnread();
  for (const btn of $('cx-dock').children) {
    const id = btn.dataset.tab;
    btn.classList.toggle('on', S.tab === id);
    if (id === 'profile') {
      const box = btn.querySelector('.tabi');
      const key = S.me ? `${S.me.id}|${S.me.avatar}` : '';
      if (box.dataset.key !== key) { box.dataset.key = key; box.innerHTML = S.me ? avatar({ id: S.me.id, title: S.me.name, avatar: S.me.avatar }) : ''; }
    }
    if (id === 'chats') { const b = btn.querySelector('.cx-badge'); b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('tx-hidden', !n); }
  }
  if (lastTab !== S.tab) {
    for (const [id, anim] of anims) {
      if (!anim.totalFrames) continue;
      anim.stop();
      if (id === S.tab && lastTab !== null) anim.playSegments([0, anim.totalFrames - 1], true);
      else anim.goToAndStop(id === S.tab ? anim.totalFrames - 1 : 0, true);
    }
    lastTab = S.tab;
  }
}

function showTab(tab) {
  S.tab = tab;
  for (const id of ['chats', 'contacts', 'settings', 'profile']) $(`page-${id}`).classList.toggle('tx-hidden', id !== tab);
  if (tab === 'contacts') renderContacts();
  if (tab === 'settings') renderSettings();
  if (tab === 'profile') renderProfile();
  dock();
}

function live() {
  S.tg.startChatLive({
    onMessage: liveMessage,
    onEdit: liveEdit,
    onDelete: liveDelete,
    onRead: (k, kind, id) => { onLiveRead(k, kind, id); liveRead(k, kind, id); },
    onTyping: (k, name) => { onLiveTyping(k, name); liveTyping(k); },
    onStatus: liveStatus,
    onReactions: liveReactions,
  }).catch((e) => console.warn('[chat] live', e));
}

async function start() {
  $('cx-app').classList.remove('tx-hidden');
  S.me = S.tg.cachedMe ? S.tg.cachedMe() : null;
  initList();
  bindOpen(openChat);
  bindOpenPages((id) => { showTab('chats'); openChat(id); });
  dock();
  await loadFirst();
  live();
  startMods();
  try { const me = await S.tg.getMe(); if (me) { S.me = me; dock(); renderList(true); } } catch {}
}

async function init() {
  applyDocumentLanguage();
  applyAppearance();
  initWallpaperEngine();
  translateTree(document.body);
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (getPrefs().theme === 'auto') applyAppearance(); }); } catch {}
  onPrefsChange((p) => applyAppearance(p));

  S.tg = await pickService();
  window.TelegramX = {
    authBack: (...a) => import('../../js/components/authModal.js').then((m) => m.authBack(...a)),
    authNext: (...a) => import('../../js/components/authModal.js').then((m) => m.authNext(...a)),
    authPickCountry: (...a) => import('../../js/components/authModal.js').then((m) => m.authPickCountry(...a)),
    authQr: (...a) => import('../../js/components/authModal.js').then((m) => m.authQr(...a)),
    authResend: (...a) => import('../../js/components/authModal.js').then((m) => m.authResend(...a)),
    back: () => history.back(),
    refreshFeed: () => Promise.resolve(),
    startLive: () => {},
    updateSettingsView: () => {},
    updateAuthUI: () => { if (!S.started) { S.started = true; start(); } },
  };

  $('cx-dock').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  on('tab', showTab);
  on('unread', dock);

  if (!fake) {
    try {
      const { initMediaBridge } = await import('../../js/media.js');
      await initMediaBridge('../sw.js', '../');
    } catch (e) { console.error('[chat] media bridge', e); }
  }

  let authed = false;
  try { authed = await S.tg.isAuthorized(); } catch (e) { console.error('[chat] auth check', e); }
  if (authed) { S.started = true; start(); } else { (await import('../../js/components/authModal.js')).openAuthModal(); }
}

init().catch((e) => { console.error('[chat] init', e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;margin:0;padding:20px;background:#000;color:#f66;z-index:999;white-space:pre-wrap">${String(e && e.stack || e)}</pre>`); });
