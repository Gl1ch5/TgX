// Mod store screens: home (recommendations), search results, a mod's page, publishing. Talks to core/store.js.
import { state } from '../state.js';
import { escapeHtml, showToast } from '../utils.js';
import { t } from '../i18n.js';
import { tgDialog } from '../core/dialog.js';
import { listMods, installMod, parseBundle, L, modPicHtml, loadCatalog, loadPresets } from '../core/mods.js';
import * as store from '../core/store.js';

let rerender = () => {};
export const bindStore = (fn) => { rerender = fn; };

const num = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}K` : String(n || 0));
const installedMap = () => new Map(listMods().map((m) => [m.manifest.id, m]));
const stars = (v) => (v ? v.toFixed(1) : '—');

function statLine(m) {
  return `<span class="tx-stat"><i class="icon icon-stars-filled"></i>${stars(m.rating)}</span><span class="tx-stat"><i class="icon icon-download"></i>${num(m.downloads)}</span><span class="tx-stat"><i class="icon icon-heart"></i>${num(m.likes)}</span>`;
}

function stateOf(m) {
  const cur = installedMap().get(m.id);
  if (!cur) return ['install', t('Установить')];
  return cur.manifest.version === m.version ? ['open', t('Открыть')] : ['update', t('Обновить')];
}

/** A tile (grid) for a mod of the store. */
export function storeTile(m) {
  const [st, label] = stateOf(m);
  const act = st === 'open' ? `window.TelegramX.openSettingsPage('mod:${m.id}')` : `window.TelegramX.storeInstall('${m.id}')`;
  return `<div class="tx-mod-card is-tile" onclick="window.TelegramX.openSettingsPage('store:${m.id}')">
    <span class="tx-mod-top">${modPicHtml(m.icon, m.name)}</span>
    <span class="tx-mod-name">${escapeHtml(L(m.name))}</span>
    <span class="tx-mod-sub">${escapeHtml(m.author || '')}</span>
    <span class="tx-stats">${statLine(m)}</span>
    <span class="tx-mod-desc">${escapeHtml(L(m.description) || '')}</span>
    <button class="tx-mod-get ${st === 'open' ? 'is-done' : ''}" onclick="event.stopPropagation(); ${act}">${label}</button>
  </div>`;
}

/** A compact horizontal card (recommendations carousel). */
function storeMini(m) {
  return `<button class="tx-minicard" onclick="window.TelegramX.openSettingsPage('store:${m.id}')">${modPicHtml(m.icon, m.name)}<b>${escapeHtml(L(m.name))}</b><small>${escapeHtml(L(m.description) || '')}</small><span class="tx-stats">${statLine(m)}</span></button>`;
}

/** A ranked row (top list). */
function storeRow(m, i) {
  const [st, label] = stateOf(m);
  const act = st === 'open' ? `window.TelegramX.openSettingsPage('mod:${m.id}')` : `window.TelegramX.storeInstall('${m.id}')`;
  return `<div class="tx-setrow" onclick="window.TelegramX.openSettingsPage('store:${m.id}')"><span class="tx-rank">${i + 1}</span>${modPicHtml(m.icon, m.name)}<span class="tx-setrow-t"><b>${escapeHtml(L(m.name))}</b><small class="tx-stats">${statLine(m)}</small></span><button class="tx-mod-get ${st === 'open' ? 'is-done' : ''}" onclick="event.stopPropagation(); ${act}">${label}</button></div>`;
}

const section = (title, body, more = '') => `<div class="tx-sec"><div class="tx-sec-h"><b>${escapeHtml(title)}</b>${more}</div>${body}</div>`;

// ---------------------------------------------------------------- home tab

export async function fillHome() {
  const box = document.getElementById('mod-home');
  if (!box) return;
  let home = null;
  try { home = await store.storeHome(); } catch {}
  if (!document.getElementById('mod-home')) return;
  const mods = listMods();
  const catCards = (cats) => `<div class="tx-catgrid">${cats.map((c) => `<button onclick="window.TelegramX.setModsCat('${c.id}'); window.TelegramX.setModsTab('catalog')"><i class="icon icon-${CAT_ICON[c.id] || 'tools'}"></i><b>${escapeHtml(CAT_NAME()[c.id] || c.id)}</b>${c.count != null ? `<small>${c.count}</small>` : ''}</button>`).join('')}</div>`;
  let html = `<div class="tx-modhero"><span class="tx-modhero-ic"><i class="icon icon-tools"></i></span><div><b>${t('Моды TeleX')}</b><small>${t('Установлено: {a}', { a: mods.filter((m) => m.enabled).length })}${home ? ' · ' + t('В каталоге: {a}', { a: home.total }) : ''}</small></div></div><div id="home-sets"></div>`;
  if (home && home.total) {
    if (home.featured.length) html += section(t('Рекомендуем'), `<div class="tx-hscroll" data-noswipe>${home.featured.map(storeMini).join('')}</div>`);
    if (home.recommended.length) html += section(t('Для вас'), `<div class="tx-hscroll" data-noswipe>${home.recommended.map(storeMini).join('')}</div>`);
    html += section(t('Категории'), catCards(home.categories));
    if (home.trending.length) html += `<div class="tx-sec"><div class="tx-sec-h"><b>${t('Популярное')}</b></div><div class="tx-group tx-instlist">${home.trending.slice(0, 8).map(storeRow).join('')}</div></div>`;
    if (home.newest.length) html += section(t('Новинки'), `<div class="tx-hscroll" data-noswipe>${home.newest.map(storeMini).join('')}</div>`);
  } else {
    // offline or the store is empty: the built-in catalog speaks for itself
    html += `${catCards(['theme', 'feed', 'widget', 'ai'].map((id) => ({ id })))}`;
    html += `<div class="tx-group-hint" style="text-align:center">${home ? t('В каталоге пока нет модов сообщества. Опубликуйте первый на вкладке «Создать».') : t('Каталог сообщества недоступен, показаны официальные моды.')}</div>`;
  }
  box.innerHTML = html;
  window.TelegramX.fillSetsInto('home-sets');
}

const CAT_ICON = { theme: 'brush', feed: 'channel', widget: 'clock', ai: 'ai', tools: 'tools' };
const CAT_NAME = () => ({ theme: t('Темы'), feed: t('Лента'), widget: t('Виджеты'), ai: t('ИИ'), tools: t('Инструменты') });

// ---------------------------------------------------------------- catalog tab (store part)

export async function fillStoreList(q, cat) {
  const box = document.getElementById('mod-store');
  if (!box) return;
  let res;
  try { res = await store.storeList({ q, category: cat }); } catch { if (box) box.innerHTML = ''; return; }
  if (!document.getElementById('mod-store')) return;
  box.innerHTML = res.items.length ? `<div class="tx-group"><div class="tx-group-title">${t('Сообщество')}</div><div class="tx-mod-grid">${res.items.map(storeTile).join('')}</div></div>` : '';
}

// ---------------------------------------------------------------- a mod's page

export function storePage() {
  return `<div class="tx-modhead"><div class="tx-titlebar"><button class="tx-icon-btn" onclick="window.TelegramX.back()"><i class="icon icon-arrow-left"></i></button><h1>${t('Мод')}</h1></div></div><div class="tx-page" id="store-box"><div class="tx-modempty"><span>${t('Загрузка…')}</span></div></div>`;
}

export async function fillStorePage(id) {
  const box = document.getElementById('store-box');
  if (!box) return;
  let m;
  try { m = await store.storeGet(id); } catch (e) { box.innerHTML = `<div class="tx-modempty"><b>${t('Мод не найден')}</b><span>${escapeHtml(e.message)}</span></div>`; return; }
  if (!document.getElementById('store-box')) return;
  const [st, label] = stateOf(m);
  const mine = store.myPublished().includes(m.id);
  const act = st === 'open' ? `window.TelegramX.openSettingsPage('mod:${m.id}')` : `window.TelegramX.storeInstall('${m.id}')`;
  const my = m.myRating || 0;
  box.innerHTML = `
    <div class="tx-mod-hero">${modPicHtml(m.icon, m.name).replace('class="tx-mod-pic', 'class="tx-mod-pic is-big')}</div>
    <div class="tx-mod-meta"><div class="tx-mod-title">${escapeHtml(L(m.name))}</div><div class="tx-mod-by">${escapeHtml(m.author || '')} · v${escapeHtml(m.version)}</div></div>
    <div class="tx-bigstats"><div><b>${stars(m.rating)}</b><small>${t('Оценок: {a}', { a: m.ratings })}</small></div><div><b>${num(m.downloads)}</b><small>${t('Установок')}</small></div><div><b>${num(m.likes)}</b><small>${t('Нравится')}</small></div></div>
    <div class="tx-store-actions"><button class="tx-btn" onclick="${act}">${label}</button><button class="tx-btn tx-btn-ghost ${m.liked ? 'is-on' : ''}" onclick="window.TelegramX.storeLike('${m.id}', ${!m.liked})"><i class="icon icon-${m.liked ? 'heart' : 'heart-outline'}"></i></button></div>
    ${m.flags && m.flags.length ? `<div class="tx-dialog-note is-warn" style="margin:12px 0"><b>${t('Автопроверка сервера')}</b>${escapeHtml(m.flags.join(', '))}</div>` : ''}
    <div class="tx-mod-lead">${escapeHtml(L(m.description) || '')}</div>
    ${m.about ? `<div class="tx-mod-about">${escapeHtml(L(m.about)).replace(/\n/g, '<br>')}</div>` : ''}
    <div class="tx-group" style="padding:14px 16px"><div class="tx-group-title" style="padding:0 0 8px">${t('Ваша оценка')}</div><div class="tx-rate">${[1, 2, 3, 4, 5].map((n) => `<button class="${n <= my ? 'is-on' : ''}" onclick="window.TelegramX.storeRate('${m.id}', ${n})"><i class="icon icon-${n <= my ? 'stars-filled' : 'star'}"></i></button>`).join('')}</div></div>
    ${m.permissions && m.permissions.includes('ai') ? `<div class="tx-group-hint">${t('Мод использует ИИ через ваш ключ Groq.')}</div>` : ''}
    <div class="tx-group-hint">${t('Моды из каталога сообщества не проверяются проектом: ставьте только то, чему доверяете.')}</div>
    <div style="display:flex;gap:10px;padding:6px 0 18px">${mine ? `<button class="tx-btn tx-btn-ghost is-danger" style="flex:1" onclick="window.TelegramX.storeUnpublish('${m.id}')">${t('Убрать из каталога')}</button>` : `<button class="tx-btn tx-btn-ghost" style="flex:1" onclick="window.TelegramX.storeReport('${m.id}')">${t('Пожаловаться')}</button>`}</div>`;
}

// ---------------------------------------------------------------- actions

export async function storeInstall(id) {
  try {
    const text = await store.storeFile(id);
    const ok = await installMod(parseBundle(text));
    if (ok) { store.storeDownloaded(id); showToast(t('Мод установлен')); }
  } catch (e) { showToast(String(e && e.message || e)); }
  rerender();
}
export async function storeLike(id, on) { try { await store.storeLike(id, on); } catch (e) { showToast(e.message); } rerender(); }
export async function storeRate(id, value) { try { await store.storeRate(id, value); showToast(t('Спасибо за оценку')); } catch (e) { showToast(e.message); } rerender(); }
export async function storeReport(id) {
  if (!(await tgDialog({ title: t('Пожаловаться на мод'), text: t('Если мод опасен или нарушает правила, он будет скрыт после нескольких жалоб.'), ok: t('Пожаловаться'), danger: true }))) return;
  try { await store.storeReport(id, 'reported'); showToast(t('Жалоба отправлена')); } catch (e) { showToast(e.message); }
}
export async function storeUnpublish(id) {
  if (!(await tgDialog({ title: t('Убрать из каталога?'), text: t('Мод пропадёт из каталога для всех. На ваших устройствах он останется.'), ok: t('Убрать'), danger: true }))) return;
  try { await store.storeDelete(id); store.forgetPublished(id); showToast(t('Мод убран из каталога')); history.back(); } catch (e) { showToast(e.message); }
}

/** Publish tab: your own mods with a button each. */
export function publishList() {
  const mine = new Set(store.myPublished());
  const own = listMods().filter((m) => !m.manifest.official);
  if (!own.length) return `<div class="tx-group-hint" style="padding:6px 22px 14px">${t('Своих модов пока нет. Установите мод из файла или создайте его с помощью нейросети.')}</div>`;
  return `<div class="tx-group tx-instlist">${own.map((m) => {
    const mf = m.manifest;
    return `<div class="tx-setrow">${modPicHtml(mf.icon, mf.name)}<span class="tx-setrow-t"><b>${escapeHtml(L(mf.name))}</b><small>v${escapeHtml(mf.version || '1.0.0')}${mine.has(mf.id) ? ' · ' + t('в каталоге') : ''}</small></span><button class="tx-mod-get ${mine.has(mf.id) ? 'is-done' : ''}" onclick="window.TelegramX.storePublish('${mf.id}')">${mine.has(mf.id) ? t('Обновить') : t('Опубликовать')}</button></div>`;
  }).join('')}</div>`;
}

export async function storePublish(id) {
  const mod = listMods().find((m) => m.manifest.id === id);
  if (!mod) return;
  const ok = await tgDialog({
    title: t('Опубликовать «{a}»?', { a: L(mod.manifest.name) }),
    text: t('Мод станет доступен всем в каталоге TeleX: его смогут находить, оценивать и устанавливать. Публикуйте только свою работу и не добавляйте в код ничего вредного.'),
    ok: t('Опубликовать'),
  });
  if (!ok) return;
  try {
    const author = (state.user && (state.user.name || state.user.username)) || '';
    const r = await store.storePublish(mod, author);
    store.rememberPublished(id);
    showToast(r.updated ? t('Мод обновлён в каталоге') : t('Мод опубликован'));
  } catch (e) {
    showToast(e.status ? String(e.message) : t('Каталог недоступен. Попробуйте позже.'));
  }
  rerender();
}
