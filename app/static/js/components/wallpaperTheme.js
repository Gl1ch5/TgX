/**
 * ====================================================================
 * COMPONENT: TELEGRAM WALLPAPER THEME ENGINE
 * ====================================================================
 */

import { showToast } from '../utils.js';
import { t } from '../i18n.js';
import { COLOR_THEMES, registerColorThemes, themeWallpaper } from '../core/colorThemes.js';
import { getPrefs, resolvedTheme } from '../core/prefs.js';

export const WALLPAPERS = [
  {
    id: 'FOks2P6KCFIMAAAAyFz5S74pfKo',
    name: 'Cosmic Liquid',
    gradient: 'radial-gradient(ellipse at 60% 20%, #1e1544 0%, #0d0922 45%, #05030d 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #e3e9fb 0%, #c4d0f1 100%)',
    svg: 'wallpapers/FOks2P6KCFIMAAAAyFz5S74pfKo.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'MIo6r0qGSFAFAAAAtL8TsDzNX60',
    name: 'Neon Cyber',
    gradient: 'radial-gradient(ellipse at 30% 70%, #0e2946 0%, #081729 45%, #02070e 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #d8eef8 0%, #b6dbee 100%)',
    svg: 'wallpapers/MIo6r0qGSFAFAAAAtL8TsDzNX60.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'CJNyxPMgSVAEAAAAvW9sMwc51cw',
    name: 'Midnight Glass',
    gradient: 'radial-gradient(circle at 50% 30%, #252533 0%, #13131c 45%, #07070a 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #e8e8f1 0%, #d0d0de 100%)',
    svg: 'wallpapers/CJNyxPMgSVAEAAAAvW9sMwc51cw.svg',
    patternOpacity: 0.30,
  },
  {
    id: 'aiuT0cIzaVIHAAAAjS-ebiVKLtU',
    name: 'Emerald Dream',
    gradient: 'radial-gradient(ellipse at 80% 20%, #103825 0%, #092015 45%, #020a07 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #d9f0e3 0%, #bde2cf 100%)',
    svg: 'wallpapers/aiuT0cIzaVIHAAAAjS-ebiVKLtU.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'T7LjEHVuYVIFAAAAS7NH4xQl6jY',
    name: 'Obsidian Purple',
    gradient: 'radial-gradient(ellipse at 20% 40%, #36174a 0%, #1c0a27 45%, #09030d 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #ecdff8 0%, #d5bfeb 100%)',
    svg: 'wallpapers/T7LjEHVuYVIFAAAAS7NH4xQl6jY.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'bJcwphEAYVINAAAA5jpWNRMqilA',
    name: 'Deep Ocean',
    gradient: 'radial-gradient(ellipse at 50% 85%, #0d3156 0%, #071b30 45%, #020810 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #d5e8f8 0%, #b3d2ee 100%)',
    svg: 'wallpapers/bJcwphEAYVINAAAA5jpWNRMqilA.svg',
    patternOpacity: 0.28,
  },
  {
    id: '8u8Y1ggMYVITAAAAluQYztxHp6s',
    name: 'Aurora Glow',
    gradient: 'radial-gradient(ellipse at 70% 60%, #1a3245 0%, #0f1e2a 45%, #03080e 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #daeef1 0%, #bcdbe3 100%)',
    svg: 'wallpapers/8u8Y1ggMYVITAAAAluQYztxHp6s.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'DRaa0SbvYVIjAAAAWv3uHfEiYyI',
    name: 'Sunset Dunes',
    gradient: 'radial-gradient(ellipse at 30% 30%, #3b211d 0%, #221210 45%, #0a0404 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #f8e5da 0%, #ebc8b6 100%)',
    svg: 'wallpapers/DRaa0SbvYVIjAAAAWv3uHfEiYyI.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'rF5kQBMSYFICAAAAUCWVFDNCLnU',
    name: 'Dark Velvet',
    gradient: 'radial-gradient(ellipse at 50% 50%, #2f2232 0%, #19111b 45%, #08040a 100%)',
    light: 'radial-gradient(ellipse at 60% 20%, #f2dfec 0%, #e2c3d7 100%)',
    svg: 'wallpapers/rF5kQBMSYFICAAAAUCWVFDNCLnU.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'oled',
    name: 'OLED Pure Black',
    gradient: '#000000',
    light: '#f0f0f5',
    svg: null,
    patternOpacity: 0,
  },
];

