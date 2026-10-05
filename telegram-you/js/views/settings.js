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
import { getPrefs, setPref, ACCENTS, applyAppearance, resolvedTheme } from '../core/prefs.js';
import { COLOR_THEMES, NAME_COLORS, NAME_COLORS_DAY, outGradient } from '../core/colorThemes.js';
import { go } from '../core/nav.js';
import { avatarHtml } from '../components/avatar.js';
import { titleBar, group, row, switchRow, slider, segments, radioRow } from '../components/ui.js';
import { WALLPAPERS, applyWallpaper, refreshWallpaper } from '../components/wallpaperTheme.js';
import { openPopup } from '../components/popup.js';
import { APP_VERSION, AUTHOR, REPO_URL } from '../version.js';
import { workerMode } from '../tg.js';
import { nativeVersion, isAndroidApp, postNative, logCount, diagnostics, exportLogs, clearLogs, hardReload } from '../core/devtools.js';
import { t, LANGUAGES, lang } from '../i18n.js';
import { listMods, installMod, removeMod, setModEnabled } from '../ui/mods.js';

const root = () => document.getElementById('settings-root');
let page = 'root';

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
  const pages = { root: rootPage, power: powerPage, chat: chatPage, appearance: chatPage, theme: themePage, language: languagePage, namecolor: nameColorPage, data: dataPage, devices: devicesPage, mods: modsPage, about: aboutPage, developer: developerPage };
  el.innerHTML = (pages[page] || rootPage)();
  if (page === 'devices') loadSessions();
  if (page === 'data') loadStorage();
  if (page === 'developer') loadDevInfo();
}

function rootPage() {
  const u = state.isAuth ? state.user : null;
  const name = u ? u.name : t('Гость');
  const sub = u ? [u.phone ? formatPhone(u.phone) : '', u.username ? '@' + u.username : ''].filter(Boolean).join(' • ') : t('Войдите в Telegram');
  const p = getPrefs();
  const avatar = avatarHtml(u ? { ...u, avatar: u.avatar_big || u.avatar } : { id: 0, name: t('Г') }, 'xl');

  return `
    <div class="tx-titlebar tx-settings-bar">
      <h1></h1>
      <button class="tx-icon-btn" onclick="window.TelegramX.openSettingsMenu(event)" title="${t('Ещё')}"><i class="icon icon-more"></i></button>
    </div>
    <div class="tx-page">
      <div class="tx-hero">
        ${u ? `<button class="tx-pf-avatar tx-settings-avatar" onclick="window.TelegramX.pickProfilePhoto()" title="${t('Выбрать фото')}">${avatar}<span class="tx-cam-badge"><i class="icon icon-camera"></i></span></button>` : avatar}
        <div class="tx-hero-name">${parseEmojis(name)}</div>
        <div class="tx-hero-sub">${escapeHtml(sub)}</div>
      </div>

      ${u ? '' : group(row({ icon: 'st-account', color: 'BLUE', title: t('Войти в Telegram'), sub: t('QR-код или номер телефона'), onclick: 'window.TelegramX.openAuthModal()' }))}

      ${group(
        (u ? row({ icon: 'st-account', color: 'BLUE', title: t('Аккаунт'), sub: t('Имя, «О себе», фото профиля'), onclick: "window.TelegramX.setView('profile')" }) : '') +
        row({ icon: 'st-chat', color: 'ORANGE', title: t('Настройки чатов'), sub: t('Обои, ночной режим, анимации'), onclick: "window.TelegramX.openSettingsPage('chat')" }) +
        row({ icon: 'st-data', color: 'BLUE_DEEP', title: t('Данные и память'), sub: t('Автозагрузка медиа, кэш'), onclick: "window.TelegramX.openSettingsPage('data')" }) +
        row({ icon: 'st-devices', color: 'CYAN', title: t('Устройства'), sub: t('Управление активными сеансами'), onclick: "window.TelegramX.openSettingsPage('devices')" }) +
        row({ icon: 'st-power', color: 'ORANGE_DEEP', title: t('Энергосбережение'), sub: p.reduceMotion ? t('Анимации выключены') : t('Анимации и автовоспроизведение'), onclick: "window.TelegramX.openSettingsPage('power')" }) +
        row({ icon: 'st-language', color: 'PURPLE', title: t('Язык'), sub: (LANGUAGES.find((l) => l.code === lang()) || LANGUAGES[0]).name, onclick: "window.TelegramX.openSettingsPage('language')" })
      )}

      ${group(
        row({ icon: 'st-ask', color: 'ORANGE', title: t('Написать автору'), sub: '@' + AUTHOR.telegram, onclick: `window.open('https://t.me/${AUTHOR.telegram}', '_blank', 'noopener')` }) +
        row({ icon: 'st-faq', color: 'BLUE', title: t('О Telegram You'), sub: t('Версия {a}', {a: APP_VERSION}), onclick: "window.TelegramX.openSettingsPage('about')" }) +
        row({ icon: 'st-gram', color: 'BLUE_DEEP', title: t('Моды'), sub: t('Расширения Telegram You'), onclick: "window.TelegramX.openSettingsPage('mods')" }) +
        row({ icon: 'st-features', color: 'PURPLE', title: t('Для разработчиков'), sub: t('Сессия, диагностика, логи'), onclick: "window.TelegramX.openSettingsPage('developer')" }),
      )}
      <div class="tx-settings-foot">${t('Telegram You {a} · автор', {a: APP_VERSION})} <a href="https://t.me/${AUTHOR.telegram}" target="_blank" rel="noopener">@${AUTHOR.telegram}</a></div>
    </div>
    <input type="file" id="profile-photo-input" accept="image/jpeg,image/png,image/webp" hidden onchange="window.TelegramX.uploadProfilePhoto(this)" />`;
}

