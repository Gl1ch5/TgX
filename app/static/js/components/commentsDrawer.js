/**
 * ====================================================================
 * COMPONENT: INLINE COMMENTS (discussion bubbles under a post)
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHtml, formatPostText } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { avatarHtml, peerColor } from './avatar.js';
import { commentsLabel } from './postCard.js';

export async function toggleInlineComments(channelId, msgId, postId, event) {
  if (event) event.stopPropagation();

  const drawer = document.getElementById(`inline-comments-${postId}`);
  const arrow = document.getElementById(`comments-arrow-${postId}`);
  const list = document.getElementById(`comments-list-${postId}`);
  if (!drawer) return;

  if (drawer.classList.contains('open')) {
    drawer.classList.remove('open');
    if (arrow) arrow.style.transform = '';
    state.openCommentsMap[postId] = false;
    return;
  }

  drawer.classList.add('open');
  if (arrow) arrow.style.transform = 'rotate(90deg)';
  state.openCommentsMap[postId] = true;

  if (state.cachedComments[postId]) {
    renderCommentsList(list, null, state.cachedComments[postId]);
  } else {
    list.innerHTML = `<div class="tx-sentinel"><span class="animate-spin"><i class="icon icon-reload"></i></span>Загрузка комментариев…</div>`;
  }

  try {
    const data = await api.getComments(channelId, msgId);
    state.cachedComments[postId] = data.comments || [];
    renderCommentsList(list, null, state.cachedComments[postId]);
  } catch (e) {
    if (!state.cachedComments[postId]) {
      list.innerHTML = `<div class="tx-sentinel">Комментарии недоступны</div>`;
    }
  }
}

function commentTime(c) {
  if (!c.date) return '';
  return new Date(c.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function renderCommentsList(listEl, _badgeEl, comments) {
  if (!listEl) return;
  if (!comments.length) {
    listEl.innerHTML = `<div class="tx-sentinel">Комментариев пока нет. Будьте первым!</div>`;
    return;
  }
  listEl.innerHTML = comments.map((c) => {
    const peer = { id: c.sender_id || c.sender_name, name: c.sender_name, avatar: c.sender_avatar };
    return `
      <div class="tx-comment comment-item">
        ${avatarHtml(peer, 'xs')}
        <div class="tx-comment-bubble">
          <div class="tx-comment-name tx-peer-${peerColor(peer.id)}">${parseEmojis(c.sender_name || 'Пользователь')}</div>
          <div class="tx-comment-text post-text">${formatPostText(c.text, c.text_html)}</div>
          <div class="tx-comment-time">${escapeHtml(commentTime(c))}</div>
        </div>
      </div>`;
  }).join('');
  listEl.scrollTop = listEl.scrollHeight;
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
  const label = document.getElementById(`comments-label-${postId}`);
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;
  if (!state.isAuth) {
    window.TelegramX.openAuthModal();
    return;
  }

  input.value = '';
  input.disabled = true;
  if (btn) btn.classList.add('opacity-50', 'pointer-events-none');

  const me = state.user || {};
  const optimistic = {
    id: Date.now(),
    text,
    text_html: escapeHtml(text),
    date: new Date().toISOString(),
    sender_id: me.id,
    sender_name: me.name || 'Вы',
    sender_avatar: me.avatar || '',
  };
  const comments = state.cachedComments[postId] || (state.cachedComments[postId] = []);
  comments.push(optimistic);
  renderCommentsList(list, null, comments);

  try {
    const res = await api.sendComment(channelId, msgId, text);
    if (res.status === 'success') {
      const post = state.posts.find((p) => p.id === postId);
      if (post) post.replies_count = (post.replies_count || 0) + 1;
      if (label && post) label.textContent = commentsLabel(post.replies_count);
    } else {
      comments.splice(comments.indexOf(optimistic), 1);
      renderCommentsList(list, null, comments);
      input.value = text;
      showToast('Не удалось отправить: ' + (res.message || 'ошибка'));
    }
  } finally {
    input.disabled = false;
    if (btn) btn.classList.remove('opacity-50', 'pointer-events-none');
    input.focus();
  }
}
