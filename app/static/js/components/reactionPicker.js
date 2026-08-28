/**
 * ====================================================================
 * COMPONENT: REACTION PICKER & HANDLERS
 * ====================================================================
 */

import { state, EMOJI_PICKER_LIST } from '../state.js';
import { api } from '../api.js';
import { showToast, formatNumber } from '../utils.js';
import { renderEmoji } from '../emoji.js';

export function toggleReactionPicker(postId, event) {
  if (event) event.stopPropagation();
  const picker = document.getElementById(`picker-${postId}`);
  if (!picker) return;

  document.querySelectorAll('.reaction-popover').forEach(p => {
    if (p.id !== `picker-${postId}`) p.classList.add('hidden');
  });

  picker.classList.toggle('hidden');
}

export function hideReactionPicker(postId) {
  const picker = document.getElementById(`picker-${postId}`);
  if (picker) picker.classList.add('hidden');
}

// Global click listener to close reaction popovers
document.addEventListener('click', () => {
  document.querySelectorAll('.reaction-popover').forEach(p => p.classList.add('hidden'));
});

export async function sendReaction(channelId, msgId, emoji, postId) {
  const post = state.posts.find(p => p.id === postId);
  if (post) {
    if (!post.reactions) post.reactions = [];
    const existing = post.reactions.find(r => r.emoji === emoji);
    if (existing) {
      existing.count += 1;
      existing.chosen = true;
    } else {
      post.reactions.push({ emoji, count: 1, chosen: true });
    }
    const wrap = document.getElementById(`reactions-wrap-${postId}`);
    if (wrap) {
      wrap.innerHTML = `
        ${post.reactions.map(r => `
          <button onclick="window.TelegramX.sendReaction(${post.channel_id}, ${post.msg_id}, '${r.emoji}', '${post.id}')" class="tg-reaction-pill ${r.chosen ? 'active' : ''}">
            ${renderEmoji(r.emoji, 'emoji-small')}
            <span class="font-medium text-[11.5px]">${formatNumber(r.count)}</span>
          </button>
        `).join('')}
        <button onclick="window.TelegramX.toggleReactionPicker('${post.id}', event)" class="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-slate-400 hover:text-white transition" title="Добавить реакцию">
          <i class="icon icon-smile text-sm"></i>
        </button>
      `;
    }
  }

  showToast(`Реакция ${emoji} отправлена`);

  try {
    await api.sendReaction(channelId, msgId, emoji);
  } catch (e) {
    console.error(e);
  }
}