function powerPage() {
  const p = getPrefs();
  return `
    ${titleBar(t('Энергосбережение'), { back: true })}
    <div class="tx-page">
      ${group(
        switchRow({ icon: 'st-power', color: 'ORANGE_DEEP', title: t('Режим энергосбережения'), sub: t('Без анимаций, стикеры и эмодзи на паузе'), checked: p.reduceMotion, onchange: "window.TelegramX.setPref('reduceMotion', this.checked); window.TelegramX.rerenderSettings()" }),
        { hint: t('Экономит заряд и ускоряет работу на слабых телефонах.') },
      )}
      ${group(
        switchRow({ title: t('Автовоспроизведение видео'), sub: t('Короткие видео в ленте без звука'), checked: p.autoplayVideos, onchange: "window.TelegramX.setPref('autoplayVideos', this.checked)" }) +
        switchRow({ title: t('Автовоспроизведение GIF'), checked: p.autoplayGifs, onchange: "window.TelegramX.setPref('autoplayGifs', this.checked)" }) +
        switchRow({ title: t('Эффекты стекла'), sub: t('Размытие под панелями'), checked: p.glass, onchange: "window.TelegramX.setPref('glass', this.checked)" }),
        { title: t('Ресурсоёмкие процессы') },
      )}
    </div>`;
}

function aboutPage() {
  const native = nativeVersion();
  return `
    ${titleBar(t('О Telegram You'), { back: true })}
    <div class="tx-page">
      <div class="tx-hero">
        <img class="tx-about-logo" src="icons/app.svg" alt="" />
        <div class="tx-hero-name">Telegram You</div>
        <div class="tx-hero-sub">${t('Копия Telegram для Android в вебе')}</div>
      </div>
      ${group(
        row({ title: APP_VERSION, sub: t('Версия') }) +
        (native ? row({ title: escapeHtml(native), sub: t('Приложение') }) : '') +
        (isAndroidApp() ? row({ icon: 'reload', color: 'GREEN', title: t('Проверить обновления'), onclick: 'window.TelegramX.checkAppUpdate()' }) : ''),
      )}
      ${group(
        row({ icon: 'user', color: 'BLUE', title: '@' + AUTHOR.telegram, sub: t('Автор · Telegram'), onclick: `window.open('https://t.me/${AUTHOR.telegram}', '_blank', 'noopener')` }) +
        row({ icon: 'code', color: 'GRAY', title: 'github.com/' + AUTHOR.github, sub: t('Исходный код'), onclick: `window.open('${REPO_URL}', '_blank', 'noopener')` }),
        { hint: t('Telegram You — неофициальный клиент. Работает напрямую с серверами Telegram, сессия хранится только на вашем устройстве.') },
      )}
    </div>`;
}

