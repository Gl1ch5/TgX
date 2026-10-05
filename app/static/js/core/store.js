// Client of the TeleX mod store API (server/). Every call fails soft: when the server is unreachable the app
// keeps working with its built-in catalog.
import { listMods } from './mods.js';

export const STORE_API = 'https://grzxk.ru:8443/api';
const base = () => { try { return (localStorage.getItem('telex.storeApi') || STORE_API).replace(/\/$/, ''); } catch { return STORE_API; } };

const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => (b % 36).toString(36)).join(''); };
function persistent(key, make) {
  try { let v = localStorage.getItem(key); if (!v) { v = make(); localStorage.setItem(key, v); } return v; } catch { return make(); }
}
/** Anonymous id of this install: likes, ratings and download counts are counted once per device. */
export const deviceId = () => persistent('telex.store.device', () => 'dev_' + rnd(24));
/** Secret that proves the author of a published mod (kept only here and, hashed, on the server). */
const authorToken = () => persistent('telex.store.author', () => 'tok_' + rnd(40));

let online = null; // null = unknown
export const storeOnline = () => online;

let downUntil = 0; // after a network failure the store is skipped for a while, so tabs never wait on a dead server
async function call(method, path, body, { timeout = 5000, raw = false } = {}) {
  if (Date.now() < downUntil) throw new Error('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(base() + path, {
      method, signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-device': deviceId(), 'x-author-token': authorToken() },
      body: body ? JSON.stringify(body) : undefined,
    });
    online = true;
    if (raw) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { status: r.status });
    return j;
  } catch (e) {
    if (e.status == null) { online = false; downUntil = Date.now() + 90000; } // network error / timeout, not an API answer
    throw e;
  } finally { clearTimeout(timer); }
}

const installedIds = () => listMods().map((m) => m.manifest.id).join(',');

let homeCache = null;
/** The home screen data; answers from a 45 s cache so switching tabs is instant. */
export async function storeHome() {
  const key = installedIds();
  if (homeCache && homeCache.key === key && Date.now() - homeCache.at < 45000) return homeCache.data;
  const data = await call('GET', `/home?installed=${encodeURIComponent(key)}`);
  homeCache = { key, at: Date.now(), data };
  return data;
}
export const storeList = ({ q = '', category = 'all', sort = 'popular', limit = 40, offset = 0 } = {}) => call('GET', `/mods?q=${encodeURIComponent(q)}&category=${category}&sort=${sort}&limit=${limit}&offset=${offset}`);
export const storeGet = (id) => call('GET', `/mods/${encodeURIComponent(id)}`);
export const storeFile = (id) => call('GET', `/mods/${encodeURIComponent(id)}/file`, null, { raw: true, timeout: 15000 });
export const storeDownloaded = (id) => call('POST', `/mods/${encodeURIComponent(id)}/download`, {}).catch(() => {});
export const storeLike = (id, on) => call('POST', `/mods/${encodeURIComponent(id)}/like`, { on });
export const storeRate = (id, value) => call('POST', `/mods/${encodeURIComponent(id)}/rate`, { value });
export const storeReport = (id, reason) => call('POST', `/mods/${encodeURIComponent(id)}/report`, { reason });
export const storeDelete = (id) => call('DELETE', `/mods/${encodeURIComponent(id)}`);

/** Publishes (or updates) an installed mod: sends it as a JSON bundle. */
export function storePublish(mod, authorName) {
  const text = JSON.stringify({ manifest: mod.manifest, parts: mod.parts });
  return call('POST', '/mods', { module: text, authorName }, { timeout: 20000 });
}

/** Ids of the mods this device published (so the app can offer "update"/"remove"). */
export const myPublished = () => { try { return JSON.parse(localStorage.getItem('telex.store.mine') || '[]'); } catch { return []; } };
export function rememberPublished(id) { try { const l = new Set(myPublished()); l.add(id); localStorage.setItem('telex.store.mine', JSON.stringify([...l])); } catch {} }
export function forgetPublished(id) { try { localStorage.setItem('telex.store.mine', JSON.stringify(myPublished().filter((x) => x !== id))); } catch {} }

/** Anonymous usage counter: the random device id, at most once a day, only when "anonymous statistics" is on. */
export function storePing(enabled = true) {
  if (!enabled) return;
  const today = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem('telex.store.ping') === today) return; } catch {}
  call('POST', '/ping', {}, { timeout: 6000 }).then(() => { try { localStorage.setItem('telex.store.ping', today); } catch {} }).catch(() => {});
}
