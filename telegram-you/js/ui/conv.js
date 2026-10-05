// Conversation screen: header pills, bubbles, composer, live updates.
import { S, t, tn, on, emit, escapeHtml, avatar, mu, msgTime, dayLabel, dayKey, statusText, showMenu, confirmBox, toast, peerColor } from './store.js';
import { I } from './icons.js';
import { patchDialog, onLiveMessage as listMessage, mediaLabel, removeDialog, forwardPicker } from './list.js';
import { toggleEmojiPanel, closePanel } from './panel.js';
import { openProfile } from './profile.js';
import { ext } from './ext.js';
import { bindModsHost } from './mods.js';
import { WALLPAPERS, applyWallpaper } from '../components/wallpaperTheme.js';

const el = () => document.getElementById('cx-conv');
const app = () => document.getElementById('cx-app');
let cur = null; // { id, dlg, msgs, hasMore, loading, reply, edit, unseen, atBottom }
let tmp = 0;
const draft = new Map();

// ---------------------------------------------------------------- open / close
export async function openChat(id) {
  const dlg = S.dialogs.get(id) || S.archived.find((d) => d.id === id) || await dialogFromSearch(id);
  if (!dlg) return toast(t('Чат не найден'));
  if (cur && cur.id === id && !app().dataset.open) { app().dataset.open = '1'; return; }
  S.openId = id;
  cur = { id, dlg, msgs: [], hasMore: true, loading: false, reply: null, edit: null, unseen: 0, atBottom: true };
  app().dataset.open = '1';
  document.getElementById('cx-empty').classList.add('tx-hidden');
  el().classList.remove('tx-hidden');
  if (!history.state || history.state.chat !== id) history.pushState({ chat: id }, '');
  buildShell();
  emit('selected', id);
  loadPins();
  loadAppearance();
  await loadOlder(true);
}

async function dialogFromSearch(id) {
  try {
    const hit = (await S.tg.chatSearch(id)).find((h) => h.id === id);
    return hit ? { ...hit, unread: 0, readOutboxMaxId: 0, readInboxMaxId: 0, topId: 0, status: null, muted: false } : null;
  } catch { return null; }
}

export function closeChat(fromPop = false) {
  if (!cur) return;
  saveDraft();
  closePanel();
  S.openId = null;
  cur = null;
  delete app().dataset.open;
  setTimeout(() => { if (!cur) { el().classList.add('tx-hidden'); el().innerHTML = ''; document.getElementById('cx-empty').classList.remove('tx-hidden'); } }, 280);
  if (!fromPop && history.state && history.state.chat) history.back();
  emit('selected', null);
}
window.addEventListener('popstate', () => { if (cur && !(history.state && history.state.chat)) closeChat(true); });
export const currentChat = () => (cur ? cur.id : null);

// ---------------------------------------------------------------- shell
function headerStatus() {
  const d = cur.dlg;
  const tp = S.typing.get(d.id);
  if (tp && tp.until > Date.now()) return { text: tp.name && d.kind !== 'user' ? t('{a} печатает', { a: tp.name }) : t('печатает'), live: true, dots: true };
  const s = d.self ? '' : statusText(d.status, d.kind);
  return { text: s, live: d.status && d.status.kind === 'online' };
}

function headerHtml() {
  const d = cur.dlg;
  if (cur.sel) {
    return `<div class="cx-head"><button class="cx-back cx-pill" style="display:flex" data-a="unsel" aria-label="${t('Отмена')}">${I.close}</button>
      <div class="cx-who cx-pill" style="font-size:20px;font-weight:500;padding-left:22px">${t('Выбрано {a}', { a: cur.sel.size })}</div>
      <div class="cx-actions cx-pill"><button class="cx-call" data-a="selcopy" aria-label="${t('Копировать')}">${I.copy}</button><button class="cx-call" data-a="selfwd" aria-label="${t('Переслать')}">${I.forward}</button><button class="cx-menu-btn" data-a="seldel" aria-label="${t('Удалить')}">${I.trash}</button></div></div>`;
  }
  if (cur.search) {
    return `<div class="cx-head"><button class="cx-back cx-pill" style="display:flex" data-a="unsearch" aria-label="${t('Назад')}">${I.back}</button>
      <div class="cx-who cx-pill" style="padding-left:18px"><input id="cx-sq" class="cx-sq" placeholder="${t('Поиск')}" value="${escapeHtml(cur.search.q)}" autocomplete="off"></div></div>`;
  }
  const st = headerStatus();
  return `<div class="cx-head">
    <button class="cx-back cx-pill" data-a="back" aria-label="${t('Назад')}">${I.back}</button>
    <button class="cx-who cx-pill" data-a="info">${d.self ? `<span class="cx-saved-ic" style="width:44px;height:44px">${I.saved}</span>` : avatar(d)}
      <span class="cx-who-t"><b>${escapeHtml(d.self ? t('Избранное') : d.title)}${d.verified ? I.verified : ''}${d.muted ? `<span class="cx-name-ico">${I.mute}</span>` : ''}</b>
      <span class="${st.live ? 'live' : ''} ${st.dots ? 'cx-typing-dots' : ''}">${escapeHtml(st.text)}</span></span></button>
    <div class="cx-actions cx-pill"><button class="cx-call" data-a="call" aria-label="${t('Звонок')}">${I.call}</button><button class="cx-menu-btn" data-a="menu" aria-label="${t('Меню')}">${I.more}</button></div>
  </div>`;
}

