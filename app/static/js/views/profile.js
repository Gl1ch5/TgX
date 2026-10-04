/**
 * ====================================================================
 * VIEW: PROFILE — own profile like Telegram (avatar, name, phone,
 * username, bio, birthday)
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { escapeHtml, formatPhone } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { avatarHtml } from '../components/avatar.js';
import { titleBar, group, row } from '../components/ui.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
let full = null;

function birthday(b) {
  if (!b) return '';
  const text = `${b.day} ${MONTHS[b.month - 1]}${b.year ? ` ${b.year}` : ''}`;
  if (!b.year) return text;
  const now = new Date();
  let age = now.getFullYear() - b.year;
  if (now.getMonth() + 1 < b.month || (now.getMonth() + 1 === b.month && now.getDate() < b.day)) age -= 1;
  return `${text} (${age})`;
}

function favCount() {
  try { return Object.keys(JSON.parse(localStorage.getItem('telex.favorites') || '{}')).length; } catch { return 0; }
}

export function renderProfile() {
  const el = document.getElementById('profile-root');
  if (!el) return;
  const u = state.isAuth ? state.user : null;

  if (!u) {
    el.innerHTML = `
      ${titleBar('Профиль')}
      <div class="tx-page">
        <div class="tx-hero">
          <span class="tx-avatar xl tx-peer-5"><i class="icon icon-user" style="font-size:52px"></i></span>
          <div class="tx-hero-name">Гость</div>
          <div class="tx-hero-sub">Войдите, чтобы читать свои каналы</div>
        </div>
        ${group(row({ icon: 'user-filled', color: '#5a83f3', title: 'Войти в Telegram', sub: 'QR-код или номер телефона', onclick: 'window.TelegramX.openAuthModal()' }))}
      </div>`;
    return;
  }

  const info =
    (u.phone ? row({ title: escapeHtml(formatPhone(u.phone)), sub: 'Мобильный' }) : '') +
    (u.username ? row({ title: '@' + escapeHtml(u.username), sub: 'Имя пользователя', onclick: `window.TelegramX.copyPostLink('https://t.me/${escapeHtml(u.username)}')` }) : '') +
    (full && full.about ? row({ title: `<span style="white-space:normal">${parseEmojis(full.about)}</span>`, sub: 'О себе' }) : '') +
    (full && full.birthday ? row({ title: escapeHtml(birthday(full.birthday)), sub: 'День рождения' }) : '');

  const favs = favCount();
  el.innerHTML = `
    ${titleBar('', { actions: '<button class="tx-icon-btn" onclick="window.TelegramX.setView(\'settings\')" title="Настройки"><i class="icon icon-settings"></i></button>' })}
    <div class="tx-page">
      <div class="tx-hero">
        ${avatarHtml({ ...u, avatar: u.avatar_big || u.avatar }, 'xl')}
        <div class="tx-hero-name">${parseEmojis(u.name)}${u.premium ? ' <i class="icon icon-star" style="color:#a77bff;font-size:22px"></i>' : ''}</div>
        <div class="tx-hero-sub is-online">в сети</div>
      </div>
      ${info ? group(info, { title: 'Информация' }) : ''}
      ${group(
        row({ icon: 'favorite-filled', color: '#f5b72f', title: 'Закладки', value: favs ? String(favs) : '', onclick: 'window.TelegramX.openFavorites()' }) +
        row({ icon: 'logout', color: '#ff5b5b', title: 'Выйти', danger: true, onclick: 'window.TelegramX.logoutTelegram()' }),
      )}
    </div>`;
}

export async function enterProfile() {
  renderProfile();
  if (!state.isAuth || full) return;
  try {
    full = await api.getFullMe();
    renderProfile();
  } catch (e) {
    console.warn('[TeleX] full profile', e);
  }
}

export function resetProfile() {
  full = null;
}
