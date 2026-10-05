/**
 * ====================================================================
 * VIEW: CHANNEL PAGE — Telegram's channel profile: big avatar, title,
 * subscribers, actions (sound / discussion / link / leave), description,
 * link, and the "Публикации" (stories) / "Медиа" tabs.
 * ====================================================================
 */

import { state } from '../state.js';
import { tgDialog } from '../core/dialog.js';
import { api } from '../api.js';
import { escapeHtml, formatNumber, showToast } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { go } from '../core/nav.js';
import { avatarHtml } from '../components/avatar.js';
import { VERIFIED_BADGE_SVG } from '../components/postCard.js';
import { openStoryViewer } from '../components/storyViewer.js';
import { openPopup } from '../components/postMenu.js';
import { t, tn } from '../i18n.js';

const $ = (id) => document.getElementById(id);
const fullCache = new Map(); // channelId -> full info

let cur = null; // { id, full, tab, media, mediaMore, mediaOffset, stories, loadingMedia }

export function openChannelPage(channelId) {
  go('channel', { channel: Number(channelId) }, { push: true });
}

/** Cached channels.getFullChannel (used by the wall header too). */
export async function channelFull(channelId, refresh = false) {
  const id = Number(channelId);
  if (!refresh && fullCache.has(id)) return fullCache.get(id);
  const full = await api.getChannelFull(id);
  fullCache.set(id, full);
  return full;
}

export function cachedChannelFull(channelId) {
  return fullCache.get(Number(channelId)) || null;
}

export function enterChannel(params = {}) {
  const id = Number(params.channel);
  if (!id) {
    go('wall');
    return;
  }
  if (!cur || cur.id !== id) {
    cur = { id, full: cachedChannelFull(id), tab: 'posts', media: null, mediaMore: false, mediaOffset: 0, stories: null, loadingMedia: false };
  }
  render();
  window.scrollTo(0, 0);
  load();
}

async function load() {
  const c = cur;
  try {
    c.full = await channelFull(c.id, true);
  } catch (e) {
    console.warn('[TeleX] channel full', e);
  }
  if (cur !== c) return;
  render();
  if (c.stories === null) {
    try {
      c.stories = await api.getChannelStories(c.id);
    } catch (e) {
      console.warn('[TeleX] channel stories', e);
      c.stories = { stories: [] };
    }
    if (cur !== c) return;
    if (!c.stories.stories.length && c.tab === 'posts') c.tab = 'media';
    render();
  }
  if (c.tab === 'media' && c.media === null) loadMedia();
}

async function loadMedia() {
  const c = cur;
  if (!c || c.loadingMedia) return;
  c.loadingMedia = true;
  try {
    const res = await api.getChannelMedia(c.id, c.mediaOffset);
    if (cur !== c) return;
    c.media = [...(c.media || []), ...res.posts];
    c.mediaMore = res.has_more;
    c.mediaOffset = res.next_offset;
  } catch (e) {
    console.warn('[TeleX] channel media', e);
    c.media = c.media || [];
  } finally {
    c.loadingMedia = false;
  }
  if (cur === c) render();
}

function linkify(text) {
  return parseEmojis(text)
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)
    .replace(/(^|[\s(])@([a-zA-Z][\w]{3,31})/g, (m, pre, name) => `${pre}<a href="https://t.me/${name}" target="_blank" rel="noopener noreferrer">@${name}</a>`)
    .replace(/\n/g, '<br>');
}

function info() {
  const base = state.channels.find((x) => x.id === cur.id) || {};
  return { ...base, ...(cur.full || {}) };
}

function subsLabel(n) {
  return n ? tn(['{n} подписчик', '{n} подписчика', '{n} подписчиков'], n, { n: formatNumber(n) }) : t('канал');
}

function action(icon, label, onclick, extra = '') {
  return `<button class="tx-pf-action ${extra}" onclick="${onclick}"><i class="icon icon-${icon}"></i><span>${label}</span></button>`;
}

function storiesGrid() {
  const list = cur.stories ? cur.stories.stories : null;
  if (!list) return '<div class="tx-pf-empty"><span class="animate-spin"><i class="icon icon-reload"></i></span></div>';
  if (!list.length) return `<div class="tx-pf-empty"><b>${t('Публикаций нет')}</b><span>${t('Канал пока не сохранил истории на своей странице.')}</span></div>`;
  return `<div class="tx-pf-grid">${list.map((s, i) => `
    <button class="tx-pf-cell" onclick="window.TelegramX.openChannelStory(${i}, this)">
      ${s.skipped ? '' : `<img src="${escapeHtml(s.type === 'video' ? s.thumb_url || '' : s.url)}" alt="" loading="lazy" decoding="async" />`}
      ${s.type === 'video' ? '<i class="icon icon-play"></i>' : ''}
      ${s.views != null ? `<span class="tx-pf-views"><i class="icon icon-channelviews"></i>${formatNumber(s.views)}</span>` : ''}
    </button>`).join('')}</div>`;
}