function pinHtml() {
  if (!cur.pins || !cur.pins.length || cur.sel || cur.search) return '';
  const p = cur.pins[cur.pinIdx % cur.pins.length];
  const n = cur.pins.length;
  const bars = n > 1 ? `<span class="segs">${cur.pins.slice(0, 4).map((_, i) => `<i class="${i === cur.pinIdx % cur.pins.length ? 'on' : ''}"></i>`).join('')}</span>` : '<span class="segs"><i class="on"></i></span>';
  return `<div class="cx-pinbar cx-pill" data-a="pin">${bars}<div><b>${t('Закреплённое сообщение')}${n > 1 ? ` #${cur.pins.length - (cur.pinIdx % n)}` : ''}</b><span>${escapeHtml(p.text || '')}</span></div><button class="cx-icon" data-a="pinlist" aria-label="${t('Все закреплённые')}">${I.pinlist}</button></div>`;
}

function refreshPin() {
  const box = el().querySelector('#cx-pin');
  if (!box) return;
  box.innerHTML = pinHtml();
  const msgs = el().querySelector('#cx-msgs');
  if (msgs) msgs.classList.toggle('haspin', !!box.innerHTML);
}

function buildShell() {
  const d = cur.dlg;
  const readonly = d.kind === 'channel' && !d.admin;
  el().innerHTML = `${headerHtml()}
    <div id="cx-pin" class="cx-pinwrap"></div>
    <div id="cx-fday" class="cx-fday"></div>
    <div class="cx-msgs" id="cx-msgs"><div class="spacer"></div><div class="cx-loading" id="cx-ld">…</div></div>
    <div id="cx-selbar" class="cx-selbar tx-hidden"><button class="cx-pill" data-a="selreply">${t('Ответить')} ${I.reply}</button><button class="cx-pill" data-a="selfwd">${t('Переслать')} ${I.forward}</button></div>
    <button class="cx-jump cx-pill tx-hidden" id="cx-jump" aria-label="${t('Вниз')}">${I.down}</button>
    ${readonly ? `<div class="cx-ro"><button class="cx-pill" style="padding:12px 28px;font-size:16px;font-weight:500;color:var(--tx-accent)" data-a="mute">${d.muted ? t('Включить звук') : t('Выключить звук')}</button></div>` : `
    <div class="cx-comp">
      <div class="cx-box">
        <div id="cx-ctx"></div>
        <div class="cx-field">
          <button class="cx-fi" id="cx-emo" data-a="emoji" aria-label="${t('Эмодзи')}">${I.smile}</button>
          <textarea id="cx-input" rows="1" placeholder="${t('Сообщение')}" enterkeyhint="send"></textarea>
          <button class="cx-fi" data-a="attach" aria-label="${t('Прикрепить')}">${I.attach}</button>
          <button class="cx-send" id="cx-send" data-a="send" aria-label="${t('Отправить')}">${I.mic}</button>
        </div>
      </div>
      <input type="file" id="cx-file" multiple hidden>
    </div><div id="cx-panel" class="cx-panel tx-hidden"></div>`}`;
  const box = el().querySelector('#cx-msgs');
  box.addEventListener('scroll', onScroll, { passive: true });
  el().onclick = onClick;
  el().oncontextmenu = onContext;
  bindTouchMenu(box);
  const inp = el().querySelector('#cx-input');
  if (inp) {
    inp.value = draft.get(cur.id) || '';
    inp.addEventListener('input', onInput);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover:hover)').matches) { e.preventDefault(); send(); }
      if (e.key === 'Escape') cancelCtx();
    });
    inp.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); files.forEach((f) => sendFile(f)); }
    });
    fit(inp);
    syncSend();
    el().querySelector('#cx-file').onchange = (e) => { [...e.target.files].forEach((f) => sendFile(f)); e.target.value = ''; };
  }
  el().addEventListener('dragover', (e) => e.preventDefault());
  el().addEventListener('drop', (e) => { e.preventDefault(); [...(e.dataTransfer?.files || [])].forEach((f) => sendFile(f)); });
}

function refreshHeader() {
  if (!cur) return;
  const h = el().querySelector('.cx-head');
  if (h) h.outerHTML = headerHtml();
}

// ---------------------------------------------------------------- history
async function loadOlder(first = false) {
  if (!cur || cur.loading || !cur.hasMore) return;
  const id = cur.id;
  cur.loading = true;
  const box = el().querySelector('#cx-msgs');
  const oldest = cur.msgs.length ? cur.msgs[0].id : 0;
  try {
    const res = await S.tg.chatHistory(id, { offsetId: oldest, limit: first ? 30 : 40 });
    if (!cur || cur.id !== id) return;
    cur.hasMore = res.hasMore;
    const before = box.scrollHeight;
    cur.msgs = [...res.messages, ...cur.msgs];
    renderAll();
    if (first) { scrollBottom(); markRead(); } else box.scrollTop += box.scrollHeight - before;
  } catch (e) {
    console.error('[chat] history', e);
    toast(t('Не удалось загрузить сообщения'));
  }
  if (cur && cur.id === id) {
    cur.loading = false;
    const ld = el().querySelector('#cx-ld');
    if (ld) ld.remove();
  }
}

function onScroll() {
  const box = el().querySelector('#cx-msgs');
  if (!box || !cur) return;
  cur.atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  floatDay();
  if (cur.atBottom) { cur.unseen = 0; markRead(); }
  updateJump();
  if (box.scrollTop < 300) loadOlder();
}

function updateJump() {
  const j = el().querySelector('#cx-jump');
  if (!j || !cur) return;
  j.classList.toggle('tx-hidden', cur.atBottom);
  j.innerHTML = I.down + (cur.unseen ? `<span class="cx-badge">${cur.unseen}</span>` : '');
}

function scrollBottom(smooth = false) {
  const box = el().querySelector('#cx-msgs');
  if (box) box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

let readTimer = 0;
function markRead() {
  if (!cur || document.visibilityState !== 'visible') return;
  const d = cur.dlg;
  const last = cur.msgs.filter((m) => !m.out && m.id > 0).pop();
  if (!last && !d.unread) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    if (!cur) return;
    const top = cur.msgs.length ? cur.msgs[cur.msgs.length - 1].id : d.topId;
    if (d.unread || d.markedUnread) {
      patchDialog(d.id, { unread: 0, markedUnread: false });
      S.tg.chatMarkRead(d.id, top).catch(() => {});
    }
  }, 250);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') markRead(); });