// ---- the wallpapers Telegram offers this account (real colours and pattern intensity) ----
const BUILTIN = WALLPAPERS.slice();
const REMOTE_KEY = 'tgx_wp_remote';

export function wallFill(w) {
  const c = w.colors || [];
  if (!c.length) return '#000';
  if (c.length === 1) return c[0];
  if (c.length === 2) return `linear-gradient(${(w.rotation || 0) + 180}deg, ${c[0]}, ${c[1]})`;
  // Telegram's 3/4-colour "freeform" gradient, approximated with corner glows
  const at = ['18% 12%', '86% 30%', '14% 88%', '82% 86%'];
  return c.map((col, i) => `radial-gradient(circle at ${at[i]}, ${col} 0, transparent 70%)`).join(', ') + `, ${c[0]}`;
}

/** Add (or replace) a real wallpaper — from Telegram or a mod. Returns its id. */
export function registerWallpaper(w, id = w.id, { name = '', hidden = false } = {}) {
  const fill = wallFill(w);
  const entry = { ...w, id, name: name || w.name || t('Обои'), gradient: fill, light: fill, svg: w.kind === 'pattern' ? w.url : null, remote: true, hidden };
  const i = WALLPAPERS.findIndex((x) => x.id === id);
  if (i >= 0) WALLPAPERS[i] = entry;
  else WALLPAPERS.splice(Math.max(0, WALLPAPERS.findIndex((x) => x.id === 'oled')), 0, entry);
  return id;
}
export function unregisterWallpapers(prefix) {
  for (let i = WALLPAPERS.length - 1; i >= 0; i--) if (WALLPAPERS[i].id.startsWith(prefix)) WALLPAPERS.splice(i, 1);
}

/** Wallpapers shown in the picker: Telegram's own when we have them, else the built-in set. */
export function pickerWallpapers() {
  const real = WALLPAPERS.some((w) => w.remote && !w.hidden && w.id.startsWith('tg'));
  return WALLPAPERS.filter((w) => !w.hidden && (w.id === 'oled' || (real ? w.remote : true)));
}

function useRemote(list) {
  if (!Array.isArray(list) || !list.length) return false;
  unregisterWallpapers('tg');
  list.forEach((w, i) => registerWallpaper(w, w.id, { name: `${t('Обои')} ${i + 1}` }));
  return true;
}

const THEMES_KEY = 'tgx_chat_themes';

/** Telegram's chat themes → the colour-theme carousel (day and night wallpapers/colours of each). */
function useThemes(list) {
  if (!Array.isArray(list) || !list.length) return false;
  unregisterWallpapers('th:');
  const themes = list.map((th) => {
    const wp = {};
    const out = {};
    for (const mode of ['dark', 'light']) {
      const v = th[mode] || th[mode === 'dark' ? 'light' : 'dark'];
      out[mode] = (v && v.out && v.out.length ? v.out : null);
      if (v && v.wallpaper) wp[mode] = registerWallpaper(v.wallpaper, `th:${th.emoticon}:${mode}`, { name: th.emoticon, hidden: true });
    }
    const base = BUILTIN_OUT;
    return { id: 'tg:' + th.emoticon, emoji: th.emoticon, accent: null, wp, out: { dark: out.dark || base.dark, light: out.light || base.light } };
  });
  // the first tile is Telegram's default look: the first real wallpaper, the standard blue bubbles
  const first = WALLPAPERS.find((w) => w.remote && !w.hidden && w.id.startsWith('tg'));
  themes.unshift({ id: 'classic', emoji: '🎨', accent: 'blue', wp: first ? first.id : 'FOks2P6KCFIMAAAAyFz5S74pfKo', out: BUILTIN_OUT });
  registerColorThemes(themes, 'telegram');
  return true;
}
const BUILTIN_OUT = { dark: ['#5a86c4', '#568fc3'], light: ['#4a80f5', '#5b8df7'] };

