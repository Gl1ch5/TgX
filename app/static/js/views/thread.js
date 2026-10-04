/**
 * ====================================================================
 * VIEW: DISCUSSION — comments under a channel post, Telegram style
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHtml, formatPostText, pluralRu, formatNumber } from '../utils.js';
import { parseEmojis, renderEmoji } from '../emoji.js';
import { go } from '../core/nav.js';
import { avatarHtml, peerColor } from '../components/avatar.js';
import { createPostCardElement, commentsLabel, buttonsHtml } from '../components/postCard.js';
import { stickerHtml, hydrateStickers } from '../components/sticker.js';
import { observeAutoplay } from '../components/autoplay.js';
import { reactionIcon } from '../components/reactions.js';
import { openPopup } from '../components/postMenu.js';

const $ = (id) => document.getElementById(id);
const GROUP_GAP = 5 * 60;

let thread = null; // { post, comments, total, hasMore, replyTo }

export function openThread(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  if (!state.isAuth) {
    window.TelegramX.openAuthModal();
    return;
  }
  go('thread', { post: postId });
}

export function enterThread(params) {
  const post = state.posts.find((p) => p.id === params.post) || (thread && thread.post);
  if (!post) {
    go('wall');
    return;
  }
  if (thread && thread.post.id === post.id && thread.comments) {
    render();
    return;
  }
  thread = { post, comments: null, total: post.replies_count || 0, hasMore: false, replyTo: null };
  state.threadPost = post;
  $('thread-input').value = '';
  setReply(null);
  render();
  load();
}

function subtitle() {
  return thread.total ? `${formatNumber(thread.total)} ${pluralRu(thread.total, 'комментарий', 'комментария', 'комментариев')}` : 'нет комментариев';
}

async function load(older = false) {
  const t = thread;
  try {
    const offsetId = older && t.comments && t.comments.length ? t.comments[0].id : 0;
    const res = await api.getComments(t.post.channel_id, t.post.msg_id, { offsetId, refresh: !older });
    if (thread !== t) return;
    t.comments = older ? [...res.comments, ...(t.comments || [])] : res.comments;
    t.total = res.total;
    t.hasMore = res.has_more;
    t.error = null;
  } catch (e) {
    if (thread !== t) return;
    t.comments = t.comments || [];
    t.error = (e && (e.errorMessage || e.message)) || String(e);
    console.error('[TeleX] comments', e);
  }
  render();
}

function dayLabel(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Вчера';
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}

function replyQuote(c) {
  if (!c.reply_to_id) return '';
  const target = thread.comments.find((x) => x.id === c.reply_to_id);
  if (!target) return '';
  const snippet = target.text || (target.media ? (target.media.type === 'sticker' ? 'Стикер' : 'Фото') : '');
  return `<span class="tx-reply tx-peer-${peerColor(target.sender_id)}" onclick="event.stopPropagation(); window.TelegramX.jumpToComment(${target.id})"><b>${parseEmojis(target.sender_name)}</b><span>${parseEmojis(snippet)}</span></span>`;
}

function commentHtml(c, first, last) {
  const time = new Date(c.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const sticker = c.media && c.media.type === 'sticker';
  const media = c.media
    ? sticker
      ? `<div class="tx-msg-media is-sticker">${stickerHtml(c.media.url, c.media.mime)}</div>`
      : `<div class="tx-msg-media"><img src="${escapeHtml(c.media.url)}" loading="lazy" ${c.media.width ? `style="aspect-ratio:${c.media.width}/${c.media.height}"` : ''} /></div>`
    : '';
  const reactions = (c.reactions || []).length
    ? `<div class="tx-reactions">${c.reactions.map((r) => `<span class="tx-reaction ${r.chosen ? 'is-chosen' : ''}">${reactionIcon(r)}<span>${formatNumber(r.count)}</span></span>`).join('')}</div>`
    : '';
  const peer = { id: c.sender_id, name: c.sender_name, avatar: c.sender_avatar };
  return `
    <div class="tx-msg ${c.is_out ? 'is-out' : ''} ${first ? 'is-first' : ''} ${last ? 'is-last' : ''}" id="comment-${c.id}">
      <span class="tx-avatar-slot">${last && !c.is_out ? avatarHtml(peer, 'sm') : ''}</span>
      <div class="tx-msg-stack">
      <div class="tx-bubble ${c.is_out ? 'is-out' : ''} ${sticker ? 'is-sticker' : ''}" onclick="window.TelegramX.openCommentMenu(${c.id}, event)">
        ${first && !c.is_out && !sticker ? `<div class="tx-msg-name tx-peer-${peerColor(c.sender_id)} tx-peer-name">${parseEmojis(c.sender_name)}</div>` : ''}
        ${replyQuote(c)}
        ${media}
        ${c.text || !sticker ? `<div class="tx-msg-body post-text">${formatPostText(c.text, c.text_html)}<span class="tx-msg-time">${time}</span></div>` : `<div class="tx-meta"><span class="tx-msg-time">${time}</span></div>`}
        ${reactions}
      </div>
      ${buttonsHtml(c.buttons)}
      </div>
    </div>`;
}

function render() {
  if (!thread) return;
  $('thread-title').textContent = 'Комментарии';
  $('thread-sub').textContent = subtitle();
  const list = $('thread-list');

  const root = createPostCardElement(thread.post);
  root.classList.add('tx-thread-root');
  root.querySelector('.tx-comments-row')?.remove();

  let html = '';
  if (thread.comments === null) {
    html = '<div class="tx-sentinel"><span class="animate-spin"><i class="icon icon-reload"></i></span></div>';
  } else if (thread.error) {
    html = `<span class="tx-service" style="display:table;margin:10px auto">Не удалось загрузить комментарии: ${escapeHtml(thread.error)}</span>`;
  } else {
    html += `<span class="tx-service" style="display:table;margin:8px auto">${thread.comments.length ? 'Начало обсуждения' : 'Комментариев пока нет — напишите первым'}</span>`;
    if (thread.hasMore) html += `<button class="tx-service" style="display:table;margin:4px auto" onclick="window.TelegramX.loadOlderComments()">Показать предыдущие комментарии</button>`;
    let lastDay = '';
    thread.comments.forEach((c, i) => {
      const prev = thread.comments[i - 1];
      const next = thread.comments[i + 1];
      const day = dayLabel(c.timestamp);
      if (day !== lastDay) {
        html += `<span class="tx-service" style="display:table;margin:10px auto 4px">${day}</span>`;
        lastDay = day;
      }
      const same = (a, b) => a && b && a.sender_id === b.sender_id && Math.abs(a.timestamp - b.timestamp) < GROUP_GAP && dayLabel(a.timestamp) === dayLabel(b.timestamp);
      html += commentHtml(c, !same(prev, c), !same(c, next));
    });
  }

  list.innerHTML = '';
  list.appendChild(root);
  list.insertAdjacentHTML('beforeend', html);
  hydrateStickers(list);
  observeAutoplay(list);
}

export function loadOlderComments() {
  if (thread) load(true);
}

export function jumpToComment(id) {
  const el = $(`comment-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const b = el.querySelector('.tx-bubble');
  b.classList.remove('is-highlight');
  void b.offsetWidth;
  b.classList.add('is-highlight');
}

function setReply(comment) {
  if (!thread) return;
  thread.replyTo = comment;
  const bar = $('thread-reply-bar');
  if (!comment) {
    bar.classList.add('tx-hidden');
    bar.innerHTML = '';
    return;
  }
  bar.innerHTML = `
    <i class="icon icon-reply"></i>
    <span class="tx-reply tx-peer-${peerColor(comment.sender_id)}"><b>${parseEmojis(comment.sender_name)}</b><span>${parseEmojis(comment.text || 'Медиа')}</span></span>
    <button class="tx-icon-btn" onclick="window.TelegramX.cancelReply()"><i class="icon icon-close" style="font-size:20px"></i></button>`;
  bar.classList.remove('tx-hidden');
  $('thread-input').focus();
}

export function cancelReply() {
  setReply(null);
}

export function openCommentMenu(id, event) {
  if (event && event.target.closest('a, .tx-reply')) return;
  const c = thread && thread.comments.find((x) => x.id === id);
  if (!c) return;
  const items = [{ icon: 'reply', label: 'Ответить', run: () => setReply(c) }];
  if (c.text) items.push({ icon: 'copy', label: 'Копировать текст', run: () => navigator.clipboard.writeText(c.text).then(() => showToast('Текст скопирован')) });
  openPopup(event.currentTarget, { items });
}

export function toggleThreadEmoji() {
  const pop = $('thread-emoji');
  if (!pop.innerHTML) {
    pop.innerHTML = state.EMOJI_PICKER_LIST.map((e) => `<button data-e="${escapeHtml(e)}">${renderEmoji(e, 'emoji-large')}</button>`).join('');
    pop.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-e]');
      if (!b) return;
      const input = $('thread-input');
      input.value += b.dataset.e;
      autosizeComposer(input);
      input.focus();
    });
  }
  pop.classList.toggle('tx-hidden');
}

export function autosizeComposer(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(140, el.scrollHeight)}px`;
}

export async function sendThreadComment() {
  if (!thread) return;
  const input = $('thread-input');
  const text = input.value.trim();
  if (!text) return;
  const t = thread;
  const replyTo = t.replyTo;
  input.value = '';
  autosizeComposer(input);
  setReply(null);
  $('thread-emoji').classList.add('tx-hidden');

  const res = await api.sendComment(t.post.channel_id, t.post.msg_id, text, replyTo ? replyTo.id : null);
  if (res.status !== 'success') {
    input.value = text;
    showToast('Не удалось отправить: ' + (res.message || 'ошибка'));
    return;
  }
  if (thread !== t) return;
  if (!t.comments.some((c) => c.id === res.comment.id)) t.comments.push(res.comment);
  t.total += 1;
  t.post.replies_count = (t.post.replies_count || 0) + 1;
  const label = $(`comments-label-${t.post.id}`);
  if (label) label.textContent = commentsLabel(t.post.replies_count);
  render();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