// ---------------------------------------------------------------- rendering
const sameRun = (a, b) => a && b && !a.service && !b.service && a.out === b.out && a.senderKey === b.senderKey && dayKey(a.date) === dayKey(b.date) && Math.abs(b.date - a.date) < 300;

function mediaHtml(m) {
  const x = m.media && m.media[0];
  if (!x) return '';
  const ratio = x.width && x.height ? `style="aspect-ratio:${x.width}/${x.height}"` : '';
  const prev = x.preview ? `style="background-image:url(${x.preview});background-size:cover"` : '';
  if (x.type === 'photo') return `<span class="cx-media" data-view="${escapeHtml(mu(x.full_url))}" data-kind="photo" ${ratio} ${prev}><img src="${escapeHtml(mu(x.url))}" alt="" loading="lazy" ${ratio}></span>`;
  if (x.type === 'sticker') return `<span class="cx-sticker"><img src="${escapeHtml(mu(x.thumb_url || x.url))}" alt="" loading="lazy"></span>`;
  if (x.type === 'gif') return `<span class="cx-media" ${ratio}><video src="${escapeHtml(mu(x.url))}" autoplay loop muted playsinline></video></span>`;
  if (x.type === 'video') return `<span class="cx-media" data-view="${escapeHtml(mu(x.url))}" data-kind="video" ${ratio} ${prev}>${x.thumb_url ? `<img src="${escapeHtml(mu(x.thumb_url))}" alt="" loading="lazy" ${ratio}>` : '<div style="aspect-ratio:16/10"></div>'}<span class="play">${I.play}</span></span>`;
  if (x.type === 'audio') {
    const bars = (x.waveform && x.waveform.length ? x.waveform : Array.from({ length: 36 }, (_, i) => 8 + ((i * 7) % 18))).map((v) => `<i style="height:${Math.max(3, Math.round((v / 31) * 26))}px"></i>`).join('');
    const dur = `${Math.floor(x.duration / 60)}:${String(x.duration % 60).padStart(2, '0')}`;
    return `<span class="cx-voice" data-audio="${escapeHtml(mu(x.url))}"><span class="cx-doc-ic" data-a="play">${I.play}</span><span class="wave">${bars}</span><span>${dur}</span></span>`;
  }
  const size = x.size ? `${(x.size / 1048576).toFixed(x.size > 1048576 ? 1 : 2)} MB` : '';
  return `<a class="cx-doc" href="${escapeHtml(mu(x.url))}" download="${escapeHtml(x.filename || '')}"><span class="cx-doc-ic">${I.file}</span><span><b>${escapeHtml(x.filename || t('Файл'))}</b><span>${size}</span></span></a>`;
}

function bubbleHtml(m, prev, next, group) {
  if (m.service) {
    const tail = m.service.pin && m.replyTo && m.replyTo.text ? ` «${m.replyTo.text.slice(0, 40)}»` : '';
    return `<div class="cx-service" data-id="${m.id}">${escapeHtml(m.service.text + tail)}</div>`;
  }
  const first = !sameRun(prev, m);
  const last = !sameRun(m, next);
  const x = m.media && m.media[0];
  const onlyMedia = x && !m.text && (x.type === 'photo' || x.type === 'video' || x.type === 'gif');
  const sticker = x && x.type === 'sticker';
  const cls = ['cx-bubble', last ? 'cont' : '', sticker ? 'sticker' : '', onlyMedia ? 'ovl' : ''].join(' ');
  const showName = group && !m.out && first && !sticker;
  const read = m.out && m.id > 0 && m.id <= cur.dlg.readOutboxMaxId;
  const tick = m.out ? (m.status === 'pending' ? I.clock : m.status === 'failed' ? '!' : `<span class="${read ? 'rd' : ''}">${read ? I.checks : I.check}</span>`) : '';
  const meta = `<span class="cx-meta">${m.pinned ? I.pin : ''}${m.edited ? t('изменено') + ' ' : ''}${msgTime(m.date)}${tick}</span>`;
  const reply = m.replyTo ? `<span class="reply" data-reply="${m.replyTo.id}"><b>${escapeHtml(m.replyTo.name || '')}</b><span>${escapeHtml(m.replyTo.text || '')}</span></span>` : '';
  const fwd = m.fwd ? `<span class="fwd">${t('Переслано от {a}', { a: escapeHtml(m.fwd.name) })}</span>` : '';
  const name = showName ? `<span class="nm tx-peer-name tx-peer-${peerColor(m.senderKey)}">${escapeHtml(m.senderName)}</span>` : '';
  const text = m.html ? `<span class="tx-body">${linkify(m.html).replace(/\n/g, '<br>')}</span>` : '';
  const web = m.webpage && m.webpage.url ? `<a class="cx-web" href="${escapeHtml(m.webpage.url)}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(m.webpage.site_name || m.webpage.display_url || '')}</b>${m.webpage.title ? `<span><b style="color:inherit">${escapeHtml(m.webpage.title)}</b></span>` : ''}${m.webpage.description ? `<span>${escapeHtml(m.webpage.description.slice(0, 160))}</span>` : ''}</a>` : '';
  const react = m.reactions && m.reactions.length ? `<div class="cx-react">${m.reactions.map((r) => `<span class="${r.chosen ? 'mine' : ''}">${escapeHtml(r.emoji || '⭐')} ${r.count}</span>`).join('')}</div>` : '';
  const av = group && !m.out ? (last ? avatar({ id: m.senderKey, title: m.senderName, avatar: m.senderAvatar }) : '<span class="av-gap"></span>') : '';
  const body = `${name}${fwd}${reply}${mediaHtml(m)}${text}${web}${meta}${react}`;
  return `<div class="cx-msg ${m.out ? 'out' : ''} ${first ? 'first' : ''} ${m.status === 'pending' ? 'pending' : ''} ${m.status === 'failed' ? 'failed' : ''} ${cur.sel && cur.sel.has(m.id) ? 'sel' : ''}" data-id="${m.id}"><span class="sel-dot">${I.check}</span>${av}<div class="${cls}">${body}</div></div>`;
}