function mediaGrid() {
  if (cur.media === null) return '<div class="tx-pf-empty"><span class="animate-spin"><i class="icon icon-reload"></i></span></div>';
  if (!cur.media.length) return `<div class="tx-pf-empty"><b>${t('Медиа нет')}</b><span>${t('В этом канале пока нет фото и видео.')}</span></div>`;
  const cells = cur.media.map((p) => {
    const it = p.media_items[0];
    const thumb = it.type === 'photo' ? it.url : it.thumb_url || '';
    return `
      <button class="tx-media-cell" onclick="window.TelegramX.openChannelMedia('${p.id}')">
        <img src="${escapeHtml(thumb)}" alt="" loading="lazy" decoding="async" data-viewer="${p.id}:0" />
        ${it.type === 'video' || it.type === 'gif' ? `<span class="tx-media-dur">${it.duration ? `${Math.floor(it.duration / 60)}:${String(Math.floor(it.duration % 60)).padStart(2, '0')}` : 'GIF'}</span>` : ''}
      </button>`;
  }).join('');
  return `<div class="tx-media-grid">${cells}</div>${cur.mediaMore ? '<div class="tx-sentinel" id="channel-media-more"><span class="animate-spin"><i class="icon icon-reload"></i></span></div>' : ''}`;
}

function render() {
  const el = $('channel-root');
  if (!el || !cur) return;
  const ch = info();
  const muted = !!ch.muted;
  const link = ch.username ? `t.me/${ch.username}` : '';
  const tabs = [['posts', t('Публикации')], ['media', t('Медиа')]];

  el.innerHTML = `
    <div class="tx-pf-bar">
      <button class="tx-icon-btn" onclick="window.TelegramX.back()" title="${t('Назад')}"><i class="icon icon-arrow-left"></i></button>
      <span class="tx-pf-bar-title">${parseEmojis(ch.title || t('Канал'))}</span>
      <button class="tx-icon-btn" onclick="window.TelegramX.openChannelPageMenu(event)" title="${t('Ещё')}"><i class="icon icon-more"></i></button>
    </div>
    <div class="tx-page tx-pf">
      <div class="tx-pf-hero">
        <span class="tx-pf-avatar">${avatarHtml({ ...ch, avatar: ch.avatar_big || ch.avatar }, 'xl')}</span>
        <div class="tx-hero-name">${parseEmojis(ch.title || t('Канал'))}${ch.verified ? VERIFIED_BADGE_SVG : ''}</div>
        <div class="tx-hero-sub">${escapeHtml(subsLabel(ch.participants_count))}</div>
      </div>
      <div class="tx-pf-actions">
        ${action(muted ? 'mute' : 'unmute', muted ? t('Без звука') : t('Звук'), 'window.TelegramX.toggleChannelMute()')}
        ${ch.linked ? action('comments', t('Обсуждение'), 'window.TelegramX.openChannelDiscussion()') : ''}
        ${action('share-filled', t('Ссылка'), 'window.TelegramX.copyChannelLink()')}
        ${action('logout', t('Покинуть'), 'window.TelegramX.leaveChannelConfirm()')}
      </div>
      ${(ch.about || link) ? `
        <div class="tx-group">
          ${ch.about ? `<div class="tx-row"><span class="tx-row-body"><span class="tx-row-title tx-about-text">${linkify(ch.about)}</span><span class="tx-row-sub">${t('Описание')}</span></span></div>` : ''}
          ${link ? `<button class="tx-row" onclick="window.TelegramX.copyChannelLink()"><span class="tx-row-body"><span class="tx-row-title">${escapeHtml(link)}</span><span class="tx-row-sub">${t('Ссылка')}</span></span><i class="icon icon-qr tx-row-end"></i></button>` : ''}
        </div>` : ''}
      <div class="tx-group tx-pf-posts">
        <div class="tx-pill-tabs">${tabs.map(([k, label]) => `<button class="${cur.tab === k ? 'is-active' : ''}" onclick="window.TelegramX.switchChannelTab('${k}')">${label}</button>`).join('')}</div>
        ${cur.tab === 'posts' ? storiesGrid() : mediaGrid()}
      </div>
      <button class="tx-open-wall" onclick="window.TelegramX.filterByChannel(${cur.id})"><i class="icon icon-channel"></i>${t('Показать публикации на стене')}</button>
    </div>`;
  observeMore();
}