function developerPage() {
  const p = getPrefs();
  return `
    ${titleBar(t('Для разработчиков'), { back: true })}
    <div class="tx-page">
      ${group(
        row({ title: '<span id="dev-conn">…</span>', sub: t('Соединение с Telegram') }) +
        row({ icon: 'reload', color: 'GREEN', title: t('Проверить соединение'), sub: `<span id="dev-ping">${t('Пинг MTProto')}</span>`, onclick: 'window.TelegramX.devPing()' }) +
        row({ icon: 'reload-arrows', color: 'BLUE', title: t('Переподключиться'), onclick: 'window.TelegramX.devReconnect()' }),
        { title: t('Диагностика') },
      )}
      ${group(
        switchRow({ icon: 'info-filled', color: 'PURPLE', title: t('Индикатор соединения'), sub: t('Дата-центр и пинг поверх экрана'), checked: p.devOverlay, onchange: "window.TelegramX.setPref('devOverlay', this.checked)" }) +
        switchRow({ icon: 'data', color: 'GRAY', title: t('Подробные логи MTProto'), sub: t('Пишет в консоль всё, что делает GramJS'), checked: p.devVerbose, onchange: "window.TelegramX.setPref('devVerbose', this.checked)" }),
        { title: t('Отладка') },
      )}
      ${group(
        switchRow({ icon: 'st-power', color: 'ORANGE_DEEP', title: t('Telegram в отдельном потоке'), sub: workerMode ? t('Включено — загрузка не тормозит интерфейс') : t('Как в Telegram Web A: быстрее при прокрутке'), checked: p.workerMode, onchange: "window.TelegramX.setWorkerMode(this.checked)" }),
        { title: t('Производительность'), hint: t('Клиент Telegram (сеть, расшифровка, загрузка медиа) работает в отдельном потоке и не мешает интерфейсу. Применяется после перезапуска. Если что-то сломается — выключите.') },
      )}
      ${group(
        row({ icon: 'download', color: 'BLUE', title: t('Экспорт логов'), sub: t('{a} записей + сведения об устройстве', {a: `<span id="dev-logs">${logCount()}</span>`}), onclick: 'window.TelegramX.devExportLogs()' }) +
        row({ icon: 'copy', color: 'BLUE_DEEP', title: t('Скопировать диагностику'), onclick: 'window.TelegramX.devCopyDiagnostics()' }) +
        row({ icon: 'delete', color: 'GRAY', title: t('Очистить логи'), onclick: 'window.TelegramX.devClearLogs()' }),
        { title: t('Логи') },
      )}
      ${group(
        row({ icon: 'link', color: 'ORANGE', title: t('Экспорт сессии'), sub: t('Скопировать строку входа'), onclick: 'window.TelegramX.devExportSession()' }) +
        row({ icon: 'add', color: 'GREEN', title: t('Импорт сессии'), sub: t('Войти по строке из другого TeleX'), onclick: 'window.TelegramX.devToggleImport()' }) +
        `<div id="dev-import" class="tx-hidden">
          <label class="tx-field"><textarea id="dev-import-text" rows="3" placeholder="${t('Вставьте строку сессии')}" autocomplete="off" spellcheck="false"></textarea></label>
          <div style="padding:0 16px 14px"><button class="tx-btn" style="width:100%" onclick="window.TelegramX.devImportSession()">${t('Войти')}</button></div>
        </div>`,
        { title: t('Сессия'), hint: t('Строка сессии — это полный доступ к аккаунту. Никому её не отправляйте: с ней можно читать и писать от вашего имени. Отозвать её можно в «Устройствах».') },
      )}
      ${group(
        row({ icon: 'reload', color: 'RED', title: t('Перезагрузить приложение начисто'), sub: t('Сбросить Service Worker и кэш кода (вход сохранится)'), onclick: 'window.TelegramX.devHardReload()' }),
      )}
    </div>`;
}