/** Turns bare URLs of already-escaped text into links (entities already made some). */
function linkify(html) {
  return html.replace(/(^|[\s>])((?:https?:\/\/)[^\s<]+)/g, (m, a, u) => (/<a [^>]*$/.test(html.slice(0, html.indexOf(m))) ? m : `${a}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`));
}

function chunk(from, to) {
  const group = cur.dlg.kind !== 'user';
  let out = '';
  for (let i = from; i < to; i++) {
    const m = cur.msgs[i];
    const prev = cur.msgs[i - 1];
    if (!prev || dayKey(prev.date) !== dayKey(m.date)) out += `<div class="cx-day" data-i="${i}">${escapeHtml(dayLabel(m.date))}</div>`;
    out += bubbleHtml(m, prev, cur.msgs[i + 1], group);
  }
  return out;
}

function renderAll() {
  const box = el().querySelector('#cx-msgs');
  box.innerHTML = `<div class="spacer"></div>${chunk(0, cur.msgs.length)}`;
}

function appendMsg(m) {
  const box = el().querySelector('#cx-msgs');
  const back = Math.min(cur.msgs.length - 1, 4);
  const from = Math.max(0, cur.msgs.length - 1 - back);
  // drop the last few nodes and render them again (the run's tail/avatar changes)
  const ids = cur.msgs.slice(from, -1).map((x) => String(x.id));
  [...box.querySelectorAll('.cx-msg, .cx-service')].filter((n) => ids.includes(n.dataset.id)).forEach((n) => n.remove());
  [...box.querySelectorAll('.cx-day')].filter((n) => Number(n.dataset.i) >= from).forEach((n) => n.remove());
  box.insertAdjacentHTML('beforeend', chunk(from, cur.msgs.length));
}

// ---------------------------------------------------------------- live events
export function liveMessage(m) {
  listMessage(m);
  if (!cur || cur.id !== m.chatId) return;
  if (cur.msgs.some((x) => x.id === m.id)) return;
  // our own message might be the pending copy already
  const pend = cur.msgs.findIndex((x) => x.status === 'pending' && x.out && x.text === m.text);
  if (m.out && pend >= 0) return;
  cur.msgs.push(m);
  ext.emit('message', m);
  appendMsg(m);
  if (cur.atBottom || m.out) { scrollBottom(true); markRead(); }
  else { cur.unseen += 1; updateJump(); }
}

export function liveEdit(m) {
  if (!cur || cur.id !== m.chatId) return;
  const i = cur.msgs.findIndex((x) => x.id === m.id);
  if (i < 0) return;
  cur.msgs[i] = { ...cur.msgs[i], ...m, replyTo: m.replyTo || cur.msgs[i].replyTo };
  const node = el().querySelector(`.cx-msg[data-id="${m.id}"]`);
  if (node) node.outerHTML = bubbleHtml(cur.msgs[i], cur.msgs[i - 1], cur.msgs[i + 1], cur.dlg.kind !== 'user');
}

export function liveDelete(key, ids) {
  if (!cur || (key && key !== cur.id)) return;
  const set = new Set(ids);
  if (!cur.msgs.some((m) => set.has(m.id))) return;
  cur.msgs = cur.msgs.filter((m) => !set.has(m.id));
  const keep = el().querySelector('#cx-msgs').scrollTop;
  renderAll();
  el().querySelector('#cx-msgs').scrollTop = keep;
}

export function liveRead(key, kind, maxId) {
  if (!cur || cur.id !== key || kind !== 'outbox') return;
  cur.dlg.readOutboxMaxId = Math.max(cur.dlg.readOutboxMaxId || 0, maxId);
  const keep = el().querySelector('#cx-msgs').scrollTop;
  renderAll();
  el().querySelector('#cx-msgs').scrollTop = keep;
}

export function liveTyping(key) {
  if (cur && cur.id === key) { refreshHeader(); setTimeout(refreshHeader, 6200); }
}
export function liveStatus(key, status) {
  const d = S.dialogs.get(key);
  if (d) d.status = status;
  if (cur && cur.id === key) { cur.dlg.status = status; refreshHeader(); }
}


// ---------------------------------------------------------------- chat wallpaper and theme (from Telegram)
const looks = new Map(); // chat key -> appearance (cached for the session)
async function loadAppearance() {
  const id = cur.id;
  let a = looks.get(id);
  if (a === undefined) {
    try { a = await S.tg.chatAppearance(id); } catch { a = null; }
    looks.set(id, a);
  }
  if (cur && cur.id === id) applyLook(a);
}

function wallCss(w) {
  const c = w.colors || [];
  if (!c.length) return '#000';
  if (c.length === 1) return c[0];
  if (c.length === 2) return `linear-gradient(${(w.rotation || 0) + 180}deg, ${c[0]}, ${c[1]})`;
  // Telegram's 3/4-colour "freeform" gradient: approximated with corner glows
  const at = ['18% 12%', '86% 30%', '14% 88%', '82% 86%'];
  return c.map((col, i) => `radial-gradient(circle at ${at[i]}, ${col} 0, transparent 70%)`).join(', ') + `, ${c[0]}`;
}

