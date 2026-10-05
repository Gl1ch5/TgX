/**
 * Chat colour themes (the "Цветовая тема" carousel): outgoing-bubble colours,
 * accent, wallpaper — like Telegram's built-in chat themes. Data only.
 */
const BUILTIN_THEMES = [
  { id: 'classic', emoji: '🎨', accent: 'blue', wp: 'FOks2P6KCFIMAAAAyFz5S74pfKo', out: { dark: ['#5a86c4', '#568fc3'], light: ['#4a80f5', '#5b8df7'] } },
  { id: 'violet', emoji: '💜', accent: 'violet', wp: 'T7LjEHVuYVIFAAAAS7NH4xQl6jY', out: { dark: ['#6b46c1', '#a94fb8'], light: ['#8260e0', '#b56fe0'] } },
  { id: 'newyear', emoji: '🎄', accent: 'orange', wp: 'CJNyxPMgSVAEAAAAvW9sMwc51cw', out: { dark: ['#c9731a', '#e0a93a'], light: ['#d97a1c', '#eab33f'] } },
  { id: 'games', emoji: '🎮', accent: 'violet', wp: 'MIo6r0qGSFAFAAAAtL8TsDzNX60', out: { dark: ['#5b73f0', '#d85aa8', '#f08a4a'], light: ['#5b73f0', '#d85aa8', '#f08a4a'] } },
  { id: 'ocean', emoji: '🌊', accent: 'cyan', wp: 'bJcwphEAYVINAAAA5jpWNRMqilA', out: { dark: ['#1c6fc0', '#23a3bf'], light: ['#1c7fd6', '#2bb5d0'] } },
  { id: 'forest', emoji: '🌲', accent: 'green', wp: 'aiuT0cIzaVIHAAAAjS-ebiVKLtU', out: { dark: ['#2a8a4a', '#26a08f'], light: ['#2f9a52', '#2bb5a0'] } },
  { id: 'sunset', emoji: '🌇', accent: 'orange', wp: 'DRaa0SbvYVIjAAAAWv3uHfEiYyI', out: { dark: ['#cf4339', '#e08a35'], light: ['#e0483f', '#f09a3a'] } },
  { id: 'rose', emoji: '🌸', accent: 'pink', wp: 'rF5kQBMSYFICAAAAUCWVFDNCLnU', out: { dark: ['#c14f7e', '#e07ba3'], light: ['#d9608f', '#f08ab0'] } },
];

export const COLOR_THEMES = BUILTIN_THEMES.slice();

/** Wallpaper id of a theme for a mode ('dark' | 'light'); themes may carry one id or one per mode. */
export const themeWallpaper = (theme, mode) => (theme && theme.wp && typeof theme.wp === 'object' ? theme.wp[mode] || theme.wp.dark || theme.wp.light : theme && theme.wp);

/**
 * Add themes (from Telegram or from a mod). `owner` is 'telegram' or a mod id; registering again
 * with the same owner replaces that owner's previous themes. Built-in themes are shown only when
 * no 'telegram' themes are present.
 */
const registry = new Map(); // owner -> themes
export function registerColorThemes(list, owner) {
  if (list.length) registry.set(owner, list.map((c) => ({ ...c, owner }))); else registry.delete(owner);
  const tg = registry.get('telegram') || [];
  const mods = [...registry].filter(([o]) => o !== 'telegram').flatMap(([, l]) => l);
  COLOR_THEMES.splice(0, COLOR_THEMES.length, ...(tg.length ? tg : BUILTIN_THEMES), ...mods);
}
export function unregisterColorThemes(owner) { registerColorThemes([], owner); }

export const NAME_COLORS = ['#ff7a72', '#faa357', '#c48bff', '#6fd27a', '#45dbc7', '#5bb9ff', '#ff7ab5']; // like the peer colours of avatars
export const NAME_COLORS_DAY = ['#e0453d', '#d1780f', '#9b5de5', '#2e9b45', '#16a596', '#2d89d8', '#d6407a'];

export const outGradient = (theme, mode) => {
  const stops = (theme.out && (theme.out[mode] && theme.out[mode].length ? theme.out[mode] : theme.out.dark && theme.out.dark.length ? theme.out.dark : theme.out.light)) || [];
  if (!stops.length) return '#5a86c4';
  return stops.length === 1 || stops[0] === stops[1] && stops.length === 2 ? stops[0] : `linear-gradient(135deg, ${stops.join(', ')})`;
};