// ---------------- Chat settings (Telegram for Android: "Настройки чатов") ----------------

const dayMode = () => resolvedTheme() === 'light';
const ICONS = {
  sun: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3L7 7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  palette: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.5-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10.5" cy="7.2" r="1.1"/><circle cx="15" cy="7.8" r="1.1"/></svg>',
  image: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="9" cy="9" r="1.7"/><path d="M4 17l5-5 4 4 3-3 4 4"/></svg>',
  ticks: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12.5l4.5 4.5L15 8.5M10 16l1 1 9-9"/></svg>',
};
const glyph = (svg) => `<span class="tx-glyph">${svg}</span>`;
const nameColorOf = (p = getPrefs(), userId = 0) => {
  const list = dayMode() ? NAME_COLORS_DAY : NAME_COLORS;
  if (p.nameColor !== 'auto' && list[Number(p.nameColor)]) return list[Number(p.nameColor)];
  return list[Math.abs(Number(userId) || 0) % list.length];
};

function previewBand() {
  const p = getPrefs();
  const day = dayMode();
  const wp = WALLPAPERS.find((w) => w.id === localStorage.getItem('tgx_wallpaper')) || WALLPAPERS[0];
  const bg = day && wp.light ? wp.light : wp.gradient;
  const theme = COLOR_THEMES.find((c) => c.id === p.colorTheme) || COLOR_THEMES[0];
  const me = state.user || { id: 5, name: 'Pavel' };
  const first = escapeHtml(String(me.name || 'Pavel').split(' ')[0]);
  return `
    <div class="tx-cp" style="background:${bg}">
      ${wp.svg ? `<div class="tx-cp-pattern" style="background-image:url('${wp.svg}')"></div>` : ''}
      <div class="tx-cp-msg">
        <div class="tx-cp-bubble">
          <div class="tx-cp-quote"><b style="color:var(--tx-green)">${first}</b><span>${parseEmojis(t('Доброе утро! 👋'))}</span></div>
          <div class="tx-cp-text">${t('Знаешь, который час?')}<i class="tx-cp-time">10:08</i></div>
        </div>
      </div>
      <div class="tx-cp-msg is-out">
        <div class="tx-cp-bubble is-out" style="background:${outGradient(theme, day ? 'light' : 'dark')}">
          <div class="tx-cp-text">${parseEmojis(t('В Токио утро 😎'))}<i class="tx-cp-time">10:23 ${ICONS.ticks}</i></div>
        </div>
      </div>
    </div>`;
}

function themeTile(c, selected) {
  const day = dayMode();
  const wp = WALLPAPERS.find((w) => w.id === c.wp) || WALLPAPERS[0];
  const bg = day && wp.light ? wp.light : wp.gradient;
  return `
    <button class="tx-theme-tile ${selected ? 'is-active' : ''}" onclick="window.TelegramX.setColorTheme('${c.id}')" aria-label="${c.id}" style="background:${bg}">
      ${wp.svg ? `<span class="tx-cp-pattern" style="background-image:url('${wp.svg}')"></span>` : ''}
      <span class="tx-theme-out" style="background:${outGradient(c, day ? 'light' : 'dark')}"></span>
      <span class="tx-theme-in"></span>
      <span class="tx-theme-emoji">${parseEmojis(c.emoji)}</span>
    </button>`;
}