function applyLook(a) {
  const conv = el();
  conv.querySelector('.cx-wall')?.remove();
  conv.style.removeProperty('--tx-bubble-out');
  if (!a) return;
  const dark = document.documentElement.dataset.theme !== 'light';
  const variant = a.theme ? (dark ? a.theme.dark : a.theme.light) || a.theme.dark || a.theme.light : null;
  if (variant && variant.out && variant.out.length) {
    conv.style.setProperty('--tx-bubble-out', variant.out.length > 1 ? `linear-gradient(180deg, ${variant.out.join(', ')})` : variant.out[0]);
  }
  const w = a.wallpaper || (variant && variant.wallpaper);
  if (!w) return;
  const box = document.createElement('div');
  box.className = 'cx-wall';
  if (w.kind === 'image') {
    box.innerHTML = `<i class="img ${w.blur ? 'blur' : ''}" style="background-image:url('${mu(w.url)}')"></i>`;
  } else {
    const fill = wallCss(w);
    const neg = w.intensity != null && w.intensity < 0;
    const op = Math.abs(w.intensity == null ? 50 : w.intensity) / 100;
    box.style.background = neg ? '#000' : fill;
    if (w.kind === 'pattern' && w.url) {
      box.innerHTML = `<i class="pat" style="-webkit-mask-image:url('${mu(w.url)}');mask-image:url('${mu(w.url)}');background:${neg ? fill : '#000'};opacity:${op}"></i>`;
    }
  }
  conv.prepend(box);
}

// ---------------------------------------------------------------- floating date while scrolling
let dayTimer = 0;
function floatDay() {
  const box = el().querySelector('#cx-msgs');
  const chip = el().querySelector('#cx-fday');
  if (!box || !chip || !cur) return;
  const top = box.getBoundingClientRect().top + (box.classList.contains('haspin') ? 130 : 70);
  const nodes = box.querySelectorAll('.cx-msg, .cx-service');
  let hit = null;
  for (const n of nodes) { if (n.getBoundingClientRect().bottom > top) { hit = n; break; } }
  const m = hit && cur.msgs.find((x) => String(x.id) === hit.dataset.id);
  if (!m) return;
  chip.textContent = dayLabel(m.date);
  chip.classList.add('on');
  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => chip.classList.remove('on'), 1100);
}

// ---------------------------------------------------------------- pinned messages, jumping
async function loadPins() {
  const id = cur.id;
  try {
    const list = await S.tg.chatPinned(id);
    if (!cur || cur.id !== id) return;
    cur.pins = list;
    cur.pinIdx = 0;
    refreshPin();
  } catch { /* chats without pins / no rights */ }
}

async function jumpTo(id) {
  if (!cur) return;
  let node = el().querySelector(`.cx-msg[data-id="${id}"]`);
  if (!node) {
    try {
      const res = await S.tg.chatHistory(cur.id, { offsetId: id + 15, limit: 40 });
      cur.msgs = res.messages;
      cur.hasMore = res.hasMore;
      renderAll();
      node = el().querySelector(`.cx-msg[data-id="${id}"]`);
    } catch { return toast(t('Сообщение недоступно')); }
  }
  if (node) {
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.animate([{ filter: 'brightness(1.7)' }, { filter: 'none' }], { duration: 1000 });
  }
  const box = el().querySelector('#cx-msgs');
  cur.atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  updateJump();
}

// ---------------------------------------------------------------- selection mode
function enterSelect(id) {
  cur.sel = new Set([Number(id)]);
  applySel();
}
function toggleSel(id) {
  id = Number(id);
  cur.sel.has(id) ? cur.sel.delete(id) : cur.sel.add(id);
  if (!cur.sel.size) return exitSelect();
  applySel();
}
function exitSelect() {
  cur.sel = null;
  applySel();
}
function applySel() {
  const c = el();
  c.classList.toggle('selecting', !!cur.sel);
  c.querySelectorAll('.cx-msg').forEach((n) => n.classList.toggle('sel', !!cur.sel && cur.sel.has(Number(n.dataset.id))));
  refreshHeader();
  refreshPin();
  c.querySelector('#cx-selbar').classList.toggle('tx-hidden', !cur.sel);
  const comp = c.querySelector('.cx-comp');
  if (comp) comp.classList.toggle('tx-hidden', !!cur.sel);
}
const selected = () => cur.msgs.filter((m) => cur.sel && cur.sel.has(m.id));

async function deleteMsgs(list) {
  const ids = list.filter((m) => m.id > 0).map((m) => m.id);
  if (!ids.length) return;
  const ok = await confirmBox(ids.length > 1 ? t('Удалить {a} сообщ.?', { a: ids.length }) : t('Удалить сообщение?'), t('Удалить'));
  if (!ok) return;
  try { await S.tg.chatDelete(cur.id, ids, true); liveDelete(cur.id, ids); } catch { toast(t('Не удалось удалить')); }
  if (cur.sel) exitSelect();
}

async function forwardMsgs(list) {
  const ids = list.filter((m) => m.id > 0).map((m) => m.id);
  if (!ids.length) return;
  const to = await forwardPicker();
  if (!to) return;
  try { await S.tg.chatForward(cur.id, ids, to); toast(t('Переслано')); } catch { toast(t('Не удалось переслать')); }
  if (cur.sel) exitSelect();
}

// ---------------------------------------------------------------- search in chat
function startSearch() {
  cur.search = { q: '', results: [] };
  refreshHeader();
  refreshPin();
  const inp = el().querySelector('#cx-sq');
  inp.focus();
  let timer = 0;
  inp.oninput = () => {
    cur.search.q = inp.value;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = inp.value.trim();
      if (q.length < 2) { cur.search.results = []; return renderSearch(); }
      try { cur.search.results = await S.tg.chatSearchIn(cur.id, q); } catch { cur.search.results = []; }
      renderSearch();
    }, 350);
  };
}
function renderSearch() {
  let box = el().querySelector('#cx-results');
  if (!box) { box = document.createElement('div'); box.id = 'cx-results'; box.className = 'cx-results'; el().appendChild(box); }
  box.innerHTML = cur.search.results.length ? cur.search.results.map((m) => `<div class="cx-row" data-jump="${m.id}">${avatar({ id: m.senderKey, title: m.senderName, avatar: m.senderAvatar })}<div class="cx-row-main"><div class="cx-line"><span class="cx-name">${escapeHtml(m.out ? t('Вы') : m.senderName || cur.dlg.title)}</span><span class="cx-date">${escapeHtml(dayLabel(m.date))}</span></div><div class="cx-line"><span class="cx-prev">${escapeHtml(m.text || mediaLabel(m))}</span></div></div></div>`).join('') : `<div class="cx-end">${cur.search.q.trim().length > 1 ? t('Ничего не найдено') : ''}</div>`;
  box.onclick = (e) => { const r = e.target.closest('[data-jump]'); if (r) { const id = Number(r.dataset.jump); stopSearch(); jumpTo(id); } };
}
function stopSearch() {
  cur.search = null;
  const r = el().querySelector('#cx-results');
  if (r) r.remove();
  refreshHeader();
  refreshPin();
}

