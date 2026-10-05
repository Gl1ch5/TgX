/**
 * ====================================================================
 * VIEW: PROFILE — own profile like Telegram for Android 12:
 * big avatar, name, "в сети", the three action buttons (photo / edit /
 * settings), info rows, and the "Публикации" grid of kept stories.
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { escapeHtml, escapeQuotes, formatPhone, showToast } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { avatarHtml } from '../components/avatar.js';
import { titleBar, group, row } from '../components/ui.js';
import { openPopup } from '../components/popup.js';
import { go, back } from '../core/nav.js';
import { t, locale } from '../i18n.js';

const ABOUT_MAX = 70;

let full = null;
let page = 'root';
let saving = false;

function birthday(b) {
  if (!b) return '';
  const text = new Date(b.year || 2000, b.month - 1, b.day).toLocaleDateString(locale(), b.year ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' });
  if (!b.year) return text;
  const now = new Date();
  let age = now.getFullYear() - b.year;
  if (now.getMonth() + 1 < b.month || (now.getMonth() + 1 === b.month && now.getDate() < b.day)) age -= 1;
  return `${text} (${age})`;
}

function guest(el) {
  el.innerHTML = `
    ${titleBar(t('Профиль'))}
    <div class="tx-page">
      <div class="tx-hero">
        <span class="tx-avatar xl tx-peer-5"><i class="icon icon-user" style="font-size:52px"></i></span>
        <div class="tx-hero-name">${t('Гость')}</div>
        <div class="tx-hero-sub">${t('Войдите, чтобы читать свои каналы')}</div>
      </div>
      ${group(row({ icon: 'user-filled', color: 'BLUE_DEEP', title: t('Войти в Telegram'), sub: t('QR-код или номер телефона'), onclick: 'window.TelegramX.openAuthModal()' }))}
    </div>`;
}

function actionButton(icon, label, onclick) {
  return `<button class="tx-pf-action" onclick="${onclick}"><i class="icon icon-${icon}"></i><span>${label}</span></button>`;
}

function renderRoot(el, u) {
  const info =
    (u.phone ? row({ title: escapeHtml(formatPhone(u.phone)), sub: t('Мобильный'), onclick: `window.TelegramX.copyText('${escapeQuotes(formatPhone(u.phone))}', '${escapeQuotes(t('Номер скопирован'))}')` }) : '') +
    (full && full.about ? row({ title: `<span style="white-space:pre-wrap">${parseEmojis(full.about)}</span>`, sub: t('О себе') }) : '') +
    (u.username ? row({ title: '@' + escapeHtml(u.username), sub: t('Имя пользователя'), onclick: `window.TelegramX.copyText('https://t.me/${escapeQuotes(u.username)}', '${escapeQuotes(t('Ссылка скопирована'))}')` }) : '') +
    (full && full.birthday ? row({ title: escapeHtml(birthday(full.birthday)), sub: t('День рождения') }) : '');

  el.innerHTML = `
    <div class="tx-pf-bar">
      <span class="tx-pf-bar-title">${parseEmojis(u.name)}</span>
      <button class="tx-icon-btn" onclick="window.TelegramX.openProfileMenu(event)" title="${t('Ещё')}"><i class="icon icon-more"></i></button>
    </div>
    <div class="tx-page tx-pf">
      <div class="tx-pf-hero">
        <button class="tx-pf-avatar" onclick="window.TelegramX.pickProfilePhoto()" title="${t('Выбрать фото')}">
          ${avatarHtml({ ...u, avatar: u.avatar_big || u.avatar }, 'xl')}
        </button>
        <div class="tx-hero-name">${parseEmojis(u.name)}${u.premium ? ' <i class="icon icon-star tx-pf-premium"></i>' : ''}</div>
        <div class="tx-hero-sub is-online">${t('в сети')}</div>
      </div>
      <div class="tx-pf-actions">
        ${actionButton('profile-photo', t('Выбрать фото'), 'window.TelegramX.pickProfilePhoto()')}
        ${actionButton('profile-edit', t('Изменить'), "window.TelegramX.openProfilePage('edit')")}
        ${actionButton('profile-settings', t('Настройки'), "window.TelegramX.setView('settings')")}
      </div>
      ${info ? group(info) : ''}
    </div>
    <input type="file" id="profile-photo-input" accept="image/jpeg,image/png,image/webp" hidden onchange="window.TelegramX.uploadProfilePhoto(this)" />`;
}

function renderEdit(el, u) {
  const about = (full && full.about) || '';
  el.innerHTML = `
    ${titleBar(t('Изменить профиль'), { back: true, actions: `<button class="tx-icon-btn" onclick="window.TelegramX.saveProfile()" title="${t('Сохранить')}"><i class="icon icon-check-bold"></i></button>` })}
    <div class="tx-page">
      <div class="tx-pf-hero is-small">
        <button class="tx-pf-avatar" onclick="window.TelegramX.pickProfilePhoto()">
          ${avatarHtml({ ...u, avatar: u.avatar_big || u.avatar }, 'xl')}
          <span class="tx-pf-avatar-cam"><i class="icon icon-camera"></i></span>
        </button>
        <button class="tx-pf-link" onclick="window.TelegramX.pickProfilePhoto()">${t('Выбрать фотографию')}</button>
      </div>
      ${group(`
        <label class="tx-field"><input id="pf-first" maxlength="64" placeholder="${t('Имя (обязательно)')}" value="${escapeHtml(u.first_name || (u.last_name ? '' : u.name) || '')}" /></label>
        <label class="tx-field"><input id="pf-last" maxlength="64" placeholder="${t('Фамилия (необязательно)')}" value="${escapeHtml(u.last_name || '')}" /></label>`,
        { hint: t('Укажите имя и, если хотите, фамилию.') })}
      ${group(`
        <label class="tx-field">
          <textarea id="pf-about" rows="2" maxlength="${ABOUT_MAX}" placeholder="${t('О себе')}" oninput="document.getElementById('pf-about-left').textContent = ${ABOUT_MAX} - this.value.length">${escapeHtml(about)}</textarea>
          <span class="tx-field-count" id="pf-about-left">${ABOUT_MAX - about.length}</span>
        </label>`,
        { hint: t('Любые подробности, например: возраст, род занятий или город. Пример: 23 года, дизайнер из Санкт-Петербурга.') })}
    </div>
    <input type="file" id="profile-photo-input" accept="image/jpeg,image/png,image/webp" hidden onchange="window.TelegramX.uploadProfilePhoto(this)" />`;
}

export function renderProfile() {
  const el = document.getElementById('profile-root');
  if (!el) return;
  const u = state.isAuth ? state.user : null;
  if (!u) {
    guest(el);
    return;
  }
  if (page === 'edit') renderEdit(el, u);
  else renderRoot(el, u);
  updateCollapse();
}

async function loadExtras() {
  if (!state.isAuth) return;
  const jobs = [];
  if (!full) jobs.push(api.getFullMe().then((f) => { full = f; }).catch((e) => console.warn('[TeleX] full profile', e)));
  if (!jobs.length) return;
  await Promise.all(jobs);
  if (document.getElementById('cx-app').dataset.tab === 'profile') renderProfile();
}

export function enterProfile(params = {}) {
  page = params.page || 'root';
  renderProfile();
  loadExtras();
}

export function resetProfile() {
  full = null;
}

export function openProfilePage(name) {
  go('profile', { page: name });
}

// ---------------- Actions ----------------

export function openProfileMenu(event) {
  const u = state.user || {};
  const items = [];
  if (u.username) items.push({ icon: 'link', label: t('Копировать ссылку'), run: () => copyText(`https://t.me/${u.username}`, t('Ссылка скопирована')) });
  items.push({ icon: 'profile-edit', label: t('Изменить информацию'), run: () => openProfilePage('edit') });
  items.push({ icon: 'profile-photo', label: t('Выбрать фото'), run: pickProfilePhoto });
  items.push({ icon: 'logout', label: t('Выйти'), danger: true, run: () => window.TelegramX.logoutTelegram() });
  openPopup(event.currentTarget, { items });
}

export function copyText(text, toast) {
  navigator.clipboard.writeText(text).then(() => showToast(toast || t('Скопировано'))).catch(() => showToast(text));
}

export function pickProfilePhoto() {
  document.getElementById('profile-photo-input')?.click();
}

export async function uploadProfilePhoto(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast(t('Файл слишком большой (до 10 МБ)'));
    return;
  }
  showToast(t('Загрузка фото…'));
  const res = await api.setProfilePhoto(file);
  if (res.status !== 'success') {
    showToast(t('Не удалось обновить фото: ') + (res.message || t('ошибка')));
    return;
  }
  state.user = res.user;
  window.TelegramX.updateAuthUI();
  showToast(t('Фото профиля обновлено'));
}

export async function saveProfile() {
  if (saving) return;
  const firstName = document.getElementById('pf-first').value.trim();
  const lastName = document.getElementById('pf-last').value.trim();
  const about = document.getElementById('pf-about').value.trim();
  if (!firstName) {
    showToast(t('Введите имя'));
    document.getElementById('pf-first').focus();
    return;
  }
  saving = true;
  const res = await api.updateProfile({ firstName, lastName, about });
  saving = false;
  if (res.status !== 'success') {
    showToast(t('Не удалось сохранить: ') + (res.message || t('ошибка')));
    return;
  }
  state.user = res.user;
  full = { ...(full || {}), about };
  back();
  window.TelegramX.updateAuthUI();
  showToast(t('Профиль сохранён'));
}

// ---------------- Collapsing header ----------------

function updateCollapse() {
  const el = document.getElementById('profile-root');
  if (!el || document.getElementById('cx-app').dataset.tab !== 'profile') return;
  const y = el.parentElement.scrollTop;
  el.style.setProperty('--pp', Math.min(1, Math.max(0, y / 170)).toFixed(3));
  el.classList.toggle('is-collapsed', y > 190);
}

document.addEventListener('scroll', updateCollapse, { passive: true, capture: true });
