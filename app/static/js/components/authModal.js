/**
 * ====================================================================
 * COMPONENT: AUTH MODAL (QR-Code Login & Phone Verification)
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

const SPINNER = '<span class="inline-block animate-spin text-sm mr-1"><i class="icon icon-reload-arrows"></i></span>';

export function openAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchAuthTab('qr');
}

export function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  api.cancelQR();
}

export function switchAuthTab(tab) {
  const qrTab = document.getElementById('auth-tab-qr');
  const phoneTab = document.getElementById('auth-tab-phone');
  const qrPane = document.getElementById('auth-qr-pane');
  const phonePane = document.getElementById('auth-phone-pane');
  const active = 'flex-1 pb-2.5 text-xs font-semibold text-[#3390ec] border-b-2 border-[#3390ec] flex items-center justify-center gap-1.5';
  const idle = 'flex-1 pb-2.5 text-xs font-semibold text-[#8a8a90] hover:text-white flex items-center justify-center gap-1.5';

  if (tab === 'qr') {
    qrTab.className = active;
    phoneTab.className = idle;
    qrPane.classList.remove('hidden');
    phonePane.classList.add('hidden');
    generateQRLogin();
  } else {
    phoneTab.className = active;
    qrTab.className = idle;
    phonePane.classList.remove('hidden');
    qrPane.classList.add('hidden');
    api.cancelQR();
    resetPhoneSteps();
  }
}

function resetPhoneSteps() {
  ['step-code', 'step-password'].forEach((id) => document.getElementById(id).classList.add('hidden'));
  document.getElementById('step-phone').classList.remove('hidden');
  ['phone-error', 'code-error', 'password-error'].forEach((id) => document.getElementById(id).classList.add('hidden'));
}

function onLoggedIn(user, message) {
  state.isAuth = true;
  state.user = user;
  window.TelegramX.updateAuthUI();
  window.TelegramX.updateSettingsView();
  closeAuthModal();
  showToast(message);
  window.TelegramX.refreshFeed();
}

function showError(id, text) {
  const el = document.getElementById(id);
  el.innerText = text;
  el.classList.remove('hidden');
}

function renderQR(url) {
  const container = document.getElementById('qr-container');
  container.innerHTML = '';
  new QRCode(container, {
    text: url,
    width: 186,
    height: 186,
    colorDark: '#0e1621',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

export async function generateQRLogin() {
  const container = document.getElementById('qr-container');
  document.getElementById('qr-display-box').classList.remove('hidden');
  document.getElementById('qr-2fa-container').classList.add('hidden');
  container.innerHTML = `<div class="text-slate-500 text-xs flex flex-col items-center gap-2"><span class="inline-block animate-spin text-[#3390ec] text-xl"><i class="icon icon-reload-arrows"></i></span>Подключение к Telegram...</div>`;

  api.cancelQR();
  const res = await api.startQR(renderQR);

  if (res.status === 'success') {
    onLoggedIn(res.user, 'Вход через QR выполнен! 🎉');
  } else if (res.status === '2fa_needed') {
    showQR2FA();
  } else if (res.status === 'error') {
    container.innerHTML = `<div class="text-red-500 text-xs text-center px-2"></div>`;
    container.firstChild.innerText = res.message || 'Ошибка подключения';
  }
}

export function showQR2FA() {
  document.getElementById('qr-display-box').classList.add('hidden');
  const box = document.getElementById('qr-2fa-container');
  box.classList.remove('hidden');
  box.classList.add('flex');
  document.getElementById('qr-password-input').focus();
}

async function submitPassword(inputId, errorId, btnId) {
  const password = document.getElementById(inputId).value;
  const btn = document.getElementById(btnId);
  document.getElementById(errorId).classList.add('hidden');
  if (!password) return showError(errorId, 'Введите облачный пароль');

  btn.innerHTML = `${SPINNER} Проверка...`;
  const res = await api.signInPassword(password);
  btn.innerText = 'Подтвердить вход';

  if (res.status === 'success') onLoggedIn(res.user, 'Вход успешно выполнен ✨');
  else showError(errorId, res.message || 'Неверный пароль');
}

export function submitQRPassword() {
  return submitPassword('qr-password-input', 'qr-2fa-error', 'btn-qr-password');
}

export function submitPhonePassword() {
  return submitPassword('password-input', 'password-error', 'btn-submit-password');
}

export async function sendPhoneCode() {
  const phone = document.getElementById('phone-input').value.trim();
  const btn = document.getElementById('btn-send-code');
  document.getElementById('phone-error').classList.add('hidden');
  if (!phone) return showError('phone-error', 'Введите номер телефона в международном формате (+7...)');

  btn.innerHTML = `${SPINNER} Отправка...`;
  const res = await api.requestCode(phone);
  btn.innerText = 'Получить код';

  if (res.status === 'code_sent') {
    document.getElementById('step-phone').classList.add('hidden');
    document.getElementById('step-code').classList.remove('hidden');
    document.getElementById('code-input').focus();
  } else {
    showError('phone-error', res.message || 'Ошибка отправки кода');
  }
}

export async function submitPhoneCode() {
  const code = document.getElementById('code-input').value.trim();
  const btn = document.getElementById('btn-submit-code');
  document.getElementById('code-error').classList.add('hidden');
  if (!code) return showError('code-error', 'Введите полученный код');

  btn.innerHTML = `${SPINNER} Проверка...`;
  const res = await api.signInCode(code);
  btn.innerText = 'Войти';

  if (res.status === 'success') {
    onLoggedIn(res.user, 'Авторизация успешна! Добро пожаловать ✨');
  } else if (res.status === '2fa_needed') {
    document.getElementById('step-code').classList.add('hidden');
    document.getElementById('step-password').classList.remove('hidden');
    document.getElementById('password-input').focus();
  } else {
    showError('code-error', res.message || 'Неверный код');
  }
}
