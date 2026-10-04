/**
 * ====================================================================
 * COMPONENT: CHANNEL LIST (Telegram chat-list style) + header stack
 * ====================================================================
 */

import { state } from '../state.js';
import { escapeQuotes, formatChatTime } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { avatarHtml } from './avatar.js';
import { VERIFIED_BADGE_SVG } from './postCard.js';

let filterQuery = '';

export function filterChannelsList(query) {
  filterQuery = (query || '').toLowerCase().trim();
  renderChannelsList();
}

function unreadBadge(ch) {
  if (!ch.unread_count) return '';
  const n = ch.unread_count > 99999 ? '99K+' : ch.unread_count;
  return `<span class="tx-badge ${ch.muted ? 'is-muted' : ''}">${n}</span>`;
}

function channelRow(ch) {
  const active = state.activeChannelId === ch.id;
  const time = ch.last_date ? formatChatTime(ch.last_date) : '';
  return `
    <div class="tx-chat ${active ? 'is-active' : ''}" onclick="window.TelegramX.filterByChannel(${ch.id}, '${escapeQuotes(ch.title)}')">
      ${avatarHtml(ch)}
      <div class="tx-chat-body">
        <div class="tx-chat-row">
          <span class="tx-chat-title"><span>${parseEmojis(ch.title)}</span>${ch.verified ? VERIFIED_BADGE_SVG : ''}${ch.muted ? '<i class="icon icon-muted"></i>' : ''}</span>
          <span class="tx-chat-time ${ch.pinned ? 'is-pinned' : ''}">${ch.pinned ? '<i class="icon icon-pin" style="font-size:13px"></i>' : ''}${time}</span>
        </div>
        <div class="tx-chat-row">
          <span class="tx-chat-preview">${parseEmojis(ch.last_text || (ch.username ? '@' + ch.username : 'Канал'))}</span>
          ${unreadBadge(ch)}
        </div>
      </div>
    </div>`;
}

export function renderChannelsList() {
  const list = document.getElementById('channels-list');
  if (list) {
    const channels = state.channels.filter((c) =>
      !filterQuery ||
      (c.title || '').toLowerCase().includes(filterQuery) ||
      (c.username || '').toLowerCase().includes(filterQuery));

    const allRow = filterQuery ? '' : `
      <div class="tx-chat tx-all-chat ${!state.activeChannelId ? 'is-active' : ''}" onclick="window.TelegramX.clearChannelFilter()">
        <span class="tx-avatar"><i class="icon icon-folder-tabs-chats"></i></span>
        <div class="tx-chat-body">
          <div class="tx-chat-row"><span class="tx-chat-title"><span>Стена каналов</span></span></div>
          <div class="tx-chat-row"><span class="tx-chat-preview">Все публикации ваших каналов</span></div>
        </div>
      </div>`;

    if (!state.isAuth) {
      list.innerHTML = `
        <div class="tx-empty">
          <p>Войдите в Telegram, чтобы увидеть свои каналы</p>
          <button class="tx-btn" onclick="window.TelegramX.openAuthModal()">Войти</button>
        </div>`;
    } else if (!channels.length) {
      list.innerHTML = allRow + `<div class="tx-sentinel">${filterQuery ? 'Ничего не найдено' : 'Загрузка каналов…'}</div>`;
    } else {
      list.innerHTML = allRow + channels.map(channelRow).join('');
    }
  }

  renderHeaderStack();
  renderUnreadBadges();
}

function renderHeaderStack() {
  const stack = document.getElementById('header-stack');
  if (!stack) return;
  const withAvatars = state.channels.filter((c) => c.is_broadcast).slice(0, 3);
  stack.innerHTML = withAvatars.map((c) => avatarHtml(c)).join('');
  stack.classList.toggle('tx-hidden', !withAvatars.length || !!state.activeChannelId);
}

function renderUnreadBadges() {
  const total = state.channels.filter((c) => c.is_broadcast && !c.muted).reduce((n, c) => n + (c.unread_count || 0), 0);
  const label = total > 999 ? '999+' : String(total);
  ['dock-unread-badge', 'tab-unread-badge'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = label;
    el.classList.toggle('tx-hidden', !total);
  });
  const count = document.getElementById('settings-channels-count');
  if (count && state.channels.length) count.textContent = `${state.channels.length} подписок`;
}
