/**
 * ====================================================================
 * AUDIO & VOICE PLAYER — Telegram style (round play button, waveform)
 * One shared <audio> element; the active row updates as it plays.
 * ====================================================================
 */

import { escapeHtml, formatDuration } from '../utils.js';
import { t } from '../i18n.js';

const audio = new Audio();
audio.preload = 'none';
let current = null; // { id, el }

function rowOf(id) {
  return document.querySelector(`.tx-audio[data-audio="${CSS.escape(id)}"]`);
}

function setPlaying(el, playing) {
  if (!el) return;
  const icon = el.querySelector('.tx-file-icon .icon');
  if (icon) icon.className = `icon ${playing ? 'icon-pause' : 'icon-play'}`;
}

function paint() {
  if (!current) return;
  const el = rowOf(current.id);
  if (!el) return;
  const dur = audio.duration || Number(el.dataset.duration) || 0;
  const p = dur ? audio.currentTime / dur : 0;
  const bars = el.querySelectorAll('.tx-wave i');
  bars.forEach((b, i) => b.classList.toggle('is-played', i / bars.length < p));
  const fill = el.querySelector('.tx-progress > i');
  if (fill) fill.style.width = `${p * 100}%`;
  const t = el.querySelector('.tx-audio-time');
  if (t) t.textContent = `${formatDuration(audio.currentTime)} / ${formatDuration(dur)}`;
}

audio.addEventListener('timeupdate', paint);
audio.addEventListener('ended', () => {
  if (current) setPlaying(rowOf(current.id), false);
  audio.currentTime = 0;
  paint();
});
audio.addEventListener('pause', () => current && setPlaying(rowOf(current.id), false));
audio.addEventListener('play', () => current && setPlaying(rowOf(current.id), true));

export function audioHtml(post, item) {
  const id = `${post.id}:${item.msg_id}`;
  const title = item.title || item.performer || (item.is_voice ? t('Голосовое сообщение') : t('Аудиозапись'));
  const wave = item.is_voice && item.waveform
    ? `<span class="tx-wave" onclick="event.stopPropagation(); window.TelegramX.seekAudio('${id}', event)">${item.waveform.map((v) => `<i style="height:${Math.max(3, Math.round((v / 31) * 22))}px"></i>`).join('')}</span>`
    : `<span class="tx-progress" onclick="event.stopPropagation(); window.TelegramX.seekAudio('${id}', event)"><i></i></span>`;
  return `
    <div class="tx-file tx-audio" data-audio="${escapeHtml(id)}" data-src="${escapeHtml(item.url)}" data-duration="${item.duration || 0}">
      <button class="tx-file-icon" onclick="event.stopPropagation(); window.TelegramX.toggleAudio('${id}')" title="${t('Слушать')}">
        <i class="icon icon-play"></i>
      </button>
      <span class="tx-file-body">
        ${item.is_voice ? '' : `<span class="tx-file-name" style="display:block">${escapeHtml(title)}</span>${item.performer && item.title ? `<span class="tx-file-sub" style="display:block">${escapeHtml(item.performer)}</span>` : ''}`}
        ${wave}
        <span class="tx-file-sub tx-audio-time" style="display:block">${formatDuration(item.duration)}</span>
      </span>
    </div>`;
}

export function toggleAudio(id) {
  const el = rowOf(id);
  if (!el) return;
  if (current && current.id === id) {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    return;
  }
  if (current) setPlaying(rowOf(current.id), false);
  current = { id };
  audio.src = el.dataset.src;
  audio.play().catch((e) => console.warn('[TeleX] audio', e));
}

export function seekAudio(id, event) {
  const el = rowOf(id);
  if (!el) return;
  if (!current || current.id !== id) toggleAudio(id);
  const rect = event.currentTarget.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const seek = () => {
    const dur = audio.duration || Number(el.dataset.duration) || 0;
    if (dur) audio.currentTime = p * dur;
  };
  if (audio.readyState >= 1) seek();
  else audio.addEventListener('loadedmetadata', seek, { once: true });
}
