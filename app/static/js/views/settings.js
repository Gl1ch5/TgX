/**
 * ====================================================================
 * VIEW: SETTINGS — root page and subpages (wall, appearance, data,
 * devices). Every item does something real.
 * ====================================================================
 */

import { state } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHtml, formatPhone, formatChatTime } from '../utils.js';
import { parseEmojis } from '../emoji.js';
import { getPrefs, setPref, setChannelExcluded, isChannelExcluded, ACCENTS, applyAppearance } from '../core/prefs.js';
import { go } from '../core/nav.js';
import { avatarHtml } from '../components/avatar.js';
import { titleBar, group, row, switchRow, slider, segments } from '../components/ui.js';
import { WALLPAPERS } from '../components/wallpaperTheme.js';
import { APP_VERSION, AUTHOR, REPO_URL } from '../version.js';
import { nativeVersion, isAndroidApp, postNative, logCount, diagnostics, exportLogs, clearLogs, hardReload } from '../core/devtools.js';

const root = () => document.getElementById('settings-root');
let page = 'root';
let channelFilter = '';

export function enterSettings(params = {}) {
  page = params.page || 'root';
  render();
}

export function openSettingsPage(name) {
  go('settings', { page: name });
}

function render() {
  const el = root();
  if (!el) return;
  const pages = { root: rootPage, wall: wallPage, appearance: appearancePage, data: dataPage, devices: devicesPage, about: aboutPage, developer: developerPage };
  el.innerHTML = (pages[page] || rootPage)();
  if (page === 'devices') loadSessions();
  if (page === 'data') loadStorage();
  if (page === 'developer') loadDevInfo();
}

function rootPage() {
  const u = state.isAuth ? state.user : null;
  const name = u ? u.name : 'Гость';
  const sub = u ? [u.phone ? formatPhone(u.phone) : '', u.username ? '@' + u.username : ''].filter(Boolean).join(' • ') : 'Войдите в Telegram';
  const p = getPrefs();
  const wpName = (WALLPAPERS.find((w) => w.id === localStorage.getItem('tgx_wallpaper')) || WALLPAPERS[0]).name;
  const excluded = p.excludedChannels.length;

  return `
    ${titleBar('Настройки', { actions: '<button class="tx-icon-btn" onclick="window.TelegramX.setView(\'profile\')" title="Профиль"><i class="icon icon-user"></i></button>' })}
    <div class="tx-page">
      <div class="tx-hero">
        ${avatarHtml(u ? { ...u, avatar: u.avatar_big || u.avatar } : { id: 0, name: 'Г' }, 'xl')}
        <div class="tx-hero-name">${parseEmojis(name)}</div>
        <div class="tx-hero-sub">${escapeHtml(sub)}</div>
      </div>

      ${group(
        row({ icon: 'channel-filled', color: '#3e88f7', title: 'Стена', sub: excluded ? `Скрыто каналов: ${excluded}` : 'Каналы на стене, прочитанное', onclick: "window.TelegramX.openSettingsPage('wall')" }) +
        row({ icon: 'brush', color: '#f19d39', title: 'Оформление', sub: `${escapeHtml(wpName)}, текст ${p.textSize} пт`, onclick: "window.TelegramX.openSettingsPage('appearance')" }) +
        row({ icon: 'piechart-filled', color: '#5a83f3', title: 'Данные и память', sub: 'Автозагрузка медиа, кэш', onclick: "window.TelegramX.openSettingsPage('data')" }) +
        row({ icon: 'devices-filled', color: '#3fb6c7', title: 'Устройства', sub: 'Активные сеансы', onclick: "window.TelegramX.openSettingsPage('devices')" }),
      )}

      ${group(
        row({ icon: 'favorite-filled', color: '#f5b72f', title: 'Закладки', sub: 'Посты, сохранённые на стене', onclick: 'window.TelegramX.openFavorites()' }),
      )}

      ${group(
        row({ icon: 'info-filled', color: '#8e8e93', title: 'О TeleX', sub: `Версия ${APP_VERSION}`, onclick: "window.TelegramX.openSettingsPage('about')" }) +
        row({ icon: 'code', color: '#6c6c70', title: 'Для разработчиков', sub: 'Сессия, диагностика, логи', onclick: "window.TelegramX.openSettingsPage('developer')" }),
      )}
      <div class="tx-settings-foot">TeleX ${APP_VERSION} · автор <a href="https://t.me/${AUTHOR.telegram}" target="_blank" rel="noopener">@${AUTHOR.telegram}</a></div>
    </div>`;
}

