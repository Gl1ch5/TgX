/**
 * ====================================================================
 * COMPONENT: INLINE COMMENTS ACCORDION DRAWER & COMMENT FORM
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, formatTgTime, formatNumber, escapeQuotes, formatPostText } from '../utils.js';
import { parseEmojis } from '../emoji.js';

export async function toggleInlineComments(channelId, msgId, postId, event) {
  if (event) event.stopPropagation();

  const drawer = document.getElementById(`inline-comments-${postId}`);
  const arrow = document.getElementById(`comments-arrow-${postId}`);
  const list = document.getElementById(`comments-list-${postId}`);
  const badge = document.getElementById(`comments-badge-${postId}`);
  if (!drawer) return;

  const isOpen = drawer.classList.contains('open');

  if (isOpen) {
    drawer.classList.remove('open');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
    state.openCommentsMap[postId] = false;
    return;
  }

  drawer.classList.add('open');
  if (arrow) arrow.style.transform = 'rotate(180deg)';
  state.openCommentsMap[postId] = true;

  // 1. 0ms instant display from local cache
  if (state.cachedComments[postId]) {
    renderCommentsList(list, badge, state.cachedComments[postId]);
  } else {
    list.innerHTML = `
      <div class="py-6 text-center flex flex-col items-center justify-center gap-2">
        <span class="inline-block animate-spin text-[#3390ec] text-lg"><i class="icon icon-reload-arrows"></i></span>
        <span class="text-xs text-[#8a8a90]">Загрузка комментариев...</span>
      </div>
    `;
  }

  // 2. Fetch fresh comments from server
  try {
    const data = await api.getComments(channelId, msgId);
    const comments = data.comments || [];
    state.cachedComments[postId] = comments;
    renderCommentsList(list, badge, comments);
  } catch (e) {
    if (!state.cachedComments[postId]) {
      list.innerHTML = `<div class="py-4 text-center text-red-400 text-xs">Не удалось загрузить комментарии: ${e}</div>`;
    }
  }
}

export function renderCommentsList(listEl, badgeEl, comments) {
  if (badgeEl) badgeEl.innerText = `${comments.length}`;

  if (comments.length === 0) {
    listEl.innerHTML = `
      <div class="py-5 text-center text-[#8a8a90] text-xs">
        Комментариев пока нет. Будьте первым, кто напишет!
      </div>
    `;
  } else {
    listEl.innerHTML = '';
    comments.forEach(c => {
      const row = document.createElement('div');
      row.className = 'py-2.5 px-3 bg-[#18181f] rounded-xl border border-white/5 flex gap-2.5 comment-item shadow-sm';
      row.innerHTML = `
        <div class="w-7 h-7 rounded-full overflow-hidden bg-[#3390ec]/20 flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5 border border-white/10">
          ${c.sender_avatar ? `<img src="${c.sender_avatar}" class="w-full h-full object-cover" />` : (c.sender_name || 'U').charAt(0)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-white truncate max-w-[200px]">${parseEmojis(c.sender_name)}</span>
            <span class="text-[10px] text-[#8a8a90] font-mono shrink-0">${c.date ? formatTgTime(c.date) : ''}</span>
          </div>
          <div class="text-xs text-slate-200 mt-1 post-text leading-relaxed">${formatPostText(c.text, c.text_html)}</div>
        </div>
      `;
      listEl.appendChild(row);
    });
  }
}

export function insertCommentEmoji(postId, emoji) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (input) {
    input.value += emoji;
    input.focus();
  }
}

export async function submitPostComment(channelId, msgId, postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  const btn = document.getElementById(`btn-send-comment-${postId}`);
  const list = document.getElementById(`comments-list-${postId}`);
  const badge = document.getElementById(`comments-badge-${postId}`);
  const label = document.getElementById(`comments-label-${postId}`);

  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.disabled = true;
  if (btn) btn.classList.add('opacity-50', 'pointer-events-none');

  // Optimistic UI addition
  const me = state.user || {};
  const optimisticComment = {
    id: Date.now(),
    text: text,
    text_html: escapeQuotes(text),
    date: new Date().toISOString(),
    timestamp: Math.floor(Date.now() / 1000),
    sender_name: me.first_name ? `${me.first_name} ${me.last_name || ''}`.trim() : 'Вы',
    sender_username: me.username || '',
    sender_avatar: me.avatar || '',
  };

  if (!state.cachedComments[postId]) state.cachedComments[postId] = [];
  state.cachedComments[postId].push(optimisticComment);
  renderCommentsList(list, badge, state.cachedComments[postId]);

  if (label) {
    label.innerText = `${state.cachedComments[postId].length} коммент.`;
  }

  showToast('Комментарий отправлен в Telegram!');

  try {
    const res = await api.sendComment(channelId, msgId, text);
    if (!res.ok) {
      showToast('Ошибка отправки комментария: ' + (res.error || ''));
    }
  } catch (e) {
    showToast('Ошибка сети при отправке: ' + e);
  } finally {
    input.disabled = false;
    if (btn) btn.classList.remove('opacity-50', 'pointer-events-none');
    input.focus();
  }
}
