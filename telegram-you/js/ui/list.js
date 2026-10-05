// Chats tab: folders, archive, search, dialog rows (Telegram for Android look).
import { S, t, tn, on, emit, escapeHtml, avatar, listTime, toast, showMenu } from './store.js';
import { I } from './icons.js';

const root = () => document.getElementById('page-chats');
let query = '';
let searchOpen = false;
let globalHits = [];
let searchTimer = 0;
let showArchive = false;
let openChat = () => {};
export const bindOpen = (fn) => { openChat = fn; };

// ---------------------------------------------------------------- data
function put(d, front = false) {
  const old = S.dialogs.get(d.id);
  S.dialogs.set(d.id, { ...old, ...d });
  if (!S.order.includes(d.id)) front ? S.order.unshift(d.id) : S.order.push(d.id);
}

function sortOrder() {
  const pinned = S.order.filter((k) => S.dialogs.get(k).pinned);
  const rest = S.order.filter((k) => !S.dialogs.get(k).pinned).sort((a, b) => S.dialogs.get(b).date - S.dialogs.get(a).date);
  S.order = [...pinned, ...rest];
}

export async function loadFirst() {
  S.loading = true;
  render();
  try {
    const [page, folders] = await Promise.all([
      S.tg.chatDialogs({ limit: 40 }),
      S.tg.chatFolders().catch(() => []),
    ]);
    S.folders = folders;
    page.dialogs.forEach((d) => put(d));
    S.cursor = page.cursor;
    S.hasMore = page.hasMore;
    sortOrder();
    S.tg.chatDialogs({ limit: 30, archived: true }).then((a) => { S.archived = a.dialogs; render(); }).catch(() => {});
  } catch (e) {
    console.error('[chat] dialogs', e);
    toast(t('Не удалось загрузить чаты'));
  }
  S.loading = false;
  render();
}

async function loadMore() {
  if (S.loading || !S.hasMore) return;
  S.loading = true;
  try {
    const page = await S.tg.chatDialogs({ limit: 40, cursor: S.cursor });
    page.dialogs.forEach((d) => { if (!S.dialogs.has(d.id)) put(d); else S.dialogs.set(d.id, { ...S.dialogs.get(d.id), ...d }); });
    S.cursor = page.cursor;
    S.hasMore = page.hasMore;
    sortOrder();
  } catch (e) { console.warn('[chat] more', e); }
  S.loading = false;
  render(true);
}

// ---------------------------------------------------------------- folders
function matches(f, d) {
  if (f === 'all') return !d.archived;
  if (f === 'personal') return d.kind === 'user' && !d.bot;
  if (f === 'unread') return d.unread > 0 || d.markedUnread;
  const fl = S.folders.find((x) => String(x.id) === String(f));
  if (!fl) return true;
  if (fl.exclude.includes(d.id)) return false;
  if (fl.include.includes(d.id)) return true;
  if (fl.excludeMuted && d.muted) return false;
  if (fl.excludeRead && !d.unread) return false;
  return (fl.nonContacts && d.kind === 'user' && !d.bot)
    || (fl.contacts && d.kind === 'user' && !d.bot)
    || (fl.groups && d.kind === 'group')
    || (fl.broadcasts && d.kind === 'channel')
    || (fl.bots && d.bot);
}
const inFolder = (f) => S.order.map((k) => S.dialogs.get(k)).filter((d) => matches(f, d));
const unreadIn = (f) => inFolder(f).filter((d) => !d.muted && d.unread > 0).length;
export const totalUnread = () => [...S.dialogs.values()].filter((d) => !d.archived && !d.muted && (d.unread > 0 || d.markedUnread)).length;

// ---------------------------------------------------------------- rendering
function previewHtml(d) {
  if (!d.last) return '';
  const typing = S.typing.get(d.id);
  if (typing && typing.until > Date.now()) return `<span style="color:var(--tx-accent)">${escapeHtml(typing.name ? t('{a} печатает…', { a: typing.name }) : t('печатает…'))}</span>`;
  const text = escapeHtml(d.last.text || '');
  const who = d.kind === 'group' && d.last.senderName ? `<b>${escapeHtml(d.last.senderName)}:</b> ` : '';
  return who + text;
}

function ticks(d) {
  if (!d.last || !d.last.out) return '';
  return d.last.id > d.readOutboxMaxId ? I.check : I.checks;
}