// ---------------------------------------------------------------- chat menu (⋮)
function chatMenu(x, y) {
  const d = cur.dlg;
  const wps = () => showMenu(x - 120, y, WALLPAPERS.map((w) => ({ icon: I.image, label: w.name, run: () => applyWallpaper(w.id, false) })));
  showMenu(x, y, [
    { icon: d.muted ? I.bellFill : I.sound, label: t('Уведомления'), arrow: true, run: async () => {
      try { await S.tg.chatMute(d.id, !d.muted); d.muted = !d.muted; patchDialog(d.id, { muted: d.muted }); refreshHeader(); toast(d.muted ? t('Уведомления выключены') : t('Уведомления включены')); } catch { toast(t('Не удалось изменить')); }
    } },
    { icon: I.video, label: t('Видеозвонок'), run: () => toast(t('Звонки скоро')) },
    { icon: I.search, label: t('Поиск'), run: startSearch },
    { icon: I.image, label: t('Изменить обои'), run: wps },
    { icon: I.broom, label: t('Очистить историю'), run: async () => {
      if (!(await confirmBox(t('Очистить историю переписки?'), t('Очистить')))) return;
      try { await S.tg.chatClearHistory(d.id); cur.msgs = []; renderAll(); patchDialog(d.id, { last: null, unread: 0 }); } catch { toast(t('Не удалось удалить')); }
    } },
    { icon: I.trash, label: t('Удалить чат'), danger: true, run: async () => {
      if (!(await confirmBox(t('Удалить чат «{a}»?', { a: d.title }), t('Удалить')))) return;
      try { await S.tg.chatLeave(d.id); removeDialog(d.id); closeChat(); } catch { toast(t('Не удалось удалить')); }
    } },
    ...ext.menu('chat', { chat: d }),
  ]);
}

// ---------------------------------------------------------------- composer
function fit(inp) {
  inp.style.height = '40px';
  inp.style.height = Math.min(140, Math.max(40, inp.scrollHeight)) + 'px';
}
let typingSent = 0;
let videoMode = false;
function onInput(e) {
  fit(e.target);
  syncSend();
  saveDraft();
  if (cur && Date.now() - typingSent > 5000 && e.target.value) { typingSent = Date.now(); S.tg.chatTyping(cur.id).catch(() => {}); }
}
function saveDraft() {
  const inp = el().querySelector('#cx-input');
  if (cur && inp) { inp.value ? draft.set(cur.id, inp.value) : draft.delete(cur.id); }
}
function syncSend() {
  const inp = el().querySelector('#cx-input');
  const btn = el().querySelector('#cx-send');
  if (!inp || !btn) return;
  const has = inp.value.trim().length > 0;
  btn.innerHTML = has ? I.send : (videoMode ? I.camVideo : I.mic);
  btn.dataset.a = has ? 'send' : 'mic';
}
function ctxBar() {
  const box = el().querySelector('#cx-ctx');
  if (!box) return;
  const c = cur.edit || cur.reply;
  box.innerHTML = c ? `<div class="cx-ctx"><span class="ico">${cur.edit ? I.editBar : I.replyBar}</span><div><b>${cur.edit ? t('Редактирование') : t('В ответ {a}', { a: escapeHtml(c.out ? t('себе') : c.senderName || '') })}</b><span>${escapeHtml(c.text || mediaLabel(c))}</span></div><button class="cx-fi" data-a="cancel" aria-label="${t('Отмена')}">${I.panelClose}</button></div>` : '';
}
function cancelCtx() {
  if (!cur) return;
  if (cur.edit) { const inp = el().querySelector('#cx-input'); inp.value = ''; fit(inp); syncSend(); }
  cur.reply = null; cur.edit = null; ctxBar();
}

async function send() {
  const inp = el().querySelector('#cx-input');
  const text = inp.value.trim();
  if (!text || !cur) return;
  const id = cur.id;
  if (cur.edit) {
    const target = cur.edit;
    cancelCtx();
    inp.value = ''; fit(inp); syncSend(); saveDraft();
    try { liveEdit(await S.tg.chatEdit(id, target.id, text)); } catch { toast(t('Не удалось изменить')); }
    return;
  }
  const out = await ext.run('beforeSend', text, { chat: cur.dlg });
  if (out == null) return;
  const reply = cur.reply;
  inp.value = ''; fit(inp); syncSend(); saveDraft(); cancelCtx();
  await sendOne(id, { text: out, replyTo: reply });
}

