// Mods: extensions that run inside TeleX with full access to its API (no sandbox, on purpose).
//
//  A mod is a JSON bundle  { manifest, code?, theme? }:
//    manifest — { id, name, version, description?, author?, type?: 'theme' | 'mod', permissions?, verified? }
//    theme    — declarative theme, needs no code (see docs/mods.md):
//               { vars: { all, dark, light }, css, colorThemes: [...], wallpapers: [...], apply }
//    code     — an ES module with `export default function (tx) { … }` (loaded with import()).
//  Both parts may be present. The price of full access is trust: the installer warns the user, and
//  `manifest.verified` is reserved for the review process that will check mods before they are listed.
//
//  tx = { mod, S, api, t, toast, confirm, escapeHtml, ext, theme, settings, storage }
import { ext } from './ext.js';
import { state } from '../state.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { showToast, escapeHtml } from '../utils.js';
import { onPrefsChange, applyAppearance, resolvedTheme } from './prefs.js';
import { registerColorThemes, unregisterColorThemes, COLOR_THEMES } from './colorThemes.js';
import { registerWallpaper, unregisterWallpapers, refreshWallpaper, applyWallpaper } from '../components/wallpaperTheme.js';

const KEY = 'telex.mods';
const MAX_CODE = 500000;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { showToast(t('Не удалось сохранить')); } };

/** What each running mod has plugged in, so disabling removes all of it. */
const running = new Map(); // id -> { vars: {all,dark,light}, styles: [], themes: bool }

export const listMods = () => load();

export function validateManifest(m) {
  if (!m || typeof m !== 'object') return t('Неверный манифест');
  if (!/^[a-z0-9][a-z0-9._-]{1,40}$/.test(m.id || '')) return t('Неверный id мода');
  if (!m.name || typeof m.name !== 'string') return t('У мода нет названия');
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
  unregisterColorThemes(id);
  unregisterWallpapers(`mod:${id}:`);
  running.delete(id);
  ext.removeOwner(id);
  applyVars();
  applyAppearance();
  refreshWallpaper();
  document.dispatchEvent(new Event('tx:themes'));
}

function makeApi(manifest) {
  const id = manifest.id;
  const store = () => { try { return JSON.parse(localStorage.getItem(`telex.mod.${id}`) || '{}'); } catch { return {}; } };
  return {
    mod: manifest,
    S: state, api, t, toast: showToast, confirm: (text, ok) => confirmDialog(text, ok || t('ОК')), escapeHtml,
    ext: {
      addMenu: (point, provider) => ext.addMenu(point, provider, id),
      addHook: (name, fn) => ext.addHook(name, fn, id),
      on: (name, fn) => ext.on(name, fn, id),
    },
    theme: themeApi(id),
    settings: { addRow: (row) => ext.addMenu('settings', () => [row], id) },
    storage: {
      get: (k) => store()[k] ?? null,
      set: (k, v) => { const d = store(); d[k] = v; try { localStorage.setItem(`telex.mod.${id}`, JSON.stringify(d)); } catch {} },
    },
  };
}

async function start(mod) {
  const id = mod.manifest.id;
  stop(id);
  running.set(id, { vars: {}, styles: [], themes: null });
  const tx = makeApi(mod.manifest);
  try {
    const th = mod.theme;
    if (th) {
      if (th.vars) for (const mode of ['all', 'dark', 'light']) if (th.vars[mode]) tx.theme.setVars(th.vars[mode], mode);
      if (th.css) tx.theme.addCss(th.css);
      (th.wallpapers || []).forEach((w) => tx.theme.addWallpaper(w));
      (th.colorThemes || []).forEach((c) => tx.theme.addColorTheme(c));
      if (th.apply && mod.justInstalled) tx.theme.select(th.apply);
    }
    if (typeof mod.code === 'string' && mod.code) {
      const url = URL.createObjectURL(new Blob([mod.code], { type: 'text/javascript' }));
      try {
        const m = await import(/* @vite-ignore */ url);
        if (typeof m.default !== 'function') throw new Error('export default function (tx) is missing');
        await m.default(tx);
      } finally { URL.revokeObjectURL(url); }
    }
    applyVars();
    refreshWallpaper();
  } catch (e) {
    console.warn(`[mods] ${id} failed`, e);
    stop(id);
    showToast(t('Мод «{a}» не запустился', { a: mod.manifest.name }));
  }
}

// ---------------------------------------------------------------- install / manage

/** Parse a bundle from text: JSON, or a .js module whose first line is  // @manifest {json}  */
export function parseBundle(text) {
  const src = String(text).trim();
  if (src.startsWith('{')) return JSON.parse(src);
  const m = /^\s*\/\/\s*@manifest\s+(\{.*\})\s*$/m.exec(src);
  if (!m) throw new Error(t('Неверный манифест'));
  return { manifest: JSON.parse(m[1]), code: src };
}

export async function installMod(mod) {
  const err = validateManifest(mod && mod.manifest);
  if (err) throw new Error(err);
  if (!mod.code && !mod.theme) throw new Error(t('В моде нет ни кода, ни темы'));
  if (mod.code != null && (typeof mod.code !== 'string' || mod.code.length > MAX_CODE)) throw new Error(t('Код мода слишком большой'));
  const m = mod.manifest;
  const risky = !!mod.code;
  const ok = await confirmDialog(
    risky
      ? t('Мод «{a}» получит полный доступ к приложению и вашему аккаунту. Ставьте только моды, которым доверяете.{b}', { a: m.name, b: m.verified ? '' : ' ' + t('Этот мод не проверен.') })
      : t('Установить тему «{a}»?', { a: m.name }),
    t('Установить'));
  if (!ok) return false;
  const entry = { manifest: m, code: mod.code || null, theme: mod.theme || null, enabled: true };
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
