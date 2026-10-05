/**
 * ====================================================================
 * COMPONENT: LOGIN — the Telegram for Android sign-in flow, full screen:
 *   phone number → code (5 boxes) → cloud password (2FA); QR as an alternative.
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHtml } from '../utils.js';
import { COUNTRIES, countryByCode, formatNational, prettyPhone } from './countries.js';
import { t } from '../i18n.js';

const CODE_LEN = 5;

const ICON = {
  back: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H4M10 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M14 6l6 6-6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  eye: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7c2 0 3.8.7 5.3 1.7M22 12s-3.6 7-10 7c-2 0-3.8-.7-5.3-1.7"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>',
  spinner: '<svg class="tx-auth-spin" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9" /></svg>',
  // Phone + laptop with "***" — the picture Telegram shows while it waits for the code.
  device: `<svg viewBox="0 0 300 160" width="270" height="144" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M70 28h160a12 12 0 0 1 12 12v90H70z"/><path d="M60 132h196a6 6 0 0 1 0 12H78"/>
    <rect x="14" y="52" width="58" height="92" rx="12" fill="#1a1a1a"/>
    <rect x="148" y="48" width="62" height="40" rx="10" fill="#7b8be0" stroke="none"/><path d="M164 88l-6 12 18-12" fill="#7b8be0" stroke="#7b8be0"/>
    <text x="179" y="78" text-anchor="middle" font-family="Roboto, Arial, sans-serif" font-weight="900" font-size="34" fill="#111" stroke="none">***</text></svg>`,
};

const root = () => document.getElementById('auth-modal');
const $ = (sel) => root().querySelector(sel);

const flow = { step: 'phone', country: null, code: '', phone: '', busy: false, resendAt: 0 };

// ---------------------------------------------------------------- shell

export function openAuthModal() {
  const el = root();
  el.classList.remove('tx-hidden');
  document.body.classList.add('tx-auth-open');
  bindViewport();
  showPhone();
}

export function closeAuthModal() {
  const el = root();
  el.classList.add('tx-hidden');
  document.body.classList.remove('tx-auth-open');
  api.cancelQR();
  el.innerHTML = '';
}

// Keep the screen (and the round button) above the on-screen keyboard.
let vpBound = false;
function bindViewport() {
  if (vpBound || !window.visualViewport) return;
  vpBound = true;
  const apply = () => {
    const vv = window.visualViewport;
    const el = root();
    if (!el) return;
    el.style.setProperty('--tx-auth-h', `${Math.round(vv.height)}px`);
    el.style.setProperty('--tx-auth-top', `${Math.round(vv.offsetTop)}px`);
  };
  window.visualViewport.addEventListener('resize', apply);
  window.visualViewport.addEventListener('scroll', apply);
  apply();
}

function screen(step, inner, { back = true, fab = true } = {}) {
  flow.step = step;
  const el = root();
  el.innerHTML = `
    <div class="tx-auth-screen" data-step="${step}">
      ${back ? `<button class="tx-auth-back" aria-label="${t('Назад')}" onclick="window.TelegramX.authBack()">${ICON.back}</button>` : ''}
      <div class="tx-auth-body">${inner}</div>
      ${fab ? `<button class="tx-auth-fab" id="auth-fab" aria-label="${t('Далее')}" onclick="window.TelegramX.authNext()">${ICON.next}</button>` : ''}
    </div>`;
  el.querySelector('.tx-auth-screen').animate([{ opacity: 0, transform: 'translateX(28px)' }, { opacity: 1, transform: 'none' }],
    { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
}

function setBusy(on) {
  flow.busy = on;
  const fab = document.getElementById('auth-fab');
  if (fab) fab.innerHTML = on ? ICON.spinner : ICON.next;
}

function setError(text) {
  const e = $('.tx-auth-error');
  if (!e) return;
  e.textContent = text || '';
  e.classList.toggle('is-shown', !!text);
}

// ---------------------------------------------------------------- phone

function showPhone() {
  screen('phone', `
    <h1 class="tx-auth-title">${t('Номер телефона')}</h1>
    <p class="tx-auth-sub">${t('Проверьте код страны и введите свой номер телефона.')}</p>
    <button class="tx-auth-field tx-auth-country" id="auth-country" onclick="window.TelegramX.authPickCountry()">
      <span class="tx-auth-country-name">${t('Страна')}</span>${ICON.chevron}
    </button>
    <label class="tx-auth-field tx-auth-phone" id="auth-phone-box">
      <span class="tx-auth-float">${t('Номер телефона')}</span>
      <span class="tx-auth-plus">+</span>
      <input id="auth-code-in" class="tx-auth-code-in" inputmode="numeric" autocomplete="tel-country-code" maxlength="4" aria-label="${t('Код страны')}">
      <i class="tx-auth-div"></i>
      <input id="auth-num-in" class="tx-auth-num-in" type="tel" inputmode="numeric" autocomplete="tel-national" aria-label="${t('Номер телефона')}">
    </label>
    <div class="tx-auth-error"></div>
    <button class="tx-auth-link" onclick="window.TelegramX.authQr()">${t('Войти по QR-коду')}</button>`);

  const codeIn = $('#auth-code-in');
  const numIn = $('#auth-num-in');
  const box = $('#auth-phone-box');
  const sync = () => {
    const c = flow.country;
    $('#auth-country .tx-auth-country-name').textContent = c ? `${c[0]}  ${c[1]}` : t('Страна');
    $('#auth-country').classList.toggle('has-value', !!c);
  };
  codeIn.addEventListener('input', () => {
    codeIn.value = codeIn.value.replace(/\D/g, '');
    flow.country = countryByCode(codeIn.value) || null;
    sync();
    if (flow.country && codeIn.value === flow.country[2]) numIn.focus();
  });
  numIn.addEventListener('input', () => {
    const digits = numIn.value.replace(/\D/g, '');
    numIn.value = formatNational(codeIn.value, digits);
  });
  numIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authNext();
    if (e.key === 'Backspace' && !numIn.value) { e.preventDefault(); codeIn.focus(); }
  });
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') numIn.focus(); });
  for (const input of [codeIn, numIn]) {
    input.addEventListener('focus', () => box.classList.add('is-focus'));
    input.addEventListener('blur', () => box.classList.remove('is-focus'));
  }
  // Pasting a whole "+7 950 …" number into either field.
  const paste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const digits = text.replace(/\D/g, '');
    if (digits.length < 7) return;
    e.preventDefault();
    const c = countryByCode(digits);
    if (c) {
      flow.country = c;
      codeIn.value = c[2];
      numIn.value = formatNational(c[2], digits.slice(c[2].length));
      sync();
    }
  };
  codeIn.addEventListener('paste', paste);
  numIn.addEventListener('paste', paste);

  if (flow.country) { codeIn.value = flow.country[2]; sync(); setTimeout(() => numIn.focus(), 60); } else setTimeout(() => codeIn.focus(), 60);
}

export function authPickCountry() {
  const sheet = document.createElement('div');
  sheet.className = 'tx-auth-picker';
  sheet.innerHTML = `
    <div class="tx-auth-picker-top">
      <button class="tx-auth-back" aria-label="${t('Назад')}" onclick="this.closest('.tx-auth-picker').remove()">${ICON.back}</button>
      <input class="tx-auth-search" placeholder="${t('Страна')}" autocomplete="off">
    </div>
    <div class="tx-auth-list"></div>`;
  root().appendChild(sheet);
  const list = sheet.querySelector('.tx-auth-list');
  const draw = (q) => {
    const s = q.trim().toLowerCase();
    list.innerHTML = COUNTRIES.filter((c) => !s || c[1].toLowerCase().includes(s) || c[2].startsWith(s.replace('+', '')))
      .map((c) => `<button class="tx-auth-row" data-i="${COUNTRIES.indexOf(c)}"><span class="tx-auth-flag">${c[0]}</span><span class="tx-auth-rname">${escapeHtml(c[1])}</span><span class="tx-auth-rcode">+${c[2]}</span></button>`).join('');
  };
  draw('');
  sheet.querySelector('.tx-auth-search').addEventListener('input', (e) => draw(e.target.value));
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.tx-auth-row');
    if (!row) return;
    flow.country = COUNTRIES[Number(row.dataset.i)];
    sheet.remove();
    const codeIn = $('#auth-code-in');
    codeIn.value = flow.country[2];
    codeIn.dispatchEvent(new Event('input'));
    $('#auth-num-in').focus();
  });
  sheet.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
  sheet.querySelector('.tx-auth-search').focus();
}

async function sendPhone(forceSms = false) {
  const code = $('#auth-code-in') ? $('#auth-code-in').value : flow.phone.code;
  const num = $('#auth-num-in') ? $('#auth-num-in').value.replace(/\D/g, '') : flow.phone.num;
  if (!code || num.length < 6) {
    setError(t('Введите номер телефона полностью'));
    return false;
  }
  flow.phone = { code, num };
  setError('');
  setBusy(true);
  const res = await api.requestCode(`+${code}${num}`, forceSms);
  setBusy(false);
  if (res.status === 'code_sent') {
    flow.viaApp = res.via_app !== false;
    flow.resendAt = Date.now() + 60000;
    return true;
  }
  setError(res.message || t('Не удалось отправить код'));
  return false;
}

// ---------------------------------------------------------------- code

function showCode() {
  const pretty = prettyPhone(`+${flow.phone.code}${flow.phone.num}`).replace(/ /g, '\u00a0');
  const how = flow.viaApp
    ? t('Мы отправили код через <b>Telegram</b> на другое устройство, где авторизован {a}.', {a: escapeHtml(pretty)})
    : t('Мы отправили SMS с кодом на номер {a}.', {a: escapeHtml(pretty)});
  screen('code', `
    <div class="tx-auth-art">${ICON.device}</div>
    <h1 class="tx-auth-title">${flow.viaApp ? t('Проверьте сообщения в Telegram') : t('Введите код')}</h1>
    <p class="tx-auth-sub">${how}</p>
    <div class="tx-auth-boxes" id="auth-boxes">${Array.from({ length: CODE_LEN }, () => '<i class="tx-auth-box"></i>').join('')}</div>
    <input id="auth-code-hidden" class="tx-auth-hidden-in" inputmode="numeric" autocomplete="one-time-code" maxlength="${CODE_LEN}" aria-label="${t('Код')}">
    <div class="tx-auth-error is-center"></div>
    <button class="tx-auth-link" id="auth-resend" onclick="window.TelegramX.authResend()">${t('Не получили код?')}</button>`, { fab: false });
  const input = $('#auth-code-hidden');
  const boxes = [...document.querySelectorAll('#auth-boxes .tx-auth-box')];
  const paint = () => {
    const v = input.value;
    boxes.forEach((b, i) => {
      b.textContent = v[i] || '';
      b.classList.toggle('is-active', i === Math.min(v.length, CODE_LEN - 1) && document.activeElement === input);
      b.classList.toggle('is-filled', !!v[i]);
    });
  };
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, CODE_LEN);
    flow.code = input.value;
    setError('');
    paint();
    if (input.value.length === CODE_LEN) submitCode();
  });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', paint);
  $('#auth-boxes').addEventListener('click', () => input.focus());
  setTimeout(() => { input.focus(); paint(); }, 60);
}

async function submitCode() {
  if (flow.busy) return;
  flow.busy = true;
  const boxes = $('#auth-boxes');
  boxes.classList.add('is-busy');
  const res = await api.signInCode(flow.code);
  flow.busy = false;
  boxes.classList.remove('is-busy');
  if (res.status === 'success') return onLoggedIn(res.user, t('Добро пожаловать!'));
  if (res.status === '2fa_needed') return showPassword();
  setError(res.message || t('Неверный код'));
  boxes.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }], { duration: 300 });
  const input = $('#auth-code-hidden');
  input.value = '';
  flow.code = '';
  document.querySelectorAll('#auth-boxes .tx-auth-box').forEach((b, i) => {
    b.textContent = '';
    b.classList.remove('is-filled');
    b.classList.toggle('is-active', i === 0);
  });
  input.focus();
}

export async function authResend() {
  const link = $('#auth-resend');
  if (!link || flow.busy) return;
  const wait = Math.ceil((flow.resendAt - Date.now()) / 1000);
  if (wait > 0) {
    showToast(t('Повторно запросить код можно через {a} с', {a: wait}));
    return;
  }
  link.textContent = t('Отправляем…');
  const ok = await sendPhone(flow.viaApp); // first resend goes out as an SMS
  if (ok) {
    showCode();
    showToast(flow.viaApp ? t('Код отправлен ещё раз') : t('Код отправлен по SMS'));
  } else {
    link.textContent = t('Не получили код?');
  }
}

// ---------------------------------------------------------------- password

function showPassword() {
  screen('password', `
    <h1 class="tx-auth-title">${t('Ваш пароль')}</h1>
    <p class="tx-auth-sub">${t('Включена двухэтапная аутентификация, ваш аккаунт защищён дополнительным паролем.')}</p>
    <label class="tx-auth-field tx-auth-pass is-focus" id="auth-pass-box">
      <span class="tx-auth-float">${t('Пароль')}</span>
      <input id="auth-pass-in" type="password" autocomplete="current-password" aria-label="${t('Пароль')}">
      <button type="button" class="tx-auth-eye" id="auth-eye" aria-label="${t('Показать пароль')}">${ICON.eye}</button>
    </label>
    <div class="tx-auth-error"></div>`);
  const input = $('#auth-pass-in');
  $('#auth-eye').addEventListener('click', (e) => {
    e.preventDefault();
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('#auth-eye').innerHTML = show ? ICON.eyeOff : ICON.eye;
    input.focus();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') authNext(); });
  input.addEventListener('input', () => setError(''));
  setTimeout(() => input.focus(), 60);
}

async function submitPassword() {
  const password = $('#auth-pass-in').value;
  if (!password) return setError(t('Введите пароль'));
  setBusy(true);
  const res = await api.signInPassword(password);
  setBusy(false);
  if (res.status === 'success') onLoggedIn(res.user, t('Добро пожаловать!'));
  else setError(res.message || t('Неверный пароль'));
}

// ---------------------------------------------------------------- QR

export function authQr() {
  screen('qr', `
    <h1 class="tx-auth-title">${t('Вход по QR-коду')}</h1>
    <p class="tx-auth-sub">${t('Откройте Telegram на телефоне: <b>Настройки → Устройства → Подключить устройство</b> и наведите камеру на код.')}</p>
    <div class="tx-auth-qr" id="qr-container"><span class="tx-auth-qr-wait">${ICON.spinner}</span></div>
    <div class="tx-auth-error is-center"></div>
    <button class="tx-auth-link" onclick="window.TelegramX.authBack()">${t('Войти по номеру телефона')}</button>`, { fab: false });
  generateQRLogin();
}

function renderQR(url) {
  const container = document.getElementById('qr-container');
  if (!container) return;
  container.innerHTML = '';
  new QRCode(container, { text: url, width: 220, height: 220, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

export async function generateQRLogin() {
  api.cancelQR();
  const res = await api.startQR(renderQR);
  if (flow.step !== 'qr') return;
  if (res.status === 'success') onLoggedIn(res.user, t('Добро пожаловать!'));
  else if (res.status === '2fa_needed') showPassword();
  else if (res.status === 'error') setError(res.message || t('Ошибка подключения'));
}

// ---------------------------------------------------------------- navigation

export function authBack() {
  if (flow.step === 'phone') return closeAuthModal();
  if (flow.step === 'qr') api.cancelQR();
  showPhone();
}

export async function authNext() {
  if (flow.busy) return;
  if (flow.step === 'phone') {
    if (await sendPhone(false)) showCode();
  } else if (flow.step === 'password') {
    submitPassword();
  }
}

function onLoggedIn(user, message) {
  state.isAuth = true;
  state.user = user;
  window.TelegramX.updateAuthUI();
  window.TelegramX.updateSettingsView();
  closeAuthModal();
  showToast(message);
  window.TelegramX.refreshFeed().then(() => window.TelegramX.startLive());
}

// Kept for older callers.
export const switchAuthTab = (tab) => (tab === 'qr' ? authQr() : showPhone());
export const sendPhoneCode = authNext;
export const submitPhoneCode = submitCode;
export const submitPhonePassword = submitPassword;
export const submitQRPassword = submitPassword;
export const showQR2FA = showPassword;
