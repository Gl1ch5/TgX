/**
 * ====================================================================
 * TAB BAR ICONS — the original Telegram for Android tab animations
 * (res/raw/tab_chats.json, tab_settings.json from DrKLO/Telegram):
 * outline at frame 0, filled at the last frame; selecting a tab plays
 * outline → filled exactly like GlassTabView.
 * ====================================================================
 */

import { loadLottie } from './sticker.js';

const anims = new Map(); // view -> lottie animation

export async function initDock() {
  const tabs = [...document.querySelectorAll('.tx-dock-tab[data-icon]')];
  if (!tabs.length) return;
  let lottie;
  try {
    lottie = await loadLottie();
  } catch {
    return; // keep the font-icon fallback
  }
  await Promise.all(tabs.map(async (tab) => {
    try {
      const res = await fetch(`icons/tabs/tab_${tab.dataset.icon}.json`);
      const data = await res.json();
      const box = tab.querySelector('.tx-tab-icon');
      box.textContent = '';
      const anim = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: data });
      anim.addEventListener('DOMLoaded', () => anim.goToAndStop(tab.classList.contains('is-active') ? anim.totalFrames - 1 : 0, true));
      anims.set(tab.dataset.view, anim);
    } catch (e) {
      console.warn('[TeleX] tab icon', tab.dataset.icon, e);
    }
  }));
}

export function setDockActive(view, prev) {
  anims.forEach((anim, name) => {
    if (name === view && prev !== view) {
      anim.goToAndStop(0, true);
      anim.playSegments([0, anim.totalFrames - 1], true);
    } else if (name !== view) {
      anim.goToAndStop(0, true);
    }
  });
}
