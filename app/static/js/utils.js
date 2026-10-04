/**
 * ====================================================================
 * UTILITY FUNCTIONS & FORMATTERS
 * ====================================================================
 */

import { parseEmojis, emojifyHtml, escapeHtml } from './emoji.js';

export { escapeHtml };

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

/**
 * Makes a raw string safe to embed as a single-quoted JS string inside an
 * HTML attribute, e.g. onclick="fn('${escapeQuotes(title)}')".
 */
export function escapeQuotes(str) {
  if (!str) return '';
  const js = String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n')
    .replace(/\u2028|\u2029/g, ' ');
  return escapeHtml(js);
}

function linkifyText(html, { urls }) {
  // Only touch text between tags, and never inside existing links.
  let inLink = 0;
  return html.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part)) inLink++;
      else if (/^<\/a>/i.test(part)) inLink = Math.max(0, inLink - 1);
      return part;
    }
    if (inLink) return part;
    let out = part;
    if (urls) {
      out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">$1</a>');
    }
    out = out.replace(/(^|[^\w&])#([\w\u0400-\u04FF]+)/g, '$1<span class="hashtag cursor-pointer hover:underline" onclick="event.stopPropagation(); window.TelegramX.filterByTag(\'$2\')">#$2</span>');
    out = out.replace(/(^|[^\w/])@([a-zA-Z0-9_]{4,32})/g, '$1<a href="https://t.me/$2" target="_blank" rel="noopener noreferrer" class="mention hover:underline" onclick="event.stopPropagation()">@$2</a>');
    return out;
  }).join('');
}

export function formatPostText(rawText, htmlText) {
  if (htmlText) {
    return emojifyHtml(linkifyText(htmlText, { urls: false }).replace(/\n/g, '<br/>'));
  }
  if (!rawText) return '';
  return emojifyHtml(linkifyText(escapeHtml(rawText), { urls: true }).replace(/\n/g, '<br/>'));
}
