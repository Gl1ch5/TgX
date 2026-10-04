/**
 * ====================================================================
 * COMPONENT: POST BUBBLE (Telegram channel message look)
 * ====================================================================
 */

import { state, EMOJI_PICKER_LIST } from '../state.js';
import { formatNumber, formatFileSize, formatDuration, formatPostText, formatPostTime, escapeQuotes, escapeHtml, pluralRu } from '../utils.js';
import { renderEmoji, parseEmojis } from '../emoji.js';
import { avatarHtml } from './avatar.js';

export const VERIFIED_BADGE_SVG = `<svg class="VerifiedIcon" viewBox="0 0 24 24" aria-label="Подтверждённый"><path d="M12 1.6l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.4l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="#5a83f3"/><path d="M10.4 15.6l-3.2-3.2 1.3-1.3 1.9 1.9 5.2-5.2 1.3 1.3-6.5 6.5z" fill="#fff"/></svg>`;

const VISUAL = new Set(['photo', 'video', 'gif']);

function photoTile(post, item, idx, extra = '') {
  return `<img src="${escapeHtml(item.url)}" loading="lazy" decoding="async" class="${extra}" style="cursor:zoom-in" onclick="window.TelegramX.openLightboxIndex('${post.id}', ${idx})" />`;
}

function videoTile(item, cls = '') {
  return `
    <button type="button" class="block w-full h-full relative group ${cls}" onclick="event.stopPropagation(); window.TelegramX.playInlineVideo(this, '${escapeHtml(item.url)}')" title="Смотреть видео">
      ${item.thumb_url ? `<img src="${escapeHtml(item.thumb_url)}" loading="lazy" decoding="async" class="w-full h-full object-cover" />` : `<span class="block w-full h-full bg-black" style="aspect-ratio:16/9"></span>`}
      <span class="absolute inset-0 flex items-center justify-center">
        <span class="w-14 h-14 rounded-full bg-black/55 backdrop-blur flex items-center justify-center group-hover:scale-110 transition"><i class="icon icon-play text-2xl text-white"></i></span>
      </span>
      ${item.duration ? `<span class="absolute left-2 top-2 text-[12px] font-medium text-white bg-black/55 rounded-full px-2 py-0.5">${formatDuration(item.duration)}</span>` : ''}
    </button>`;
}

function tile(post, item, idx, cls) {
  return item.type === 'photo' ? photoTile(post, item, idx, `w-full h-full object-cover ${cls}`) : videoTile(item, cls);
}

