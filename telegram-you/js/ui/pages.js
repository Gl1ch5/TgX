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
let sortBy = 'seen'; // 'seen' (last seen, Telegram default) | 'name'
const SORT_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h12M3 12h9M3 18h6"/><path d="M15 17l3-8 3 8M16 15h4" stroke-width="1.8"/></svg>';
const TGC = { BLUE: '#1CA5ED,#1488E1', GREEN: '#55CA47,#27B434' };
const sq = (icon, color) => { const [a, b] = TGC[color].split(','); return `<span class="tx-row-icon cx-act-ic" style="--c:linear-gradient(180deg,${a},${b})"><i class="icon icon-${icon}"></i></span>`; };
// how recently a contact was seen: online first, then newest; vague statuses after exact ones
const seenRank = (st) => (!st ? 0 : st.kind === 'online' ? 1e12 : st.kind === 'offline' ? st.at : st.kind === 'recently' ? 1e9 : st.kind === 'week' ? 5e8 : st.kind === 'month' ? 2e8 : 0);

export async function renderContacts() {
  const el = document.getElementById('page-contacts');
  if (!contacts) {
    el.innerHTML = head(t('Контакты')) + `<div class="cx-scroll"><div class="cx-loading">…</div></div>`;
    try { contacts = await S.tg.chatContacts(); } catch (e) { console.error(e); contacts = []; toast(t('Не удалось загрузить контакты')); }
  }
  const q = cq.trim().toLowerCase();
  const list = contacts.filter((c) => !q || c.title.toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q));
  if (sortBy === 'seen') list.sort((a, b) => seenRank(b.status) - seenRank(a.status)); else list.sort((a, b) => a.title.localeCompare(b.title));
  const rowOf = (c) => {
    const st = statusText(c.status, 'user');
    return `<div class="cx-row" data-id="${c.id}">${avatar(c)}<div class="cx-row-main"><div class="cx-line"><span class="cx-name">${escapeHtml(c.title)}</span></div><div class="cx-line"><span class="cx-prev" style="${c.status && c.status.kind === 'online' ? 'color:var(--tx-accent)' : ''}">${escapeHtml(st)}</span></div></div></div>`;
  };
  let body = '';
  if (sortBy === 'name') {
    let letter = '';
    body = list.map((c) => { const l = (c.title[0] || '#').toUpperCase(); const sect = l !== letter ? (letter = l, `<div class="cx-sect">${escapeHtml(l)}</div>`) : ''; return sect + rowOf(c); }).join('');
  } else body = `<div class="cx-sect">${t('Сортировка по времени захода')}</div>${list.map(rowOf).join('')}`;
  const actions = q ? '' : `<div class="cx-card"><div class="cx-row" data-act="invite">${sq('st-invite', 'BLUE')}<div class="cx-row-main"><div class="cx-line"><span class="cx-name">${t('Пригласить друзей')}</span></div></div></div><div class="cx-row" data-act="calls">${sq('st-calls', 'GREEN')}<div class="cx-row-main"><div class="cx-line"><span class="cx-name">${t('Недавние звонки')}</span></div></div></div></div>`;
  el.innerHTML = `<div class="cx-top"><h1>${t('Контакты')}</h1><button class="cx-icon" data-act="sort" aria-label="${t('Сортировка')}">${SORT_ICON}</button></div>
    <label class="cx-search"><span class="cx-search-ic">${I.search}</span><input id="cx-cq" placeholder="${t('Поиск контактов')}" value="${escapeHtml(cq)}" autocomplete="off"></label>
    <div class="cx-scroll">${actions}<div class="cx-card">${body || `<div class="cx-end">${t('Контактов нет')}</div>`}</div></div>
    <button class="cx-fab cx-fab-contacts" data-act="addcontact" aria-label="${t('Добавить контакт')}">${I.addUser || I.plus}</button>`;
  el.onclick = (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'sort') { const r = act.getBoundingClientRect(); showMenu(r.right - 250, r.bottom, [{ icon: I.check, label: t('По времени захода'), run: () => { sortBy = 'seen'; renderContacts(); } }, { icon: I.list, label: t('По имени'), run: () => { sortBy = 'name'; renderContacts(); } }]); }
      else if (a === 'invite') { const text = location.origin + location.pathname; if (navigator.share) navigator.share({ title: 'Telegram', text: t('Присоединяйтесь к Telegram'), url: 'https://telegram.org' }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText('https://telegram.org').catch(() => {}); toast(t('Ссылка скопирована')); } }
      else if (a === 'calls') toast(t('Звонки скоро'));
      else if (a === 'addcontact') toast(t('Добавление контактов скоро'));
      return;
    }
    const r = e.target.closest('.cx-row[data-id]'); if (r) openChat(r.dataset.id);
  };
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
