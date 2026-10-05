// Contacts, Settings and Profile tabs.
import { S, t, escapeHtml, avatar, statusText, toast, showMenu } from './store.js';
import { I } from './icons.js';
import { getPrefs, setPref } from '../core/prefs.js';
import { LANGUAGES, lang } from '../i18n.js';

let openChat = () => {};
export const bindOpenPages = (fn) => { openChat = fn; };

// ---------------------------------------------------------------- contacts
let contacts = null;
let cq = '';
export async function renderContacts() {
  const el = document.getElementById('page-contacts');
  if (!contacts) {
    el.innerHTML = head(t('Контакты')) + `<div class="cx-scroll"><div class="cx-loading">…</div></div>`;
    try { contacts = await S.tg.chatContacts(); } catch (e) { console.error(e); contacts = []; toast(t('Не удалось загрузить контакты')); }
  }
  const q = cq.trim().toLowerCase();
  const list = contacts.filter((c) => !q || c.title.toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q));
  let letter = '';
  const rows = list.map((c) => {
    const l = (c.title[0] || '#').toUpperCase();
    const sect = l !== letter ? (letter = l, `<div class="cx-sect">${escapeHtml(l)}</div>`) : '';
    const st = statusText(c.status, 'user');
    return `${sect}<div class="cx-row" data-id="${c.id}">${avatar(c)}<div class="cx-row-main"><div class="cx-line"><span class="cx-name">${escapeHtml(c.title)}</span>${c.verified ? '' : ''}</div><div class="cx-line"><span class="cx-prev" style="${c.status && c.status.kind === 'online' ? 'color:var(--tx-accent)' : ''}">${escapeHtml(st)}</span></div></div></div>`;
  }).join('') || `<div class="cx-end">${t('Контактов нет')}</div>`;
  el.innerHTML = head(t('Контакты')) + `<div class="cx-search">${I.search}<input id="cx-cq" placeholder="${t('Поиск')}" value="${escapeHtml(cq)}" autocomplete="off"></div><div class="cx-scroll">${rows}</div>`;
  el.onclick = (e) => { const r = e.target.closest('.cx-row[data-id]'); if (r) openChat(r.dataset.id); };
  const inp = el.querySelector('#cx-cq');
  inp.oninput = () => { cq = inp.value; const p = inp.selectionStart; renderContacts().then(() => { const n = el.querySelector('#cx-cq'); n.focus(); n.setSelectionRange(p, p); }); };
}
const head = (title) => `<div class="cx-top"><h1>${escapeHtml(title)}</h1></div>`;

// ---------------------------------------------------------------- settings and profile (ported from TeleX, same screens)
import { enterSettings } from '../views/settings.js';
import { enterProfile } from '../views/profile.js';

export function renderSettings(params = {}) {
  const el = document.getElementById('page-settings');
  if (!el.firstElementChild) el.innerHTML = '<div class="cx-scroll cx-views"><div id="settings-root"></div></div>';
  enterSettings(params);
}

export function renderProfile(params = {}) {
  const el = document.getElementById('page-profile');
  if (!el.firstElementChild) el.innerHTML = '<div class="cx-scroll cx-views"><div id="profile-root"></div></div>';
  enterProfile(params);
}