function chatPage() {
  const p = getPrefs();
  const me = state.user || { id: 5, name: 'Pavel' };
  const nc = nameColorOf(p, me.id);
  const day = dayMode();
  const more = `<button class="tx-icon-btn" onclick="window.TelegramX.openChatSettingsMenu(event)" title="${t('Ещё')}"><i class="icon icon-more"></i></button>`;
  return `
    ${titleBar(t('Настройки чатов'), { back: true, actions: more })}
    <div class="tx-page tx-chat-settings">
      <div class="tx-group tx-group-flush">
        <div class="tx-group-title">${t('Размер текста сообщений')}</div>
        ${slider({ min: 12, max: 30, value: p.textSize, left: '', right: '<b class="tx-slider-val" id="cs-size">' + p.textSize + '</b>', oninput: "document.getElementById('cs-size').textContent = this.value; window.TelegramX.setPref('textSize', +this.value)" })}
        ${previewBand()}
        ${row({ avatar: glyph(ICONS.image), title: t('Изменить обои'), onclick: 'window.TelegramX.openWallpaperPicker(event)', accent: true })}
        ${row({ avatar: glyph(ICONS.palette), title: t('Изменить цвет имени'), value: `<span class="tx-name-pill" style="--n:${nc}">${escapeHtml(String(me.name || 'Pavel').split(' ')[0])}</span>`, onclick: "window.TelegramX.openSettingsPage('namecolor')", accent: true })}
      </div>

      <div class="tx-group tx-group-flush">
        <div class="tx-group-title">${t('Цветовая тема')}</div>
        <div class="tx-theme-strip">${COLOR_THEMES.map((c) => themeTile(c, c.id === p.colorTheme)).join('')}</div>
        ${row({ avatar: glyph(day ? ICONS.moon : ICONS.sun), title: day ? t('Переключить на ночную тему') : t('Переключить на дневную тему'), onclick: 'window.TelegramX.toggleDayNight()', accent: true })}
        ${row({ avatar: glyph('<i class="icon icon-brush"></i>'), title: t('Настройки темы'), onclick: "window.TelegramX.openSettingsPage('theme')", accent: true })}
      </div>

      <div class="tx-group tx-group-flush">
        <div class="tx-group-title">${t('Углы блоков с сообщениями')}</div>
        ${slider({ min: 0, max: 17, value: Math.min(17, p.bubbleRadius), left: '', right: '<b class="tx-slider-val" id="cs-radius">' + Math.min(17, p.bubbleRadius) + '</b>', oninput: "document.getElementById('cs-radius').textContent = this.value; window.TelegramX.setPref('bubbleRadius', +this.value)" })}
      </div>
    </div>`;
}

function themePage() {
  const p = getPrefs();
  const modes = [['auto', t('Как на устройстве'), t('Тема меняется вместе с системной')], ['light', t('Дневная'), ''], ['dark', t('Ночная'), '']];
  return `
    ${titleBar(t('Настройки темы'), { back: true })}
    <div class="tx-page">
      ${group(modes.map(([v, title, sub]) => radioRow({ title, sub, checked: p.theme === v, onclick: `window.TelegramX.setThemeMode('${v}')` })).join(''), { title: t('Тема') })}
      ${group(`<div class="tx-colors">${ACCENTS.map((a) => `<button style="--c:${a.fill}" class="${a.id === p.accent ? 'is-active' : ''}" onclick="window.TelegramX.setAccent('${a.id}')" title="${a.id}"></button>`).join('')}</div>`, { title: t('Цвет акцента') })}
    </div>`;
}

function nameColorPage() {
  const p = getPrefs();
  const list = dayMode() ? NAME_COLORS_DAY : NAME_COLORS;
  const me = state.user || { id: 5, name: 'Pavel' };
  const swatches = ['auto', ...list.map((_, i) => String(i))].map((v) => {
    const c = v === 'auto' ? nameColorOf({ ...p, nameColor: 'auto' }, me.id) : list[Number(v)];
    return `<button class="tx-swatch ${String(p.nameColor) === v ? 'is-active' : ''}" style="--c:${c}" onclick="window.TelegramX.setNameColor('${v}')" title="${v === 'auto' ? t('Авто') : ''}">${v === 'auto' ? '<span>A</span>' : ''}</button>`;
  }).join('');
  return `
    ${titleBar(t('Изменить цвет имени'), { back: true })}
    <div class="tx-page">
      ${group(`<div class="tx-name-preview"><span class="tx-name-pill is-big" style="--n:${nameColorOf(p, me.id)}">${escapeHtml(String(me.name || 'Pavel').split(' ')[0])}</span></div><div class="tx-swatches">${swatches}</div>`, { title: t('Цвет имени'), hint: t('Цвет вашего имени в комментариях и превью. Виден только вам.') })}
    </div>`;
}