export function buildMediaHtml(post) {
  const items = post.media_items || [];
  if (!items.length) return '';

  // Albums
  if (items.length > 1 && items.every((i) => VISUAL.has(i.type))) {
    const n = items.length;
    const shown = items.slice(0, 4);
    const more = n - shown.length;
    const cols = n === 2 ? 'grid-template-columns:1fr 1fr' : n === 3 ? 'grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr' : 'grid-template-columns:1fr 1fr';
    const h = n === 2 ? 'height:260px' : n === 3 ? 'height:320px' : 'height:380px';
    return `
      <div class="tx-post-media" onclick="event.stopPropagation()">
        <div class="tx-grid" style="${cols};${h}">
          ${shown.map((it, idx) => `
            <div class="relative overflow-hidden bg-black" style="${n === 3 && idx === 0 ? 'grid-row:span 2' : ''}">
              ${tile(post, it, idx, '')}
              ${idx === 3 && more > 0 ? `<span class="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-2xl font-semibold pointer-events-none">+${more}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }

  const item = items[0];

  if (item.type === 'photo') {
    return `<div class="tx-post-media" onclick="event.stopPropagation()">${photoTile(post, item, 0)}</div>`;
  }

  if (item.type === 'video') {
    return `<div class="tx-post-media" onclick="event.stopPropagation()">${videoTile(item)}</div>`;
  }

  if (item.type === 'gif') {
    return `
      <div class="tx-post-media" onclick="event.stopPropagation()">
        <video src="${escapeHtml(item.url)}" autoplay loop muted playsinline></video>
        <span class="absolute left-2 bottom-2 text-[11px] font-bold text-white bg-black/55 rounded-md px-1.5 py-0.5">GIF</span>
      </div>`;
  }

  if (item.type === 'audio') {
    const title = item.title || item.performer || (item.is_voice ? 'Голосовое сообщение' : 'Аудиозапись');
    return `
      <div class="tx-file" onclick="event.stopPropagation()">
        <span class="tx-file-icon"><i class="icon ${item.is_voice ? 'icon-microphone' : 'icon-play'}"></i></span>
        <div class="min-w-0 flex-1">
          <div class="tx-file-name">${escapeHtml(title)}</div>
          <audio src="${escapeHtml(item.url)}" controls preload="none" class="w-full h-8 mt-1"></audio>
        </div>
      </div>`;
  }

  if (item.type === 'document') {
    return `
      <a href="${escapeHtml(item.url)}" download="${escapeHtml(item.filename || 'file')}" class="tx-file" onclick="event.stopPropagation()">
        <span class="tx-file-icon"><i class="icon icon-download"></i></span>
        <div class="min-w-0 flex-1">
          <div class="tx-file-name">${escapeHtml(item.filename || 'Документ')}</div>
          <div class="tx-file-sub">${formatFileSize(item.size)}${item.mime ? ' · ' + escapeHtml(item.mime) : ''}</div>
        </div>
      </a>`;
  }

  return '';
}

function webpageHtml(post) {
  const wp = post.webpage;
  if (!wp || !wp.url) return '';
  return `
    <a href="${escapeHtml(wp.url)}" target="_blank" rel="noopener noreferrer" class="tx-webpage" onclick="event.stopPropagation()">
      <div class="tx-webpage-site">${parseEmojis(wp.site_name || wp.display_url)}</div>
      ${wp.title ? `<div class="tx-webpage-title">${parseEmojis(wp.title)}</div>` : ''}
      ${wp.description ? `<div class="tx-webpage-desc">${parseEmojis(wp.description)}</div>` : ''}
      ${wp.photo_url ? `<img src="${escapeHtml(wp.photo_url)}" loading="lazy" decoding="async" />` : ''}
    </a>`;
}

export function reactionsHtml(post) {
  const add = `<button class="tx-reaction tx-reaction-add" onclick="window.TelegramX.toggleReactionPicker('${post.id}', event)" title="Добавить реакцию"><i class="icon icon-smile" style="font-size:18px"></i></button>`;
  return (post.reactions || []).map((r) => `
    <button class="tx-reaction ${r.chosen ? 'is-chosen' : ''}" onclick="window.TelegramX.sendReaction(${post.channel_id}, ${post.msg_id}, '${escapeQuotes(r.emoji)}', '${post.id}')">
      ${renderEmoji(r.emoji, 'emoji-small')}<span>${formatNumber(r.count)}</span>
    </button>`).join('') + add;
}

export function commentsLabel(count) {
  return count ? `${formatNumber(count)} ${pluralRu(count, 'комментарий', 'комментария', 'комментариев')}` : 'Прокомментировать';
}

export function createPostCardElement(post) {
  const card = document.createElement('article');
  card.id = `post-card-${post.id}`;
  card.className = 'tx-post';
  const ch = post.channel || {};

  const media = buildMediaHtml(post);
  const body = formatPostText(post.text, post.text_html);
  const isVisualOnly = media && !body && (post.media_items || []).every((i) => VISUAL.has(i.type));

  card.innerHTML = `
    <div class="tx-bubble">
      <div class="tx-post-head">
        <span onclick="window.TelegramX.filterByChannel(${post.channel_id}, '${escapeQuotes(ch.title)}')" style="cursor:pointer">${avatarHtml(ch, 'sm')}</span>
        <div class="tx-post-who" onclick="window.TelegramX.filterByChannel(${post.channel_id}, '${escapeQuotes(ch.title)}')">
          <div class="tx-post-name"><span>${parseEmojis(ch.title || 'Канал')}</span>${ch.verified ? VERIFIED_BADGE_SVG : ''}</div>
          <div class="tx-post-sub">${ch.username ? '@' + escapeHtml(ch.username) : 'Канал'}</div>
        </div>
        <button class="tx-icon-btn tx-post-more" onclick="window.TelegramX.openPostMenu('${post.id}', event)" title="Ещё">
          <i class="icon icon-more"></i>
        </button>
      </div>

      ${media}
      ${body ? `<div class="post-text tx-post-text select-text">${body}</div>` : ''}
      ${webpageHtml(post)}

      <div class="tx-post-foot" onclick="event.stopPropagation()">
        <div class="flex flex-wrap items-center gap-1.5" id="reactions-wrap-${post.id}">${reactionsHtml(post)}</div>
        <span class="tx-post-meta ${isVisualOnly ? '' : ''}">
          ${post.is_favorite ? '<i class="icon icon-star" style="color:#f5b72f" id="fav-mark-' + post.id + '"></i>' : `<i class="icon icon-star tx-hidden" style="color:#f5b72f" id="fav-mark-${post.id}"></i>`}
          ${post.views != null ? `<i class="icon icon-channelviews"></i>${formatNumber(post.views)} ·` : ''}
          <span title="${escapeHtml(post.date)}">${formatPostTime(post.date)}</span>
        </span>
      </div>

      <div id="picker-${post.id}" class="tx-picker hidden reaction-popover" onclick="event.stopPropagation()">
        ${EMOJI_PICKER_LIST.map((em) => `
          <button onclick="window.TelegramX.sendReaction(${post.channel_id}, ${post.msg_id}, '${escapeQuotes(em)}', '${post.id}'); window.TelegramX.hideReactionPicker('${post.id}')" title="${escapeHtml(em)}">
            ${renderEmoji(em, 'emoji-large')}
          </button>`).join('')}
      </div>

      <button class="tx-comments-row" onclick="window.TelegramX.toggleInlineComments(${post.channel_id}, ${post.msg_id}, '${post.id}', event)">
        <i class="icon icon-comments"></i>
        <span id="comments-label-${post.id}">${commentsLabel(post.replies_count)}</span>
        <i class="icon icon-next tx-chevron" id="comments-arrow-${post.id}" style="transition:transform .2s"></i>
      </button>

      <div id="inline-comments-${post.id}" class="comments-accordion tx-comments" onclick="event.stopPropagation()">
        <div id="comments-list-${post.id}" class="max-h-[420px] overflow-y-auto tx-scroll"></div>
        <span id="comments-badge-${post.id}" class="tx-hidden"></span>
        <div class="tx-composer">
          <div class="tx-composer-input">
            <input type="text" id="comment-input-${post.id}" placeholder="Комментарий" autocomplete="off"
              onkeydown="if(event.key==='Enter') window.TelegramX.submitPostComment(${post.channel_id}, ${post.msg_id}, '${post.id}')" />
          </div>
          <button class="tx-send" id="btn-send-comment-${post.id}" onclick="window.TelegramX.submitPostComment(${post.channel_id}, ${post.msg_id}, '${post.id}')" title="Отправить">
            <i class="icon icon-send"></i>
          </button>
        </div>
      </div>
    </div>

    <button class="tx-side-btn" onclick="window.TelegramX.sharePost('${post.id}')" title="Поделиться">
      <i class="icon icon-share-filled"></i>
    </button>
  `;

  return card;
}

export function playInlineVideo(button, url) {
  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.className = 'w-full h-full bg-black';
  video.style.maxHeight = '560px';
  button.replaceWith(video);
}

// ---------------- Post context menu ----------------

function closeMenu() {
  document.querySelectorAll('.tx-menu').forEach((m) => m.remove());
}

document.addEventListener('click', closeMenu);
window.addEventListener('resize', closeMenu);
document.addEventListener('scroll', closeMenu, true);

export function openPostMenu(postId, event) {
  if (event) event.stopPropagation();
  closeMenu();
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;

  const menu = document.createElement('div');
  menu.className = 'tx-menu';
  menu.innerHTML = `
    <button data-act="open"><i class="icon icon-open-in-new-tab"></i>Открыть в Telegram</button>
    <button data-act="copy"><i class="icon icon-link"></i>Копировать ссылку</button>
    <button data-act="fav"><i class="icon icon-star"></i>${post.is_favorite ? 'Убрать из избранного' : 'В избранное'}</button>
    <button data-act="saved"><i class="icon icon-saved-messages"></i>В «Избранное» Telegram</button>
    <button data-act="react"><i class="icon icon-smile"></i>Реакция</button>
  `;
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const act = e.target.closest('button')?.dataset.act;
    closeMenu();
    const tx = window.TelegramX;
    if (act === 'open') window.open(post.tg_url, '_blank', 'noopener');
    if (act === 'copy') tx.copyPostLink(post.tg_url);
    if (act === 'fav') tx.togglePostFavorite(post.id);
    if (act === 'saved') tx.forwardToSaved(post.channel_id, post.msg_id);
    if (act === 'react') tx.toggleReactionPicker(post.id);
  });
  document.body.appendChild(menu);

  const rect = (event && event.currentTarget ? event.currentTarget : document.body).getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8));
  const top = rect.bottom + h + 8 > window.innerHeight ? Math.max(8, rect.top - h - 4) : rect.bottom + 4;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
