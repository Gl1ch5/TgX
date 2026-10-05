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
import { tgDialog } from '../core/dialog.js';
import { getKey, setKey, hasKey, testKey, looksLikeKey, GROQ_KEYS_URL } from '../core/groq.js';
import { titleBar, group, row, switchRow, slider, segments, radioRow } from '../components/ui.js';
import { WALLPAPERS, applyWallpaper, refreshWallpaper, openWallpaperModal, wallPreviewHtml, wallFill as wallFillCss } from '../components/wallpaperTheme.js';
import { openPopup } from '../components/postMenu.js';
import { APP_VERSION, AUTHOR, REPO_URL } from '../version.js';
import { workerMode } from '../tg.js';
import { nativeVersion, isAndroidApp, postNative, logCount, diagnostics, exportLogs, clearLogs, hardReload } from '../core/devtools.js';
import { t, LANGUAGES, lang } from '../i18n.js';
import { ext } from '../core/ext.js';
import * as storeUi from './store.js';
import { storeOnline } from '../core/store.js';
import { listMods, installMod, removeMod, setModEnabled, parseBundle, installFromUrl, confirmDialog, L as modL, modIcon, modPicHtml, modConfigGet, modConfigSet, modRenderers, modPage as modPageDef, loadCatalog, loadPresets, installPreset, installOfficial, loadCommunity, installCommunity, loadAiPrompt, cleanPasted } from '../core/mods.js';

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

let shownPage = null;

