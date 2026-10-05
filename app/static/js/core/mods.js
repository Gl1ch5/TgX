// Mods: extensions that run inside TeleX with full access to its API (no sandbox, on purpose).
//
//  A mod is a `.module` file — plain text, and it may contain anything:
//    1. JSON bundle  { "manifest": {...}, "parts": [ { "type": "js|html|css|theme|json|text", "name"?, "code"|"data" } ] }
//       (old shape { manifest, code, theme } is understood too)
//    2. one annotated source file: the first comment line says  @manifest {json}, the rest is the body;
//       the body is an HTML page/fragment when it starts with "<", a theme when it is JSON with theme keys,
//       and a JS module otherwise.
//  manifest — { id, name, version, author?, description?, about?, icon?, preview?, tags?, settings?, verified? }
//    preview  — image (https:// or data: URL) or a list of them, shown on the mod card;
//    settings — schema of the mod's own settings: [{ key, type: switch|text|number|select|color, title, sub?, default, min?, max?, options? }]
//  The price of full access is trust: the installer warns, and `manifest.verified` is reserved for the review process.
//
//  tx = { mod, S, api, t, toast, confirm, escapeHtml, ext, theme, config, settings, storage, data, root }
import { ext } from './ext.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { t, lang } from '../i18n.js';
import { showToast, escapeHtml } from '../utils.js';
import { onPrefsChange, applyAppearance, resolvedTheme } from './prefs.js';
import { registerColorThemes, unregisterColorThemes, COLOR_THEMES } from './colorThemes.js';
import { registerWallpaper, unregisterWallpapers, refreshWallpaper, applyWallpaper } from '../components/wallpaperTheme.js';

const KEY = 'telex.mods';
const MAX_CODE = 1500000;
/** Old entries had { code, theme }; new ones have parts[]. */
function normalize(m) {
  if (m.parts) return m;
  const parts = [];
  if (m.theme) parts.push({ type: 'theme', data: m.theme });
  if (m.code) parts.push({ type: 'js', code: m.code });
  return { manifest: m.manifest, parts, enabled: m.enabled };
}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]').map(normalize); } catch { return []; } };
const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { showToast(t('Не удалось сохранить')); } };

/** What each running mod has plugged in, so disabling removes all of it. */
const running = new Map(); // id -> { vars: {all,dark,light}, styles: [], themes: bool }

export const listMods = () => load();

/** A text that may be given per language: "text" or { ru, en, es, pt, uk }. Falls back to English, then to any. */
export const L = (v) => (v == null || typeof v === 'string' ? v : v[lang()] || v.en || v.ru || Object.values(v)[0] || '');

/** Icon of a mod: emoji, or an image (https:, data:image/ or a path inside the app). Returns { img } or { emoji }. */
export function modIcon(icon) {
  if (typeof icon === 'string' && /^(https:|data:image\/|mods\/)/.test(icon)) return { img: icon };
  return { emoji: typeof icon === 'string' ? icon : '' };
}

export function validateManifest(m) {
  if (!m || typeof m !== 'object') return t('Неверный манифест');
  if (!/^[a-z0-9][a-z0-9._-]{1,40}$/.test(m.id || '')) return t('Неверный id мода');
  if (!L(m.name) || (typeof m.name !== 'string' && typeof m.name !== 'object')) return t('У мода нет названия');
  if (m.permissions != null && !Array.isArray(m.permissions)) return t('Неверные права');
  return null;
}

// ---------------------------------------------------------------- confirm dialog

