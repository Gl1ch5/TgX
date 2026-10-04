/**
 * ====================================================================
 * USER PREFERENCES (localStorage) — wall filters, appearance, media
 * ====================================================================
 */

const KEY = 'telex.prefs';

export const ACCENTS = [
  { id: 'blue', fill: '#5a83f3', text: '#7595ff' },
  { id: 'classic', fill: '#3e88f7', text: '#62a5ff' },
  { id: 'violet', fill: '#8774e1', text: '#a594ff' },
  { id: 'cyan', fill: '#2fa9c7', text: '#4cc6e3' },
  { id: 'green', fill: '#4fae4e', text: '#6fd16e' },
  { id: 'orange', fill: '#e88a35', text: '#ffa65a' },
  { id: 'pink', fill: '#d9608f', text: '#ff86b2' },
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
  devOverlay: false,      // developer: connection/ping badge
  devVerbose: false,      // developer: GramJS debug logging
};

let prefs = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
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
export function applyAppearance(p = prefs) {
  const root = document.documentElement;
  const accent = ACCENTS.find((a) => a.id === p.accent) || ACCENTS[0];
  root.style.setProperty('--tx-accent-fill', accent.fill);
  root.style.setProperty('--tx-accent', accent.text);
  root.style.setProperty('--tx-link', accent.text);
  root.style.setProperty('--tx-accent-soft', hexAlpha(accent.text, 0.16));
  root.style.setProperty('--tx-text-size', `${p.textSize}px`);
  root.style.setProperty('--tx-bubble-radius', `${p.bubbleRadius}px`);
  root.style.setProperty('--tx-bubble-radius-small', `${Math.min(6, p.bubbleRadius)}px`);
  document.body.classList.toggle('tx-reduce-motion', !!p.reduceMotion);
  document.body.classList.toggle('tx-no-glass', p.glass === false);
  root.style.setProperty('--tx-glass-blur', p.glass === false ? 'none' : 'blur(22px) saturate(170%)');
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
