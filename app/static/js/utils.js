/**
 * ====================================================================
 * UTILITY FUNCTIONS & FORMATTERS
 * ====================================================================
 */

import { parseEmojis } from './emoji.js';

export function showToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (msgEl) msgEl.innerHTML = parseEmojis(msg);
  if (toast) {
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
      toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
  }
}

export function formatTgTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'только что';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`;
  
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `вчера в ${timeStr}`;
  }

  return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} в ${timeStr}`;
}

export function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' МБ';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return bytes + ' Б';
}

export function formatDuration(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

export function formatPostText(rawText, htmlText) {
  if (htmlText) {
    let html = htmlText.replace(/#([\w\u0400-\u04FF_]+)/g, '<span class="hashtag cursor-pointer hover:underline" onclick="event.stopPropagation(); window.TelegramX.filterByTag(\'$1\')">#$1</span>');
    html = html.replace(/@([a-zA-Z0-9_]{4,32})/g, '<a href="https://t.me/$1" target="_blank" rel="noopener noreferrer" class="mention hover:underline" onclick="event.stopPropagation()">@$1</a>');
    html = html.replace(/\n/g, '<br/>');
    return parseEmojis(html);
  }
  if (!rawText) return '';
  let html = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">$1</a>');
  html = html.replace(/#([\w\u0400-\u04FF_]+)/g, '<span class="hashtag cursor-pointer hover:underline" onclick="event.stopPropagation(); window.TelegramX.filterByTag(\'$1\')">#$1</span>');
  html = html.replace(/@([a-zA-Z0-9_]{4,32})/g, '<a href="https://t.me/$1" target="_blank" rel="noopener noreferrer" class="mention hover:underline" onclick="event.stopPropagation()">@$1</a>');
  html = html.replace(/\n/g, '<br/>');
  return parseEmojis(html);
}