function render() {
  const el = root();
  if (!el) return;
  const prevPage = shownPage;
  const pages = { root: rootPage, power: powerPage, wall: wallPage, chat: chatPage, appearance: chatPage, theme: themePage, language: languagePage, namecolor: nameColorPage, data: dataPage, devices: devicesPage, about: aboutPage, developer: developerPage, mods: modsPage, ai: aiPage };
  el.innerHTML = (pages[page] || (page.startsWith('mod:') ? () => modPage(page.slice(4)) : page.startsWith('xp:') ? () => extPage(page.slice(3)) : page.startsWith('set:') ? () => setPage(page.slice(4)) : page.startsWith('store:') ? () => storeUi.storePage() : rootPage))();
  if (page.startsWith('xp:')) { const pg = modPageDef(page.slice(3)); const box = document.getElementById('xp-box'); if (pg && box) { try { pg.render(box); } catch (e) { console.warn('[mods] page', e); } } }
  if (page === 'mods') { initModsSwipe(); requestAnimationFrame(() => placeModTabs(prevPage === 'mods')); }
  if (page === 'mods') {
    if (modsTab === 'home') storeUi.fillHome();
    if (modsTab === 'catalog') { fillSets(); fillOfficial(); storeUi.fillStoreList(modsQuery, modsCat).then(() => { if (storeOnline() === false) fillCommunity(); }); }
  }
  if (page.startsWith('store:')) storeUi.fillStorePage(page.slice(6));
  if (page.startsWith('set:')) fillSet(page.slice(4));
  if (page.startsWith('mod:')) { const box = document.getElementById('mod-custom'); if (box) modRenderers(page.slice(4)).forEach((fn) => { try { fn(box); } catch (e) { console.warn('[mods] render', e); } }); }
  // a sub-page slides in from the right, going back slides the list in from the left; groups rise one by one
  if (prevPage !== null && prevPage !== page && !document.body.classList.contains('tx-reduce-motion')) {
    const forward = page !== 'root';
    el.animate([{ opacity: 0, transform: `translateX(${forward ? 28 : -28}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
  }
  if (prevPage !== page) el.querySelectorAll('.tx-group, .tx-hero').forEach((g, i) => { if (i < 9) { g.style.setProperty('--i', i); g.classList.add('tx-rise'); } });
  shownPage = page;
  if (page === 'about' && isAndroidApp()) {
    window.__txUpdate = (json) => { try { const i = JSON.parse(json); const el = document.getElementById('upd-status'); if (el) el.textContent = `${i.name} · ${i.code}\n${i.status}`; } catch {} };
    postNative('updateStatus');
  }
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
        row({ icon: 'st-chat', color: 'GREEN', title: 'Telegram You', sub: t('Полноценный клиент Telegram'), onclick: "window.open('https://gl1ch5.github.io/Telegram-YOU/', '_blank', 'noopener')" }) +
        row({ icon: 'st-language', color: 'PURPLE', title: t('Язык'), sub: (LANGUAGES.find((l) => l.code === lang()) || LANGUAGES[0]).name, onclick: "window.TelegramX.openSettingsPage('language')" }) +
        row({ icon: 'st-features', color: 'PURPLE', title: t('Моды'), sub: modsSummary(), onclick: "window.TelegramX.openSettingsPage('mods')" }) +
        row({ icon: 'st-stars', color: 'GREEN', title: t('Ключ Groq'), sub: hasKey() ? t('Подключён · проверка модов включена') : t('Бесплатный ключ для умных функций'), onclick: "window.TelegramX.openSettingsPage('ai')" }),
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

function aiPage() {
  const p = getPrefs();
  const k = getKey();
  return `
    ${titleBar(t('Ключ Groq'), { back: true })}
    <div class="tx-page">
      ${group(
        `<label class="tx-field"><input id="ai-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="gsk_…" value="${escapeHtml(k)}"></label>
         <div id="ai-msg" class="tx-group-hint" style="margin:0;padding:0 18px 8px;min-height:18px"></div>
         <div style="padding:0 16px 14px;display:flex;gap:10px"><button class="tx-btn" style="flex:1" onclick="window.TelegramX.aiKeySave()">${t('Сохранить')}</button>${k ? `<button class="tx-btn tx-btn-ghost is-danger" style="flex:1" onclick="window.TelegramX.aiKeyClear()">${t('Удалить ключ')}</button>` : ''}</div>`,
        { title: t('API-ключ'), hint: t('Ключ хранится только на этом устройстве и отправляется только в Groq. Бесплатный план: регистрация без карты.') },
      )}
      ${group(row({ icon: 'download', color: 'BLUE', title: t('Получить бесплатный ключ'), sub: 'console.groq.com/keys', onclick: `window.open('${GROQ_KEYS_URL}', '_blank', 'noopener')` }))}
      ${group(
        switchRow({ icon: 'st-features', color: 'PURPLE', title: t('Проверять моды перед установкой'), sub: t('ИИ ищет опасный код и то, что ломает интерфейс'), checked: p.aiReview !== false, onchange: "window.TelegramX.setPref('aiReview', this.checked)" }),
        { hint: hasKey() ? '' : t('Работает, когда добавлен ключ.') },
      )}
    </div>`;
}

/** Adds / removes a channel id in a "channels" setting; returns the new list (used by the switch rows). */
export function modToggleChannel(id, key, channelId, on) {
  const m = listMods().find((x) => x.manifest.id === id);
  const cur = new Set((modConfigGet(m, key) || []).map(String));
  on ? cur.add(String(channelId)) : cur.delete(String(channelId));
  return [...cur];
}

export async function aiKeySave() {
  const input = document.getElementById('ai-key');
  const msg = document.getElementById('ai-msg');
  const val = (input && input.value || '').trim();
  if (!val) { setKey(''); showToast(t('Ключ удалён')); rerenderSettings(); return; }
  if (!looksLikeKey(val)) { msg.style.color = 'var(--tx-red)'; msg.textContent = t('Ключ начинается с gsk_ — скопируйте его целиком.'); return; }
  msg.style.color = ''; msg.textContent = t('Проверяем ключ…');
  const res = await testKey(val);
  if (res === 'invalid') { msg.style.color = 'var(--tx-red)'; msg.textContent = t('Groq не принял этот ключ. Проверьте, что скопировали его полностью.'); return; }
  setKey(val);
  showToast(res === 'ok' ? t('Ключ сохранён') : t('Ключ сохранён, но проверить его сейчас не удалось'));
  rerenderSettings();
}

export function aiKeyClear() {
  setKey('');
  showToast(t('Ключ удалён'));
  rerenderSettings();
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
        (isAndroidApp() ? row({ icon: 'reload', color: 'GREEN', title: t('Проверить обновления'), sub: '<span id="upd-status" style="white-space:pre-line">…</span>', onclick: 'window.TelegramX.checkAppUpdate()' }) : ''),
      )}
      ${group(
        row({ icon: 'user', color: 'BLUE', title: '@' + AUTHOR.telegram, sub: t('Автор · Telegram'), onclick: `window.open('https://t.me/${AUTHOR.telegram}', '_blank', 'noopener')` }) +
        row({ icon: 'code', color: 'GRAY', title: 'github.com/' + AUTHOR.github, sub: t('Исходный код'), onclick: `window.open('${REPO_URL}', '_blank', 'noopener')` }),
        { hint: t('TeleX — неофициальный клиент. Работает напрямую с серверами Telegram, сессия хранится только на вашем устройстве.') },
      )}
      ${group(
        switchRow({ icon: 'stats', color: 'CYAN', title: t('Анонимная статистика'), sub: t('Случайный номер установки раз в сутки, чтобы считать пользователей. Без аккаунта и данных'), checked: getPrefs().anonStats !== false, onchange: "window.TelegramX.setPref('anonStats', this.checked)" }),
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

const COMMUNITY_REPO_URL = 'https://github.com/Gl1ch5/TgX/tree/main/community';
const MODS_DOCS_URL = 'https://telex-web.ru/mods.html';
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
  return modPicHtml(mf.icon, mf.name).replace('class="tx-mod-pic', `class="${cls}`);
}

function extPage(key) {
  const pg = modPageDef(key);
  return `${titleBar(pg ? pg.title : '', { back: true })}<div class="tx-page"><div id="xp-box"></div></div>`;
}

let modsTab = 'home';
let modsQuery = '';
let modsCat = 'all';
const modsTabs = () => [['home', t('Главная')], ['catalog', t('Каталог')], ['installed', t('Установленные')], ['create', t('Создать')]];
const MOD_CATS = () => [['all', t('Все')], ['theme', t('Темы')], ['feed', t('Лента')], ['widget', t('Виджеты')], ['ai', t('ИИ')]];

export function setModsTab(tab, dir = 0) {
  if (tab === modsTab) return;
  const order = modsTabs().map((x) => x[0]);
  if (!dir) dir = order.indexOf(tab) > order.indexOf(modsTab) ? 1 : -1;
  modsTab = tab;
  window.scrollTo({ top: 0 });
  rerenderSettings();
  const pg = document.querySelector('#screen-settings .tx-page');
  if (pg && !document.body.classList.contains('tx-reduce-motion')) pg.animate([{ opacity: 0, transform: `translateX(${dir * 36}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
}

/** The sliding indicator of the mod tabs (same look as the feed tabs). */
function placeModTabs(animate = true) {
  const nav = document.querySelector('.tx-modtabs');
  if (!nav) return;
  const ind = nav.querySelector('.tx-tab-ind');
  const on = nav.querySelector('.tx-tab.is-active');
  if (!ind || !on) return;
  if (!animate) ind.style.transition = 'none';
  ind.style.width = `${on.offsetWidth}px`;
  ind.style.transform = `translateX(${on.offsetLeft - 4}px)`;
  nav.classList.add('has-ind');
  if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
  const target = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  nav.scrollTo({ left: Math.max(0, target), behavior: animate ? 'smooth' : 'auto' });
}

/** Swipe left / right on the mods page switches tabs (not over scrollers, fields and sliders). */
function initModsSwipe() {
  const area = document.getElementById('screen-settings');
  if (!area || area.dataset.modswipe) return;
  area.dataset.modswipe = '1';
  let sx = 0; let sy = 0; let t0 = 0; let live = false; let dx = 0;
  const blocked = (el) => {
    for (let n = el; n && n !== area; n = n.parentElement) {
      if (n.matches && n.matches('input, textarea, select, .tx-modtabs, .tx-setscroll, .tx-mod-shots, .tx-slider, [data-noswipe]')) return true;
      if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
    }
    return false;
  };
  area.addEventListener('touchstart', (e) => {
    live = page === 'mods' && e.touches.length === 1 && !blocked(e.target) && !document.querySelector('.tx-dialog-back, .tx-mod-screen');
    if (!live) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now(); dx = 0;
  }, { passive: true });
  area.addEventListener('touchmove', (e) => {
    if (!live) return;
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) live = false;
  }, { passive: true });
  area.addEventListener('touchend', () => {
    if (!live) return;
    live = false;
    const fast = Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.3;
    if (Math.abs(dx) < (fast ? 28 : 56)) return;
    const order = modsTabs().map((x) => x[0]);
    const i = order.indexOf(modsTab) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < order.length) setModsTab(order[i], dx < 0 ? 1 : -1);
  }, { passive: true });
}

export function setModsQuery(q) { modsQuery = String(q || '').trim().toLowerCase(); fillSets(); fillOfficial(); storeUi.fillStoreList(modsQuery, modsCat); }
export function setModsCat(c) { modsCat = c; document.querySelectorAll('.tx-chipbar button').forEach((b) => b.classList.toggle('is-active', b.dataset.c === c)); fillSets(); fillOfficial(); storeUi.fillStoreList(modsQuery, modsCat); }

function modsPage() {
  const list = listMods();
  const cards = list.map((m) => {
    const mf = m.manifest;
    const sub = [modKind(m), mf.version ? 'v' + mf.version : '', mf.author || ''].filter(Boolean).map(escapeHtml).join(' · ');
    return `
      <div class="tx-mod-card is-tile" onclick="window.TelegramX.openSettingsPage('mod:${mf.id}')">
        <span class="tx-mod-top">
          ${modThumb(m)}
          <span class="tx-mod-acts" onclick="event.stopPropagation()">
            <button class="tx-mod-gear" title="${t('Настройки мода')}" onclick="window.TelegramX.openSettingsPage('mod:${mf.id}')"><i class="icon icon-settings"></i></button>
            <button class="tx-mod-del" title="${t('Удалить')}" onclick="window.TelegramX.deleteMod('${mf.id}')"><i class="icon icon-delete"></i></button>
            <label class="tx-switch"><input type="checkbox" ${m.enabled ? 'checked' : ''} onchange="window.TelegramX.toggleMod('${mf.id}', this.checked)"><span></span></label>
          </span>
        </span>
        <span class="tx-mod-name">${escapeHtml(modL(mf.name))}</span>
        <span class="tx-mod-sub">${sub}</span>
        ${mf.description ? `<span class="tx-mod-desc">${escapeHtml(modL(mf.description))}</span>` : ''}
      </div>`;
  }).join('');
  const tabs = `<nav class="tx-tabs tx-glass tx-modtabs"><i class="tx-tab-ind"></i>${modsTabs().map(([id, label]) => `<button class="tx-tab ${modsTab === id ? 'is-active' : ''}" onclick="window.TelegramX.setModsTab('${id}')">${escapeHtml(label)}${id === 'installed' && list.length ? ` <span class="tx-badge">${list.length}</span>` : ''}</button>`).join('')}</nav>`;
  let body = '';
  if (modsTab === 'home') {
    body = `<div id="mod-home"></div>`;
  } else if (modsTab === 'catalog') {
    body = `<label class="tx-search tx-modsearch"><i class="icon icon-search"></i><input type="search" id="mod-q" placeholder="${t('Поиск модов')}" value="${escapeHtml(modsQuery)}" autocomplete="off" oninput="window.TelegramX.setModsQuery(this.value)"></label>
      <div class="tx-chipbar" data-noswipe>${MOD_CATS().map(([c, label]) => `<button data-c="${c}" class="${modsCat === c ? 'is-active' : ''}" onclick="window.TelegramX.setModsCat('${c}')">${escapeHtml(label)}</button>`).join('')}</div>
      <div id="mod-sets"></div><div id="mod-official"></div><div id="mod-store"></div><div id="mod-community"></div>`;
  } else if (modsTab === 'installed') {
    body = list.length
      ? `<div class="tx-group tx-instlist">${list.map((m) => {
        const mf = m.manifest;
        const sub = [modKind(m), mf.version ? 'v' + mf.version : ''].filter(Boolean).map(escapeHtml).join(' · ');
        return `<div class="tx-setrow" onclick="window.TelegramX.openSettingsPage('mod:${mf.id}')">${modThumb(m).replace('class="tx-mod-pic', 'class="tx-mod-pic')}<span class="tx-setrow-t"><b>${escapeHtml(modL(mf.name))}</b><small>${sub}</small></span><span class="tx-mod-acts" onclick="event.stopPropagation()"><label class="tx-switch"><input type="checkbox" ${m.enabled ? 'checked' : ''} onchange="window.TelegramX.toggleMod('${mf.id}', this.checked)"><span></span></label></span></div>`;
      }).join('')}</div>`
      : `<div class="tx-modempty"><span class="tx-modempty-ic"><i class="icon icon-tools"></i></span><b>${t('Модов пока нет')}</b><span>${t('Откройте «Каталог» и установите первый мод.')}</span><button class="tx-btn" onclick="window.TelegramX.setModsTab('catalog')">${t('Открыть каталог')}</button></div>`;
  } else {
    body = `
      <div class="tx-group"><div class="tx-group-title">${t('Опубликовать в каталог')}</div>${storeUi.publishList()}</div>
      <div class="tx-group-hint" style="margin-top:-6px">${t('Ваши моды увидят все пользователи TeleX: можно оценивать, ставить лайки и устанавливать в один клик.')}</div>
      ${group(
        row({ icon: 'code', color: 'PURPLE', title: t('Скопировать промпт для нейросети'), sub: t('Вставьте его в нейросеть и опишите нужный мод'), onclick: 'window.TelegramX.copyAiPrompt()' }) +
        row({ icon: 'copy', color: 'GREEN', title: t('Вставить мод из буфера'), sub: t('Готовый файл от нейросети — одним нажатием'), onclick: 'window.TelegramX.installFromClipboard()' }),
        { title: t('Мод с помощью нейросети'), hint: t('1. Нажмите «Скопировать промпт». 2. Вставьте его в нейросеть и допишите, какой мод нужен. 3. Скопируйте ответ нейросети и нажмите «Вставить мод из буфера».') },
      )}
      ${group(
        row({ icon: 'download', color: 'BLUE', title: t('Установить из файла'), sub: t('Файл .module'), onclick: "document.getElementById('mod-file').click()" }) +
        row({ icon: 'copy', color: 'GREEN', title: t('Вставить ссылку или JSON'), onclick: "document.getElementById('mod-paste').classList.toggle('tx-hidden')" }) +
        `<div id="mod-paste" class="tx-hidden">
          <label class="tx-field"><textarea id="mod-text" rows="6" placeholder="${t('Ссылка https://… или JSON мода')}" autocomplete="off" spellcheck="false"></textarea></label>
          <div style="padding:0 16px 14px"><button class="tx-btn" style="width:100%" onclick="window.TelegramX.installModText()">${t('Установить')}</button></div>
        </div>`,
        { title: t('Установка'), hint: t('Мод может сменить тему, обои и цвета сообщений, добавить пункты в меню и настройки. Мод с кодом получает полный доступ к приложению и аккаунту: ставьте только то, чему доверяете.') },
      )}
      ${group(row({ icon: 'faq', color: 'PURPLE', title: t('Документация по созданию модов'), sub: 'telex-web.ru/mods.html', onclick: `window.open('${MODS_DOCS_URL}', '_blank', 'noopener')` }))}
      <input type="file" id="mod-file" accept=".module,.json,.js,.html,application/json,text/*" hidden onchange="window.TelegramX.installModFile(this)" />`;
  }
  return `
    <div class="tx-modhead">${titleBar(t('Моды'), { back: true })}${tabs}</div>
    <div class="tx-page">
      ${body}
    </div>`;
}

/** A page of one mod set (settings page "set:<id>"): the mods inside it, each with its own button, and "install all". */
function setPage(id) {
  return `
    ${titleBar(t('Набор модов'), { back: true })}
    <div class="tx-page" id="set-box"><div class="tx-modempty"><span>${t('Загрузка…')}</span></div></div>`;
}

async function fillSet(id) {
  const box = document.getElementById('set-box');
  if (!box) return;
  let sets, cat;
  try { sets = await loadPresets(); cat = await loadCatalog(); } catch { return; }
  const p = sets.find((x) => x.id === id);
  if (!p || !document.getElementById('set-box')) return;
  const have = new Map(listMods().map((m) => [m.manifest.id, m]));
  const entries = p.mods.map((mid) => cat.find((c) => c.id === mid)).filter(Boolean);
  const pending = entries.filter((e) => !have.has(e.id) || have.get(e.id).manifest.version !== e.version).length;
  const rows = entries.map((c) => {
    const cur = have.get(c.id);
    const upToDate = cur && cur.manifest.version === c.version;
    const ic = modIcon(c.icon);
    const nm = modL(c.name);
    const pic = modPicHtml(c.icon, nm);
    return `<div class="tx-setrow">${pic}<span class="tx-setrow-t"><b>${escapeHtml(nm)} <i class="tx-verified"></i></b><small>${escapeHtml(modL(c.description) || '')}</small></span><button class="tx-mod-get ${upToDate ? 'is-done' : ''}" onclick="${upToDate ? `window.TelegramX.openSettingsPage('mod:${c.id}')` : `window.TelegramX.installOfficial('${c.id}')`}">${cur ? (upToDate ? t('Открыть') : t('Обновить')) : t('Установить')}</button></span></div>`;
  }).join('');
  box.innerHTML = `
    <div class="tx-sethero" style="--c1:${escapeHtml(p.c1 || '#7c5cff')};--c2:${escapeHtml(p.c2 || '#2fc1e6')}">
      <span class="tx-sethero-ic"><i class="icon icon-${escapeHtml(p.icon || 'tools')}"></i></span>
      <h2>${escapeHtml(modL(p.name))}</h2>
      <p>${escapeHtml(modL(p.description) || '')}</p>
    </div>
    <div class="tx-group tx-setlist"><div class="tx-group-title">${t('В наборе')} · ${entries.length}</div>${rows}</div>
    ${pending ? `<div class="tx-setbar"><button class="tx-btn" onclick="window.TelegramX.installPreset('${p.id}')">${t('Установить всё')} · ${pending}</button></div>` : `<div class="tx-group-hint" style="text-align:center">${t('Весь набор уже установлен')}</div>`}`;
}

export async function fillSetsInto(id) { return fillSets(id, true); }
async function fillSets(boxId = 'mod-sets', force = false) {
  const box = document.getElementById(boxId);
  if (!box) return;
  let sets, cat;
  try { sets = await loadPresets(); cat = await loadCatalog(); } catch { return; }
  if (!document.getElementById(boxId)) return;
  if (!sets.length || (!force && (modsQuery || modsCat !== 'all'))) { box.innerHTML = ''; return; }
  const cards = sets.map((p) => {
    const icons = p.mods.map((mid) => cat.find((c) => c.id === mid)).filter(Boolean).slice(0, 4).map((c) => {
      const ic = modIcon(c.icon);
      return ic.img ? `<span class="tx-setmini"><img src="${escapeHtml(ic.img)}" alt=""></span>` : `<span class="tx-setmini"><i class="icon icon-${escapeHtml(ic.glyph || 'tools')}"></i></span>`;
    }).join('');
    return `<button class="tx-setcard" style="--c1:${escapeHtml(p.c1 || '#7c5cff')};--c2:${escapeHtml(p.c2 || '#2fc1e6')}" onclick="window.TelegramX.openSettingsPage('set:${p.id}')">
      <span class="tx-setcard-ic"><i class="icon icon-${escapeHtml(p.icon || 'tools')}"></i></span>
      <b>${escapeHtml(modL(p.name))}</b>
      <small>${escapeHtml(modL(p.description) || '')}</small>
      <span class="tx-setcard-mods">${icons}<em>${p.mods.length}</em></span>
    </button>`;
  }).join('');
  box.innerHTML = `<div class="tx-group-title tx-sets-title">${t('Наборы модов')}</div><div class="tx-setscroll">${cards}</div>`;
}

async function fillOfficial() {
  const box = document.getElementById('mod-official');
  if (!box) return;
  let list;
  try { list = await loadCatalog(); } catch { return; }
  if (!document.getElementById('mod-official')) return;
  const have = new Map(listMods().map((m) => [m.manifest.id, m.manifest.version]));
  const shown = list.filter((c) => (modsCat === 'all' || (c.tags || []).includes(modsCat)) && (!modsQuery || `${modL(c.name)} ${modL(c.description)}`.toLowerCase().includes(modsQuery)));
  if (!shown.length) { box.innerHTML = `<div class="tx-modempty"><span class="tx-modempty-ic"><i class="icon icon-search"></i></span><b>${t('Ничего не найдено')}</b></div>`; return; }
  const cards = shown.map((c) => {
    const cur = have.get(c.id);
    const upToDate = cur != null && cur === c.version;
    const state = cur == null ? t('Установить') : !upToDate ? t('Обновить') : t('Открыть');
    const act = upToDate ? `window.TelegramX.openSettingsPage('mod:${c.id}')` : `window.TelegramX.installOfficial('${c.id}')`;
    const ic = modIcon(c.icon);
    const nm = modL(c.name);
    const pic = modPicHtml(c.icon, nm);
    return `
      <div class="tx-mod-card is-tile"${cur != null ? ` onclick="window.TelegramX.openSettingsPage('mod:${c.id}')"` : ''}>
        <span class="tx-mod-top">${pic}${cur != null ? `<span class="tx-mod-acts"><button class="tx-mod-gear" title="${t('Настройки мода')}" onclick="event.stopPropagation(); window.TelegramX.openSettingsPage('mod:${c.id}')"><i class="icon icon-settings"></i></button></span>` : ''}</span>
        <span class="tx-mod-name">${escapeHtml(nm)} <i class="tx-verified"></i></span>
        <span class="tx-mod-sub">${escapeHtml([c.version ? 'v' + c.version : '', c.author || ''].filter(Boolean).join(' · '))}</span>
        <span class="tx-mod-desc">${escapeHtml(modL(c.description) || '')}</span>
        <button class="tx-mod-get ${upToDate ? 'is-done' : ''}" onclick="event.stopPropagation(); ${act}">${state}</button>
      </div>`;
  }).join('');
  box.innerHTML = `<div class="tx-group"><div class="tx-group-title">${t('Официальные моды')}</div><div class="tx-mod-grid">${cards}</div></div>`;
}

/** "Community": mods published by pull request to the repository. They are not verified. */
async function fillCommunity() {
  const box = document.getElementById('mod-community');
  if (!box) return;
  let list;
  try { list = await loadCommunity(); } catch { return; }
  if (!document.getElementById('mod-community') || !list.length) return;
  const have = new Map(listMods().map((m) => [m.manifest.id, m.manifest.version]));
  const cards = list.map((c) => {
    const cur = have.get(c.id);
    const upToDate = cur != null && cur === c.version;
    const ic = modIcon(c.icon);
    const nm = modL(c.name) || c.id;
    const pic = modPicHtml(c.icon, nm);
    return `
      <div class="tx-mod-card is-tile"${cur != null ? ` onclick="window.TelegramX.openSettingsPage('mod:${c.id}')"` : ''}>
        <span class="tx-mod-top">${pic}</span>
        <span class="tx-mod-name">${escapeHtml(nm)}</span>
        <span class="tx-mod-sub">${escapeHtml([c.version ? 'v' + c.version : '', c.author || ''].filter(Boolean).join(' · '))}</span>
        <span class="tx-mod-desc">${escapeHtml(modL(c.description) || '')}</span>
        <button class="tx-mod-get ${upToDate ? 'is-done' : ''}" onclick="event.stopPropagation(); ${upToDate ? `window.TelegramX.openSettingsPage('mod:${c.id}')` : `window.TelegramX.installCommunity('${c.id}')`}">${cur == null ? t('Установить') : upToDate ? t('Открыть') : t('Обновить')}</button>
      </div>`;
  }).join('');
  box.innerHTML = `<div class="tx-group"><div class="tx-group-title">${t('Сообщество')}</div><div class="tx-mod-grid">${cards}</div></div><div class="tx-group-hint" style="margin-top:-6px">${t('Моды сообщества не проверяются проектом: ставьте только то, чему доверяете.')}</div>`;
}

export function installCommunityMod(id) { runInstall(installCommunity(id)); }

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export async function copyAiPrompt() {
  try {
    const ok = await copyToClipboard(await loadAiPrompt());
    showToast(ok ? t('Промпт скопирован — вставьте его в нейросеть') : t('Не удалось скопировать'));
  } catch { showToast(t('Не удалось скопировать')); }
}

/** Reads the clipboard (through the Android app when there is one), cleans markdown/chatter around the file and installs it. */
export function installFromClipboard() {
  const install = (text) => {
    if (!text || !String(text).trim()) { showToast(t('Буфер обмена пуст')); return; }
    runInstall(Promise.resolve().then(() => installMod(parseBundle(cleanPasted(text)))));
  };
  if (isAndroidApp()) {
    window.__txClip = install;
    if (postNative('clipboard')) return;
  }
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(install, () => { document.getElementById('mod-paste')?.classList.remove('tx-hidden'); showToast(t('Вставьте мод в поле ниже')); });
  } else {
    document.getElementById('mod-paste')?.classList.remove('tx-hidden');
    showToast(t('Вставьте мод в поле ниже'));
  }
}

export function installOfficialMod(id) { runInstall(installOfficial(id)); }
export function installPresetMod(id) { installPreset(id).then((n) => { if (n) showToast(t('Установлено модов: {a}', { a: n })); rerenderSettings(); }).catch((e) => showToast(String(e && e.message || e))); }

function modControl(m, def) {
  const id = m.manifest.id;
  const v = modConfigGet(m, def.key);
  const k = JSON.stringify(def.key).replace(/"/g, '&quot;');
  const set = (expr) => `window.TelegramX.modSet('${id}', ${k}, ${expr})`;
  const title = escapeHtml(modL(def.title) || def.key);
  const sub = def.sub ? escapeHtml(modL(def.sub)) : '';
  switch (def.type) {
    case 'switch': return switchRow({ title, sub, checked: !!v, onchange: set('this.checked') });
    case 'number': return `<div class="tx-group-title" style="padding-top:12px">${title}</div>` + slider({ min: def.min ?? 0, max: def.max ?? 100, step: def.step || 1, value: Number(v) || 0, oninput: set('+this.value'), left: '', right: '' });
    case 'channels': { // several channels: the value is a list of channel ids (strings)
      const cur = new Set((Array.isArray(v) ? v : []).map(String));
      const rows = (state.channels || []).map((c) => switchRow({ title: escapeHtml(c.title || String(c.id)), checked: cur.has(String(c.id)), onchange: `window.TelegramX.modSet('${id}', ${k}, window.TelegramX.modToggleChannel('${id}', ${k}, '${c.id}', this.checked))` })).join('');
      return `<div class="tx-group-title" style="padding-top:12px">${title}</div>` + (rows || `<div class="tx-group-hint" style="margin:0;padding:6px 22px 14px">${t('Каналов пока нет')}</div>`);
    }
    case 'select': if (def.optionsFrom === 'channels') return `<div class="tx-group-title" style="padding-top:12px">${title}</div>` + `<label class="tx-field"><select class="tx-mod-text" onchange="${set('this.value')}"><option value="">${t('Не выбран')}</option>${(state.channels || []).map((c) => `<option value="${c.id}" ${String(v) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.title || String(c.id))}</option>`).join('')}</select></label>`;
      return `<div class="tx-group-title" style="padding-top:12px">${title}</div>` + segments((def.options || []).map((o) => (Array.isArray(o) ? [o[0], modL(o[1])] : [o, String(o)])), v, `${set('$v')}; window.TelegramX.rerenderSettings()`);
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
    ${titleBar(modL(mf.name), { back: true })}
    <div class="tx-page">
      ${hero}
      <div class="tx-mod-meta">
        <div class="tx-mod-title">${escapeHtml(modL(mf.name))}${mf.verified ? ' <i class="tx-verified"></i>' : ''}</div>
        <div class="tx-mod-by">${[modKind(m), mf.version ? 'v' + mf.version : '', mf.author || ''].filter(Boolean).map(escapeHtml).join(' · ')}</div>
        ${tags ? `<div class="tx-mod-tags">${tags}</div>` : ''}
        ${mf.description ? `<p class="tx-mod-lead">${escapeHtml(modL(mf.description))}</p>` : ''}
        ${mf.about ? `<p class="tx-mod-about">${escapeHtml(modL(mf.about)).replace(/\n/g, '<br>')}</p>` : ''}
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

storeUi.bindStore(() => rerenderSettings());

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
  if (!(await tgDialog({ title: t('Завершить сеанс'), text: t('Завершить этот сеанс?'), ok: t('Завершить'), danger: true }))) return;
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

export async function devExportSession() {
  const value = api.exportSession();
  if (!value) {
    showToast(t('Вы не вошли в Telegram'));
    return;
  }
  if (!(await tgDialog({ title: t('Строка сессии'), text: t('Строка сессии даёт полный доступ к вашему аккаунту Telegram. Скопировать её?'), ok: t('Скопировать'), danger: true }))) return;
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
