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
let activeView = 'wall';

/** Put every icon on its resting frame: filled for the active tab, outline for the rest. */
function settle() {
  anims.forEach((anim, name) => {
    if (!anim.totalFrames) return;
    anim.stop();
    anim.goToAndStop(name === activeView ? anim.totalFrames - 1 : 0, true);
  });
}

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
      // The filling animation must never stay half-way (that frame has a hole in the middle).
      anim.addEventListener('complete', settle);
      anims.set(tab.dataset.view, anim);
    } catch (e) {
      console.warn('[TeleX] tab icon', tab.dataset.icon, e);
    }
  }));
  activeView = document.querySelector('.tx-dock-tab.is-active')?.dataset.view || activeView;
  settle();
  // Hidden tabs/apps pause animations mid-way: snap to the end state when coming back.
  document.addEventListener('visibilitychange', settle);
  window.addEventListener('tx:resume', settle);
}

let settleTimer = null;

export function setDockActive(view, prev) {
  if (view === 'thread' || view === 'channel') return; // nested screens keep the tab state
  const changed = activeView !== view; // coming back from a nested screen doesn't replay the fill
  activeView = view;
  const reduce = document.body.classList.contains('tx-reduce-motion') || document.visibilityState !== 'visible';
  anims.forEach((anim, name) => {
    if (name === view && changed && !reduce) {
      anim.goToAndStop(0, true);
      anim.playSegments([0, anim.totalFrames - 1], true);
    } else {
      anim.stop();
      anim.goToAndStop(name === view ? anim.totalFrames - 1 : 0, true);
    }
  });
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, 900); // safety net if 'complete' never fires
}