function aboutPage() {
  const native = nativeVersion();
  return `
    ${titleBar('О TeleX', { back: true })}
    <div class="tx-page">
      <div class="tx-hero">
        <img class="tx-about-logo" src="icons/telex.svg" alt="" />
        <div class="tx-hero-name">TeleX</div>
        <div class="tx-hero-sub">Все ваши каналы — одной стеной</div>
      </div>
      ${group(
        row({ title: APP_VERSION, sub: 'Версия' }) +
        (native ? row({ title: escapeHtml(native), sub: 'Приложение' }) : '') +
        (isAndroidApp() ? row({ icon: 'reload', color: '#4fae4e', title: 'Проверить обновления', onclick: 'window.TelegramX.checkAppUpdate()' }) : ''),
      )}
      ${group(
        row({ icon: 'user', color: '#3e88f7', title: '@' + AUTHOR.telegram, sub: 'Автор · Telegram', onclick: `window.open('https://t.me/${AUTHOR.telegram}', '_blank', 'noopener')` }) +
        row({ icon: 'code', color: '#24292f', title: 'github.com/' + AUTHOR.github, sub: 'Исходный код', onclick: `window.open('${REPO_URL}', '_blank', 'noopener')` }),
        { hint: 'TeleX — неофициальный клиент. Работает напрямую с серверами Telegram, сессия хранится только на вашем устройстве.' },
      )}
    </div>`;
}

function developerPage() {
  const p = getPrefs();
  return `
    ${titleBar('Для разработчиков', { back: true })}
    <div class="tx-page">
      ${group(
        row({ title: '<span id="dev-conn">…</span>', sub: 'Соединение с Telegram' }) +
        row({ icon: 'reload', color: '#4fae4e', title: 'Проверить соединение', sub: '<span id="dev-ping">Пинг MTProto</span>', onclick: 'window.TelegramX.devPing()' }) +
        row({ icon: 'reload-arrows', color: '#3e88f7', title: 'Переподключиться', onclick: 'window.TelegramX.devReconnect()' }),
        { title: 'Диагностика' },
      )}
      ${group(
        switchRow({ icon: 'info-filled', color: '#8774e1', title: 'Индикатор соединения', sub: 'Дата-центр и пинг поверх экрана', checked: p.devOverlay, onchange: "window.TelegramX.setPref('devOverlay', this.checked)" }) +
        switchRow({ icon: 'data', color: '#6c6c70', title: 'Подробные логи MTProto', sub: 'Пишет в консоль всё, что делает GramJS', checked: p.devVerbose, onchange: "window.TelegramX.setPref('devVerbose', this.checked)" }),
        { title: 'Отладка' },
      )}
      ${group(
        row({ icon: 'download', color: '#3e88f7', title: 'Экспорт логов', sub: `<span id="dev-logs">${logCount()}</span> записей + сведения об устройстве`, onclick: 'window.TelegramX.devExportLogs()' }) +
        row({ icon: 'copy', color: '#5a83f3', title: 'Скопировать диагностику', onclick: 'window.TelegramX.devCopyDiagnostics()' }) +
        row({ icon: 'delete', color: '#8e8e93', title: 'Очистить логи', onclick: 'window.TelegramX.devClearLogs()' }),
        { title: 'Логи' },
      )}
      ${group(
        row({ icon: 'link', color: '#f19d39', title: 'Экспорт сессии', sub: 'Скопировать строку входа', onclick: 'window.TelegramX.devExportSession()' }) +
        row({ icon: 'add', color: '#4fae4e', title: 'Импорт сессии', sub: 'Войти по строке из другого TeleX', onclick: 'window.TelegramX.devToggleImport()' }) +
        `<div id="dev-import" class="tx-hidden">
          <label class="tx-field"><textarea id="dev-import-text" rows="3" placeholder="Вставьте строку сессии" autocomplete="off" spellcheck="false"></textarea></label>
          <div style="padding:0 16px 14px"><button class="tx-btn" style="width:100%" onclick="window.TelegramX.devImportSession()">Войти</button></div>
        </div>`,
        { title: 'Сессия', hint: 'Строка сессии — это полный доступ к аккаунту. Никому её не отправляйте: с ней можно читать и писать от вашего имени. Отозвать её можно в «Устройствах».' },
      )}
      ${group(
        row({ icon: 'reload', color: '#ff5b5b', title: 'Перезагрузить приложение начисто', sub: 'Сбросить Service Worker и кэш кода (вход сохранится)', onclick: 'window.TelegramX.devHardReload()' }),
      )}
    </div>`;
}

