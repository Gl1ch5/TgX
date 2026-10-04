/**
 * ====================================================================
 * COMPONENT: SETTINGS & PROFILE PANES (Telegram Android style)
 * ====================================================================
 */

import { state } from '../state.js';
import { parseEmojis } from '../emoji.js';
import { formatPhone } from '../utils.js';
import { avatarHtml } from './avatar.js';
import { WALLPAPERS } from './wallpaperTheme.js';

export function openSettingsModal() {
  window.TelegramX.setView('settings');
}

export function closeSettingsModal() {
  if (document.getElementById('app')?.dataset.view === 'settings') window.TelegramX.setView('wall');
}

function setAvatar(id, peer, size) {
  const el = document.getElementById(id);
  if (!el) return;
  const tmp = document.createElement('span');
  tmp.innerHTML = avatarHtml(peer, size);
  const fresh = tmp.firstElementChild;
  fresh.id = id;
  el.replaceWith(fresh);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

export function updateSettingsView() {
  const u = state.isAuth ? state.user : null;
  const name = u ? u.name || 'Пользователь' : 'Гость';
  const phone = u && u.phone ? formatPhone(u.phone) : '';
  const username = u && u.username ? `@${u.username}` : '';
  const sub = u ? [phone, username].filter(Boolean).join(' • ') || 'в сети' : 'Войдите в Telegram';

  ['settings-name', 'profile-name'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = parseEmojis(name) + (u && u.premium ? ' <i class="icon icon-star" style="color:#a77bff;font-size:20px"></i>' : '');
  });
  setText('settings-sub', sub);
  setText('profile-sub', u ? (username || phone) : 'Войдите, чтобы читать свои каналы');
  setText('profile-phone', phone || '—');
  setText('profile-username', username || '—');

  if (u) {
    setAvatar('settings-avatar', u, 'xl');
    setAvatar('profile-avatar', u, 'xl');
    setAvatar('dock-user-avatar', u, '');
  } else {
    ['settings-avatar', 'profile-avatar'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<i class="icon icon-user"></i>';
    });
    const dock = document.getElementById('dock-user-avatar');
    if (dock) dock.innerHTML = '<i class="icon icon-user" style="font-size:15px"></i>';
  }

  document.getElementById('profile-guest')?.classList.toggle('tx-hidden', !!u);
  document.getElementById('profile-account')?.classList.toggle('tx-hidden', !u);

  let favCount = 0;
  try { favCount = Object.keys(JSON.parse(localStorage.getItem('telex.favorites') || '{}')).length; } catch {}
  setText('profile-fav-count', favCount ? String(favCount) : '');

  let wpName = '';
  try {
    const id = localStorage.getItem('tgx_wallpaper');
    wpName = (WALLPAPERS.find((w) => w.id === id) || WALLPAPERS[0]).name;
  } catch {}
  setText('settings-wallpaper-name', wpName || 'Узоры Telegram');
}
