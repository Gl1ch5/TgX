/**
 * ====================================================================
 * COMPONENT: AUTH MODAL (QR-Code Login & Phone Verification)
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

export function openAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchAuthTab('qr');
  generateQRLogin();
}

export function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  if (state.qrCheckInterval) {
    clearInterval(state.qrCheckInterval);
    state.qrCheckInterval = null;
  }
}

export function switchAuthTab(tab) {
  const qrTab = document.getElementById('auth-tab-qr');
  const phoneTab = document.getElementById('auth-tab-phone');
  const qrPane = document.getElementById('auth-qr-pane');
  const phonePane = document.getElementById('auth-phone-pane');

  if (tab === 'qr') {
    qrTab.className = 'flex-1 pb-3 text-sm font-semibold text-[#3390ec] border-b-2 border-[#3390ec] flex items-center justify-center gap-2';
    phoneTab.className = 'flex-1 pb-3 text-sm font-semibold text-[#8a8a90] hover:text-white flex items-center justify-center gap-2';
    qrPane.classList.remove('hidden');
    phonePane.classList.add('hidden');
  } else {
    phoneTab.className = 'flex-1 pb-3 text-sm font-semibold text-[#3390ec] border-b-2 border-[#3390ec] flex items-center justify-center gap-2';
    qrTab.className = 'flex-1 pb-3 text-sm font-semibold text-[#8a8a90] hover:text-white flex items-center justify-center gap-2';
    phonePane.classList.remove('hidden');
    qrPane.classList.add('hidden');
  }
}

export async function generateQRLogin() {
  const container = document.getElementById('qr-container');
  const qrDisplayBox = document.getElementById('qr-display-box');
  const qr2faBox = document.getElementById('qr-2fa-container');
  
  qrDisplayBox.classList.remove('hidden');
  qr2faBox.classList.add('hidden');
  container.innerHTML = `<div class="text-slate-500 text-xs flex flex-col items-center gap-2"><span class="inline-block animate-spin text-[#3390ec] text-xl"><i class="icon icon-reload-arrows"></i></span>Генерация QR...</div>`;

  try {
    const data = await api.startQR();
    
    if (data.status === 'already_authorized') {
      state.isAuth = true;
      state.user = data.user;
      window.TelegramX.updateAuthUI();
      closeAuthModal();
      showToast('Вы уже авторизованы!');
      window.TelegramX.refreshFeed();
      return;
    }

    if (data.status === '2fa_needed') {
      showQR2FA();
      return;
    }

    if (data.url) {
      container.innerHTML = '';
      new QRCode(container, {
        text: data.url,
        width: 200,
        height: 200,
        colorDark: '#0e1621',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });

      if (state.qrCheckInterval) clearInterval(state.qrCheckInterval);
      state.qrCheckInterval = setInterval(checkQRStatus, 2000);
    }
  } catch (e) {
    console.error('QR start error', e);
  }
}

export function showQR2FA() {
  if (state.qrCheckInterval) {
    clearInterval(state.qrCheckInterval);
    state.qrCheckInterval = null;
  }
  document.getElementById('qr-display-box').classList.add('hidden');
  document.getElementById('qr-2fa-container').classList.remove('hidden');
  document.getElementById('qr-password-input').focus();
}

export async function submitQRPassword() {
  const password = document.getElementById('qr-password-input').value.trim();
  const errEl = document.getElementById('qr-2fa-error');
  const btn = document.getElementById('btn-qr-password');
  errEl.classList.add('hidden');

  if (!password) {
    errEl.innerText = 'Введите пароль двухфакторной аутентификации';
    errEl.classList.remove('hidden');
    return;
  }

  btn.innerHTML = `<span class="inline-block animate-spin text-sm mr-1"><i class="icon icon-reload-arrows"></i></span> Проверка...`;

  try {
    const data = await api.signInPassword(password);
    btn.innerText = 'Подтвердить вход';

    if (data.ok) {
      state.isAuth = true;
      state.user = data.user;
      window.TelegramX.updateAuthUI();
      closeAuthModal();
      showToast('Вход успешно выполнен ✨');
      window.TelegramX.refreshFeed();
    } else {
      errEl.innerText = data.error || 'Неверный пароль двухфакторной защиты';
      errEl.classList.remove('hidden');
    }
  } catch (e) {
    btn.innerText = 'Подтвердить вход';
    errEl.innerText = 'Ошибка соединения';
    errEl.classList.remove('hidden');
  }
}

export async function checkQRStatus() {
  try {
    const res = await fetch('/api/auth/qr-status');
    const data = await res.json();
    
    if (data.status === 'authorized') {
      if (state.qrCheckInterval) clearInterval(state.qrCheckInterval);
      state.isAuth = true;
      state.user = data.user;
      window.TelegramX.updateAuthUI();
      closeAuthModal();
      showToast('Вход через Telegram QR выполнен! 🎉');
      window.TelegramX.refreshFeed();
    } else if (data.status === '2fa_needed') {
      showQR2FA();
    } else if (data.status === 'expired') {
      generateQRLogin();
    }
  } catch (e) {
    console.error('QR check error', e);
  }
}

export async function sendPhoneCode() {
  const phone = document.getElementById('phone-input').value.trim();
  const errEl = document.getElementById('phone-error');
  const btn = document.getElementById('btn-send-code');
  errEl.classList.add('hidden');

  if (!phone) {
    errEl.innerText = 'Введите номер телефона в международном формате (+7...)';
    errEl.classList.remove('hidden');
    return;
  }

  btn.innerHTML = `<span class="inline-block animate-spin text-sm mr-1"><i class="icon icon-reload-arrows"></i></span> Отправка...`;

  try {
    const res = await api.sendCode(phone);
    btn.innerText = 'Получить код';

    if (res.ok) {
      document.getElementById('step-phone').classList.add('hidden');
      document.getElementById('step-code').classList.remove('hidden');
      document.getElementById('code-input').focus();
    } else {
      errEl.innerText = res.error || 'Ошибка отправки кода';
      errEl.classList.remove('hidden');
    }
  } catch (e) {
    btn.innerText = 'Получить код';
    errEl.innerText = 'Ошибка соединения';
    errEl.classList.remove('hidden');
  }
}

export async function submitPhoneCode() {
  const code = document.getElementById('code-input').value.trim();
  const errEl = document.getElementById('code-error');
  const btn = document.getElementById('btn-submit-code');
  errEl.classList.add('hidden');

  if (!code) {
    errEl.innerText = 'Введите полученный код';
    errEl.classList.remove('hidden');
    return;
  }

  btn.innerHTML = `<span class="inline-block animate-spin text-sm mr-1"><i class="icon icon-reload-arrows"></i></span> Проверка...`;

  try {
    const res = await api.signInCode(code);
    btn.innerText = 'Войти';

    if (res.ok) {
      state.isAuth = true;
      state.user = res.user;
      window.TelegramX.updateAuthUI();
      closeAuthModal();
      showToast('Авторизация успешна! Добро пожаловать ✨');
      window.TelegramX.refreshFeed();
    } else if (res.status === '2fa_needed') {
      document.getElementById('step-code').classList.add('hidden');
      document.getElementById('step-password').classList.remove('hidden');
      document.getElementById('password-input').focus();
    } else {
      errEl.innerText = res.error || 'Неверный код';
      errEl.classList.remove('hidden');
    }
  } catch (e) {
    btn.innerText = 'Войти';
    errEl.innerText = 'Ошибка соединения';
    errEl.classList.remove('hidden');
  }
}

export async function submitPhonePassword() {
  const password = document.getElementById('password-input').value.trim();
  const errEl = document.getElementById('password-error');
  const btn = document.getElementById('btn-submit-password');
  errEl.classList.add('hidden');

  if (!password) {
    errEl.innerText = 'Введите пароль двухфакторной аутентификации';
    errEl.classList.remove('hidden');
    return;
  }

  btn.innerHTML = `<span class="inline-block animate-spin text-sm mr-1"><i class="icon icon-reload-arrows"></i></span> Проверка...`;

  try {
    const res = await api.signInPassword(password);
    btn.innerText = 'Подтвердить вход';

    if (res.ok) {
      state.isAuth = true;
      state.user = res.user;
      window.TelegramX.updateAuthUI();
      closeAuthModal();
      showToast('Авторизация успешна! ✨');
      window.TelegramX.refreshFeed();
    } else {
      errEl.innerText = res.error || 'Неверный пароль';
      errEl.classList.remove('hidden');
    }
  } catch (e) {
    btn.innerText = 'Подтвердить вход';
    errEl.innerText = 'Ошибка соединения';
    errEl.classList.remove('hidden');
  }
}
