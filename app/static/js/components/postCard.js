/**
 * ====================================================================
 * COMPONENT: POST CARD & MEDIA GRIDS (Telegram Authentic UI)
 * ====================================================================
 */

import { state, EMOJI_PICKER_LIST } from '../state.js';
import { formatTgTime, formatNumber, formatFileSize, formatDuration, formatPostText, escapeQuotes } from '../utils.js';
import { renderEmoji, parseEmojis } from '../emoji.js';

export const VERIFIED_BADGE_SVG = `<svg class="VerifiedIcon" viewBox="0 0 24 24"><path d="M12.3 2.9c.1.1.2.1.3.2.7.6 1.3 1.1 2 1.7.3.2.6.4.9.4.9.1 1.7.2 2.6.2.2 0 .4.1.5.3.4.8.9 1.5 1.5 2.1.2.2.3.5.4.8.3.9.7 1.7 1.2 2.4.1.2.1.4.1.6-.1.9-.1 1.8-.1 2.7 0 .3 0 .6-.2.8-.5.8-.9 1.6-1.2 2.5-.1.3-.2.5-.4.8-.5.7-1 1.4-1.4 2.1-.1.2-.3.3-.6.3-.9.2-1.7.4-2.6.7-.3.1-.5.2-.8.5-.6.7-1.3 1.3-2.1 1.7-.2.1-.4.2-.6.1-.9-.2-1.8-.4-2.7-.4-.3 0-.6 0-.8-.2-.8-.5-1.6-.9-2.5-1.2-.3-.1-.5-.2-.8-.4-.7-.5-1.4-1-2.1-1.4-.2-.1-.3-.3-.3-.6-.2-.9-.4-1.7-.7-2.6-.1-.3-.2-.5-.5-.8-.7-.6-1.3-1.3-1.7-2.1-.1-.2-.2-.4-.1-.6.2-.9.4-1.8.4-2.7 0-.3 0-.6.2-.8.5-.8.9-1.6 1.2-2.5.1-.3.2-.5.4-.8.5-.7 1-1.4 1.4-2.1.1-.2.3-.3.6-.3.9-.2 1.7-.4 2.6-.7.3-.1.5-.2.8-.5.6-.7 1.3-1.3 2.1-1.7.2-.1.4-.2.6-.1.9.2 1.8.4 2.7.4.3 0 .6 0 .8.2.8.5 1.6.9 2.5 1.2.3.1.5.2.8.4.7.5 1.4 1 2.1 1.4.2.1.3.3.3.6.2.9.4 1.7.7 2.6.1.3.2.5.5.8.7.6 1.3 1.3 1.7 2.1.1.2.2.4.1.6-.2.9-.4 1.8-.4 2.7 0 .3 0 .6-.2.8-.5.8-.9 1.6-1.2 2.5-.1.3-.2.5-.4.8-.5.7-1 1.4-1.4 2.1-.1.2-.3.3-.6.3-.9.2-1.7.4-2.6.7-.3.1-.5.2-.8.5-.6.7-1.3 1.3-2.1 1.7-.2.1-.4.2-.6.1-.9-.2-1.8-.4-2.7-.4-.3 0-.6 0-.8-.2-.8-.5-1.6-.9-2.5-1.2-.3-.1-.5-.2-.8-.4-.7-.5-1.4-1-2.1-1.4-.2-.1-.3-.3-.3-.6-.2-.9-.4-1.7-.7-2.6-.1-.3-.2-.5-.5-.8-.7-.6-1.3-1.3-1.7-2.1-.1-.2-.2-.4-.1-.6z" fill="#3390ec"/><path d="M10.2 16.2l-3.5-3.5 1.4-1.4 2.1 2.1 6.4-6.4 1.4 1.4-7.8 7.8z" fill="#ffffff"/></svg>`;

