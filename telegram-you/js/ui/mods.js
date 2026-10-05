// Mods: extensions that run inside the app with full access to its API.
//
//  * A mod = { manifest: {id, name, version, description, author?, permissions?, verified?}, code }.
//  * `code` is an ES module whose default export is `export default function (tx) { … }`.
//    It is loaded as a module (import()), so it can use `await`, `import` from absolute URLs, etc.
//  * There is no sandbox on purpose: mods may use anything the app can (Telegram calls, UI, storage).
//    The price is trust, so the installer shows a warning and `manifest.verified` is reserved for the
//    review process that will check mods before they are listed as safe.
//  * `manifest.permissions` is informational today (shown to the user); it is what the review checks against.
//
//  tx = { ext, S, tg, t, toast, confirm, menu, icons, send(text), storage, mod }
import { ext } from './ext.js';
import { I } from './icons.js';
import { S, t, confirmBox, showMenu, toast, escapeHtml } from './store.js';

const KEY = 'telex.mods';
let host = { currentChat: () => null, send: async () => {} };
export function bindModsHost(api) { host = { ...host, ...api }; }

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { toast(t('Не удалось сохранить')); } };
const active = new Map(); // id -> { dispose[] }

export function validateManifest(m) {
  if (!m || typeof m !== 'object') return t('Неверный манифест');
  if (!/^[a-z0-9][a-z0-9._-]{1,40}$/.test(m.id || '')) return t('Неверный id мода');
  if (!m.name || typeof m.name !== 'string') return t('У мода нет названия');
  if (m.permissions != null && !Array.isArray(m.permissions)) return t('Неверные права');
  return null;
}

export const listMods = () => load();

/** The API object a mod receives. Everything it registers is tracked and removed on disable. */
function makeApi(manifest) {
  const id = manifest.id;
  const store = () => { try { return JSON.parse(localStorage.getItem(`telex.mod.${id}`) || '{}'); } catch { return {}; } };
  return {
    mod: manifest,
    ext: {
      addMenu: (point, provider) => ext.addMenu(point, provider, id),
      addHook: (name, fn) => ext.addHook(name, fn, id),
      on: (name, fn) => ext.on(name, fn, id),
    },
    S, tg: S.tg, t, toast, confirm: confirmBox, showMenu, icons: I, escapeHtml,
    menu: (point, label, run) => ext.addMenu(point, (ctx) => [{ label, run: () => run(ctx) }], id),
    send: (text) => host.send(String(text)),
    currentChat: () => host.currentChat(),
    storage: {
      get: (k) => store()[k] ?? null,
      set: (k, v) => { const d = store(); d[k] = v; localStorage.setItem(`telex.mod.${id}`, JSON.stringify(d)); },
    },
  };
}

async function start(mod) {
  const id = mod.manifest.id;
  stop(id);
  const url = URL.createObjectURL(new Blob([mod.code], { type: 'text/javascript' }));
  try {
    const m = await import(/* @vite-ignore */ url);
    if (typeof m.default !== 'function') throw new Error('export default function (tx) is missing');
    active.set(id, true);
    await m.default(makeApi(mod.manifest));
  } catch (e) {
    console.warn(`[mods] ${id} failed`, e);
    ext.removeOwner(id);
    active.delete(id);
    toast(t('Мод «{a}» не запустился', { a: mod.manifest.name }));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function stop(id) {
  active.delete(id);
  ext.removeOwner(id);
}

export async function installMod(mod) {
  const err = validateManifest(mod && mod.manifest);
  if (err) throw new Error(err);
  if (typeof mod.code !== 'string' || mod.code.length > 500000) throw new Error(t('Код мода слишком большой'));
  const m = mod.manifest;
  const ok = await confirmBox(
    t('Мод «{a}» получит полный доступ к приложению и вашему аккаунту. Ставьте только моды, которым доверяете.{b}', { a: m.name, b: m.verified ? '' : ' ' + t('Этот мод не проверен.') }),
    t('Установить'), false);
  if (!ok) return false;
  const list = load().filter((x) => x.manifest.id !== m.id);
  const entry = { manifest: m, code: mod.code, enabled: true };
  list.push(entry);
  save(list);
  await start(entry);
  return true;
}

export function removeMod(id) {
  stop(id);
  save(load().filter((m) => m.manifest.id !== id));
  try { localStorage.removeItem(`telex.mod.${id}`); } catch {}
}

export function setModEnabled(id, on) {
  const list = load();
  const m = list.find((x) => x.manifest.id === id);
  if (!m) return;
  m.enabled = on;
  save(list);
  on ? start(m) : stop(id);
}

export function startMods() { load().filter((m) => m.enabled).forEach(start); }
