/**
 * ====================================================================
 * POST CONTEXT MENU — Telegram style: reaction strip + action list.
 * Opened by tapping a bubble; double tap sends the quick reaction.
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, haptic } from '../utils.js';
import { quickReactionButtons, sendReaction } from './reactions.js';
import { hydrateStickers } from './sticker.js';
import { t, locale } from '../i18n.js';

const QUICK_REACTION = '👍';
let lastTap = 0;

export function closeMenus() {
  document.querySelectorAll('.tx-ctx, .tx-ctx-backdrop').forEach((m) => {
    if (m.dataset.closing) return;
    m.dataset.closing = '1';
    m.style.pointerEvents = 'none';
    const a = m.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: m.classList.contains('tx-ctx') ? 'scale(0.96)' : 'none' }], { duration: 140, easing: 'ease-in' });
    a.finished.then(() => m.remove(), () => m.remove());
  });
}

function findPost(postId) {
  return state.posts.find((p) => p.id === postId) || (state.threadPost && state.threadPost.id === postId ? state.threadPost : null);
}

/** Generic popup anchored to an element: optional reaction strip + menu items. */
export function openPopup(anchor, { reactionsHtml = '', items = [], header = null }) {
  closeMenus();
  haptic(6);
  const backdrop = document.createElement('div');
  backdrop.className = 'tx-ctx-backdrop';
  backdrop.onclick = closeMenus;

  const ctx = document.createElement('div');
  ctx.className = 'tx-ctx';
  ctx.innerHTML = `
    ${reactionsHtml ? `<div class="tx-ctx-reactions">${reactionsHtml}</div>` : ''}
    <div class="tx-menu">
      ${header ? `<div class="tx-menu-head"><i class="icon icon-${header.icon}"></i><span>${header.text}</span></div><div class="tx-menu-gap"></div>` : ''}
      ${items.map((it, i) => it.sep ? '<div class="tx-menu-gap"></div>' : `<button data-i="${i}" class="${it.danger ? 'is-danger' : ''}"><i class="icon icon-${it.icon}"></i>${it.label}</button>`).join('')}
    </div>`;
  ctx.addEventListener('click', (e) => {
    const i = e.target.closest('[data-i]')?.dataset.i;
    if (i == null) return;
    closeMenus();
    items[i].run();
  });
  document.body.append(backdrop, ctx);

  const r = anchor.getBoundingClientRect();
  const w = ctx.offsetWidth;
  const h = ctx.offsetHeight;
  const left = Math.max(8, Math.min(r.left + 12, window.innerWidth - w - 8));
  let top = r.top + 12;
  if (top + h > window.innerHeight - 12) top = Math.max(8, window.innerHeight - h - 12);
  ctx.style.left = `${left}px`;
  ctx.style.top = `${top}px`;
  ctx.style.transformOrigin = `${Math.max(0, r.left + 24 - left)}px ${top < r.top ? 'top' : 'bottom'}`;
  return ctx;
}

export function openPostMenu(postId, event) {
  const target = event && event.target;
  // Links, buttons, media and spoilers handle their own taps; keep text selectable.
  if (target && target.closest('a, button, video, audio, .tx-media, .tx-spoiler, .tg-spoiler')) return;
  if (String(window.getSelection && window.getSelection()).length) return;
  const now = Date.now();
  if (now - lastTap < 300) return; // second tap of a double tap
  lastTap = now;

  const post = findPost(postId);
  if (!post) return;
  const anchor = event.currentTarget || document.getElementById(`post-card-${postId}`);
  setTimeout(() => {
    if (Date.now() - lastTap < 280) return;
    const tx = window.TelegramX;
    const items = [];
    if (post.comments_enabled) items.push({ icon: 'reply', label: t('Ответить'), run: () => tx.openThread(post.id) });
    if (post.text) items.push({ icon: 'copy', label: t('Копировать'), run: () => copyText(post.text) });
    items.push({ icon: 'link', label: t('Копировать ссылку'), run: () => tx.copyPostLink(post.tg_url) });
    if (savable(post)) items.push({ icon: 'save-gallery', label: t('Сохранить в галерею'), run: () => saveMedia(post) });
    items.push(
      { icon: 'forward', label: t('Переслать в «Избранное»'), run: () => tx.forwardToSaved(post.channel_id, post.msg_id) },
      { icon: post.is_favorite ? 'favorite-filled' : 'favorite', label: post.is_favorite ? t('Убрать из закладок') : t('В закладки'), run: () => tx.togglePostFavorite(post.id) },
      { sep: true },
      { icon: 'open-in-new-tab', label: t('Открыть в Telegram'), run: () => window.open(post.tg_url, '_blank', 'noopener') },
    );
    const ctx = openPopup(anchor, { reactionsHtml: quickReactionButtons(post.id), items, header: menuHeader(post) });
    hydrateStickers(ctx);
  }, 290);
}