async function sendOne(id, { text, file, replyTo }) {
  const tempId = -(++tmp);
  const me = S.me || {};
  const pending = { id: tempId, chatId: id, date: Math.floor(Date.now() / 1000), out: true, senderKey: me.id ? `u${me.id}` : null, senderName: me.name || '', text, html: escapeHtml(text || ''), media: [], reactions: [], replyTo: replyTo ? { id: replyTo.id, name: replyTo.out ? t('Вы') : replyTo.senderName, text: replyTo.text || mediaLabel(replyTo) } : null, status: 'pending', service: null };
  if (file) pending.html = escapeHtml(file.name || '');
  cur.msgs.push(pending);
  appendMsg(pending);
  scrollBottom(true);
  const replace = (real, failed) => {
    if (!cur || cur.id !== id) return;
    const i = cur.msgs.findIndex((x) => x.id === tempId);
    if (i < 0) return;
    cur.msgs[i] = failed ? { ...cur.msgs[i], status: 'failed' } : real;
    const keep = el().querySelector('#cx-msgs').scrollTop;
    const node = el().querySelector(`.cx-msg[data-id="${tempId}"]`);
    if (node) node.outerHTML = bubbleHtml(cur.msgs[i], cur.msgs[i - 1], cur.msgs[i + 1], cur.dlg.kind !== 'user');
    el().querySelector('#cx-msgs').scrollTop = keep;
  };
  try {
    const real = file
      ? await S.tg.chatSendFile(id, file, { caption: text || '', replyTo: replyTo ? replyTo.id : 0 })
      : await S.tg.chatSend(id, text, { replyTo: replyTo ? replyTo.id : 0 });
    replace(real, false);
    const d = S.dialogs.get(id);
    if (d) { d.date = real.date; d.topId = real.id; d.last = { id: real.id, text: real.text || mediaLabel(real), out: true, senderName: t('Вы') }; listMessage({ ...real, __own: true }); }
  } catch (e) {
    console.error('[chat] send', e);
    replace(null, true);
    toast(t('Не отправлено'));
  }
}

async function sendFile(file) {
  if (!cur) return;
  const inp = el().querySelector('#cx-input');
  const caption = inp ? inp.value.trim() : '';
  if (inp && caption) { inp.value = ''; fit(inp); syncSend(); saveDraft(); }
  const reply = cur.reply; cancelCtx();
  await sendOne(cur.id, { text: caption, file, replyTo: reply });
}

// ---------------------------------------------------------------- clicks, menus, viewer
let audio = null;
let audioBtn = null;
function playVoice(box) {
  const src = box.dataset.audio;
  const btn = box.querySelector('.cx-doc-ic');
  if (audio && audio.dataset.src === src) {
    if (audio.paused) { audio.play(); btn.innerHTML = I.pause; } else { audio.pause(); btn.innerHTML = I.play; }
    return;
  }
  if (audio) { audio.pause(); if (audioBtn) audioBtn.innerHTML = I.play; }
  audio = new Audio(src);
  audio.dataset.src = src;
  audioBtn = btn;
  const bars = [...box.querySelectorAll('.wave i')];
  audio.ontimeupdate = () => { const n = Math.floor((audio.currentTime / (audio.duration || 1)) * bars.length); bars.forEach((b, i) => b.classList.toggle('on', i < n)); };
  audio.onended = () => { btn.innerHTML = I.play; bars.forEach((b) => b.classList.remove('on')); };
  audio.play().catch(() => toast(t('Не удалось воспроизвести')));
  btn.innerHTML = I.pause;
}

function openViewer(src, kind) {
  const v = document.getElementById('cx-viewer');
  v.innerHTML = `<button class="x cx-icon" aria-label="${t('Закрыть')}">${I.close}</button>${kind === 'video' ? `<video src="${escapeHtml(src)}" controls autoplay playsinline></video>` : `<img src="${escapeHtml(src)}" alt="">`}`;
  v.classList.remove('tx-hidden');
  v.onclick = (e) => { if (e.target.tagName !== 'VIDEO') { v.classList.add('tx-hidden'); v.innerHTML = ''; } };
}

function onClick(e) {
  const a = e.target.closest('[data-a]');
  if (a) {
    const act = a.dataset.a;
    if (act === 'back') return closeChat();
    if (act === 'send') return send();
    if (act === 'attach') return el().querySelector('#cx-file').click();
    if (act === 'cancel') return cancelCtx();
    if (act === 'mic') { videoMode = !videoMode; syncSend(); return toast(videoMode ? t('Удерживайте для записи видео. Нажмите для переключения в голосовой режим.') : t('Удерживайте для записи голоса. Нажмите для переключения в режим видео.')); }
    if (act === 'emoji') return toggleEmojiPanel(el().querySelector('#cx-panel'), el().querySelector('#cx-input'), el().querySelector('#cx-emo'), () => { fit(el().querySelector('#cx-input')); syncSend(); });
    if (act === 'call') return toast(t('Звонки скоро'));
    if (act === 'info') return openProfile(cur.dlg.id, { onChat: () => {} });
    if (act === 'unsel') return exitSelect();
    if (act === 'selcopy') { navigator.clipboard?.writeText(selected().map((m) => m.text).filter(Boolean).join('\n')).then(() => toast(t('Скопировано'))); return exitSelect(); }
    if (act === 'selfwd') return forwardMsgs(selected());
    if (act === 'seldel') return deleteMsgs(selected());
    if (act === 'selreply') { const m = selected()[0]; exitSelect(); if (m) { cur.reply = m; ctxBar(); el().querySelector('#cx-input')?.focus(); } return; }
    if (act === 'unsearch') return stopSearch();
    if (act === 'pin') { if (a.closest('.cx-pinbar') && !e.target.closest('[data-a=pinlist]')) { const p = cur.pins[cur.pinIdx % cur.pins.length]; cur.pinIdx += 1; refreshPin(); return jumpTo(p.id); } }
    if (act === 'pinlist') return showMenu(innerWidth - 300, 140, cur.pins.map((p) => ({ icon: I.pinO, label: (p.text || '#' + p.id).slice(0, 38), run: () => jumpTo(p.id) })));
    if (act === 'mute') { return S.tg.chatMute(cur.dlg.id, !cur.dlg.muted).then(() => { cur.dlg.muted = !cur.dlg.muted; patchDialog(cur.dlg.id, { muted: cur.dlg.muted }); buildShell(); renderAll(); scrollBottom(); }).catch(() => toast(t('Не удалось изменить'))); }
    if (act === 'play') return playVoice(a.closest('[data-audio]'));
    if (act === 'menu') { const r = a.getBoundingClientRect(); return chatMenu(r.right - 270, r.bottom + 4); }
  }
  if (e.target.closest('#cx-jump')) { scrollBottom(true); return; }
  if (cur.sel) { const n = e.target.closest('.cx-msg'); if (n) toggleSel(n.dataset.id); return; }
  const media = e.target.closest('[data-view]');
  if (media) return openViewer(media.dataset.view, media.dataset.kind);
  const rp = e.target.closest('[data-reply]');
  if (rp) jumpTo(Number(rp.dataset.reply));
}