let languageFilter = '';
function languagePage() {
  const cur = lang();
  const list = [...LANGUAGES].sort((a, b) => (a.code === cur ? -1 : b.code === cur ? 1 : a.english.localeCompare(b.english)))
    .filter((l) => !languageFilter || `${l.name} ${l.english}`.toLowerCase().includes(languageFilter.toLowerCase()));
  const search = `<button class="tx-icon-btn" onclick="window.TelegramX.toggleLanguageSearch()" title="${t('Поиск')}"><i class="icon icon-search"></i></button>`;
  return `
    ${titleBar(t('Язык'), { back: true, actions: search })}
    <div class="tx-page">
      <div class="tx-lang-search ${languageFilter ? '' : 'tx-hidden'}" id="lang-search"><input type="search" placeholder="${t('Поиск')}" value="${escapeHtml(languageFilter)}" oninput="window.TelegramX.filterLanguages(this.value)" /></div>
      ${group(list.map((l) => radioRow({ title: l.name, sub: l.english, checked: l.code === cur, onclick: `window.TelegramX.setLanguage('${l.code}')` })).join(''), { title: t('Язык') })}
    </div>`;
}

export function toggleLanguageSearch() {
  const box = document.getElementById('lang-search');
  if (!box) return;
  box.classList.toggle('tx-hidden');
  if (!box.classList.contains('tx-hidden')) box.querySelector('input').focus();
}

export function filterLanguages(v) {
  languageFilter = v || '';
  const el = root();
  const pos = el.scrollTop;
  el.innerHTML = languagePage();
  const input = el.querySelector('#lang-search input');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  el.scrollTop = pos;
}

export function setLanguage(code) {
  if (code === lang() && getPrefs().lang === code) return;
  setPref('lang', code);
  showToast(t('Применяем язык…'));
  setTimeout(() => location.reload(), 350);
}

// ---------------- theme handlers ----------------

function refreshTheme() {
  applyAppearance();
  refreshWallpaper();
  rerenderSettings();
}

export function setColorTheme(id) {
  const c = COLOR_THEMES.find((x) => x.id === id);
  if (!c) return;
  setPref('colorTheme', id);
  setPref('accent', c.accent);
  localStorage.setItem('tgx_wallpaper', c.wp);
  refreshTheme();
}

export function setThemeMode(mode) {
  setPref('theme', mode);
  refreshTheme();
  postNative('theme:' + resolvedTheme());
}

export function toggleDayNight() {
  setThemeMode(dayMode() ? 'dark' : 'light');
}

export function setAccent(id) {
  setPref('accent', id);
  refreshTheme();
}

export function setNameColor(v) {
  setPref('nameColor', v);
  rerenderSettings();
}

export function openChatSettingsMenu(event) {
  openPopup(event.currentTarget, { items: [{ icon: 'reload', label: t('Сбросить настройки'), run: resetChatSettings }] });
}

function resetChatSettings() {
  setPref('textSize', 16);
  setPref('bubbleRadius', 17);
  setPref('colorTheme', 'classic');
  setPref('accent', 'blue');
  setPref('nameColor', 'auto');
  setPref('theme', 'auto');
  localStorage.setItem('tgx_wallpaper', COLOR_THEMES[0].wp);
  refreshTheme();
  postNative('theme:' + resolvedTheme());
  showToast(t('Настройки чатов сброшены'));
}

