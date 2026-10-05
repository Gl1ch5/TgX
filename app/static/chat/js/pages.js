// Contacts, Settings and Profile tabs.
import { S, t, escapeHtml, avatar, statusText, toast, showMenu } from './store.js';
import { I } from './icons.js';
import { getPrefs, setPref } from '../../js/core/prefs.js';
import { LANGUAGES, lang } from '../../js/i18n.js';

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

// ---------------------------------------------------------------- settings
export function renderSettings() {
  const el = document.getElementById('page-settings');
  const p = getPrefs();
  const me = S.me;
  const langName = (LANGUAGES.find((l) => l.code === lang()) || LANGUAGES[0]).name;
  const seg = (v, label) => `<button data-theme="${v}" class="${p.theme === v ? 'on' : ''}">${label}</button>`;
  el.innerHTML = head(t('Настройки')) + `<div class="cx-scroll">
    ${me ? `<div class="cx-me">${avatar({ id: me.id, title: me.name, avatar: me.avatar_big || me.avatar })}<b>${escapeHtml(me.name)}</b><span>${me.phone ? '+' + escapeHtml(me.phone) : ''}${me.username ? ' · @' + escapeHtml(me.username) : ''}</span></div>` : ''}
    <div class="cx-sect">${t('Тема')}</div>
    <div class="cx-seg">${seg('auto', t('Авто'))}${seg('light', t('Светлая'))}${seg('dark', t('Тёмная'))}</div>
    <div class="cx-card" style="margin-top:14px">
      <button class="cx-set" data-act="lang">${I.globe}<span>${t('Язык')}</span><em>${escapeHtml(langName)}</em></button>
      <a class="cx-set" href="../" style="text-decoration:none;color:inherit">${I.wall}<span>${t('Стена каналов TeleX')}</span></a>
    </div>
    <div class="cx-card"><button class="cx-set danger" data-act="logout">${I.logout}<span>${t('Выйти')}</span></button></div>
    <div class="cx-end">TeleX Chat · ${t('неофициальный клиент Telegram')}</div></div>`;
  el.onclick = async (e) => {
    const th = e.target.closest('[data-theme]');
    if (th) { setPref('theme', th.dataset.theme); renderSettings(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'lang') {
      const r = act.getBoundingClientRect();
      showMenu(r.left, r.top - 8, [{ label: t('Автоматически'), run: () => setLang('auto') }, ...LANGUAGES.map((l) => ({ label: l.name, run: () => setLang(l.code) }))]);
    }
    if (act.dataset.act === 'logout' && confirm(t('Выйти из аккаунта?'))) { try { await S.tg.logout(); } catch {} location.reload(); }
  };
}
function setLang(code) { setPref('lang', code); location.reload(); }

// ---------------------------------------------------------------- profile
export async function renderProfile() {
  const el = document.getElementById('page-profile');
  const me = S.me;
  if (!me) { el.innerHTML = head(t('Профиль')); return; }
  el.innerHTML = head(t('Профиль')) + `<div class="cx-scroll"><div class="cx-me">${avatar({ id: me.id, title: me.name, avatar: me.avatar_big || me.avatar })}<b>${escapeHtml(me.name)}</b><span>${t('в сети')}</span></div>
    <div class="cx-card">
      ${me.phone ? `<div class="cx-set"><span>+${escapeHtml(me.phone)}</span><em>${t('Телефон')}</em></div>` : ''}
      ${me.username ? `<div class="cx-set"><span>@${escapeHtml(me.username)}</span><em>${t('Имя пользователя')}</em></div>` : ''}
      <div class="cx-set" id="cx-about" style="display:none"><span></span><em>${t('О себе')}</em></div>
    </div></div>`;
  try {
    const full = await S.tg.getFullMe();
    if (full.about) { const a = el.querySelector('#cx-about'); a.style.display = ''; a.firstElementChild.textContent = full.about; }
  } catch {}
}
