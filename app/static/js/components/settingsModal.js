/**
 * ====================================================================
 * COMPONENT: TELEGRAM SETTINGS MODAL (Full-Featured Native Window)
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';
import { parseEmojis } from '../emoji.js';

export function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  updateSettingsView();
}

export function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

export function updateSettingsView() {
  const u = state.user;
  const nameEl = document.getElementById('modal-settings-name');
  const subEl = document.getElementById('modal-settings-sub');
  const avatarBox = document.getElementById('modal-settings-avatar');
  const accTitle = document.getElementById('modal-account-name');
  const accPhone = document.getElementById('modal-account-phone');

  if (state.isAuth && u) {
    const name = u.name || 'Пользователь';
    const phone = u.phone ? (u.phone.startsWith('+') ? u.phone : `+${u.phone}`) : '';
    const username = u.username ? `@${u.username}` : '';
    const sub = [phone, username].filter(Boolean).join(' • ') || 'В сети';

    if (nameEl) nameEl.innerHTML = parseEmojis(name);
    if (subEl) subEl.innerText = sub;
    if (accTitle) accTitle.innerHTML = parseEmojis(name);
    if (accPhone) accPhone.innerText = sub;

    if (avatarBox) {
      if (u.avatar) {
        avatarBox.innerHTML = `<img src="${u.avatar}" class="w-full h-full object-cover" />`;
      } else {
        avatarBox.innerHTML = `<div class="w-full h-full bg-[#3390ec] flex items-center justify-center text-white font-bold text-xl">${name.charAt(0).toUpperCase()}</div>`;
      }
    }
  } else {
    if (nameEl) nameEl.innerText = 'Не авторизован';
    if (subEl) subEl.innerText = 'Войдите в Telegram';
    if (accTitle) accTitle.innerText = 'Гостевой режим';
    if (accPhone) accPhone.innerText = 'Нажмите, чтобы войти';
    if (avatarBox) {
      avatarBox.innerHTML = `<i class="icon icon-user text-2xl text-slate-400"></i>`;
    }
  }
}