function dataPage() {
  const p = getPrefs();
  return `
    ${titleBar(t('Данные и память'), { back: true })}
    <div class="tx-page">
      ${group(
        switchRow({ icon: 'photo', color: 'BLUE', title: t('Загружать фото автоматически'), checked: p.autoloadPhotos, onchange: "window.TelegramX.setPref('autoloadPhotos', this.checked)" }) +
        row({ icon: 'video', color: 'ORANGE_DEEP', title: t('Автовоспроизведение'), sub: t('В разделе «Энергосбережение»'), onclick: "window.TelegramX.openSettingsPage('power')" }),
        { title: t('Автозагрузка медиа') },
      )}
      ${group(
        row({ icon: 'data', color: 'BLUE_DEEP', title: t('Использование памяти'), sub: `<span id="storage-usage">${t('Подсчёт…')}</span>` }) +
        row({ icon: 'delete', color: 'RED', title: t('Очистить кэш'), sub: t('Медиа и сохранённая лента'), onclick: 'window.TelegramX.clearMediaCache()' }),
        { title: t('Хранилище'), hint: t('Сессия и настройки при очистке кэша сохраняются.') },
      )}
    </div>`;
}

function devicesPage() {
  return `
    ${titleBar(t('Устройства'), { back: true })}
    <div class="tx-page">
      <div id="sessions-box"><div class="tx-sentinel"><span class="animate-spin"><i class="icon icon-reload"></i></span></div></div>
      ${group(row({ icon: 'logout', color: 'RED', title: t('Выйти из TeleX'), sub: t('Завершить сеанс в этом браузере'), danger: true, onclick: 'window.TelegramX.logoutTelegram()' }))}
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
    box.innerHTML = group(`<div class="tx-group-hint" style="padding-top:14px">${t('Войдите, чтобы увидеть устройства')}</div>`);
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
      (current ? group(item(current), { title: t('Это устройство') }) : '') +
      (others.length ? group(others.map(item).join(''), { title: t('Активные сеансы'), hint: t('Нажмите на сеанс, чтобы завершить его.') }) : '');
  } catch (e) {
    box.innerHTML = group(`<div class="tx-group-hint" style="padding-top:14px">${t('Не удалось загрузить: {a}', {a: escapeHtml(e.errorMessage || e.message || String(e))})}</div>`);
  }
}

async function loadStorage() {
  const el = document.getElementById('storage-usage');
  if (!el) return;
  try {
    const { usage } = await navigator.storage.estimate();
    el.textContent = usage > 1048576 ? t('{a} МБ', {a: (usage / 1048576).toFixed(1)}) : t('{a} КБ', {a: Math.round(usage / 1024)});
  } catch {
    el.textContent = t('нет данных');
  }
}

// ---------------- Actions ----------------

export function rerenderSettings() {
  if (document.getElementById('cx-app').dataset.tab === 'settings') {
    const sc = root().parentElement;
    const y = sc.scrollTop;
    render();
    sc.scrollTop = y;
  }
}

export function updatePref(key, value) {
  setPref(key, value);
  applyAppearance();
}

export async function terminateSession(hash) {
  if (!confirm(t('Завершить этот сеанс?'))) return;
  const res = await api.terminateSession(hash);
  showToast(res.status === 'success' ? t('Сеанс завершён') : t('Ошибка: ') + (res.message || ''));
  loadSessions();
}

// ---------------- About / developer actions ----------------

function loadDevInfo() {
  const el = document.getElementById('dev-conn');
  if (!el) return;
  const info = api.connectionInfo();
  el.textContent = `${info.connected ? t('Подключено') : t('Нет соединения')} · DC ${info.dc ?? '—'}${info.hasSession ? '' : t(' · без сессии')}`;
}

export async function devPing() {
  const el = document.getElementById('dev-ping');
  if (el) el.textContent = t('Пинг…');
  try {
    const ms = await api.ping();
    if (el) el.textContent = t('{a} мс', {a: ms});
  } catch (e) {
    if (el) el.textContent = t('Нет ответа: ') + escapeHtml(e.message || String(e));
  }
  loadDevInfo();
}

export async function devReconnect() {
  showToast(t('Переподключение…'));
  const re = await api.ensureAlive();
  loadDevInfo();
  showToast(re ? t('Соединение восстановлено') : t('Соединение в порядке'));
}

export function devExportLogs() {
  exportLogs();
}

export function devCopyDiagnostics() {
  navigator.clipboard.writeText(diagnostics()).then(() => showToast(t('Диагностика скопирована'))).catch(() => showToast(t('Не удалось скопировать')));
}

export function devClearLogs() {
  clearLogs();
  const el = document.getElementById('dev-logs');
  if (el) el.textContent = '0';
  showToast(t('Логи очищены'));
}

export function devExportSession() {
  const value = api.exportSession();
  if (!value) {
    showToast(t('Вы не вошли в Telegram'));
    return;
  }
  if (!confirm(t('Строка сессии даёт полный доступ к вашему аккаунту Telegram. Скопировать её?'))) return;
  navigator.clipboard.writeText(value).then(() => showToast(t('Сессия скопирована. Храните её в секрете'))).catch(() => showToast(t('Не удалось скопировать')));
}

export function devToggleImport() {
  document.getElementById('dev-import')?.classList.toggle('tx-hidden');
}

export async function devImportSession() {
  const value = document.getElementById('dev-import-text').value;
  try {
    await api.importSession(value);
    showToast(t('Сессия загружена, перезапуск…'));
    setTimeout(() => location.reload(), 600);
  } catch (e) {
    showToast(e.message || t('Не удалось импортировать'));
  }
}

export function devHardReload() {
  hardReload();
}

export function checkAppUpdate() {
  if (!postNative('checkUpdate')) showToast(t('Доступно только в приложении для Android'));
  else showToast(t('Проверяем обновления…'));
}

export function openSettingsMenu(event) {
  const items = [
    { icon: 'faq', label: t('О Telegram You'), run: () => openSettingsPage('about') },
    { icon: 'link', label: t('Исходный код'), run: () => window.open(REPO_URL, '_blank', 'noopener') },
  ];
  if (state.isAuth) items.push({ icon: 'logout', label: t('Выйти'), danger: true, run: () => window.TelegramX.logoutTelegram() });
  openPopup(event.currentTarget, { items });
}

export function setWorkerMode(on) {
  setPref('workerMode', !!on);
  showToast(on ? t('Перезапуск в новом режиме…') : t('Возврат к обычному режиму…'));
  setTimeout(() => location.reload(), 700);
}

/** Wallpaper picker (Telegram's "Изменить обои"): a list of the built-in wallpapers. */
export function openWallpaperPicker(event) {
  const items = WALLPAPERS.map((w) => ({ icon: 'photo', label: w.name, run: () => { applyWallpaper(w.id, false); rerenderSettings(); } }));
  openPopup(event.currentTarget || document.body, { items });
}

function modsPage() {
  const mods = listMods();
  return `
    ${titleBar(t('Моды'), { back: true })}
    <div class="tx-page">
      ${group(
        (mods.map((m) => row({
          icon: 'st-features', color: 'PURPLE', title: escapeHtml(m.manifest.name),
          sub: escapeHtml(m.manifest.description || (m.manifest.permissions || []).join(', ')),
          value: m.enabled ? t('Вкл') : t('Выкл'),
          onclick: `window.TelegramX.toggleMod('${escapeHtml(m.manifest.id)}')`,
          html: `<span class="tx-row-value" style="color:var(--tx-red);margin-left:12px" onclick="event.stopPropagation();window.TelegramX.deleteMod('${escapeHtml(m.manifest.id)}')">${t('Удалить')}</span>`,
        })).join('')) +
        row({ icon: 'add', color: 'GREEN', title: t('Установить мод из файла'), onclick: "document.getElementById('mod-file').click()" }),
        { hint: t('Мод получает полный доступ к приложению и вашему аккаунту. Ставьте только моды, которым доверяете.') },
      )}
    </div>
    <input type="file" id="mod-file" accept=".json,application/json" hidden onchange="window.TelegramX.installModFile(this)" />`;
}

export function toggleMod(id) {
  const m = listMods().find((x) => x.manifest.id === id);
  setModEnabled(id, !(m && m.enabled));
  render();
}
export function deleteMod(id) {
  removeMod(id);
  render();
}
export async function installModFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    if (await installMod(JSON.parse(await file.text()))) { showToast(t('Мод установлен')); render(); }
  } catch (e) { showToast(String(e.message || e)); }
}