function rowHtml(d) {
  const sel = S.openId === d.id ? ' sel' : '';
  const av = d.self ? `<span class="cx-saved-ic">${I.saved}</span>` : avatar(d);
  const title = d.self ? t('Избранное') : d.title;
  const icons = (d.verified ? I.verified : '') + (d.muted ? `<span class="cx-name-ico">${I.mute}</span>` : '');
  const date = listTime(d.date);
  const when = d.pinned
    ? `<span class="cx-date pinned">${I.pin}${escapeHtml(date)}</span>`
    : `<span class="cx-date">${ticks(d)}${escapeHtml(date)}</span>`;
  const badge = d.unread > 0
    ? `<span class="cx-badge ${d.muted ? 'muted' : ''}">${d.unread > 999 ? '999+' : d.unread}</span>`
    : d.markedUnread ? `<span class="cx-badge ${d.muted ? 'muted' : ''}" style="min-width:12px;height:12px;padding:0"></span>` : '';
  return `<div class="cx-row${sel}" data-id="${d.id}">${av}<div class="cx-row-main">
    <div class="cx-line"><span class="cx-name">${escapeHtml(title)}</span>${icons}${when}</div>
    <div class="cx-line"><span class="cx-prev">${previewHtml(d)}</span>${badge}</div></div></div>`;
}

function archiveRow() {
  if (!S.archived.length) return '';
  const names = S.archived.slice(0, 4).map((d) => d.title).join(', ');
  const n = S.archived.filter((d) => d.unread).length;
  return `<div class="cx-row" data-archive="1"><span class="cx-arch-ic">${I.archive}</span><div class="cx-row-main">
    <div class="cx-line"><span class="cx-name">${t('Архив чатов')}</span></div>
    <div class="cx-line"><span class="cx-prev">${escapeHtml(names)}</span>${n ? `<span class="cx-badge muted">${n}</span>` : ''}</div></div></div>`;
}

function foldersHtml() {
  const all = [{ id: 'all', title: t('Все') }, ...(S.folders.length ? S.folders.map((f) => ({ id: String(f.id), title: f.title })) : [{ id: 'personal', title: t('Личные') }, { id: 'unread', title: t('Новые') }])];
  if (all.length < 2) return '';
  return `<div class="cx-folders">${all.map((f) => {
    const n = unreadIn(f.id);
    return `<button class="cx-folder ${S.folder === f.id ? 'on' : ''}" data-f="${f.id}">${escapeHtml(f.title)}${n ? `<i>${n}</i>` : ''}</button>`;
  }).join('')}</div>`;
}

function skeleton() {
  return Array.from({ length: 9 }, () => '<div class="cx-row cx-skel"><span class="tx-avatar"></span><div class="cx-row-main"><div class="cx-line"><i style="height:14px;width:45%;border-radius:7px"></i></div><div class="cx-line"><i style="height:12px;width:75%;border-radius:6px"></i></div></div></div>').join('');
}