function wallPage() {
  const p = getPrefs();
  const channels = state.channels
    .filter((c) => c.is_broadcast || p.showGroups)
    .filter((c) => !channelFilter || (c.title || '').toLowerCase().includes(channelFilter) || (c.username || '').toLowerCase().includes(channelFilter));

  const list = channels.map((c) => switchRow({
    avatar: avatarHtml(c, 'md'),
    title: parseEmojis(c.title),
    sub: c.username ? '@' + escapeHtml(c.username) : (c.is_broadcast ? 'канал' : 'группа'),
    checked: !isChannelExcluded(c.id),
    onchange: `window.TelegramX.setChannelOnWall(${c.id}, this.checked)`,
  })).join('');

  return `
    ${titleBar('Стена', { back: true })}
    <div class="tx-page">
      ${group(
        switchRow({ icon: 'readchats', color: '#4fae4e', title: 'Отмечать прочитанным', sub: 'Просмотренные посты — прочитаны и в Telegram', checked: p.syncRead, onchange: "window.TelegramX.setPref('syncRead', this.checked)" }) +
        switchRow({ icon: 'group-filled', color: '#8774e1', title: 'Показывать группы', sub: 'Сообщения супергрупп на стене', checked: p.showGroups, onchange: "window.TelegramX.setPref('showGroups', this.checked); window.TelegramX.rerenderSettings()" }),
      )}
      ${group(segments([[10, '10'], [20, '20'], [40, '40'], [60, '60']], p.feedSize, "window.TelegramX.setPref('feedSize', $v); window.TelegramX.rerenderSettings()"),
        { title: 'Сколько каналов загружать', hint: 'Чем больше каналов, тем дольше обновляется стена.' })}
      <label class="tx-search tx-glass" style="margin:0 0 12px;background:var(--tx-surface)">
        <i class="icon icon-search"></i>
        <input type="search" placeholder="Поиск каналов" value="${escapeHtml(channelFilter)}" oninput="window.TelegramX.filterWallChannels(this.value)" />
      </label>
      ${group(list || '<div class="tx-group-hint" style="padding-top:14px">Каналы появятся после входа в Telegram</div>',
        { title: 'Каналы на стене', hint: 'Выключенные каналы не попадают на стену и в счётчик новых.' })}
    </div>`;
}

function appearancePage() {
  const p = getPrefs();
  const wpName = (WALLPAPERS.find((w) => w.id === localStorage.getItem('tgx_wallpaper')) || WALLPAPERS[0]).name;
  const preview = `
    <div class="tx-preview" id="appearance-preview">
      <div class="tx-msg is-first is-last">
        <span class="tx-avatar-slot">${avatarHtml({ id: 5, name: 'Telegram' }, 'sm')}</span>
        <div class="tx-bubble"><div class="tx-msg-name tx-peer-5 tx-peer-name">Telegram</div>
          <div class="tx-msg-body">Так будут выглядеть публикации на стене 👋<span class="tx-msg-time">12:00</span></div></div>
      </div>
    </div>`;
  return `
    ${titleBar('Оформление', { back: true })}
    <div class="tx-page">
      ${preview}
      ${group(slider({ min: 12, max: 22, value: p.textSize, left: 'A', right: '<span style="font-size:20px">A</span>', oninput: "window.TelegramX.setPref('textSize', +this.value)" }), { title: `Размер текста` })}
      ${group(slider({ min: 0, max: 22, value: p.bubbleRadius, left: '0', right: '22', oninput: "window.TelegramX.setPref('bubbleRadius', +this.value)" }), { title: 'Скругление углов сообщений' })}
      ${group(`<div class="tx-colors">${ACCENTS.map((a) => `<button style="--c:${a.fill}" class="${a.id === p.accent ? 'is-active' : ''}" onclick="window.TelegramX.setPref('accent', '${a.id}'); window.TelegramX.rerenderSettings()" title="${a.id}"></button>`).join('')}</div>`, { title: 'Цвет акцента' })}
      ${group(
        row({ icon: 'brush', color: '#f19d39', title: 'Обои', sub: escapeHtml(wpName), onclick: 'window.TelegramX.openWallpaperModal()' }) +
        switchRow({ icon: 'animations', color: '#e66b9b', title: 'Уменьшить анимацию', sub: 'Стикеры и эмодзи без движения', checked: p.reduceMotion, onchange: "window.TelegramX.setPref('reduceMotion', this.checked)" }),
      )}
    </div>`;
}