export function quickReact(postId, event) {
  if (event) event.preventDefault();
  lastTap = Date.now();
  closeMenus();
  const post = findPost(postId);
  if (!post) return;
  const chosen = (post.reactions || []).find((r) => r.chosen && !r.paid);
  if (chosen && !chosen.custom_id && chosen.emoji === QUICK_REACTION) return;
  sendReaction(post.channel_id, post.msg_id, QUICK_REACTION, post.id);
}

export function pickReaction(postId, emoji, customId = null) {
  closeMenus();
  const post = findPost(postId);
  if (post) sendReaction(post.channel_id, post.msg_id, emoji, post.id, customId);
}

function menuHeader(post) {
  const d = new Date(post.timestamp * 1000);
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const today = d.toDateString() === new Date().toDateString();
  const day = d.toLocaleDateString(locale(), { day: 'numeric', month: 'long' });
  if (post.edited) return { icon: 'clock-edit', text: today ? t('изменено в {time}', { time }) : t('изменено {day} в {time}', { day, time }) };
  return { icon: 'clock', text: today ? t('сегодня в {time}', { time }) : t('{day} в {time}', { day, time }) };
}

const SAVABLE = new Set(['photo', 'video', 'gif', 'round']);

function savable(post) {
  return (post.media_items || []).some((i) => SAVABLE.has(i.type));
}

/** Download the post's photos/videos (the Android app saves them into the gallery). */
export async function saveMedia(post) {
  const items = (post.media_items || []).filter((i) => SAVABLE.has(i.type));
  if (!items.length) return;
  showToast(items.length > 1 ? t('Сохранение {a} файлов…', {a: items.length}) : t('Сохранение…'));
  for (const [n, it] of items.entries()) {
    const photo = it.type === 'photo';
    const name = `telex_${post.channel_id}_${post.msg_id}${items.length > 1 ? `_${n + 1}` : ''}.${photo ? 'jpg' : 'mp4'}`;
    const url = new URL(it.full_url || it.url, location.href).href;
    if (window.__telexDl) {
      window.__telexDl(url, name, photo ? 'image/jpeg' : 'video/mp4');
      continue;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blobUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      showToast(t('Не удалось сохранить: ') + (e.message || e));
      return;
    }
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast(t('Текст скопирован'))).catch(() => {});
}

export function copyPostLink(url) {
  navigator.clipboard.writeText(url).then(() => showToast(t('Ссылка скопирована'))).catch(() => showToast(url));
}

export async function sharePost(postId) {
  const post = findPost(postId);
  if (!post) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: post.channel?.title || 'Telegram', url: post.tg_url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  copyPostLink(post.tg_url);
}

export async function forwardToSaved(channelId, msgId) {
  const res = await api.forwardToSaved(channelId, msgId);
  showToast(res.status === 'success' ? t('Сохранено в «Избранное» Telegram') : t('Не удалось переслать: ') + (res.message || t('ошибка')));
}

export async function togglePostFavorite(postId) {
  const post = findPost(postId);
  const res = await api.toggleFavorite(postId, post);
  if (post) post.is_favorite = res.is_favorite;
  document.querySelectorAll(`[id="fav-mark-${postId}"]`).forEach((el) => el.classList.toggle('tx-hidden', !res.is_favorite));
  if (state.feedType === 'favorites' && !res.is_favorite) {
    document.getElementById(`post-card-${postId}`)?.remove();
    state.posts = state.posts.filter((p) => p.id !== postId);
  }
  showToast(res.is_favorite ? t('Добавлено в закладки') : t('Удалено из закладок'));
}