/** Fetch the account's real wallpapers and chat themes once (cached for the next start), then redraw. */
export async function loadRemoteWallpapers() {
  try { useRemote(JSON.parse(localStorage.getItem(REMOTE_KEY) || 'null')); useThemes(JSON.parse(localStorage.getItem(THEMES_KEY) || 'null')); } catch {}
  try {
    const { telegram } = await import('../tg.js');
    if (!telegram.hasSession || !telegram.hasSession()) return;
    const [walls, themes] = await Promise.all([telegram.getWallpapers().catch(() => null), telegram.getChatThemes().catch(() => null)]);
    if (useRemote(walls)) localStorage.setItem(REMOTE_KEY, JSON.stringify(walls));
    if (useThemes(themes)) localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
    refreshWallpaper();
    document.dispatchEvent(new Event('tx:themes'));
    const grid = document.getElementById('wallpaper-grid-list');
    if (grid) renderWallpaperList();
  } catch (e) { console.warn('[TeleX] wallpapers', e); }
}

/** Fill + pattern of a wallpaper into two layers (shared by the page background, the picker and the previews). */
function paintWall(wp, day, canvas, pattern, scale = 1) {
  if (wp.remote) {
    const neg = wp.intensity != null && wp.intensity < 0;
    const op = Math.abs(wp.intensity == null ? 50 : wp.intensity) / 100;
    canvas.style.background = neg ? '#000' : wp.gradient;
    if (wp.svg) {
      const u = `url("${wp.svg}")`;
      pattern.style.cssText += `;filter:none;background:${neg ? wp.gradient : '#000'};-webkit-mask:${u} center top/${scale === 1 ? 'min(100%,640px) auto' : '120px auto'} repeat;mask:${u} center top/${scale === 1 ? 'min(100%,640px) auto' : '120px auto'} repeat;opacity:${op}`;
    } else { pattern.style.cssText += ';-webkit-mask:none;mask:none;background:none;opacity:0'; }
    return;
  }
  canvas.style.background = day && wp.light ? wp.light : wp.gradient;
}

/** Two stacked layers (fill + pattern) for a small preview of a wallpaper. */
export function wallPreviewHtml(wp, day, size = 120) {
  if (wp.remote) {
    const neg = wp.intensity != null && wp.intensity < 0;
    const op = Math.abs(wp.intensity == null ? 50 : wp.intensity) / 100;
    const u = wp.svg ? `url('${wp.svg}')` : '';
    return `<span style="position:absolute;inset:0;background:${neg ? '#000' : wp.gradient}"></span>` + (u ? `<span style="position:absolute;inset:0;background:${neg ? wp.gradient : '#000'};-webkit-mask:${u} center top/${size}px auto repeat;mask:${u} center top/${size}px auto repeat;opacity:${op}"></span>` : '');
  }
  const bg = day && wp.light ? wp.light : wp.gradient;
  return `<span style="position:absolute;inset:0;background:${bg}"></span>` + (wp.svg ? `<span style="position:absolute;inset:0;background:url('${wp.svg}') center/${size}px auto repeat;opacity:.35"></span>` : '');
}

export function initWallpaperEngine() {
  loadRemoteWallpapers();
  const savedId = localStorage.getItem('tgx_wallpaper') || 'FOks2P6KCFIMAAAAyFz5S74pfKo';
  applyWallpaper(savedId, false);
}