function dataPage() {
  const p = getPrefs();
  return `
    ${titleBar('Данные и память', { back: true })}
    <div class="tx-page">
      ${group(
        switchRow({ icon: 'photo', color: '#3e88f7', title: 'Загружать фото автоматически', checked: p.autoloadPhotos, onchange: "window.TelegramX.setPref('autoloadPhotos', this.checked)" }) +
        switchRow({ icon: 'gifs', color: '#4fae4e', title: 'Автовоспроизведение GIF', checked: p.autoplayGifs, onchange: "window.TelegramX.setPref('autoplayGifs', this.checked)" }) +
        switchRow({ icon: 'video', color: '#e66b9b', title: 'Автовоспроизведение видео', sub: 'Короткие видео без звука, как в Telegram', checked: p.autoplayVideos, onchange: "window.TelegramX.setPref('autoplayVideos', this.checked)" }),
        { title: 'Автозагрузка медиа' },
      )}
      ${group(
        row({ icon: 'data', color: '#5a83f3', title: 'Использование памяти', sub: '<span id="storage-usage">Подсчёт…</span>' }) +
        row({ icon: 'delete', color: '#ff5b5b', title: 'Очистить кэш', sub: 'Медиа и сохранённая лента', onclick: 'window.TelegramX.clearMediaCache()' }),
        { title: 'Хранилище', hint: 'Сессия и настройки при очистке кэша сохраняются.' },
      )}
    </div>`;
}

function devicesPage() {
  return `
    ${titleBar('Устройства', { back: true })}
    <div class="tx-page">
      <div id="sessions-box"><div class="tx-sentinel"><span class="animate-spin"><i class="icon icon-reload"></i></span></div></div>
      ${group(row({ icon: 'logout', color: '#ff5b5b', title: 'Выйти из TeleX', sub: 'Завершить сеанс в этом браузере', danger: true, onclick: 'window.TelegramX.logoutTelegram()' }))}
    </div>`;
}

function deviceIcon(s) {
  const d = `${s.app} ${s.device}`.toLowerCase();
  if (d.includes('android')) return 'device-android';
  if (d.includes('ios') || d.includes('iphone') || d.includes('mac')) return 'device-apple';
  if (d.includes('windows')) return 'device-windows';
  if (d.includes('linux') || d.includes('ubuntu')) return 'device-linux';
  if (d.includes('web')) return 'device-webk';
  return 'device-unknown';
}

async function loadSessions() {
  const box = document.getElementById('sessions-box');
  if (!state.isAuth) {
    box.innerHTML = group('<div class="tx-group-hint" style="padding-top:14px">Войдите, чтобы увидеть устройства</div>');
    return;
  }
  try {
    const list = await api.getSessions();
    const current = list.find((s) => s.current);
    const others = list.filter((s) => !s.current).sort((a, b) => b.active - a.active);
    const item = (s) => row({
      icon: deviceIcon(s), color: s.current ? '#4fae4e' : '#5a83f3',
      title: escapeHtml(s.device || s.app), sub: `${escapeHtml(s.app)} · ${escapeHtml(s.location)}${s.current ? '' : ' · ' + formatChatTime(s.active)}`,
      onclick: s.current ? '' : `window.TelegramX.terminateSession('${s.hash}')`,
    });
    box.innerHTML =
      (current ? group(item(current), { title: 'Это устройство' }) : '') +
      (others.length ? group(others.map(item).join(''), { title: 'Активные сеансы', hint: 'Нажмите на сеанс, чтобы завершить его.' }) : '');
  } catch (e) {
    box.innerHTML = group(`<div class="tx-group-hint" style="padding-top:14px">Не удалось загрузить: ${escapeHtml(e.errorMessage || e.message || String(e))}</div>`);
  }
}

