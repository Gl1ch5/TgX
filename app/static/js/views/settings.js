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
import { getPrefs, setPref, setChannelExcluded, isChannelExcluded, ACCENTS, applyAppearance, resolvedTheme } from '../core/prefs.js';
import { COLOR_THEMES, NAME_COLORS, NAME_COLORS_DAY, outGradient, themeWallpaper } from '../core/colorThemes.js';
import { go } from '../core/nav.js';
import { avatarHtml } from '../components/avatar.js';
import { titleBar, group, row, switchRow, slider, segments, radioRow } from '../components/ui.js';
import { WALLPAPERS, applyWallpaper, refreshWallpaper, openWallpaperModal, wallPreviewHtml, wallFill as wallFillCss } from '../components/wallpaperTheme.js';
import { openPopup } from '../components/postMenu.js';
import { APP_VERSION, AUTHOR, REPO_URL } from '../version.js';
import { workerMode } from '../tg.js';
import { nativeVersion, isAndroidApp, postNative, logCount, diagnostics, exportLogs, clearLogs, hardReload } from '../core/devtools.js';
import { t, LANGUAGES, lang } from '../i18n.js';
import { ext } from '../core/ext.js';
import { listMods, installMod, removeMod, setModEnabled, parseBundle, installFromUrl, confirmDialog, modConfigGet, modConfigSet, modRenderers, modPage as modPageDef, loadCatalog, installOfficial } from '../core/mods.js';

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
  const pages = { root: rootPage, power: powerPage, wall: wallPage, chat: chatPage, appearance: chatPage, theme: themePage, language: languagePage, namecolor: nameColorPage, data: dataPage, devices: devicesPage, about: aboutPage, developer: developerPage, mods: modsPage };
  el.innerHTML = (pages[page] || (page.startsWith('mod:') ? () => modPage(page.slice(4)) : page.startsWith('xp:') ? () => extPage(page.slice(3)) : rootPage))();
  if (page.startsWith('xp:')) { const pg = modPageDef(page.slice(3)); const box = document.getElementById('xp-box'); if (pg && box) { try { pg.render(box); } catch (e) { console.warn('[mods] page', e); } } }
  if (page === 'mods') fillOfficial();
  if (page.startsWith('mod:')) { const box = document.getElementById('mod-custom'); if (box) modRenderers(page.slice(4)).forEach((fn) => { try { fn(box); } catch (e) { console.warn('[mods] render', e); } }); }
  if (page === 'devices') loadSessions();
  if (page === 'data') loadStorage();
  if (page === 'developer') loadDevInfo();
}