export function render(keepScroll = false) {
  const el = root();
  if (!el) return;
  const prevScroll = el.querySelector('.cx-scroll');
  const top = prevScroll ? prevScroll.scrollTop : 0;
  const q = query.trim().toLowerCase();
  let rows = '';
  if (showArchive) {
    rows = S.archived.map(rowHtml).join('') || `<div class="cx-end">${t('Архив пуст')}</div>`;
  } else if (q) {
    const local = S.order.map((k) => S.dialogs.get(k)).filter((d) => d.title.toLowerCase().includes(q) || (d.username || '').toLowerCase().includes(q));
    rows = (local.length ? local.map(rowHtml).join('') : '')
      + (globalHits.length ? `<div class="cx-sect">${t('Глобальный поиск')}</div>${globalHits.map((d) => `<div class="cx-row" data-id="${d.id}">${avatar(d)}<div class="cx-row-main"><div class="cx-line"><span class="cx-name">${escapeHtml(d.title)}</span>${d.verified ? I.verified : ''}</div><div class="cx-line"><span class="cx-prev">${d.username ? '@' + escapeHtml(d.username) : ''}</span></div></div></div>`).join('')}` : '')
      || `<div class="cx-end">${t('Ничего не найдено')}</div>`;
  } else if (S.loading && !S.order.length) {
    rows = skeleton();
  } else {
    const list = inFolder(S.folder);
    rows = (S.folder === 'all' ? archiveRow() : '') + list.map(rowHtml).join('');
    if (!list.length && !S.loading) rows += `<div class="cx-end">${t('Здесь пока пусто')}</div>`;
    if (S.hasMore) rows += '<div class="cx-end" id="cx-more">…</div>';
  }
  el.innerHTML = `
    <div class="cx-top">
      ${showArchive ? `<button class="cx-icon" data-act="unarch" aria-label="${t('Назад')}">${I.back}</button>` : ''}
      ${showArchive ? '' : `<span class="cx-stack">${S.me ? avatar({ id: S.me.id, title: S.me.name, avatar: S.me.avatar }) : ''}</span>`}
      <h1>${showArchive ? t('Архив чатов') : 'Telegram'}</h1>
      <button class="cx-icon" data-act="search" aria-label="${t('Поиск')}">${I.search}</button>
      <button class="cx-icon" data-act="menu" aria-label="${t('Меню')}">${I.more}</button>
    </div>
    ${searchOpen ? `<div class="cx-search">${I.search}<input id="cx-q" placeholder="${t('Поиск')}" value="${escapeHtml(query)}" autocomplete="off"></div>` : ''}
    ${showArchive || searchOpen ? '' : foldersHtml()}
    <div class="cx-scroll" id="cx-list">${rows}</div>
    ${showArchive ? '' : `<button class="cx-fab" data-act="new" aria-label="${t('Новое сообщение')}">${I.fab}</button>`}`;
  const sc = el.querySelector('.cx-scroll');
  if (keepScroll || top) sc.scrollTop = top;
  if (searchOpen) {
    const inp = el.querySelector('#cx-q');
    if (inp && document.activeElement !== inp && !inp.dataset.f) { inp.dataset.f = '1'; inp.focus(); }
  }
  const more = el.querySelector('#cx-more');
  if (more && 'IntersectionObserver' in window) new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); loadMore(); } }, { root: sc, rootMargin: '600px' }).observe(more);
  emit('unread', totalUnread());
}

// ---------------------------------------------------------------- events
function onClick(e) {
  const act = e.target.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'search') { searchOpen = !searchOpen; query = ''; globalHits = []; render(); }
    else if (a === 'unarch') { showArchive = false; render(); }
    else if (a === 'new') emit('tab', 'contacts');
    else if (a === 'menu') {
      const r = act.getBoundingClientRect();
      showMenu(r.right - 240, r.bottom, [
        { icon: I.check, label: t('Прочитать все'), run: markAllRead },
        { icon: I.settingsTab, label: t('Настройки'), run: () => emit('tab', 'settings') },
      ]);
    }
    return;
  }
  const f = e.target.closest('[data-f]');
  if (f) { S.folder = f.dataset.f; render(); return; }
  const row = e.target.closest('.cx-row');
  if (!row) return;
  if (row.dataset.archive) { showArchive = true; render(); return; }
  if (row.dataset.id) openChat(row.dataset.id);
}

function onContext(e) {
  const row = e.target.closest('.cx-row[data-id]');
  if (!row) return;
  e.preventDefault();
  rowMenu(row.dataset.id, e.clientX, e.clientY);
}

function rowMenu(id, x, y) {
  const d = S.dialogs.get(id) || S.archived.find((a) => a.id === id);
  if (!d) return;
  showMenu(x, y, [
    { icon: I.pin, label: d.pinned ? t('Открепить') : t('Закрепить'), run: () => toast(t('Скоро')) },
    { icon: I.mute, label: d.muted ? t('Включить звук') : t('Выключить звук'), run: () => toast(t('Скоро')) },
    { icon: I.check, label: t('Прочитано'), run: async () => { d.unread = 0; d.markedUnread = false; render(true); try { await S.tg.chatMarkRead(id, d.topId); } catch {} } },
  ]);
}

async function markAllRead() {
  for (const d of [...S.dialogs.values()]) {
    if (d.unread > 0 && !d.muted) { d.unread = 0; S.tg.chatMarkRead(d.id, d.topId).catch(() => {}); }
  }
  render(true);
}