export function confirmDialog(text, okLabel) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'tx-dialog-back';
    el.innerHTML = `<div class="tx-dialog" role="dialog"><p>${escapeHtml(text)}</p><div class="tx-dialog-btns"><button data-v="0">${t('Отмена')}</button><button data-v="1" class="is-main">${escapeHtml(okLabel)}</button></div></div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b && e.target !== el) return;
      el.remove();
      resolve(!!b && b.dataset.v === '1');
    });
    document.body.append(el);
  });
}

// ---------------------------------------------------------------- theme layer

const modeNow = () => resolvedTheme();

function applyVars() {
  const root = document.documentElement;
  for (const el of [...root.style]) if (root.dataset.modVars && root.dataset.modVars.split(' ').includes(el)) root.style.removeProperty(el);
  const names = [];
  for (const r of running.values()) {
    for (const group of ['all', modeNow()]) {
      for (const [k, v] of Object.entries(r.vars[group] || {})) {
        if (!/^--[\w-]+$/.test(k)) continue;
        root.style.setProperty(k, String(v));
        names.push(k);
      }
    }
  }
  root.dataset.modVars = names.join(' ');
}

function themeApi(id) {
  const r = running.get(id);
  const redraw = () => { document.dispatchEvent(new Event('tx:themes')); };
  const api2 = {
    /** CSS custom properties, e.g. setVars({ '--tx-bg': '#000' }, 'dark'). mode: 'all' | 'dark' | 'light' */
    setVars(vars, mode = 'all') { r.vars[mode] = { ...(r.vars[mode] || {}), ...vars }; applyVars(); },
    addCss(css) {
      const el = document.createElement('style');
      el.dataset.mod = id;
      el.textContent = String(css);
      document.head.append(el);
      r.styles.push(el);
    },
    /** Colour theme for the carousel: { id, emoji, accent?, out: { dark: [colours], light: [colours] }, wallpapers?: { dark, light } } */
    addColorTheme(th) {
      const wp = {};
      for (const mode of ['dark', 'light']) {
        const w = th.wallpapers && th.wallpapers[mode];
        if (w) wp[mode] = registerWallpaper(w, `mod:${id}:${th.id}:${mode}`, { name: th.id, hidden: true });
      }
      r.themes = [...(r.themes || []).filter((x) => x.id !== `${id}:${th.id}`), { id: `${id}:${th.id}`, emoji: th.emoji || '🎨', accent: th.accent || null, wp, out: th.out || { dark: ['#5a86c4'], light: ['#4a80f5'] } }];
      registerColorThemes(r.themes, id);
      redraw();
    },
    /** Wallpaper for the picker: { id, name, kind: 'fill' | 'pattern', colors: ['#rrggbb'…], rotation, intensity, url? } */
    addWallpaper(w) { registerWallpaper(w, `mod:${id}:${w.id}`, { name: w.name || w.id }); redraw(); },
    setWallpaper(wid) { localStorage.removeItem('tgx_wp_auto'); applyWallpaper(`mod:${id}:${wid}`, false); redraw(); },
    /** Select a colour theme (own or Telegram's) by id. */
    select(themeId) { window.TelegramX && window.TelegramX.setColorTheme(COLOR_THEMES.some((c) => c.id === themeId) ? themeId : `${id}:${themeId}`); },
    mode: modeNow,
  };
  return api2;
}

function stop(id) {
  const r = running.get(id);
  if (!r) { ext.removeOwner(id); return; }
  r.styles.forEach((s) => s.remove());
  (r.roots || []).forEach((n) => n.remove());
  (r.cleanups || []).forEach((fn) => { try { fn(); } catch (e) { console.warn(`[mods] ${id} cleanup`, e); } });
  configListeners.delete(id);
  renderers.delete(id);
  (observers.get(id) || []).forEach((o) => o.disconnect());
  observers.delete(id);
  document.querySelectorAll(`[data-mod-inject="${id}"]`).forEach((n) => n.remove());
  for (const k of [...pages.keys()]) if (k.startsWith(id + ':')) pages.delete(k);
  if (window.TeleXMods) delete window.TeleXMods[id];
  unregisterColorThemes(id);
  unregisterWallpapers(`mod:${id}:`);
  running.delete(id);
  ext.removeOwner(id);
  applyVars();
  applyAppearance();
  refreshWallpaper();
  document.dispatchEvent(new Event('tx:themes'));
}

const pages = new Map();            // 'modId:pageId' -> page definition (settings screens added by mods)
export const modPage = (key) => pages.get(key);
const observers = new Map();        // id -> MutationObserver[]
function watchSelector(id, selector, fn) {
  const seen = new WeakSet();
  const scan = (root) => {
    const list = root.nodeType === 1 && root.matches(selector) ? [root] : [];
    list.push(...(root.querySelectorAll ? root.querySelectorAll(selector) : []));
    for (const el of list) if (!seen.has(el)) { seen.add(el); try { fn(el); } catch (e) { console.warn(`[mods] ${id} watch`, e); } }
  };
  scan(document.body);
  const mo = new MutationObserver((recs) => { for (const r of recs) r.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); }); });
  mo.observe(document.body, { childList: true, subtree: true });
  observers.set(id, [...(observers.get(id) || []), mo]);
}
const configListeners = new Map(); // id -> Map(key -> [fn])
const renderers = new Map();       // id -> [fn(container)]

const storeOf = (id) => { try { return JSON.parse(localStorage.getItem(`telex.mod.${id}`) || '{}'); } catch { return {}; } };
const writeStore = (id, d) => { try { localStorage.setItem(`telex.mod.${id}`, JSON.stringify(d)); } catch {} };

/** Value of one of the mod's own settings (falls back to the default from the manifest). */
export function modConfigGet(mod, key) {
  const d = storeOf(mod.manifest.id);
  if (key in d) return d[key];
  const def = (mod.manifest.settings || []).find((x) => x.key === key);
  return def ? def.default : null;
}
export function modConfigSet(id, key, value) {
  const d = storeOf(id);
  d[key] = value;
  writeStore(id, d);
  const ls = configListeners.get(id);
  for (const fn of [...((ls && ls.get(key)) || []), ...((ls && ls.get('*')) || [])]) { try { fn(value, key); } catch (e) { console.warn(`[mods] ${id} config`, e); } }
}
export const modRenderers = (id) => renderers.get(id) || [];

function makeApi(mod) {
  const manifest = mod.manifest;
  const id = manifest.id;
  const dataParts = {};
  for (const p of mod.parts) if (p.type === 'json' || p.type === 'text') dataParts[p.name || p.type] = p.data !== undefined ? p.data : p.code;
  return {
    mod: manifest,
    S: state, api, t, L, toast: showToast, confirm: (text, ok) => confirmDialog(text, ok || t('ОК')), escapeHtml,
    ext: {
      addMenu: (point, provider) => ext.addMenu(point, provider, id),
      addHook: (name, fn) => ext.addHook(name, fn, id),
      on: (name, fn) => ext.on(name, fn, id),
    },
    theme: themeApi(id),
    /** Register cleanup (timers, listeners, nodes you made yourself): runs when the mod is disabled or removed. */
    onStop: (fn) => { const r = running.get(id); if (r) r.cleanups.push(fn); },
    /** The mod's own settings (schema in manifest.settings): get(key), set(key, value), on(key | '*', fn), render(fn(container)) for a custom block */
    config: {
      get: (k) => modConfigGet(mod, k),
      set: (k, v) => modConfigSet(id, k, v),
      on: (k, fn) => { const m = configListeners.get(id) || new Map(); configListeners.set(id, m); m.set(k, [...(m.get(k) || []), fn]); },
      render: (fn) => renderers.set(id, [...(renderers.get(id) || []), fn]),
    },
    settings: {
      addRow: (row) => ext.addMenu('settings', () => [row], id),
      /** A whole screen in the settings: { id, title, sub?, icon?, color?, render(box) } — gets a row in the settings list. */
      addPage: (pg) => {
        pages.set(`${id}:${pg.id}`, pg);
        ext.addMenu('settings', () => [{ title: pg.title, sub: pg.sub, icon: pg.icon, color: pg.color, run: () => window.TelegramX.openSettingsPage(`xp:${id}:${pg.id}`) }], id);
      },
    },
    /** Reach into any screen: watch(selector, fn) runs for present and future elements, inject(selector, html, where) adds markup. */
    ui: {
      watch: (selector, fn) => watchSelector(id, selector, fn),
      inject: (selector, html, where = 'beforeend') => {
        const put = (el) => { if (!el.querySelector(`[data-mod-inject="${id}"]`) || where !== 'beforeend') { const tpl = document.createElement('template'); tpl.innerHTML = `<span data-mod-inject="${id}" style="display:contents">${html}</span>`; el.insertAdjacentElement(where, tpl.content.firstChild); } };
        watchSelector(id, selector, put);
      },
      root: () => document.getElementById('app') || document.body,
    },
    storage: {
      get: (k) => storeOf(id)[k] ?? null,
      set: (k, v) => { const d = storeOf(id); d[k] = v; writeStore(id, d); },
    },
    data: dataParts,
  };
}

/** Run the scripts of an HTML part (innerHTML does not execute them). */
function mountHtml(id, html, tx, r) {
  const root = document.createElement('div');
  root.className = 'tx-mod-root';
  root.dataset.mod = id;
  root.innerHTML = html;
  (window.TeleXMods = window.TeleXMods || {})[id] = tx;
  document.body.append(root);
  r.roots.push(root);
  for (const old of [...root.querySelectorAll('script')]) {
    const sc = document.createElement('script');
    for (const a of old.attributes) sc.setAttribute(a.name, a.value);
    sc.textContent = old.textContent;
    old.replaceWith(sc);
  }
}

async function start(mod) {
  const id = mod.manifest.id;
  stop(id);
  running.set(id, { vars: {}, styles: [], roots: [], cleanups: [], themes: null });
  const r = running.get(id);
  const tx = makeApi(mod);
  try {
    for (const part of mod.parts) {
      if (part.type === 'theme') {
        const th = part.data;
        if (th.vars) for (const mode of ['all', 'dark', 'light']) if (th.vars[mode]) tx.theme.setVars(th.vars[mode], mode);
        if (th.css) tx.theme.addCss(th.css);
        (th.wallpapers || []).forEach((w) => tx.theme.addWallpaper(w));
        (th.colorThemes || []).forEach((c) => tx.theme.addColorTheme(c));
        if (th.apply && mod.justInstalled) tx.theme.select(th.apply);
      } else if (part.type === 'css') {
        tx.theme.addCss(part.code);
      } else if (part.type === 'html') {
        mountHtml(id, part.code, tx, r);
      } else if (part.type === 'js') {
        const url = URL.createObjectURL(new Blob([part.code], { type: 'text/javascript' }));
        try {
          const m = await import(/* @vite-ignore */ url);
          if (typeof m.default === 'function') await m.default(tx);
        } finally { URL.revokeObjectURL(url); }
      }
    }
    applyVars();
    refreshWallpaper();
  } catch (e) {
    console.warn(`[mods] ${id} failed`, e);
    stop(id);
    showToast(t('Мод «{a}» не запустился', { a: L(mod.manifest.name) }));
  }
}

// ---------------------------------------------------------------- install / manage

const BODY_TYPES = new Set(['js', 'html', 'css', 'theme', 'json', 'text']);

/** Parse the text of a .module file (see the header of this file for the shapes). */
export function parseBundle(text) {
  const src = String(text).replace(/^\uFEFF/, '').trim();
  if (src.startsWith('{')) {
    const o = JSON.parse(src);
    if (o.manifest && Array.isArray(o.parts)) {
      for (const p of o.parts) if (!BODY_TYPES.has(p.type)) throw new Error(t('Неверный манифест'));
      return { manifest: o.manifest, parts: o.parts };
    }
    if (o.manifest) return normalize(o);
  }
  // annotated source: the manifest sits in the first comment line carrying "@manifest"
  const m = /^[^\n]*@manifest\s+(\{.*\})[^\n]*$/m.exec(src);
  if (!m) throw new Error(t('Неверный манифест'));
  const manifest = JSON.parse(m[1]);
  const body = src.replace(m[0], '').trim();
  let part;
  if (body.startsWith('<')) part = { type: 'html', code: body };
  else if (body.startsWith('{') || body.startsWith('[')) {
    const data = JSON.parse(body);
    part = data && (data.vars || data.colorThemes || data.wallpapers || data.css) ? { type: 'theme', data } : { type: 'json', data };
  } else part = { type: 'js', code: body };
  return { manifest, parts: [part] };
}

export async function installMod(mod) {
  const err = validateManifest(mod && mod.manifest);
  if (err) throw new Error(err);
  const parts = mod.parts || [];
  if (!parts.length) throw new Error(t('В моде нет ни кода, ни темы'));
  const size = JSON.stringify(parts).length + JSON.stringify(mod.manifest).length;
  if (size > MAX_CODE) throw new Error(t('Код мода слишком большой'));
  const m = mod.manifest;
  const risky = parts.some((p) => p.type === 'js' || p.type === 'html');
  const ok = await confirmDialog(
    risky
      ? t('Мод «{a}» получит полный доступ к приложению и вашему аккаунту. Ставьте только моды, которым доверяете.{b}', { a: L(m.name), b: m.verified ? '' : ' ' + t('Этот мод не проверен.') })
      : t('Установить тему «{a}»?', { a: L(m.name) }),
    t('Установить'));
  if (!ok) return false;
  const entry = { manifest: m, parts, enabled: true };
  save([...load().filter((x) => x.manifest.id !== m.id), entry]);
  await start({ ...entry, justInstalled: true });
  document.dispatchEvent(new Event('tx:mods'));
  return true;
}

export function removeMod(id) {
  stop(id);
  save(load().filter((m) => m.manifest.id !== id));
  try { localStorage.removeItem(`telex.mod.${id}`); } catch {}
  document.dispatchEvent(new Event('tx:mods'));
}

export function setModEnabled(id, on) {
  const list = load();
  const m = list.find((x) => x.manifest.id === id);
  if (!m) return;
  m.enabled = on;
  save(list);
  if (on) start(m); else stop(id);
}

export async function installFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return installMod(parseBundle(await res.text()));
}

export const reapplyModVars = () => applyVars();

export function startMods() {
  load().filter((m) => m.enabled).forEach((m) => { start(m); });
  // the app redraws its own variables on theme changes: put the mods' ones back on top
  onPrefsChange(() => setTimeout(applyVars, 0));
}

// ---------------------------------------------------------------- official catalog (app/static/mods/catalog.json)

let catalog = null;
export async function loadCatalog() {
  if (catalog) return catalog;
  const res = await fetch('mods/catalog.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  catalog = (await res.json()).mods || [];
  return catalog;
}

/** Install a mod from the catalog; mods from there are the project's own, so they carry the verified mark. */
export async function installOfficial(id) {
  const entry = (await loadCatalog()).find((m) => m.id === id);
  if (!entry) throw new Error('not found');
  const res = await fetch('mods/' + entry.file, { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const bundle = parseBundle(await res.text());
  bundle.manifest = { ...bundle.manifest, verified: true, official: true };
  return installMod(bundle);
}