let moreObserver = null;
function observeMore() {
  const s = $('channel-media-more');
  if (!s) return;
  moreObserver = moreObserver || new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) loadMedia();
  }, { rootMargin: '600px' });
  moreObserver.disconnect();
  moreObserver.observe(s);
}

// ---------------- Actions ----------------

export function switchChannelTab(tab) {
  if (!cur) return;
  cur.tab = tab;
  render();
  if (tab === 'media' && cur.media === null) loadMedia();
}

export async function toggleChannelMute(channelId = cur && cur.id) {
  const ch = state.channels.find((x) => x.id === Number(channelId)) || (cur && cur.id === Number(channelId) ? cur.full : null);
  const next = !(ch && ch.muted);
  const res = await api.setChannelMuted(Number(channelId), next);
  if (res.status !== 'success') {
    showToast(t('Не удалось: ') + (res.message || t('ошибка')));
    return null;
  }
  state.channels.forEach((x) => { if (x.id === Number(channelId)) x.muted = next; });
  const full = fullCache.get(Number(channelId));
  if (full) full.muted = next;
  showToast(next ? t('Уведомления выключены') : t('Уведомления включены'));
  if (cur && cur.id === Number(channelId)) render();
  window.dispatchEvent(new CustomEvent('tx:channel-muted', { detail: { id: Number(channelId), muted: next } }));
  return next;
}

export function copyChannelLink(channelId = cur && cur.id) {
  const ch = { ...(state.channels.find((x) => x.id === Number(channelId)) || {}), ...(fullCache.get(Number(channelId)) || {}) };
  const url = ch.username ? `https://t.me/${ch.username}` : `https://t.me/c/${channelId}`;
  navigator.clipboard.writeText(url).then(() => showToast(t('Ссылка скопирована'))).catch(() => showToast(url));
}

export function openChannelDiscussion() {
  const ch = info();
  if (!ch.linked) return;
  const url = ch.linked.username ? `https://t.me/${ch.linked.username}` : `https://t.me/c/${ch.linked.id}`;
  window.open(url, '_blank', 'noopener');
}

export async function leaveChannelConfirm(channelId = cur && cur.id) {
  const ch = state.channels.find((x) => x.id === Number(channelId)) || {};
  if (!(await tgDialog({ title: t('Покинуть канал'), text: t('Покинуть канал «{a}»? Он пропадёт со стены и из Telegram.', {a: ch.title || t('канал')}), ok: t('Покинуть'), danger: true }))) return;
  const res = await api.leaveChannel(Number(channelId));
  if (res.status !== 'success') {
    showToast(t('Не удалось: ') + (res.message || t('ошибка')));
    return;
  }
  state.channels = state.channels.filter((x) => x.id !== Number(channelId));
  state.posts = state.posts.filter((p) => p.channel_id !== Number(channelId));
  showToast(t('Вы покинули канал'));
  if (state.activeChannelId === Number(channelId)) state.activeChannelId = null;
  go('wall');
  window.TelegramX.resetFeed();
}

export function openChannelPageMenu(event) {
  const ch = info();
  openPopup(event.currentTarget, {
    items: [
      { icon: 'channel', label: t('Показать на стене'), run: () => window.TelegramX.filterByChannel(cur.id) },
      { icon: 'link', label: t('Копировать ссылку'), run: () => copyChannelLink() },
      { icon: 'open-in-new-tab', label: t('Открыть в Telegram'), run: () => window.open(ch.username ? `https://t.me/${ch.username}` : `https://t.me/c/${cur.id}`, '_blank', 'noopener') },
      { icon: 'logout', label: t('Покинуть канал'), danger: true, run: () => leaveChannelConfirm() },
    ],
  });
}

export function openChannelStory(index, cell) {
  if (!cur || !cur.stories || !cur.stories.stories.length) return;
  openStoryViewer([cur.stories], 0, {
    storyIndex: index,
    source: cell,
    sourceFor: () => document.querySelectorAll('#channel-root .tx-pf-cell')[index] || null,
  });
}

export function openChannelMedia(postId) {
  const post = cur && cur.media && cur.media.find((p) => p.id === postId);
  if (!post) return;
  if (!state.posts.some((p) => p.id === postId)) state.extraPosts = [...(state.extraPosts || []).slice(-200), post];
  window.TelegramX.openViewer(postId, 0);
}

