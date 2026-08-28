/**
 * ====================================================================
 * COMPONENT: RIGHT SIDEBAR (Search, Sidebar Channels, Trends)
 * ====================================================================
 */

import { state } from '../state.js';
import { parseEmojis } from '../emoji.js';
import { VERIFIED_BADGE_SVG } from './postCard.js';

export function renderSidebarChannels() {
  const list = document.getElementById('channels-sidebar-list');
  if (!list) return;
  list.innerHTML = '';

  state.channels.slice(0, 8).forEach(ch => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between hover:bg-white/5 p-2 rounded-2xl cursor-pointer transition';
    item.onclick = () => window.TelegramX.filterByChannel(ch.id, ch.title);

    const initial = (ch.title || 'C').charAt(0).toUpperCase();
    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-tr from-[#3390ec] to-sky-400 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow">
          ${ch.avatar ? `<img src="${ch.avatar}" class="w-full h-full object-cover" />` : initial}
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1">
            <span class="text-xs font-bold text-white truncate max-w-[140px]">${parseEmojis(ch.title)}</span>
            ${ch.verified ? VERIFIED_BADGE_SVG : ''}
          </div>
          <span class="text-[10px] text-[#8a8a90] font-mono truncate">${ch.username ? '@' + ch.username : 'Канал'}</span>
        </div>
      </div>
      <button class="bg-[#3390ec]/15 hover:bg-[#3390ec] hover:text-white text-[11px] font-semibold text-[#62b0f2] px-3 py-1 rounded-full transition shrink-0 border border-[#3390ec]/20">
        Стена
      </button>
    `;
    list.appendChild(item);
  });
}
