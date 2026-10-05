// Messages that other people deleted stay visible here (marked as deleted). Stored only in this browser.
// Nothing is sent anywhere; the server has really deleted them, we simply remember what we had already received.
import { getPrefs } from './prefs.js';

const KEY = 'telex.deleted';
const PER_CHAT = 300;
const CACHE_MAX = 6000;
const cache = new Map();     // message id (+chat) -> message, every message seen in this session
const selfDeleted = new Set(); // ids the user deleted on purpose: never kept

const ck = (chat, id) => `${chat}:${id}`;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

export const keepEnabled = () => getPrefs().keepDeleted !== false;

/** Remember a message we have received (needed to keep it if it is deleted later). */
export function rememberMessage(m) {
  if (!m || !m.id || m.id < 0 || m.service) return;
  cache.set(ck(m.chatId, m.id), m);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
export const rememberMany = (list) => (list || []).forEach(rememberMessage);

/** The user deletes these on purpose: they must really disappear. */
export function markSelfDeleted(chat, ids) {
  ids.forEach((id) => selfDeleted.add(ck(chat, id)));
  setTimeout(() => ids.forEach((id) => selfDeleted.delete(ck(chat, id))), 60000);
}

/** Messages found for a delete update (chat key may be unknown for private chats: look through the cache). */
export function takeDeleted(chat, ids) {
  const out = [];
  for (const id of ids) {
    let m = chat ? cache.get(ck(chat, id)) : null;
    if (!m && !chat) for (const [k, v] of cache) if (v.id === id && k.endsWith(`:${id}`)) { m = v; break; }
    if (!m) continue;
    if (selfDeleted.has(ck(m.chatId, id))) continue;
    out.push(m);
  }
  return out;
}

const slim = (m) => ({ id: m.id, chatId: m.chatId, date: m.date, out: !!m.out, senderKey: m.senderKey, senderName: m.senderName, senderAvatar: m.senderAvatar, text: m.text, html: m.html, media: (m.media || []).map((x) => ({ type: x.type, url: x.url, thumb: x.thumb, filename: x.filename, duration: x.duration, size: x.size, w: x.w, h: x.h })), replyTo: m.replyTo || null, fwd: m.fwd || null, webpage: m.webpage || null, deleted: true, deletedAt: Date.now() });

export function saveDeleted(list) {
  if (!list.length) return;
  const all = read();
  for (const m of list) {
    const arr = all[m.chatId] || [];
    if (!arr.some((x) => x.id === m.id)) arr.push(slim(m));
    all[m.chatId] = arr.sort((a, b) => a.id - b.id).slice(-PER_CHAT);
  }
  write(all);
}

export const deletedOf = (chat) => (read()[chat] || []).map((m) => ({ ...m }));

/** Put the saved deleted messages of a chat between the loaded ones (by id). `from` = the oldest loaded id. */
export function mergeDeleted(chat, msgs) {
  if (!keepEnabled()) return msgs;
  const have = new Set(msgs.map((m) => m.id));
  const oldest = msgs.length ? msgs[0].id : 0;
  const extra = deletedOf(chat).filter((m) => !have.has(m.id) && (!oldest || m.id > oldest));
  if (!extra.length) return msgs;
  return [...msgs, ...extra].sort((a, b) => a.id - b.id);
}

export function forgetDeleted(chat) {
  const all = read();
  delete all[chat];
  write(all);
}
export const deletedCount = () => Object.values(read()).reduce((n, a) => n + a.length, 0);
export function clearAllDeleted() { write({}); }