export function applyWallpaper(wallpaperId, showFeedback = true) {
  const wp = WALLPAPERS.find(w => w.id === wallpaperId) || WALLPAPERS[0];
  localStorage.setItem('tgx_wallpaper', wp.id);

  let bgCanvas = document.getElementById('tgx-bg-canvas');
  if (!bgCanvas) {
    bgCanvas = document.createElement('div');
    bgCanvas.id = 'tgx-bg-canvas';
    bgCanvas.className = 'fixed inset-0 pointer-events-none z-0';
    document.body.prepend(bgCanvas);
  }

  let bgPattern = document.getElementById('tgx-bg-pattern');
  if (!bgPattern) {
    bgPattern = document.createElement('div');
    bgPattern.id = 'tgx-bg-pattern';
    bgPattern.className = 'fixed inset-0 pointer-events-none z-0 bg-repeat bg-center';
    document.body.prepend(bgPattern);
  }

  // Set background gradient (day theme: the pale variant)
  const day = document.documentElement.dataset.theme === 'light';
  bgCanvas.style.background = day && wp.light ? wp.light : wp.gradient;

  // Set vector pattern
  if (wp.remote) {
    bgPattern.style.cssText = '';
    paintWall(wp, day, bgCanvas, bgPattern);
  } else if (wp.svg) {
    bgPattern.style.cssText = '';
    bgPattern.style.backgroundImage = `url("${wp.svg}")`;
    bgPattern.style.backgroundSize = '360px auto';
    bgPattern.style.opacity = day ? 0.1 : wp.patternOpacity || 0.28;
  } else {
    bgPattern.style.backgroundImage = 'none';
    bgPattern.style.opacity = '0';
  }

  // Update checkmarks in wallpaper modal
  document.querySelectorAll('.wallpaper-item-card').forEach(card => {
    const isCur = card.getAttribute('data-wp-id') === wp.id;
    card.classList.toggle('ring-2', isCur);
    card.classList.toggle('ring-[#3390ec]', isCur);
    const check = card.querySelector('.wp-active-check');
    if (check) check.classList.toggle('hidden', !isCur);
  });

  if (showFeedback) {
    showToast(t('Обои установлены: {a}', {a: wp.name}));
  }
}

/** Re-draw the wallpaper (the theme changed). */
export function refreshWallpaper() {
  // A colour theme that has its own day/night wallpapers keeps them in step with the mode.
  const auto = localStorage.getItem('tgx_wp_auto');
  const theme = auto && COLOR_THEMES.find((c) => c.id === auto);
  const id = theme && themeWallpaper(theme, resolvedTheme(getPrefs()));
  if (id && WALLPAPERS.some((w) => w.id === id)) localStorage.setItem('tgx_wallpaper', id);
  applyWallpaper(localStorage.getItem('tgx_wallpaper') || WALLPAPERS[0].id, false);
}

export function openWallpaperModal() {
  const modal = document.getElementById('wallpaper-modal');
  if (modal) {
    modal.classList.remove('hidden');
    renderWallpaperList();
  }
}

export function closeWallpaperModal() {
  const modal = document.getElementById('wallpaper-modal');
  if (modal) modal.classList.add('hidden');
}

export function renderWallpaperList() {
  const container = document.getElementById('wallpaper-grid-list');
  if (!container) return;
  const currentId = localStorage.getItem('tgx_wallpaper') || 'FOks2P6KCFIMAAAAyFz5S74pfKo';

  container.innerHTML = '';
  pickerWallpapers().forEach(wp => {
    const isCur = wp.id === currentId;
    const item = document.createElement('div');
    item.setAttribute('data-wp-id', wp.id);
    item.className = `wallpaper-item-card relative h-36 rounded-2xl cursor-pointer overflow-hidden border border-white/15 transition transform hover:scale-102 flex flex-col justify-end p-2.5 shadow-xl ${isCur ? 'ring-2 ring-[#3390ec]' : ''}`;
    item.onclick = () => {
      localStorage.removeItem('tgx_wp_auto'); // a hand-picked wallpaper stops following the theme
      applyWallpaper(wp.id, true);
    };

    item.innerHTML = `
      ${wallPreviewHtml(wp, document.documentElement.dataset.theme === 'light', 200)}

      <!-- Active Checkmark Badge -->
      <div class="wp-active-check ${isCur ? '' : 'hidden'} absolute top-2 right-2 w-5 h-5 rounded-full bg-[#3390ec] text-white flex items-center justify-center shadow-lg z-10">
        <i class="icon icon-check-bold text-[10px] text-white"></i>
      </div>

      <!-- Title Badge -->
      <div class="relative z-10 bg-black/60 backdrop-blur-md rounded-xl px-2 py-1 border border-white/10 flex items-center justify-between">
        <span class="text-xs font-medium text-white truncate max-w-[110px]">${wp.name}</span>
        <span class="text-[10px] text-[#62b0f2] font-mono font-medium">${wp.svg ? 'Telegram' : 'OLED'}</span>
      </div>
    `;

    container.appendChild(item);
  });
}
