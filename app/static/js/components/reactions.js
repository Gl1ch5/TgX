/**
 * ====================================================================
 * REACTIONS — Telegram pills (emoji, premium custom emoji, paid stars)
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, formatNumber, escapeQuotes } from '../utils.js';
import { renderEmoji } from '../emoji.js';
import { hydrateStickers } from './sticker.js';

const STAR_SVG = '<svg class="tx-star" viewBox="0 0 24 24" width="22" height="22"><path fill="#ffc83d" stroke="#f59e0b" stroke-width="1" stroke-linejoin="round" d="M12 2.6l2.75 6.03 6.6.67-4.94 4.43 1.41 6.5L12 16.9l-5.82 3.33 1.41-6.5L2.65 9.3l6.6-.67z"/></svg>';

export function reactionIcon(r) {
  if (r.paid) return STAR_SVG;
  if (r.custom_id) return `<span class="tx-cemoji" data-id="${r.custom_id}"><span class="tx-cemoji-fallback"></span></span>`;
  return renderEmoji(r.emoji, 'emoji-small');
}

export function reactionsHtml(post, { scope = 'post' } = {}) {
  const list = post.reactions || [];
  if (!list.length) return '';
  return list.map((r, i) => `
    <button class="tx-reaction ${r.chosen ? 'is-chosen' : ''} ${r.paid ? 'is-paid' : ''}"
      onclick="event.stopPropagation(); window.TelegramX.tapReaction('${post.id}', ${i}, '${scope}')">
      ${reactionIcon(r)}<span>${formatNumber(r.count)}</span>
    </button>`).join('');
}

export function renderReactions(post, popIndex = -1) {
  document.querySelectorAll(`[id="reactions-wrap-${post.id}"]`).forEach((wrap) => {
    wrap.innerHTML = reactionsHtml(post);
    if (popIndex >= 0) wrap.children[popIndex]?.classList.add('tx-pop');
    wrap.classList.toggle('tx-hidden', !(post.reactions || []).length);
    hydrateStickers(wrap);
  });
}

/** Toggle a reaction on a post; one own reaction like a non-premium Telegram user. */
export async function sendReaction(channelId, msgId, emoji, postId, customId = null) {
  const post = state.posts.find((p) => p.id === postId) || (state.threadPost && state.threadPost.id === postId ? state.threadPost : null);
  let send = { emoji, customId };

  if (post) {
    post.reactions = post.reactions || [];
    const same = (r) => (customId ? r.custom_id === customId : !r.custom_id && !r.paid && r.emoji === emoji);
    const current = post.reactions.find((r) => r.chosen && !r.paid);
    if (current) {
      current.chosen = false;
      current.count = Math.max(0, current.count - 1);
    }
    if (current && same(current)) {
      send = { emoji: '', customId: null };
    } else {
      const target = post.reactions.find(same);
      if (target) {
        target.count += 1;
        target.chosen = true;
      } else {
        post.reactions.push({ emoji, custom_id: customId, count: 1, chosen: true });
      }
    }
    post.reactions = post.reactions.filter((r) => r.count > 0);
    renderReactions(post, post.reactions.findIndex((r) => r.chosen));
  }

  const res = await api.sendReaction(channelId, msgId, send.emoji, send.customId);
  if (res.status !== 'success') {
    const premium = /PREMIUM|REACTION_INVALID/.test(res.message || '');
    showToast(premium ? 'Эта реакция доступна только с Telegram Premium' : 'Не удалось поставить реакцию: ' + (res.message || 'ошибка'));
  }
}

export function tapReaction(postId, index) {
  const post = state.posts.find((p) => p.id === postId) || (state.threadPost && state.threadPost.id === postId ? state.threadPost : null);
  const r = post && post.reactions[index];
  if (!r) return;
  if (r.paid) {
    showToast('Платные реакции ⭐ отправляются из приложения Telegram');
    return;
  }
  sendReaction(post.channel_id, post.msg_id, r.emoji, post.id, r.custom_id || null);
}

export function quickReactionButtons(postId) {
  return state.EMOJI_PICKER_LIST.slice(0, 24).map((em) =>
    `<button onclick="window.TelegramX.pickReaction('${postId}', '${escapeQuotes(em)}')">${renderEmoji(em, 'emoji-large')}</button>`).join('');
}
