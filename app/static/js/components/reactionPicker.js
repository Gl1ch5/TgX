/**
 * ====================================================================
 * COMPONENT: REACTION PICKER & HANDLERS
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';
import { reactionsHtml } from './postCard.js';

export function toggleReactionPicker(postId, event) {
  if (event) event.stopPropagation();
  const picker = document.getElementById(`picker-${postId}`);
  if (!picker) return;

  document.querySelectorAll('.reaction-popover').forEach((p) => {
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
  document.querySelectorAll('.reaction-popover').forEach((p) => p.classList.add('hidden'));
});

export async function sendReaction(channelId, msgId, emoji, postId) {
  const post = state.posts.find((p) => p.id === postId);
  let sendEmoji = emoji;

  if (post) {
    post.reactions = post.reactions || [];
    const current = post.reactions.find((r) => r.chosen);
    if (current) {
      current.chosen = false;
      current.count = Math.max(0, current.count - 1);
    }
    if (current && current.emoji === emoji) {
      sendEmoji = ''; // tapping your own reaction removes it
    } else {
      const target = post.reactions.find((r) => r.emoji === emoji);
      if (target) {
        target.count += 1;
        target.chosen = true;
      } else {
        post.reactions.push({ emoji, count: 1, chosen: true });
      }
    }
    post.reactions = post.reactions.filter((r) => r.count > 0);

    const wrap = document.getElementById(`reactions-wrap-${postId}`);
    if (wrap) wrap.innerHTML = reactionsHtml(post);
  }

  const res = await api.sendReaction(channelId, msgId, sendEmoji);
  if (res.status !== 'success') {
    showToast('Не удалось поставить реакцию: ' + (res.message || 'ошибка'));
  }
}
