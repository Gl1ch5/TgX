/**
 * ====================================================================
 * COMPONENT: CHANNELS DIALOG MODAL & SEARCH FILTER
 * ====================================================================
 */

import { state } from '../state.js';
import { escapeQuotes } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { VERIFIED_BADGE_SVG } from './postCard.js';

export function openChannelsModal() {
  const modal = document.getElementById('channels-modal');
  if (modal) {
    modal.classList.remove('hidden');
    renderChannelsModalList(state.channels);
  }
}

export function closeChannelsModal() {
  const modal = document.getElementById('channels-modal');
  if (modal) modal.classList.add('hidden');
}

export function renderChannelsModalList(channels) {
  const list = document.getElementById('channels-modal-list');
  if (!list) return;
  list.innerHTML = '';

  channels.forEach(ch => {
    const row = document.createElement('div');
    row.className = 'py-3 flex items-center justify-between hover:bg-white/5 px-2.5 rounded-2xl transition cursor-pointer';
    const initial = (ch.title || 'C').charAt(0).toUpperCase();
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1" onclick="window.TelegramX.closeChannelsModal(); window.TelegramX.filterByChannel(${ch.id}, '${escapeQuotes(ch.title)}')">
        <div class="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-tr from-[#3390ec] to-sky-400 flex items-center justify-center font-bold text-white text-sm shrink-0 border border-white/10 shadow">
          ${ch.avatar ? `<img src="${ch.avatar}" class="w-full h-full object-cover" />` : initial}
        </div>
        <div class="flex flex-col min-w-0 flex-1">
          <div class="flex items-center gap-1">
            <span class="text-sm font-bold text-white truncate max-w-[240px]">${parseEmojis(ch.title)}</span>
            ${ch.verified ? VERIFIED_BADGE_SVG : ''}
          </div>
          <span class="text-xs text-[#8a8a90] font-mono truncate">${ch.username ? '@' + ch.username : 'Канал'}</span>
        </div>
      </div>
      <button onclick="window.TelegramX.closeChannelsModal(); window.TelegramX.filterByChannel(${ch.id}, '${escapeQuotes(ch.title)}')" class="bg-[#3390ec]/15 hover:bg-[#3390ec] text-[#62b0f2] hover:text-white px-3.5 py-1.5 rounded-full text-xs font-semibold transition border border-[#3390ec]/30 flex items-center gap-1 shrink-0">
        <i class="icon icon-channel text-xs"></i>
        <span>Стена</span>
      </button>
    `;
    list.appendChild(row);
  });
}

export function filterChannelsModalList(query) {
  const q = query.toLowerCase().trim();
  const filtered = state.channels.filter(c => 
    (c.title && c.title.toLowerCase().includes(q)) || 
    (c.username && c.username.toLowerCase().includes(q))
  );
  renderChannelsModalList(filtered);
}