export function initList() {
  const el = root();
  el.addEventListener('click', onClick);
  el.addEventListener('contextmenu', onContext);
  let pressTimer = 0;
  el.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.cx-row[data-id]');
    if (!row) return;
    const p = e.touches[0];
    pressTimer = setTimeout(() => { pressTimer = -1; rowMenu(row.dataset.id, p.clientX, p.clientY); }, 520);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((n) => el.addEventListener(n, () => clearTimeout(pressTimer), { passive: true }));
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'cx-q') return;
    query = e.target.value;
    clearTimeout(searchTimer);
    const q = query.trim();
    searchTimer = setTimeout(async () => {
      try { globalHits = q.length > 1 ? (await S.tg.chatSearch(q)).filter((h) => !S.dialogs.has(h.id)) : []; } catch { globalHits = []; }
      if (q === query.trim()) { const inp = el.querySelector('#cx-q'); const pos = inp.selectionStart; render(true); const n = el.querySelector('#cx-q'); n.focus(); n.setSelectionRange(pos, pos); }
    }, 350);
    const inp = el.querySelector('#cx-q'); const pos = inp.selectionStart; render(true); const n = el.querySelector('#cx-q'); n.focus(); n.setSelectionRange(pos, pos);
  });
  on('selected', () => render(true));
}

// Live updates -------------------------------------------------------------
export function onLiveMessage(m) {
  let d = S.dialogs.get(m.chatId);
  const isOpen = S.openId === m.chatId && document.visibilityState === 'visible';
  if (!d) {
    // A chat we haven't loaded: fetch the first page again to learn about it.
    S.tg.chatDialogs({ limit: 20 }).then((p) => { p.dialogs.forEach((x) => put(x, true)); sortOrder(); render(true); }).catch(() => {});
    return;
  }
  d.date = m.date;
  d.topId = m.id;
  d.last = { id: m.id, text: m.service ? m.service.text : (m.text || mediaLabel(m)), out: m.out, senderName: m.out ? t('Вы') : m.senderName };
  if (!m.out && !isOpen) d.unread = (d.unread || 0) + 1;
  S.dialogs.set(d.id, d);
  sortOrder();
  render(true);
}

export function mediaLabel(m) {
  if (!m.media || !m.media.length) return '';
  const x = m.media[0];
  const label = { photo: t('Фото'), video: x.round ? t('Видеосообщение') : t('Видео'), gif: 'GIF', sticker: t('Стикер'), audio: x.is_voice ? t('Голосовое сообщение') : t('Аудио'), document: t('Файл') }[x.type] || t('Файл');
  return m.text ? `${label}, ${m.text}` : label;
}

export function patchDialog(id, patch) {
  const d = S.dialogs.get(id);
  if (!d) return;
  Object.assign(d, patch);
  render(true);
}

export function onLiveRead(key, kind, maxId) {
  const d = S.dialogs.get(key);
  if (!d) return;
  if (kind === 'inbox') { d.readInboxMaxId = maxId; if (maxId >= d.topId) d.unread = 0; }
  else d.readOutboxMaxId = Math.max(d.readOutboxMaxId, maxId);
  render(true);
}

export function onLiveTyping(key, name) {
  S.typing.set(key, { name, until: Date.now() + 6000 });
  render(true);
  setTimeout(() => render(true), 6200);
}

export function removeDialog(id) {
  S.dialogs.delete(id);
  S.order = S.order.filter((k) => k !== id);
  S.archived = S.archived.filter((d) => d.id !== id);
  render(true);
}

/** Full-screen chat picker (forwarding). Resolves a chat key or null. */
export function forwardPicker() {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'cx-picker';
    const draw = (q = '') => {
      const list = S.order.map((k) => S.dialogs.get(k)).filter((d) => !q || d.title.toLowerCase().includes(q));
      box.querySelector('.cx-scroll').innerHTML = list.slice(0, 80).map((d) => `<div class="cx-row" data-id="${d.id}">${d.self ? `<span class="cx-saved-ic">${I.saved}</span>` : avatar(d)}<div class="cx-row-main"><div class="cx-line"><span class="cx-name">${escapeHtml(d.self ? t('Избранное') : d.title)}</span></div></div></div>`).join('');
    };
    box.innerHTML = `<div class="cx-top"><button class="cx-icon" data-x="1">${I.back}</button><h1>${t('Переслать')}</h1></div><div class="cx-search">${I.search}<input placeholder="${t('Поиск')}" autocomplete="off"></div><div class="cx-scroll"></div>`;
    document.body.appendChild(box);
    draw();
    const done = (v) => { box.remove(); resolve(v); };
    box.onclick = (e) => {
      if (e.target.closest('[data-x]')) return done(null);
      const r = e.target.closest('.cx-row[data-id]');
      if (r) done(r.dataset.id);
    };
    box.querySelector('input').oninput = (e) => draw(e.target.value.trim().toLowerCase());
  });
}