async function loadStorage() {
  const el = document.getElementById('storage-usage');
  if (!el) return;
  try {
    const { usage } = await navigator.storage.estimate();
    el.textContent = usage > 1048576 ? `${(usage / 1048576).toFixed(1)} МБ` : `${Math.round(usage / 1024)} КБ`;
  } catch {
    el.textContent = 'нет данных';
  }
}

// ---------------- Actions ----------------

export function rerenderSettings() {
  if (document.getElementById('app').dataset.view === 'settings') {
    const y = window.scrollY;
    render();
    window.scrollTo({ top: y });
  }
}

export function filterWallChannels(q) {
  channelFilter = q.toLowerCase().trim();
  const input = document.activeElement;
  const pos = input && input.selectionStart;
  rerenderSettings();
  const fresh = root().querySelector('input[type=search]');
  if (fresh) {
    fresh.focus();
    if (pos != null) fresh.setSelectionRange(pos, pos);
  }
}

export function setChannelOnWall(id, on) {
  setChannelExcluded(id, !on);
}

export function updatePref(key, value) {
  setPref(key, value);
  applyAppearance();
}

export async function terminateSession(hash) {
  if (!confirm('Завершить этот сеанс?')) return;
  const res = await api.terminateSession(hash);
  showToast(res.status === 'success' ? 'Сеанс завершён' : 'Ошибка: ' + (res.message || ''));
  loadSessions();
}

// ---------------- About / developer actions ----------------

function loadDevInfo() {
  const el = document.getElementById('dev-conn');
  if (!el) return;
  const info = api.connectionInfo();
  el.textContent = `${info.connected ? 'Подключено' : 'Нет соединения'} · DC ${info.dc ?? '—'}${info.hasSession ? '' : ' · без сессии'}`;
}

export async function devPing() {
  const el = document.getElementById('dev-ping');
  if (el) el.textContent = 'Пинг…';
  try {
    const ms = await api.ping();
    if (el) el.textContent = `${ms} мс`;
  } catch (e) {
    if (el) el.textContent = 'Нет ответа: ' + escapeHtml(e.message || String(e));
  }
  loadDevInfo();
}

export async function devReconnect() {
  showToast('Переподключение…');
  const re = await api.ensureAlive();
  loadDevInfo();
  showToast(re ? 'Соединение восстановлено' : 'Соединение в порядке');
}

export function devExportLogs() {
  exportLogs();
}

export function devCopyDiagnostics() {
  navigator.clipboard.writeText(diagnostics()).then(() => showToast('Диагностика скопирована')).catch(() => showToast('Не удалось скопировать'));
}

export function devClearLogs() {
  clearLogs();
  const el = document.getElementById('dev-logs');
  if (el) el.textContent = '0';
  showToast('Логи очищены');
}

export function devExportSession() {
  const value = api.exportSession();
  if (!value) {
    showToast('Вы не вошли в Telegram');
    return;
  }
  if (!confirm('Строка сессии даёт полный доступ к вашему аккаунту Telegram. Скопировать её?')) return;
  navigator.clipboard.writeText(value).then(() => showToast('Сессия скопирована. Храните её в секрете')).catch(() => showToast('Не удалось скопировать'));
}

export function devToggleImport() {
  document.getElementById('dev-import')?.classList.toggle('tx-hidden');
}

export async function devImportSession() {
  const value = document.getElementById('dev-import-text').value;
  try {
    await api.importSession(value);
    showToast('Сессия загружена, перезапуск…');
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    showToast(e.message || 'Не удалось импортировать');
  }
}

export function devHardReload() {
  hardReload();
}

export function checkAppUpdate() {
  if (!postNative('checkUpdate')) showToast('Доступно только в приложении для Android');
  else showToast('Проверяем обновления…');
}