function rootPage() {
  const u = state.isAuth ? state.user : null;
  const name = u ? u.name : t('Гость');
  const sub = u ? [u.phone ? formatPhone(u.phone) : '', u.username ? '@' + u.username : ''].filter(Boolean).join(' • ') : t('Войдите в Telegram');
  const p = getPrefs();
  const wpName = (WALLPAPERS.find((w) => w.id === localStorage.getItem('tgx_wallpaper')) || WALLPAPERS[0]).name;
  const excluded = p.excludedChannels.length;
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
        row({ icon: 'st-channel', color: 'BLUE_DEEP', title: t('Стена'), sub: excluded ? t('Скрыто каналов: {a}', {a: excluded}) : t('Каналы на стене, прочитанное'), onclick: "window.TelegramX.openSettingsPage('wall')" }) +
        row({ icon: 'st-chat', color: 'ORANGE', title: t('Настройки чатов'), sub: t('Обои, ночной режим, анимации'), onclick: "window.TelegramX.openSettingsPage('chat')" }) +
        row({ icon: 'st-data', color: 'BLUE_DEEP', title: t('Данные и память'), sub: t('Автозагрузка медиа, кэш'), onclick: "window.TelegramX.openSettingsPage('data')" }) +
        row({ icon: 'st-devices', color: 'CYAN', title: t('Устройства'), sub: t('Управление активными сеансами'), onclick: "window.TelegramX.openSettingsPage('devices')" }) +
        row({ icon: 'st-power', color: 'ORANGE_DEEP', title: t('Энергосбережение'), sub: p.reduceMotion ? t('Анимации выключены') : t('Анимации и автовоспроизведение'), onclick: "window.TelegramX.openSettingsPage('power')" }) +
        row({ icon: 'st-chat', color: 'GREEN', title: 'Telegram You', sub: t('Полноценный клиент Telegram'), onclick: "location.href='../../telegram-you/'" }) +
        row({ icon: 'st-language', color: 'PURPLE', title: t('Язык'), sub: (LANGUAGES.find((l) => l.code === lang()) || LANGUAGES[0]).name, onclick: "window.TelegramX.openSettingsPage('language')" }) +
        row({ icon: 'st-features', color: 'PURPLE', title: t('Моды'), sub: modsSummary(), onclick: "window.TelegramX.openSettingsPage('mods')" }),
      )}

      ${group(
        row({ icon: 'st-stars', color: 'ORANGE', title: t('Закладки'), sub: t('Посты, сохранённые на стене'), onclick: 'window.TelegramX.openFavorites()' }),
      )}

      ${group(
        row({ icon: 'st-ask', color: 'ORANGE', title: t('Написать автору'), sub: '@' + AUTHOR.telegram, onclick: `window.open('https://t.me/${AUTHOR.telegram}', '_blank', 'noopener')` }) +
        row({ icon: 'st-faq', color: 'BLUE', title: t('О TeleX'), sub: t('Версия {a}', {a: APP_VERSION}), onclick: "window.TelegramX.openSettingsPage('about')" }) +
        row({ icon: 'st-features', color: 'PURPLE', title: t('Для разработчиков'), sub: t('Сессия, диагностика, логи'), onclick: "window.TelegramX.openSettingsPage('developer')" }),
      )}
      ${extraRows()}
      <div class="tx-settings-foot">${t('TeleX {a} · автор', {a: APP_VERSION})} <a href="https://t.me/${AUTHOR.telegram}" target="_blank" rel="noopener">@${AUTHOR.telegram}</a></div>
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
    ${titleBar(t('О TeleX'), { back: true })}
    <div class="tx-page">
      <div class="tx-hero">
        <img class="tx-about-logo" src="icons/telex.svg" alt="" />
        <div class="tx-hero-name">TeleX</div>
        <div class="tx-hero-sub">${t('Все ваши каналы — одной стеной')}</div>
      </div>
      ${group(
        row({ title: APP_VERSION, sub: t('Версия') }) +
        (native ? row({ title: escapeHtml(native), sub: t('Приложение') }) : '') +
        (isAndroidApp() ? row({ icon: 'reload', color: 'GREEN', title: t('Проверить обновления'), onclick: 'window.TelegramX.checkAppUpdate()' }) : ''),
      )}
      ${group(
        row({ icon: 'user', color: 'BLUE', title: '@' + AUTHOR.telegram, sub: t('Автор · Telegram'), onclick: `window.open('https://t.me/${AUTHOR.telegram}', '_blank', 'noopener')` }) +
        row({ icon: 'code', color: 'GRAY', title: 'github.com/' + AUTHOR.github, sub: t('Исходный код'), onclick: `window.open('${REPO_URL}', '_blank', 'noopener')` }),
        { hint: t('TeleX — неофициальный клиент. Работает напрямую с серверами Telegram, сессия хранится только на вашем устройстве.') },
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

function wallPage() {
  const p = getPrefs();
  const channels = state.channels
    .filter((c) => c.is_broadcast || p.showGroups)
    .filter((c) => !channelFilter || (c.title || '').toLowerCase().includes(channelFilter) || (c.username || '').toLowerCase().includes(channelFilter));

  const list = channels.map((c) => switchRow({
    avatar: avatarHtml(c, 'md'),
    title: parseEmojis(c.title),
    sub: c.username ? '@' + escapeHtml(c.username) : (c.is_broadcast ? t('канал') : t('группа')),
    checked: !isChannelExcluded(c.id),
    onchange: `window.TelegramX.setChannelOnWall(${c.id}, this.checked)`,
  })).join('');

  return `
    ${titleBar(t('Стена'), { back: true })}
    <div class="tx-page">
      ${group(
        switchRow({ icon: 'readchats', color: 'GREEN', title: t('Отмечать прочитанным'), sub: t('Просмотренные посты — прочитаны и в Telegram'), checked: p.syncRead, onchange: "window.TelegramX.setPref('syncRead', this.checked)" }) +
        switchRow({ icon: 'group-filled', color: 'PURPLE', title: t('Показывать группы'), sub: t('Сообщения супергрупп на стене'), checked: p.showGroups, onchange: "window.TelegramX.setPref('showGroups', this.checked); window.TelegramX.rerenderSettings()" }),
      )}
      ${group(segments([[10, '10'], [20, '20'], [40, '40'], [60, '60']], p.feedSize, "window.TelegramX.setPref('feedSize', $v); window.TelegramX.rerenderSettings()"),
        { title: t('Сколько каналов загружать'), hint: t('Чем больше каналов, тем дольше обновляется стена.') })}
      <label class="tx-search tx-glass" style="margin:0 0 12px;background:var(--tx-surface)">
        <i class="icon icon-search"></i>
        <input type="search" placeholder="${t('Поиск каналов')}" value="${escapeHtml(channelFilter)}" oninput="window.TelegramX.filterWallChannels(this.value)" />
      </label>
      ${group(list || `<div class="tx-group-hint" style="padding-top:14px">${t('Каналы появятся после входа в Telegram')}</div>`,
        { title: t('Каналы на стене'), hint: t('Выключенные каналы не попадают на стену и в счётчик новых.') })}
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
    <div class="tx-cp" style="${wp.remote ? '' : `background:${bg}`}">
      ${wp.remote ? `<div style="position:absolute;inset:0;overflow:hidden">${wallPreviewHtml(wp, day, 200)}</div>` : wp.svg ? `<div class="tx-cp-pattern" style="background-image:url('${wp.svg}')"></div>` : ''}
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
  const wp = WALLPAPERS.find((w) => w.id === themeWallpaper(c, day ? 'light' : 'dark')) || WALLPAPERS[0];
  const bg = day && wp.light ? wp.light : wp.gradient;
  return `
    <button class="tx-theme-tile ${selected ? 'is-active' : ''}" onclick="window.TelegramX.setColorTheme('${c.id}')" aria-label="${c.id}" style="${wp.remote ? '' : `background:${bg}`}">
      ${wp.remote ? wallPreviewHtml(wp, day, 90) : wp.svg ? `<span class="tx-cp-pattern" style="background-image:url('${wp.svg}')"></span>` : ''}
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
        ${row({ avatar: glyph(ICONS.image), title: t('Изменить обои'), onclick: 'window.TelegramX.openWallpaperModal()', accent: true })}
        ${row({ avatar: glyph(ICONS.palette), title: t('Изменить цвет имени'), value: `<span class="tx-name-pill" style="--n:${nc}">${escapeHtml(String(me.name || 'Pavel').split(' ')[0])}</span>`, onclick: "window.TelegramX.openSettingsPage('namecolor')", accent: true })}
      </div>

      <div class="tx-group tx-group-flush">
        <div class="tx-group-title">${t('Цветовая тема')}</div>
        <div class="tx-theme-strip">${COLOR_THEMES.map((c) => themeTile(c, c.id === p.colorTheme)).join('')}</div>
        ${row({ avatar: glyph(day ? ICONS.moon : ICONS.sun), title: day ? t('Переключить на ночную тему') : t('Переключить на дневную тему'), onclick: 'window.TelegramX.toggleDayNight()', accent: true })}
        ${row({ avatar: glyph('<i class="icon icon-brush"></i>'), title: t('Настройки темы'), onclick: "window.TelegramX.openSettingsPage('theme')", accent: true })}
        ${row({ avatar: glyph('<i class="icon icon-st-features"></i>'), title: t('Моды тем'), onclick: "window.TelegramX.openSettingsPage('mods')", accent: true })}
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
  if (c.accent) setPref('accent', c.accent);
  const wpId = themeWallpaper(c, dayMode() ? 'light' : 'dark');
  if (wpId) { localStorage.setItem('tgx_wallpaper', wpId); localStorage.setItem('tgx_wp_auto', c.id); } else localStorage.removeItem('tgx_wp_auto');
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
  setPref('colorTheme', COLOR_THEMES[0].id);
  setPref('accent', 'blue');
  setPref('nameColor', 'auto');
  setPref('theme', 'auto');
  localStorage.setItem('tgx_wallpaper', themeWallpaper(COLOR_THEMES[0], dayMode() ? 'light' : 'dark') || 'FOks2P6KCFIMAAAAyFz5S74pfKo');
  localStorage.setItem('tgx_wp_auto', COLOR_THEMES[0].id);
  refreshTheme();
  postNative('theme:' + resolvedTheme());
  showToast(t('Настройки чатов сброшены'));
}

// ---------------- Mods ----------------

function modsSummary() {
  const list = listMods();
  const on = list.filter((m) => m.enabled).length;
  return list.length ? t('Включено: {a} из {b}', { a: on, b: list.length }) : t('Темы и расширения');
}

/** Rows that mods add to the settings screen (ext point "settings"). */
function extraRows() {
  const items = ext.menu('settings', {});
  if (!items.length) return '';
  window.__txSettingsExt = items;
  return group(items.map((it, i) => row({ icon: it.icon || 'st-features', color: it.color || 'PURPLE', title: escapeHtml(it.title || it.label || ''), sub: it.sub ? escapeHtml(it.sub) : '', onclick: `window.__txSettingsExt[${i}].run()` })).join(''));
}

const modKind = (m) => (m.parts.some((p) => p.type === 'js' || p.type === 'html') ? (m.parts.some((p) => p.type === 'theme') ? t('Тема + код') : t('Мод')) : t('Тема'));

/** Card picture: the mod's own preview, else a drawing of its theme, else its icon on a gradient. */
function modThumb(m, { big = false } = {}) {
  const mf = m.manifest;
  const first = Array.isArray(mf.preview) ? mf.preview[0] : mf.preview;
  const cls = big ? 'tx-mod-pic is-big' : 'tx-mod-pic';
  if (first && /^(https:|data:image\/)/.test(first)) return `<span class="${cls}"><img src="${escapeHtml(first)}" alt="" loading="lazy"></span>`;
  const th = m.parts.find((p) => p.type === 'theme');
  const ct = th && th.data && th.data.colorThemes && th.data.colorThemes[0];
  const wp = ct && ct.wallpapers && (ct.wallpapers[dayMode() ? 'light' : 'dark'] || ct.wallpapers.dark || ct.wallpapers.light);
  if (wp) {
    const out = ct.out && (ct.out[dayMode() ? 'light' : 'dark'] || ct.out.dark) || ['#5a86c4'];
    return `<span class="${cls}" style="position:relative;overflow:hidden">${wallPreviewHtml({ ...wp, remote: true, gradient: wallFillCss(wp), svg: wp.kind === 'pattern' ? wp.url : null }, dayMode(), 90)}<i class="tx-mod-bub" style="background:${out.length > 1 ? `linear-gradient(135deg,${out.join(',')})` : out[0]}"></i></span>`;
  }
  const icon = mf.icon && !/^(https:|data:)/.test(mf.icon) ? mf.icon : (mf.name || '?').trim().slice(0, 1).toUpperCase();
  return `<span class="${cls} is-icon">${parseEmojis(escapeHtml(icon))}</span>`;
}

function extPage(key) {
  const pg = modPageDef(key);
  return `${titleBar(pg ? pg.title : '', { back: true })}<div class="tx-page"><div id="xp-box"></div></div>`;
}

function modsPage() {
  const list = listMods();
  const cards = list.map((m) => {
    const mf = m.manifest;
    const sub = [modKind(m), mf.version ? 'v' + mf.version : '', mf.author || ''].filter(Boolean).map(escapeHtml).join(' · ');
    return `
      <div class="tx-mod-card" onclick="window.TelegramX.openSettingsPage('mod:${mf.id}')">
        ${modThumb(m)}
        <span class="tx-mod-body">
          <span class="tx-mod-name">${escapeHtml(mf.name)}</span>
          <span class="tx-mod-sub">${sub}</span>
          ${mf.description ? `<span class="tx-mod-desc">${escapeHtml(mf.description)}</span>` : ''}
        </span>
        <label class="tx-switch" onclick="event.stopPropagation()"><input type="checkbox" ${m.enabled ? 'checked' : ''} onchange="window.TelegramX.toggleMod('${mf.id}', this.checked)"><span></span></label>
      </div>`;
  }).join('');
  return `
    ${titleBar(t('Моды'), { back: true })}
    <div class="tx-page">
      ${group(
        row({ icon: 'download', color: 'BLUE', title: t('Установить из файла'), sub: t('Файл .module'), onclick: "document.getElementById('mod-file').click()" }) +
        row({ icon: 'copy', color: 'GREEN', title: t('Вставить ссылку или JSON'), onclick: "document.getElementById('mod-paste').classList.toggle('tx-hidden')" }) +
        `<div id="mod-paste" class="tx-hidden">
          <label class="tx-field"><textarea id="mod-text" rows="6" placeholder="${t('Ссылка https://… или JSON мода')}" autocomplete="off" spellcheck="false"></textarea></label>
          <div style="padding:0 16px 14px"><button class="tx-btn" style="width:100%" onclick="window.TelegramX.installModText()">${t('Установить')}</button></div>
        </div>`,
        { title: t('Установка'), hint: t('Мод может сменить тему, обои и цвета сообщений, добавить пункты в меню и настройки. Мод с кодом получает полный доступ к приложению и аккаунту: ставьте только то, чему доверяете.') },
      )}
      <div id="mod-official"></div>
      <div class="tx-group"><div class="tx-group-title">${t('Установленные')}</div>${list.length ? cards : `<div class="tx-group-hint" style="padding:6px 22px 18px;margin:0">${t('Модов пока нет')}</div>`}</div>
      <input type="file" id="mod-file" accept=".module,.json,.js,.html,application/json,text/*" hidden onchange="window.TelegramX.installModFile(this)" />
    </div>`;
}

/** "Official mods": the project's own catalog, one tap to install. */
async function fillOfficial() {
  const box = document.getElementById('mod-official');
  if (!box) return;
  let list;
  try { list = await loadCatalog(); } catch { return; }
  if (!document.getElementById('mod-official')) return;
  const have = new Map(listMods().map((m) => [m.manifest.id, m.manifest.version]));
  const cards = list.map((c) => {
    const cur = have.get(c.id);
    const state = cur == null ? t('Установить') : cur !== c.version ? t('Обновить') : t('Установлено');
    const pic = c.swatch ? `<span class="tx-mod-pic" style="background:linear-gradient(135deg,${c.swatch.join(',')})">${parseEmojis(escapeHtml(c.icon || ''))}</span>` : `<span class="tx-mod-pic is-icon">${parseEmojis(escapeHtml(c.icon || c.name.slice(0, 1)))}</span>`;
    return `
      <div class="tx-mod-card">
        ${pic}
        <span class="tx-mod-body">
          <span class="tx-mod-name">${escapeHtml(c.name)} <i class="tx-verified"></i></span>
          <span class="tx-mod-sub">${escapeHtml([c.version ? 'v' + c.version : '', c.author || ''].filter(Boolean).join(' · '))}</span>
          <span class="tx-mod-desc">${escapeHtml(c.description || '')}</span>
        </span>
        <button class="tx-mod-get ${cur != null && cur === c.version ? 'is-done' : ''}" ${cur != null && cur === c.version ? 'disabled' : ''} onclick="window.TelegramX.installOfficial('${c.id}')">${state}</button>
      </div>`;
  }).join('');
  box.innerHTML = `<div class="tx-group"><div class="tx-group-title">${t('Официальные моды')}</div>${cards}</div>`;
}

export function installOfficialMod(id) { runInstall(installOfficial(id)); }

function modControl(m, def) {
  const id = m.manifest.id;
  const v = modConfigGet(m, def.key);
  const k = JSON.stringify(def.key).replace(/"/g, '&quot;');
  const set = (expr) => `window.TelegramX.modSet('${id}', ${k}, ${expr})`;
  const title = escapeHtml(def.title || def.key);
  const sub = def.sub ? escapeHtml(def.sub) : '';
  switch (def.type) {
    case 'switch': return switchRow({ title, sub, checked: !!v, onchange: set('this.checked') });
    case 'number': return `<div class="tx-group-title" style="padding-top:12px">${title}</div>` + slider({ min: def.min ?? 0, max: def.max ?? 100, step: def.step || 1, value: Number(v) || 0, oninput: set('+this.value'), left: '', right: '' });
    case 'select': return `<div class="tx-group-title" style="padding-top:12px">${title}</div>` + segments((def.options || []).map((o) => (Array.isArray(o) ? o : [o, String(o)])), v, `${set('$v')}; window.TelegramX.rerenderSettings()`);
    case 'color': return row({ title, sub, html: `<input type="color" class="tx-mod-color" value="${escapeHtml(String(v || '#3390ec'))}" onchange="${set('this.value')}">` });
    default: return `<div class="tx-group-title" style="padding-top:12px">${title}</div><label class="tx-field"><input type="text" class="tx-mod-text" value="${escapeHtml(String(v ?? ''))}" onchange="${set('this.value')}"></label>`;
  }
}

function modPage(id) {
  const m = listMods().find((x) => x.manifest.id === id);
  if (!m) return modsPage();
  const mf = m.manifest;
  const shots = (Array.isArray(mf.preview) ? mf.preview : [mf.preview]).filter((u) => u && /^(https:|data:image\/)/.test(u));
  const hero = shots.length > 1
    ? `<div class="tx-mod-shots">${shots.map((u) => `<img src="${escapeHtml(u)}" alt="" loading="lazy">`).join('')}</div>`
    : `<div class="tx-mod-hero">${modThumb(m, { big: true })}</div>`;
  const tags = (mf.tags || []).map((x) => `<span class="tx-mod-tag">${escapeHtml(String(x))}</span>`).join('');
  const schema = (mf.settings || []).filter((d) => d && d.key);
  return `
    ${titleBar(mf.name, { back: true })}
    <div class="tx-page">
      ${hero}
      <div class="tx-mod-meta">
        <div class="tx-mod-title">${escapeHtml(mf.name)}${mf.verified ? ' <i class="tx-verified"></i>' : ''}</div>
        <div class="tx-mod-by">${[modKind(m), mf.version ? 'v' + mf.version : '', mf.author || ''].filter(Boolean).map(escapeHtml).join(' · ')}</div>
        ${tags ? `<div class="tx-mod-tags">${tags}</div>` : ''}
        ${mf.description ? `<p class="tx-mod-lead">${escapeHtml(mf.description)}</p>` : ''}
        ${mf.about ? `<p class="tx-mod-about">${escapeHtml(mf.about).replace(/\n/g, '<br>')}</p>` : ''}
      </div>
      ${group(switchRow({ icon: 'st-features', color: 'PURPLE', title: t('Включён'), checked: !!m.enabled, onchange: `window.TelegramX.toggleMod('${id}', this.checked)` }))}
      ${schema.length ? `<div class="tx-group"><div class="tx-group-title">${t('Настройки мода')}</div>${schema.map((d) => modControl(m, d)).join('')}</div>` : ''}
      <div id="mod-custom"></div>
      ${group(row({ icon: 'delete', color: 'RED', title: t('Удалить'), danger: true, onclick: `window.TelegramX.deleteMod('${id}')` }))}
    </div>`;
}

export function modSet(id, key, value) { modConfigSet(id, key, value); }

async function runInstall(promise) {
  try {
    if (await promise) showToast(t('Мод установлен'));
  } catch (e) {
    showToast(String(e && e.message || e));
  }
  rerenderSettings();
}

export function installModFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  runInstall(file.text().then((txt) => installMod(parseBundle(txt))));
}

export function installModText() {
  const el = document.getElementById('mod-text');
  const v = el && el.value.trim();
  if (!v) return;
  runInstall(/^https:\/\/\S+$/.test(v) ? installFromUrl(v) : Promise.resolve().then(() => installMod(parseBundle(v))));
}

export function toggleMod(id, on) { setModEnabled(id, on); rerenderSettings(); }

export async function deleteMod(id) {
  if (await confirmDialog(t('Удалить мод?'), t('Удалить'))) { removeMod(id); if (page.startsWith('mod:')) { history.back(); } else rerenderSettings(); }
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
    { icon: 'faq', label: t('О TeleX'), run: () => openSettingsPage('about') },
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