const QUICK = ['🤯', '🤔', '❤️', '👍', '👎', '🔥', '🥰'];
async function react(m, emoji) {
  const mine = (m.reactions || []).find((r) => r.chosen);
  const remove = mine && mine.emoji === emoji;
  try { await S.tg.chatReact(cur.id, m.id, remove ? '' : emoji); } catch { return toast(t('Не удалось изменить')); }
  const next = (m.reactions || []).map((r) => ({ ...r, chosen: false, count: r.chosen ? r.count - 1 : r.count })).filter((r) => r.count > 0);
  if (!remove) {
    const hit = next.find((r) => r.emoji === emoji);
    hit ? (hit.count += 1, hit.chosen = true) : next.push({ emoji, count: 1, chosen: true });
  }
  liveReactions(cur.id, m.id, next);
}

function msgMenu(id, x, y) {
  const m = cur.msgs.find((q) => String(q.id) === String(id));
  if (!m || m.service) return;
  const items = [
    { icon: I.reply, label: t('Ответить'), run: () => { cur.reply = m; cur.edit = null; ctxBar(); el().querySelector('#cx-input')?.focus(); } },
    { icon: I.copy, label: t('Копировать'), run: () => navigator.clipboard?.writeText(m.text || '').then(() => toast(t('Скопировано'))) },
  ];
  if (m.id > 0) items.push({ icon: I.forward, label: t('Переслать'), run: () => forwardMsgs([m]) });
  if (m.id > 0) items.push({ icon: m.pinned ? I.unpin : I.pinO, label: m.pinned ? t('Открепить') : t('Закрепить'), run: async () => {
    try { await S.tg.chatPin(cur.id, m.id, !!m.pinned); m.pinned = !m.pinned; liveEdit({ ...m }); loadPins(); } catch { toast(t('Не удалось изменить')); }
  } });
  if (m.out && m.text && m.id > 0) items.push({ icon: I.edit, label: t('Изменить'), run: () => { cur.edit = m; cur.reply = null; const inp = el().querySelector('#cx-input'); inp.value = m.text; fit(inp); syncSend(); ctxBar(); inp.focus(); } });
  items.push({ icon: I.select, label: t('Выбрать'), run: () => enterSelect(m.id) });
  if (m.id > 0) items.push({ icon: I.trash, label: t('Удалить'), danger: true, run: () => deleteMsgs([m]) });
  items.push(...ext.menu('message', { msg: m, chat: cur.dlg }));
  showMenu(x, y, items, { reactions: m.id > 0 ? QUICK : [], onReact: (e) => react(m, e) });
}
function onContext(e) {
  const n = e.target.closest('.cx-msg');
  if (!n || !cur) return;
  e.preventDefault();
  msgMenu(n.dataset.id, e.clientX, e.clientY);
}
function bindTouchMenu(box) {
  let timer = 0, sx = 0, sy = 0, node = null, swiped = false;
  box.addEventListener('touchstart', (e) => {
    node = e.target.closest('.cx-msg');
    swiped = false;
    if (!node) return;
    const p = e.touches[0];
    sx = p.clientX; sy = p.clientY;
    timer = setTimeout(() => { timer = -1; if (cur.sel) return toggleSel(node.dataset.id); msgMenu(node.dataset.id, p.clientX, p.clientY); }, 480);
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    if (!node) return;
    const p = e.touches[0];
    const dx = p.clientX - sx, dy = p.clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(timer);
    if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5 && !cur.sel) {
      swiped = true;
      const b = node.querySelector('.cx-bubble');
      if (b) b.style.transform = `translateX(${Math.max(dx, -80)}px)`;
      node.classList.toggle('swipe-ready', dx < -60);
    }
  }, { passive: true });
  const end = () => {
    clearTimeout(timer);
    if (!node) return;
    const b = node.querySelector('.cx-bubble');
    if (b) { b.style.transition = 'transform .18s'; b.style.transform = ''; setTimeout(() => { b.style.transition = ''; }, 200); }
    if (swiped && node.classList.contains('swipe-ready')) {
      const m = cur.msgs.find((q) => String(q.id) === node.dataset.id);
      if (m && !m.service) { cur.reply = m; cur.edit = null; ctxBar(); el().querySelector('#cx-input')?.focus(); }
    }
    node.classList.remove('swipe-ready');
    node = null;
  };
  ['touchend', 'touchcancel'].forEach((ev) => box.addEventListener(ev, end, { passive: true }));
}

export function liveReactions(key, id, reactions) {
  if (!cur || cur.id !== key) return;
  const i = cur.msgs.findIndex((x) => x.id === id);
  if (i < 0) return;
  cur.msgs[i] = { ...cur.msgs[i], reactions };
  const node = el().querySelector(`.cx-msg[data-id="${id}"]`);
  if (node) node.outerHTML = bubbleHtml(cur.msgs[i], cur.msgs[i - 1], cur.msgs[i + 1], cur.dlg.kind !== 'user');
}

// the mods host sends through the open chat
bindModsHost({ currentChat: () => (cur ? cur.id : null), send: (text) => (cur ? sendOne(cur.id, { text, replyTo: null }) : Promise.resolve()) });
