/**
 * ====================================================================
 * USER PREFERENCES (localStorage) — wall filters, appearance, media
 * ====================================================================
 */

import { COLOR_THEMES, outGradient } from './colorThemes.js';

const KEY = 'telex.prefs';

// Bumped when a default changes for everyone (saved prefs keep the old value otherwise).
const MIGRATION = 1;

export const ACCENTS = [
  { id: 'blue', fill: '#5a83f3', text: '#7595ff', day: '#3a6fe6' },
  { id: 'classic', fill: '#3e88f7', text: '#62a5ff', day: '#2a7ae4' },
  { id: 'violet', fill: '#8774e1', text: '#a594ff', day: '#6c58c9' },
  { id: 'cyan', fill: '#2fa9c7', text: '#4cc6e3', day: '#17869f' },
  { id: 'green', fill: '#4fae4e', text: '#6fd16e', day: '#2f8f3e' },
  { id: 'orange', fill: '#e88a35', text: '#ffa65a', day: '#c76a14' },
  { id: 'pink', fill: '#d9608f', text: '#ff86b2', day: '#c13d73' },
];

const DEFAULTS = {
  excludedChannels: [],   // channel ids hidden from the wall
  showGroups: false,      // include supergroups on the wall
  feedSize: 20,           // how many channels the wall polls
  textSize: 16,           // message text size, px
  accent: 'blue',
  reduceMotion: false,
  autoplayGifs: true,
  autoplayVideos: true,   // short videos play muted in the feed, like Telegram
  autoloadPhotos: true,
  syncRead: true,         // mark posts read in Telegram when seen on the wall
  bubbleRadius: 17,       // Telegram default message corner radius
  glass: true,            // backdrop blur under bars (off = solid, faster)
  workerMode: true,       // GramJS in a Web Worker (applies after reload)
  theme: 'auto',          // 'auto' follows the device, or 'light' / 'dark'
  colorTheme: 'classic',  // chat colour theme (outgoing bubbles, wallpaper, accent)
  lang: 'auto',           // interface language: 'auto' or a code from i18n.js
  nameColor: 'auto',      // own name colour in chats: 'auto' or a peer colour 0-6
  devOverlay: false,      // developer: connection/ping badge
  devVerbose: false,      // developer: GramJS debug logging
};

let prefs = load();
const listeners = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if ((saved.migration || 0) < MIGRATION && Object.keys(saved).length) {
      saved.workerMode = true; // 3.12: worker mode is the default
      saved.migration = MIGRATION;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
    }
    return { ...DEFAULTS, migration: MIGRATION, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getPrefs() {
  return prefs;
}

export function setPref(key, value) {
  prefs = { ...prefs, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  listeners.forEach((fn) => fn(prefs, key));
}

/** Re-read from storage (used by the Telegram worker when the page changes a setting). */
export function reloadPrefs() {
  prefs = load();
}

export function onPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isChannelExcluded(id) {
  return prefs.excludedChannels.includes(Number(id));
}

export function setChannelExcluded(id, excluded) {
  const set = new Set(prefs.excludedChannels.map(Number));
  if (excluded) set.add(Number(id));
  else set.delete(Number(id));
  setPref('excludedChannels', [...set]);
}

export function resetPrefs() {
  prefs = { ...DEFAULTS };
  try { localStorage.removeItem(KEY); } catch {}
  listeners.forEach((fn) => fn(prefs, null));
}

/** Push appearance prefs into CSS variables / body classes */
/** 'light' or 'dark': the saved choice, or what the device uses. */
export function resolvedTheme(p = prefs) {
  if (p.theme === 'light' || p.theme === 'dark') return p.theme;
  try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return 'dark'; }
}

export function applyAppearance(p = prefs) {
  const root = document.documentElement;
  const mode = resolvedTheme(p);
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
  const accent = ACCENTS.find((a) => a.id === p.accent) || ACCENTS[0];
  const text = mode === 'light' ? accent.day : accent.text;
  root.style.setProperty('--tx-accent-fill', accent.fill);
  root.style.setProperty('--tx-accent', text);
  root.style.setProperty('--tx-link', text);
  root.style.setProperty('--tx-accent-soft', hexAlpha(text, mode === 'light' ? 0.12 : 0.16));
  const theme = COLOR_THEMES.find((c) => c.id === p.colorTheme) || COLOR_THEMES[0];
  root.style.setProperty('--tx-bubble-out', outGradient(theme, mode));
  root.style.setProperty('--tx-text-size', `${p.textSize}px`);
  root.style.setProperty('--tx-bubble-radius', `${p.bubbleRadius}px`);
  root.style.setProperty('--tx-bubble-radius-small', `${Math.min(6, p.bubbleRadius)}px`);
  document.body.classList.toggle('tx-reduce-motion', !!p.reduceMotion);
  document.body.classList.toggle('tx-no-glass', p.glass === false);
  root.style.setProperty('--tx-glass-blur', p.glass === false ? 'none' : 'blur(22px) saturate(170%)');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'light' ? '#f0f0f5' : '#000000');
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
