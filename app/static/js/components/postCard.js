/**
 * ====================================================================
 * COMPONENT: WALL POST — Telegram group-chat message layout
 * avatar · bubble (name, media, text, reactions, meta, comments) · share
 * ====================================================================
 */

import { formatNumber, formatFileSize, formatDuration, formatPostText, escapeQuotes, escapeHtml, pluralRu } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { getPrefs } from '../core/prefs.js';
import { avatarHtml, peerColor } from './avatar.js';
import { reactionsHtml } from './reactions.js';
import { stickerHtml } from './sticker.js';
import { audioHtml } from './audioPlayer.js';

export const VERIFIED_BADGE_SVG = `<svg class="VerifiedIcon" viewBox="0 0 24 24" aria-label="Подтверждённый"><path d="M12 1.6l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.4l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" fill="var(--tx-accent-fill)"/><path d="M10.4 15.6l-3.2-3.2 1.3-1.3 1.9 1.9 5.2-5.2 1.3 1.3-6.5 6.5z" fill="#fff"/></svg>`;

const VISUAL = new Set(['photo', 'video', 'gif']);

export function galleryOf(post) {
  return (post.media_items || []).filter((i) => VISUAL.has(i.type));
}

function timeOf(post) {
  return new Date(post.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function aspect(item) {
  return item.width && item.height ? `aspect-ratio:${item.width}/${item.height};` : 'aspect-ratio:4/3;';
}

function openAttr(post, idx) {
  return `onclick="event.stopPropagation(); window.TelegramX.openViewer('${post.id}', ${idx})"`;
}

function photoTile(post, item, idx, fill = false) {
  const style = fill ? 'width:100%;height:100%' : aspect(item);
  if (!getPrefs().autoloadPhotos) {
    return `<span class="tx-media-tap" style="${style};background:#1a1a1c" data-src="${escapeHtml(item.url)}" data-post="${post.id}" data-idx="${idx}" onclick="event.stopPropagation(); window.TelegramX.loadPhoto(this)">
      <span class="tx-media-load"><span class="tx-play"><i class="icon icon-download"></i></span></span></span>`;
  }
  return `<img src="${escapeHtml(item.url)}" loading="lazy" decoding="async" style="${style}" ${openAttr(post, idx)} />`;
}

function videoTile(post, item, idx, fill = false) {
  const style = fill ? 'width:100%;height:100%' : aspect(item);
  return `
    <span class="tx-media-tap" style="${style}" ${openAttr(post, idx)}>
      ${item.thumb_url ? `<img src="${escapeHtml(item.thumb_url)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover" />` : '<span style="display:block;width:100%;height:100%;background:#000"></span>'}
      <span class="tx-media-pill">${formatDuration(item.duration)} <i class="icon icon-speaker-muted-story"></i></span>
      <span class="tx-play"><i class="icon icon-play"></i></span>
    </span>`;
}

function gifTile(post, item, idx, fill = false) {
  const style = fill ? 'width:100%;height:100%' : aspect(item);
  const auto = getPrefs().autoplayGifs;
  return `
    <span class="tx-media-tap" style="${style}" ${openAttr(post, idx)}>
      <video src="${escapeHtml(item.url)}" ${auto ? 'autoplay' : ''} loop muted playsinline preload="${auto ? 'auto' : 'none'}" ${item.thumb_url ? `poster="${escapeHtml(item.thumb_url)}"` : ''} style="width:100%;height:100%;object-fit:cover"></video>
      <span class="tx-media-pill">GIF</span>
    </span>`;
}

function tile(post, item, idx, fill) {
  if (item.type === 'photo') return photoTile(post, item, idx, fill);
  if (item.type === 'gif') return gifTile(post, item, idx, fill);
  return videoTile(post, item, idx, fill);
}

function albumHtml(post, items) {
  const n = items.length;
  const shown = items.slice(0, 6);
  const more = n - shown.length;
  const layouts = {
    2: 'grid-template-columns:1fr 1fr;height:240px',
    3: 'grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;height:300px',
    4: 'grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;height:340px',
    5: 'grid-template-columns:repeat(6,1fr);grid-template-rows:1fr 1fr;height:320px',
    6: 'grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;height:300px',
  };
  const span = (i) => {
    if (n === 3 && i === 0) return 'grid-row:span 2';
    if (shown.length === 5) return i < 2 ? 'grid-column:span 3' : 'grid-column:span 2';
    return '';
  };
  return `
    <div class="tx-grid" style="${layouts[shown.length] || layouts[6]}">
      ${shown.map((it, i) => `
        <div style="${span(i)}">
          ${tile(post, it, i, true)}
          ${i === shown.length - 1 && more > 0 ? `<span class="tx-media-more">+${more}</span>` : ''}
        </div>`).join('')}
    </div>`;
}

function mediaBlock(post) {
  const items = post.media_items || [];
  if (!items.length) return '';
  const visual = items.filter((i) => VISUAL.has(i.type));

  if (items.length > 1 && visual.length === items.length) return `<div class="tx-media">${albumHtml(post, items)}</div>`;

  const item = items[0];
  if (item.type === 'sticker') return `<div class="tx-sticker-wrap">${stickerHtml(item.url, item.mime)}</div>`;
  if (item.type === 'video' && item.round) {
    return `<div class="tx-round" ${openAttr(post, 0)}>${item.thumb_url ? `<img src="${escapeHtml(item.thumb_url)}" />` : ''}<span class="tx-play"><i class="icon icon-play"></i></span><span class="tx-media-pill">${formatDuration(item.duration)}</span></div>`;
  }
  if (VISUAL.has(item.type)) return `<div class="tx-media">${tile(post, item, 0, false)}</div>`;
  if (item.type === 'audio') return audioHtml(post, item);
  if (item.type === 'document') {
    return `
      <a href="${escapeHtml(item.url)}" download="${escapeHtml(item.filename || 'file')}" class="tx-file" onclick="event.stopPropagation()">
        <span class="tx-file-icon"><i class="icon icon-download"></i></span>
        <span class="tx-file-body">
          <span class="tx-file-name" style="display:block">${escapeHtml(item.filename || 'Документ')}</span>
          <span class="tx-file-sub" style="display:block">${formatFileSize(item.size)}</span>
        </span>
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

export function commentsLabel(count) {
  return count ? `${formatNumber(count)} ${pluralRu(count, 'комментарий', 'комментария', 'комментариев')}` : 'Прокомментировать';
}

function commentsRow(post) {
  if (!post.comments_enabled) return '';
  const avatars = (post.recent_repliers || []).map((p) => avatarHtml(p, 'xs')).join('');
  return `
    <button class="tx-comments-row" onclick="event.stopPropagation(); window.TelegramX.openThread('${post.id}')">
      ${avatars ? `<span class="tx-avatars">${avatars}</span>` : '<i class="icon icon-comments"></i>'}
      <span id="comments-label-${post.id}">${commentsLabel(post.replies_count)}</span>
      <i class="icon icon-next tx-chevron"></i>
    </button>`;
}

function metaHtml(post) {
  return `
    <i class="icon icon-star ${post.is_favorite ? '' : 'tx-hidden'}" id="fav-mark-${post.id}" style="color:#f5b72f"></i>
    ${post.views != null ? `<i class="icon icon-channelviews"></i><span>${formatNumber(post.views)}</span>` : ''}
    ${post.post_author ? `<span class="tx-meta-author">&nbsp;${escapeHtml(post.post_author)},</span>` : ''}
    <span>&nbsp;${post.edited ? 'изменено ' : ''}${timeOf(post)}</span>`;
}

export function createPostCardElement(post) {
  const ch = post.channel || {};
  const media = mediaBlock(post);
  const body = formatPostText(post.text, post.text_html);
  const items = post.media_items || [];
  const isSticker = items.length === 1 && items[0].type === 'sticker';
  const mediaOnly = !body && !post.webpage && items.length && items.every((i) => VISUAL.has(i.type)) && !post.comments_enabled;
  const hasReactions = (post.reactions || []).length > 0;

  const card = document.createElement('article');
  card.id = `post-card-${post.id}`;
  card.className = 'tx-post';
  card.dataset.post = post.id;
  card.dataset.channel = post.channel_id;
  card.dataset.msg = post.msg_id;

  card.innerHTML = `
    <span class="tx-post-avatar" onclick="window.TelegramX.filterByChannel(${post.channel_id}, '${escapeQuotes(ch.title)}')">${avatarHtml(ch, 'md')}</span>
    <div class="tx-post-col">
      <div class="tx-bubble ${isSticker ? 'is-sticker' : ''} ${mediaOnly ? 'tx-media-only' : ''}"
           onclick="window.TelegramX.openPostMenu('${post.id}', event)"
           ondblclick="window.TelegramX.quickReact('${post.id}', event)">
        ${isSticker ? '' : `<div class="tx-bubble-name tx-peer-${peerColor(post.channel_id)} tx-peer-name" onclick="event.stopPropagation(); window.TelegramX.filterByChannel(${post.channel_id}, '${escapeQuotes(ch.title)}')"><span>${parseEmojis(ch.title || 'Канал')}</span>${ch.verified ? VERIFIED_BADGE_SVG : ''}</div>`}
        ${media}
        ${body ? `<div class="post-text tx-text">${body}</div>` : ''}
        ${webpageHtml(post)}
        <div class="tx-reactions ${hasReactions ? '' : 'tx-hidden'}" id="reactions-wrap-${post.id}">${reactionsHtml(post)}</div>
        <div class="tx-meta">${metaHtml(post)}</div>
        ${commentsRow(post)}
      </div>
      <button class="tx-side-btn tx-glass" onclick="window.TelegramX.sharePost('${post.id}')" title="Поделиться">
        <i class="icon icon-share-filled"></i>
      </button>
    </div>`;

  return card;
}

/** Tap-to-download photo (when autoload is off); next tap opens the viewer. */
export function loadPhoto(el) {
  const img = document.createElement('img');
  img.src = el.dataset.src;
  img.setAttribute('style', el.getAttribute('style').replace(/background:[^;]+;?/, ''));
  img.onclick = (e) => {
    e.stopPropagation();
    window.TelegramX.openViewer(el.dataset.post, Number(el.dataset.idx));
  };
  el.replaceWith(img);
}
