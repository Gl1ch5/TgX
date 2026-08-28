/**
 * ====================================================================
 * COMPONENT: TELEGRAM WALLPAPER THEME ENGINE
 * ====================================================================
 */

import { showToast } from '../utils.js';

export const WALLPAPERS = [
  {
    id: 'FOks2P6KCFIMAAAAyFz5S74pfKo',
    name: 'Cosmic Liquid',
    gradient: 'radial-gradient(ellipse at 60% 20%, #1e1544 0%, #0d0922 45%, #05030d 100%)',
    svg: '/static/wallpapers/FOks2P6KCFIMAAAAyFz5S74pfKo.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'MIo6r0qGSFAFAAAAtL8TsDzNX60',
    name: 'Neon Cyber',
    gradient: 'radial-gradient(ellipse at 30% 70%, #0e2946 0%, #081729 45%, #02070e 100%)',
    svg: '/static/wallpapers/MIo6r0qGSFAFAAAAtL8TsDzNX60.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'CJNyxPMgSVAEAAAAvW9sMwc51cw',
    name: 'Midnight Glass',
    gradient: 'radial-gradient(circle at 50% 30%, #252533 0%, #13131c 45%, #07070a 100%)',
    svg: '/static/wallpapers/CJNyxPMgSVAEAAAAvW9sMwc51cw.svg',
    patternOpacity: 0.30,
  },
  {
    id: 'aiuT0cIzaVIHAAAAjS-ebiVKLtU',
    name: 'Emerald Dream',
    gradient: 'radial-gradient(ellipse at 80% 20%, #103825 0%, #092015 45%, #020a07 100%)',
    svg: '/static/wallpapers/aiuT0cIzaVIHAAAAjS-ebiVKLtU.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'T7LjEHVuYVIFAAAAS7NH4xQl6jY',
    name: 'Obsidian Purple',
    gradient: 'radial-gradient(ellipse at 20% 40%, #36174a 0%, #1c0a27 45%, #09030d 100%)',
    svg: '/static/wallpapers/T7LjEHVuYVIFAAAAS7NH4xQl6jY.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'bJcwphEAYVINAAAA5jpWNRMqilA',
    name: 'Deep Ocean',
    gradient: 'radial-gradient(ellipse at 50% 85%, #0d3156 0%, #071b30 45%, #020810 100%)',
    svg: '/static/wallpapers/bJcwphEAYVINAAAA5jpWNRMqilA.svg',
    patternOpacity: 0.28,
  },
  {
    id: '8u8Y1ggMYVITAAAAluQYztxHp6s',
    name: 'Aurora Glow',
    gradient: 'radial-gradient(ellipse at 70% 60%, #1a3245 0%, #0f1e2a 45%, #03080e 100%)',
    svg: '/static/wallpapers/8u8Y1ggMYVITAAAAluQYztxHp6s.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'DRaa0SbvYVIjAAAAWv3uHfEiYyI',
    name: 'Sunset Dunes',
    gradient: 'radial-gradient(ellipse at 30% 30%, #3b211d 0%, #221210 45%, #0a0404 100%)',
    svg: '/static/wallpapers/DRaa0SbvYVIjAAAAWv3uHfEiYyI.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'rF5kQBMSYFICAAAAUCWVFDNCLnU',
    name: 'Dark Velvet',
    gradient: 'radial-gradient(ellipse at 50% 50%, #2f2232 0%, #19111b 45%, #08040a 100%)',
    svg: '/static/wallpapers/rF5kQBMSYFICAAAAUCWVFDNCLnU.svg',
    patternOpacity: 0.28,
  },
  {
    id: 'oled',
    name: 'OLED Pure Black',
    gradient: '#000000',
    svg: null,
    patternOpacity: 0,
  },
];

export function initWallpaperEngine() {
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
    bgCanvas.className = 'fixed inset-0 pointer-events-none z-0 transition-all duration-700 ease-in-out';
    document.body.prepend(bgCanvas);
  }

  let bgPattern = document.getElementById('tgx-bg-pattern');
  if (!bgPattern) {
    bgPattern = document.createElement('div');
    bgPattern.id = 'tgx-bg-pattern';
    bgPattern.className = 'fixed inset-0 pointer-events-none z-0 transition-opacity duration-700 ease-in-out bg-repeat bg-center';
    document.body.prepend(bgPattern);
  }

  // Set background gradient
  bgCanvas.style.background = wp.gradient;

  // Set vector pattern
  if (wp.svg) {
    bgPattern.style.backgroundImage = `url("${wp.svg}")`;
    bgPattern.style.backgroundSize = '360px auto';
    bgPattern.style.opacity = wp.patternOpacity || 0.28;
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
    showToast(`Обои установлены: ${wp.name} ✨`);
  }
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
  WALLPAPERS.forEach(wp => {
    const isCur = wp.id === currentId;
    const item = document.createElement('div');
    item.setAttribute('data-wp-id', wp.id);
    item.className = `wallpaper-item-card relative h-36 rounded-2xl cursor-pointer overflow-hidden border border-white/15 transition transform hover:scale-102 flex flex-col justify-end p-2.5 shadow-xl ${isCur ? 'ring-2 ring-[#3390ec]' : ''}`;
    item.onclick = () => {
      applyWallpaper(wp.id, true);
    };

    item.innerHTML = `
      <!-- Background Canvas Preview -->
      <div class="absolute inset-0 z-0" style="background: ${wp.gradient};"></div>
      ${wp.svg ? `
        <div class="absolute inset-0 z-0 bg-repeat bg-center" style="background-image: url('${wp.svg}'); background-size: 200px auto; opacity: 0.35;"></div>
      ` : ''}

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
