// Telegram You — boot: appearance, language, auth, tabs, live updates.
import { applyAppearance, getPrefs, onPrefsChange } from '../../js/core/prefs.js';
import { applyDocumentLanguage, translateTree } from '../../js/i18n.js';
import { S, t, on, avatar } from './store.js';
import { I } from './icons.js';
import { initList, loadFirst, render as renderList, bindOpen, onLiveRead, onLiveTyping, totalUnread } from './list.js';
import { openChat, closeChat, liveMessage, liveEdit, liveDelete, liveRead, liveTyping, liveStatus } from './conv.js';
import { renderContacts, renderSettings, renderProfile, bindOpenPages } from './pages.js';

const fake = new URLSearchParams(location.search).has('fake');
const $ = (id) => document.getElementById(id);

async function pickService() {
  if (fake) return (await import('./fake.js')).fake;
  return (await import('../../js/tg.js')).telegram;
}

function dock() {
  const tabs = [
    ['chats', t('Чаты'), I.chats, I.chatsFill],
    ['contacts', t('Контакты'), I.contacts, I.contactsFill],
    ['settings', t('Настройки'), I.settings, I.settingsFill],
    ['profile', t('Профиль'), null, null],
  ];
  const n = totalUnread();
  $('cx-dock').innerHTML = tabs.map(([id, label, ic, fill]) => {
    const on = S.tab === id;
    const icon = id === 'profile' ? (S.me ? avatar({ id: S.me.id, title: S.me.name, avatar: S.me.avatar }) : I.contacts) : (on ? fill : ic);
    const badge = id === 'chats' && n ? `<span class="cx-badge">${n}</span>` : '';
    return `<button class="cx-tab ${on ? 'on' : ''}" data-tab="${id}">${icon}${badge}<span>${label}</span></button>`;
  }).join('');
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
  try { const me = await S.tg.getMe(); if (me) { S.me = me; dock(); renderList(true); } } catch {}
}

async function init() {
  applyDocumentLanguage();
  applyAppearance();
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