export function buildMediaHtml(post) {
  const items = post.media_items || [];
  if (items.length === 0) {
    if (post.webpage) {
      const wp = post.webpage;
      return `
        <a href="${wp.url}" target="_blank" rel="noopener noreferrer" class="block rounded-xl border border-white/10 bg-[#121216] hover:bg-[#1c1c24] transition overflow-hidden mt-1 shadow-md" onclick="event.stopPropagation()">
          ${wp.photo_url ? `<img src="${wp.photo_url}" loading="lazy" decoding="async" class="w-full max-h-56 object-cover border-b border-white/10" />` : ''}
          <div class="p-3 border-l-4 border-[#3390ec]">
            <span class="text-[11px] text-[#8a8a90] font-mono block">${wp.site_name || wp.display_url}</span>
            <h4 class="text-sm font-semibold text-white line-clamp-1 mt-0.5">${parseEmojis(wp.title || wp.url)}</h4>
            ${wp.description ? `<p class="text-xs text-slate-300 line-clamp-2 mt-1 leading-relaxed">${parseEmojis(wp.description)}</p>` : ''}
          </div>
        </a>
      `;
    }
    return '';
  }

  // Single photo
  if (items.length === 1 && items[0].type === 'photo') {
    const item = items[0];
    return `
      <div class="rounded-xl overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center max-h-[540px] mt-1 shadow-sm" onclick="event.stopPropagation()">
        <img src="${item.url}" loading="lazy" decoding="async" class="w-full object-cover max-h-[540px] cursor-zoom-in hover:opacity-95 transition" onclick="window.TelegramX.openLightboxSingle('${item.url}', '${post.id}')" />
      </div>
    `;
  }

  // Multi-Photo Album Grid
  if (items.length > 1 && items.every(i => i.type === 'photo' || i.type === 'video')) {
    const count = items.length;
    if (count === 2) {
      return `
        <div class="grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-white/10 mt-1" onclick="event.stopPropagation()">
          ${items.map((it, idx) => `
            <div class="h-60 bg-black/40 overflow-hidden cursor-zoom-in" onclick="window.TelegramX.openLightboxIndex('${post.id}', ${idx})">
              <img src="${it.url}" loading="lazy" decoding="async" class="w-full h-full object-cover hover:scale-105 transition duration-300" />
            </div>
          `).join('')}
        </div>
      `;
    } else if (count === 3) {
      return `
        <div class="grid grid-cols-3 gap-1 rounded-xl overflow-hidden border border-white/10 mt-1" onclick="event.stopPropagation()">
          <div class="col-span-2 h-72 bg-black/40 overflow-hidden cursor-zoom-in" onclick="window.TelegramX.openLightboxIndex('${post.id}', 0)">
            <img src="${items[0].url}" loading="lazy" decoding="async" class="w-full h-full object-cover hover:scale-105 transition duration-300" />
          </div>
          <div class="flex flex-col gap-1 h-72">
            <div class="flex-1 bg-black/40 overflow-hidden cursor-zoom-in" onclick="window.TelegramX.openLightboxIndex('${post.id}', 1)">
              <img src="${items[1].url}" loading="lazy" decoding="async" class="w-full h-full object-cover hover:scale-105 transition duration-300" />
            </div>
            <div class="flex-1 bg-black/40 overflow-hidden cursor-zoom-in" onclick="window.TelegramX.openLightboxIndex('${post.id}', 2)">
              <img src="${items[2].url}" loading="lazy" decoding="async" class="w-full h-full object-cover hover:scale-105 transition duration-300" />
            </div>
          </div>
        </div>
      `;
    } else {
      const displayItems = items.slice(0, 4);
      const remaining = items.length - 4;
      return `
        <div class="grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-white/10 mt-1" onclick="event.stopPropagation()">
          ${displayItems.map((it, idx) => `
            <div class="h-44 bg-black/40 overflow-hidden relative cursor-zoom-in" onclick="window.TelegramX.openLightboxIndex('${post.id}', ${idx})">
              <img src="${it.url}" loading="lazy" decoding="async" class="w-full h-full object-cover hover:scale-105 transition duration-300" />
              ${idx === 3 && remaining > 0 ? `
                <div class="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg backdrop-blur-xs">
                  +${remaining}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // Single Video
  if (items[0].type === 'video') {
    const item = items[0];
    return `
      <div class="rounded-xl overflow-hidden bg-black border border-white/10 mt-1 shadow-md relative" onclick="event.stopPropagation()">
        <video src="${item.url}" poster="${item.thumb_url || ''}" controls preload="metadata" class="w-full max-h-[500px] rounded-xl"></video>
      </div>
    `;
  }

  // Audio / Voice Message
  if (items[0].type === 'audio') {
    const item = items[0];
    return `
      <div class="p-3 rounded-xl border border-white/10 bg-[#121216] flex items-center gap-3 mt-1 shadow-inner" onclick="event.stopPropagation()">
        <div class="w-10 h-10 rounded-full bg-[#3390ec]/20 text-[#3390ec] flex items-center justify-center shrink-0 shadow-inner">
          <i class="icon ${item.is_voice ? 'icon-microphone' : 'icon-play'} text-lg text-[#3390ec]"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-medium text-white truncate max-w-[240px]">${item.title || item.performer || (item.is_voice ? 'Голосовое сообщение' : 'Аудиозапись')}</span>
            <span class="text-[10px] text-[#8a8a90] font-mono">${formatDuration(item.duration)}</span>
          </div>
          <audio src="${item.url}" controls class="w-full h-7"></audio>
        </div>
      </div>
    `;
  }

  // GIF / Animation
  if (items[0].type === 'gif') {
    const item = items[0];
    return `
      <div class="rounded-xl overflow-hidden bg-black border border-white/10 mt-1" onclick="event.stopPropagation()">
        <video src="${item.url}" autoplay loop muted playsinline class="w-full max-h-[480px]"></video>
      </div>
    `;
  }

  // Document / File
  if (items[0].type === 'document') {
    const item = items[0];
    return `
      <a href="${item.url}" download target="_blank" class="p-3 rounded-xl border border-white/10 bg-[#121216] hover:bg-[#1c1c24] transition flex items-center justify-between gap-3 mt-1" onclick="event.stopPropagation()">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-[#3390ec]/15 flex items-center justify-center shrink-0">
            <i class="icon icon-document text-lg text-[#3390ec]"></i>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-xs font-medium text-white truncate max-w-[280px]">${item.filename || 'Документ'}</span>
            <span class="text-[10px] text-[#8a8a90] font-mono">${formatFileSize(item.size)} · ${item.mime || 'Файл'}</span>
          </div>
        </div>
        <i class="icon icon-download text-base text-slate-400 hover:text-white transition"></i>
      </a>
    `;
  }

  return '';
}

export function createPostCardElement(post) {
  const card = document.createElement('article');
  card.id = `post-card-${post.id}`;
  card.className = 'tg-post-card p-3.5 sm:p-4 flex flex-col gap-2.5 relative';
  
  const ch = post.channel || {};
  const avatarUrl = ch.avatar || '';
  const initial = (ch.title || 'C').charAt(0).toUpperCase();

  // Reactions list
  let reactionsHtml = '';
  if (post.reactions && post.reactions.length > 0) {
    reactionsHtml = `
      <div class="flex flex-wrap items-center gap-1.5 pt-0.5" id="reactions-wrap-${post.id}" onclick="event.stopPropagation()">
        ${post.reactions.map(r => `
          <button onclick="window.TelegramX.sendReaction(${post.channel_id}, ${post.msg_id}, '${r.emoji}', '${post.id}')" class="tg-reaction-pill ${r.chosen ? 'active' : ''}">
            ${renderEmoji(r.emoji, 'emoji-small')}
            <span class="font-medium text-[11.5px] ml-0.5">${formatNumber(r.count)}</span>
          </button>
        `).join('')}
        <button onclick="window.TelegramX.toggleReactionPicker('${post.id}', event)" class="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-slate-400 hover:text-white transition shrink-0" title="Добавить реакцию">
          <i class="icon icon-smile text-sm"></i>
        </button>
      </div>
    `;
  } else {
    reactionsHtml = `
      <div class="flex flex-wrap items-center gap-1.5 pt-0.5" id="reactions-wrap-${post.id}" onclick="event.stopPropagation()">
        <button onclick="window.TelegramX.toggleReactionPicker('${post.id}', event)" class="tg-reaction-pill hover:text-white text-slate-400">
          <i class="icon icon-smile text-xs text-[#3390ec]"></i>
          <span class="text-xs">Реакция</span>
        </button>
      </div>
    `;
  }

  const mediaHtml = buildMediaHtml(post);
  const formattedBody = formatPostText(post.text, post.text_html);

  card.innerHTML = `
    <!-- Post Header -->
    <div class="flex items-center justify-between gap-2.5">
      <div class="flex items-center gap-2.5 min-w-0 cursor-pointer" onclick="window.TelegramX.filterByChannel(${post.channel_id}, '${escapeQuotes(ch.title)}')">
        <div class="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-tr from-[#3390ec] to-sky-400 flex items-center justify-center font-bold text-white text-sm shadow shrink-0 border border-white/10">
          ${avatarUrl ? `<img src="${avatarUrl}" class="w-full h-full object-cover" />` : initial}
        </div>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1">
            <span class="font-medium text-white text-[14.5px] hover:underline truncate">${parseEmojis(ch.title || 'Канал')}</span>
            ${ch.verified ? VERIFIED_BADGE_SVG : ''}
          </div>
          <span class="text-[#8a8a90] text-[11.5px]">${ch.username ? '@' + ch.username : 'Канал'} · <span title="${post.date}">${formatTgTime(post.date)}</span></span>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="flex items-center gap-0.5" onclick="event.stopPropagation()">
        <button onclick="window.TelegramX.copyPostLink('${post.tg_url}')" class="text-[#8a8a90] hover:text-[#3390ec] transition p-1.5 rounded-full hover:bg-white/5" title="Скопировать ссылку">
          <i class="icon icon-copy text-base"></i>
        </button>
        <a href="${post.tg_url}" target="_blank" rel="noopener noreferrer" class="text-[#8a8a90] hover:text-[#3390ec] transition p-1.5 rounded-full hover:bg-white/5" title="Открыть в Telegram">
          <i class="icon icon-share-filled text-base"></i>
        </a>
      </div>
    </div>

    <!-- Post Body Text -->
    ${formattedBody ? `
      <div class="post-text select-text leading-relaxed">
        ${formattedBody}
      </div>
    ` : ''}

    <!-- Media Attachment -->
    ${mediaHtml}

    <!-- Reactions Row -->
    <div class="flex flex-col gap-1.5 pt-0.5">
      ${reactionsHtml}

      <!-- Expandable Reaction Picker Palette (Opens inline below reactions without covering text) -->
      <div id="picker-${post.id}" class="hidden bg-[#121218] rounded-2xl p-2.5 flex flex-wrap gap-2 border border-white/10 shadow-xl transition-all reaction-popover" onclick="event.stopPropagation()">
        ${EMOJI_PICKER_LIST.map(em => `
          <button onclick="window.TelegramX.sendReaction(${post.channel_id}, ${post.msg_id}, '${em}', '${post.id}'); window.TelegramX.hideReactionPicker('${post.id}')" class="w-8 h-8 rounded-xl hover:bg-white/15 flex items-center justify-center transition transform hover:scale-125 active:scale-95" title="${em}">
            ${renderEmoji(em, 'emoji-large')}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Bottom Footer Bar (Native Telegram Layout) -->
    <div class="flex items-center justify-between text-[#8a8a90] text-xs pt-2 mt-0.5 border-t border-white/5" onclick="event.stopPropagation()">
      
      <!-- Comments Button (Clean Telegram Style, NO CHEVRON ARROWS) -->
      <button onclick="window.TelegramX.toggleInlineComments(${post.channel_id}, ${post.msg_id}, '${post.id}', event)" id="comments-btn-${post.id}" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition group">
        <i class="icon icon-comments text-base text-[#3390ec]"></i>
        <span class="font-normal text-xs" id="comments-label-${post.id}">${post.replies_count ? `${formatNumber(post.replies_count)} комментариев` : 'Прокомментировать'}</span>
      </button>

      <!-- Right Controls: Views, Share & Save -->
      <div class="flex items-center gap-2.5">
        <!-- Views -->
        <div class="flex items-center gap-1 text-[#8a8a90] font-mono text-[11px]" title="Просмотры">
          <i class="icon icon-eye text-sm opacity-75"></i>
          <span>${formatNumber(post.views || 100)}</span>
        </div>

        <!-- Forward to Saved Messages -->
        <button onclick="window.TelegramX.forwardToSaved(${post.channel_id}, ${post.msg_id})" class="text-[#8a8a90] hover:text-[#4fae4e] transition p-1 rounded-full hover:bg-white/5" title="В Избранное">
          <i class="icon icon-forward text-base"></i>
        </button>

        <!-- Bookmark Local Favorite -->
        <button onclick="window.TelegramX.togglePostFavorite('${post.id}')" id="fav-btn-${post.id}" class="text-[#8a8a90] hover:text-amber-400 transition p-1 rounded-full hover:bg-white/5 ${post.is_favorite ? 'text-amber-400' : ''}" title="В закладки">
          <i class="icon icon-star text-base ${post.is_favorite ? 'text-amber-400' : ''}"></i>
        </button>
      </div>

    </div>

    <!-- INLINE COMMENTS DRAWER -->
    <div id="inline-comments-${post.id}" class="comments-accordion border-t border-white/10" onclick="event.stopPropagation()">
      <div class="bg-[#121216] rounded-xl p-3 border border-white/10 shadow-inner">
        
        <!-- Drawer Header -->
        <div class="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
          <div class="flex items-center gap-1.5">
            <i class="icon icon-comments text-sm text-[#3390ec]"></i>
            <span class="text-xs font-medium text-white">Обсуждение</span>
            <span id="comments-badge-${post.id}" class="text-[10px] bg-[#3390ec]/20 text-[#62b0f2] font-mono px-1.5 py-0.2 rounded-full font-medium border border-[#3390ec]/30"></span>
          </div>
          <button onclick="window.TelegramX.toggleInlineComments(${post.channel_id}, ${post.msg_id}, '${post.id}', event)" class="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition text-[11px]">
            <span>Закрыть</span>
          </button>
        </div>

        <!-- Comments List Container -->
        <div id="comments-list-${post.id}" class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          <!-- Dynamically populated comments -->
        </div>

        <!-- WRITE COMMENT FORM -->
        <div class="mt-2.5 pt-2.5 border-t border-white/10 flex items-center gap-2">
          <div class="w-7 h-7 rounded-full overflow-hidden bg-[#18181f] flex items-center justify-center shrink-0 border border-[#3390ec]/40 shadow">
            ${state.user && state.user.avatar ? `<img src="${state.user.avatar}" class="w-full h-full object-cover" />` : `<i class="icon icon-user text-xs text-[#3390ec]"></i>`}
          </div>
          
          <div class="flex-1 relative flex items-center bg-[#18181f] rounded-xl border border-white/10 focus-within:border-[#3390ec] px-3 py-1.5 transition">
            <input 
              type="text" 
              id="comment-input-${post.id}" 
              placeholder="Написать комментарий..." 
              class="bg-transparent text-xs text-white placeholder-[#8a8a90] focus:outline-none w-full pr-6"
              onkeydown="if(event.key==='Enter') window.TelegramX.submitPostComment(${post.channel_id}, ${post.msg_id}, '${post.id}')"
            />
            <button onclick="window.TelegramX.insertCommentEmoji('${post.id}', '🔥')" class="text-slate-400 hover:text-white text-xs mr-0.5" title="Быстрый эмодзи">
              ${renderEmoji('🔥', 'emoji-small')}
            </button>
          </div>

          <button 
            onclick="window.TelegramX.submitPostComment(${post.channel_id}, ${post.msg_id}, '${post.id}')" 
            id="btn-send-comment-${post.id}"
            class="w-7 h-7 rounded-full bg-[#3390ec] hover:bg-[#267fd9] text-white flex items-center justify-center transition shadow-md shadow-[#3390ec]/30 shrink-0 transform active:scale-95"
            title="Отправить комментарий"
          >
            <i class="icon icon-new-send text-xs text-white"></i>
          </button>
        </div>

      </div>
    </div>
  `;

  return card;
}
