/**
 * ====================================================================
 * COMPONENT: CHANNELS STORIES BAR CAROUSEL
 * ====================================================================
 */

import { state } from '../state.js';
import { parseEmojis } from '../emoji.js';

export function renderChannelsBar() {
  const bar = document.getElementById('channels-bar');
  if (!bar) return;

  bar.innerHTML = `
    <button onclick="window.TelegramX.clearChannelFilter()" class="flex flex-col items-center gap-1 shrink-0 group">
      <div class="w-11 h-11 rounded-full bg-[#18181f] border ${!state.activeChannelId ? 'border-[#3390ec] ring-2 ring-[#3390ec]/40' : 'border-white/10'} flex items-center justify-center group-hover:scale-105 transition shadow">
        <i class="icon icon-channel text-lg text-[#3390ec]"></i>
      </div>
      <span class="text-[11px] font-normal text-slate-300 w-12 text-center truncate">Все</span>
    </button>
  `;

  state.channels.slice(0, 20).forEach(ch => {
    const btn = document.createElement('div');
    const isActive = state.activeChannelId === ch.id;
    btn.className = 'flex flex-col items-center gap-1 shrink-0 group cursor-pointer';

    const initial = (ch.title || 'C').charAt(0).toUpperCase();
    btn.innerHTML = `
      <div class="w-11 h-11 rounded-full overflow-hidden story-ring ${isActive ? 'ring-2 ring-[#3390ec]' : ''} flex items-center justify-center text-white font-bold text-xs shadow group-hover:scale-105 transition relative" onclick="window.TelegramX.openStoryViewer(${ch.id})">
        <div class="w-full h-full rounded-full overflow-hidden bg-gradient-to-tr from-[#3390ec] to-sky-400 flex items-center justify-center">
          ${ch.avatar ? `<img src="${ch.avatar}" class="w-full h-full object-cover" />` : initial}
        </div>
        ${ch.unread_count > 0 ? `<span class="absolute top-0 right-0 w-2.5 h-2.5 bg-[#4fae4e] border-2 border-[#000000] rounded-full"></span>` : ''}
      </div>
      <span class="text-[11px] font-normal text-slate-300 w-12 text-center truncate hover:underline" onclick="window.TelegramX.filterByChannel(${ch.id}, '${ch.title}')">${parseEmojis(ch.title)}</span>
    `;
    bar.appendChild(btn);
  });
}
