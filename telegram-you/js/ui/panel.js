// Emoji / GIF / Stickers panel under the composer (Telegram for Android layout).
import { t, escapeHtml } from './store.js';
import { I } from './icons.js';
import { EMOJI_PICKER_LIST } from '../emoji.js';

const GROUPS = [
  ['😀', ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬']],
  ['👍', ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐', '🖖', '👋', '🤝', '👏', '🙌', '👐', '🤲', '🙏', '✍️', '💪', '🦾', '🧠', '👀', '👅', '👄', '💋', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝']],
  ['🐱', ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍', '🦎', '🐙', '🦑', '🦀', '🐠', '🐟', '🐬', '🐳', '🦈']],
  ['🍎', ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🥕', '🌽', '🥔', '🍞', '🧀', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🌮', '🍣', '🍜', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬', '🍭', '☕', '🍵', '🍺', '🍷', '🥂']],
  ['⚽', ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🥊', '🎯', '🎮', '🎲', '🎸', '🎹', '🥁', '🎧', '🎬', '🎨', '🏆', '🥇']],
  ['🚗', ['🚗', '🚕', '🚙', '🚌', '🏎', '🚓', '🚑', '🚒', '🚚', '🚲', '🛵', '🏍', '✈️', '🚀', '🛸', '🚁', '⛵', '🚢', '🏠', '🏢', '🌇', '🌃', '🌉']],
  ['💡', ['💡', '📱', '💻', '⌨️', '🖥', '🖨', '📷', '🎥', '📺', '⏰', '🔋', '🔌', '💰', '💳', '💎', '🔧', '🔨', '🔑', '🔒', '📌', '📎', '✏️', '📚', '🔥', '⭐', '🌟', '✨', '⚡', '🎉', '🎁']],
];

let tab = 'emoji';

export function closePanel() {
  const p = document.getElementById('cx-panel');
  if (p) { p.classList.add('tx-hidden'); p.innerHTML = ''; }
  const e = document.getElementById('cx-emo');
  if (e) e.innerHTML = I.smile;
}

export function toggleEmojiPanel(panel, input, btn, onChange) {
  if (!panel) return;
  if (!panel.classList.contains('tx-hidden')) {
    closePanel();
    input.focus();
    return;
  }
  input.blur();
  panel.classList.remove('tx-hidden');
  btn.innerHTML = I.keyboard;
  draw(panel, input, onChange);
}

function draw(panel, input, onChange) {
  const tabs = `<div class="tabs cx-pill"><button data-t="emoji" class="${tab === 'emoji' ? 'on' : ''}">${t('Эмодзи')}</button><button data-t="gif" class="${tab === 'gif' ? 'on' : ''}">GIF</button><button data-t="stickers" class="${tab === 'stickers' ? 'on' : ''}">${t('Стикеры')}</button></div>`;
  let body = '';
  if (tab === 'emoji') {
    const recent = EMOJI_PICKER_LIST.slice(0, 16);
    body = `<div class="cx-search" style="margin:8px 12px">${I.search}<input placeholder="${t('Поиск')}" id="cx-esearch" autocomplete="off"></div>
      <div class="grid" id="cx-egrid">${renderGrid(recent, GROUPS)}</div>`;
  } else {
    body = `<div class="cx-end" style="padding:40px 20px">${tab === 'gif' ? t('GIF скоро') : t('Стикеры скоро')}</div>`;
  }
  panel.innerHTML = `<div class="body">${body}</div>${tabs}`;
  panel.onclick = (e) => {
    const tb = e.target.closest('[data-t]');
    if (tb) { tab = tb.dataset.t; return draw(panel, input, onChange); }
    const em = e.target.closest('[data-e]');
    if (em) {
      const s = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, s) + em.dataset.e + input.value.slice(input.selectionEnd ?? s);
      input.setSelectionRange(s + em.dataset.e.length, s + em.dataset.e.length);
      onChange();
    }
    if (e.target.closest('[data-del]')) { input.value = Array.from(input.value).slice(0, -1).join(''); onChange(); }
  };
  const q = panel.querySelector('#cx-esearch');
  if (q) q.oninput = () => {
    const v = q.value.trim();
    panel.querySelector('#cx-egrid').innerHTML = v ? renderGrid(EMOJI_PICKER_LIST.filter((e) => e.includes(v)), []) : renderGrid(EMOJI_PICKER_LIST.slice(0, 16), GROUPS);
  };
}

function renderGrid(recent, groups) {
  const cell = (e) => `<button data-e="${e}">${e}</button>`;
  return (recent.length ? recent.map(cell).join('') : '')
    + groups.map(([, list]) => list.map(cell).join('')).join('')
    + '<button class="del" data-del="1" aria-label="Del">⌫</button>';
}
