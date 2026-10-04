/**
 * ====================================================================
 * APPLE EMOJI (the set Telegram renders), served from emoji/apple/64/
 * ====================================================================
 */

import { EMOJI_SAME, EMOJI_ALIASES } from './emoji-data.js';

const EMOJI_BASE = 'emoji/apple/64/';
const KNOWN = new Set(EMOJI_SAME.split('\u0000'));

export const TELEGRAM_REACTIONS = [
  '👍', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '🤬',
  '😢', '🎉', '🤩', '🤮', '💩', '🙏', '👌', '🕊️', '🤡', '🥱',
  '🥴', '😍', '🐳', '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡', '🍌',
  '🏆', '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈', '😴',
  '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈', '😇', '😨', '🤝',
  '✍️', '🤗', '🫡', '🎅', '🎄', '☃️', '💅', '🤪', '🗿', '🆒',
  '💘', '🙉', '🦄', '😘', '💊', '🙊', '😎', '👾', '🤷‍♂️', '🤷‍♀️', '😡'
];

export const EMOJI_PICKER_LIST = TELEGRAM_REACTIONS;

// Flags, keycaps, and pictographic sequences (ZWJ, skin tones, VS16)
const EMOJI_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?)*/gu;

function stemOf(str) {
  if (!str) return null;
  if (EMOJI_ALIASES[str]) return EMOJI_ALIASES[str];
  if (KNOWN.has(str)) return Array.from(str, (c) => c.codePointAt(0).toString(16)).join('-');
  const bare = str.replace(/\uFE0F/g, '');
  if (bare !== str) return stemOf(bare);
  return null;
}

/** Image filename for an emoji, or null when Apple has no image for it */
export function getEmojiFilename(emojiStr) {
  const stem = stemOf(emojiStr);
  return stem ? `${stem}.png` : null;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML for a single emoji (Apple image, or the native glyph when unknown) */
export function renderEmoji(emojiChar, extraClass = 'emoji-small') {
  const safe = escapeHtml(emojiChar);
  const filename = getEmojiFilename(emojiChar);
  if (!filename) return `<span class="emoji-native">${safe}</span>`;
  return `<img class="emoji ${extraClass}" src="${EMOJI_BASE}${filename}" alt="${safe}" draggable="false" decoding="async" onerror="this.replaceWith(this.alt)" />`;
}

/** Replaces emojis inside already-safe HTML (text nodes only, never inside tags) */
export function emojifyHtml(html) {
  if (!html) return '';
  return html
    .split(/(<[^>]*>)/g)
    .map((part) => (part.startsWith('<') ? part : part.replace(EMOJI_REGEX, (m) => (getEmojiFilename(m) ? renderEmoji(m) : m))))
    .join('');
}

/** Escapes plain text and replaces emojis with Apple emoji images */
export function parseEmojis(text) {
  if (!text) return '';
  return emojifyHtml(escapeHtml(text));
}
