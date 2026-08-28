/**
 * ====================================================================
 * TELEGRAM APPLE EMOJI ENGINE (100% Reliable, Fast & Native Fallback)
 * ====================================================================
 */

// Precise mapping of Telegram emojis to emoji-datasource-apple filenames
export const EMOJI_MAP = {
  '👍': '1f44d.png',
  '❤️': '2764-fe0f.png',
  '🔥': '1f525.png',
  '🥰': '1f970.png',
  '👏': '1f44f.png',
  '😁': '1f601.png',
  '🤔': '1f914.png',
  '🤯': '1f92f.png',
  '😱': '1f631.png',
  '🤬': '1f92c.png',
  '😢': '1f622.png',
  '🎉': '1f389.png',
  '🤩': '1f929.png',
  '🤮': '1f92e.png',
  '💩': '1f4a9.png',
  '🙏': '1f64f.png',
  '👌': '1f44c.png',
  '🕊️': '1f54a-fe0f.png',
  '🕊': '1f54a-fe0f.png',
  '🤡': '1f921.png',
  '🥱': '1f971.png',
  '🥴': '1f974.png',
  '😍': '1f60d.png',
  '🐳': '1f433.png',
  '❤️‍🔥': '2764-fe0f-200d-1f525.png',
  '🌚': '1f31a.png',
  '🌭': '1f32d.png',
  '💯': '1f4af.png',
  '🤣': '1f923.png',
  '⚡': '26a1.png',
  '🍌': '1f34c.png',
  '🏆': '1f3c6.png',
  '💔': '1f494.png',
  '🤨': '1f928.png',
  '😐': '1f610.png',
  '🍓': '1f353.png',
  '🍾': '1f37e.png',
  '💋': '1f48b.png',
  '🖕': '1f595.png',
  '😈': '1f608.png',
  '😴': '1f634.png',
  '😭': '1f62d.png',
  '🤓': '1f913.png',
  '👻': '1f47b.png',
  '👨‍💻': '1f468-200d-1f4bb.png',
  '👀': '1f440.png',
  '🎃': '1f383.png',
  '🙈': '1f648.png',
  '😇': '1f607.png',
  '😨': '1f628.png',
  '🤝': '1f91d.png',
  '✍️': '270d-fe0f.png',
  '✍': '270d-fe0f.png',
  '🤗': '1f917.png',
  '🫡': '1fae1.png',
  '🎅': '1f385.png',
  '🎄': '1f384.png',
  '☃️': '2603-fe0f.png',
  '☃': '2603-fe0f.png',
  '💅': '1f485.png',
  '🤪': '1f92a.png',
  '🗿': '1f5ff.png',
  '🆒': '1f192.png',
  '💘': '1f498.png',
  '🙉': '1f649.png',
  '🦄': '1f984.png',
  '😘': '1f618.png',
  '💊': '1f48a.png',
  '🙊': '1f64a.png',
  '😎': '1f60e.png',
  '👾': '1f47e.png',
  '🤷‍♂️': '1f937-200d-2642-fe0f.png',
  '🤷‍♀️': '1f937-200d-2640-fe0f.png',
  '😡': '1f621.png',
  '✨': '2728.png',
  '⭐': '2b50.png',
  '🌟': '1f31f.png',
  '🚀': '1f680.png',
  '📢': '1f4e2.png',
  '💬': '1f4ac.png',
  '📸': '1f4f8.png',
  '📹': '1f4f9.png',
  '🔒': '1f512.png',
  '🔑': '1f511.png'
};

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

/**
 * Returns hex filename for any Unicode emoji string
 */
export function getEmojiFilename(emojiStr) {
  if (!emojiStr) return null;
  if (EMOJI_MAP[emojiStr]) return EMOJI_MAP[emojiStr];

  const cleaned = emojiStr.replace(/\ufe0f/g, '');
  if (EMOJI_MAP[cleaned]) return EMOJI_MAP[cleaned];

  // Dynamic codepoints calculation
  const codes = [];
  for (let i = 0; i < emojiStr.length; i++) {
    const cp = emojiStr.codePointAt(i);
    if (cp > 0xffff) i++;
    codes.push(cp.toString(16));
  }
  return codes.join('-') + '.png';
}

/**
 * Returns HTML string of the Apple Telegram emoji with instant fallback
 */
export function renderEmoji(emojiChar, extraClass = 'emoji-small') {
  const filename = getEmojiFilename(emojiChar);
  if (!filename) {
    return `<span class="emoji-fallback" style="font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif;">${emojiChar}</span>`;
  }

  const cdnUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/${filename}`;

  return `<img class="emoji ${extraClass}" src="${cdnUrl}" alt="${emojiChar}" loading="lazy" decoding="async" draggable="false" onerror="this.outerHTML='${emojiChar}'" />`;
}

/**
 * Parses text and replaces unicode emojis with Apple emoji <img> tags
 */
export function parseEmojis(text) {
  if (!text) return '';

  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;

  return text.replace(emojiRegex, (match) => {
    return renderEmoji(match);
  });
}
