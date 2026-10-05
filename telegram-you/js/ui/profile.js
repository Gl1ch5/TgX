// Profile screen of a person / group / channel: photo, actions, info, shared media tabs, ⋮ menu.
import { S, t, escapeHtml, mu, avatar, statusText, showMenu, confirmBox, toast, msgTime } from './store.js';
import { I } from './icons.js';

const TABS = () => [['media', t('Медиа')], ['files', t('Файлы')], ['links', t('Ссылки')], ['music', t('Музыка')], ['voice', t('Голосовые')], ['gif', 'GIF']];
let state = null;

export async function openProfile(key, { onChat } = {}) {
  const d = S.dialogs.get(key) || S.archived.find((x) => x.id === key) || { id: key, title: '', kind: 'user' };
  const el = document.createElement('section');
  el.className = 'cx-profile';
  document.body.appendChild(el);
  state = { key, tab: 'media', el, info: { ...d, about: '', phone: '', status: d.status }, onChat };
  history.pushState({ profile: key }, '');
  draw();
  try {
    const info = await S.tg.chatProfile(key);
    state.info = { ...state.info, ...info };
    draw();
  } catch (e) { console.warn('[chat] profile', e); }
  loadTab();
}

export function closeProfile(fromPop = false) {
  if (!state) return;
  state.el.remove();
  state = null;
  if (!fromPop && history.state && history.state.profile) history.back();
}
window.addEventListener('popstate', () => { if (state && !(history.state && history.state.profile)) closeProfile(true); });

function draw() {
  if (!state) return;
  const { info, tab } = state;
  const hero = info.avatar ? `<img src="${escapeHtml(mu(info.avatar))}" alt="" onerror="this.remove()">` : '';
  const phone = info.phone ? `+${String(info.phone).replace(/^\+/, '')}` : '';
  const rows = [
    phone && `<div class="r"><b>${escapeHtml(phone)}</b><span>${t('Телефон')}</span></div>`,
    info.username && `<div class="r"><b>@${escapeHtml(info.username)}</b><span>${info.kind === 'user' ? t('Имя пользователя') : t('Ссылка')}</span><i>${I.qr}</i></div>`,
    info.about && `<div class="r"><b>${escapeHtml(info.about)}</b><span>${info.kind === 'user' ? t('О себе') : t('Описание')}</span></div>`,
  ].filter(Boolean).join('');
  const status = statusText(info.status, info.kind);
  state.el.innerHTML = `
    <div class="hero tx-peer-${Math.abs(Number(String(info.id).replace(/\D/g, '').slice(-3)) || 0) % 7}">${hero}<span class="ini">${escapeHtml((info.title || '?')[0].toUpperCase())}</span>
      <div class="bar"><button class="cx-icon" data-a="back" aria-label="${t('Назад')}">${I.back}</button><button class="cx-icon" data-a="more" aria-label="${t('Меню')}">${I.more}</button></div>
      <div class="who"><h2>${escapeHtml(info.self ? t('Избранное') : info.title)}</h2><span>${escapeHtml(status)}</span></div>
      <div class="acts"><button data-a="chat">${I.newmsg}<span>${t('Чат')}</span></button><button data-a="mute">${info.muted ? I.sound : I.soundOff}<span>${info.muted ? t('Звук') : t('Без звука')}</span></button><button data-a="call">${I.call}<span>${t('Звонок')}</span></button><button data-a="video">${I.video}<span>${t('Видео')}</span></button></div>
    </div>
    ${rows ? `<div class="cx-card info">${rows}</div>` : ''}
    <div class="tabs cx-pill">${TABS().map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`).join('')}</div>
    <div class="shared" id="cx-shared"></div>`;
  state.el.onclick = onClick;
  renderShared();
}

async function loadTab() {
  if (!state) return;
  const { key, tab } = state;
  state.shared = state.shared || {};
  if (state.shared[tab]) return renderShared();
  try {
    const res = await S.tg.chatShared(key, tab, { limit: 36 });
    if (!state || state.key !== key) return;
    state.shared[tab] = res.messages;
  } catch { state.shared[tab] = []; }
  renderShared();
}

function renderShared() {
  if (!state) return;
  const box = state.el.querySelector('#cx-shared');
  if (!box) return;
  const list = (state.shared && state.shared[state.tab]) || null;
  if (!list) { box.innerHTML = `<div class="cx-loading">…</div>`; return; }
  if (!list.length) { box.innerHTML = `<div class="cx-end">${t('Здесь пока пусто')}</div>`; return; }
  const tab = state.tab;
  if (tab === 'media' || tab === 'gif') {
    box.className = 'shared grid3';
    box.innerHTML = list.map((m) => { const x = m.media && m.media[0]; if (!x) return ''; const src = x.type === 'photo' ? x.url : (x.thumb_url || x.url); return `<span class="cell"><img src="${escapeHtml(mu(src))}" alt="" loading="lazy">${x.type === 'video' ? `<i>${I.play}</i>` : ''}</span>`; }).join('');
  } else if (tab === 'links') {
    box.className = 'shared';
    box.innerHTML = list.map((m) => `<a class="cx-set" href="${escapeHtml((m.webpage && m.webpage.url) || '#')}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;height:auto;padding:12px 16px;flex-direction:column;align-items:flex-start;gap:2px"><b>${escapeHtml((m.webpage && (m.webpage.title || m.webpage.site_name)) || m.text.slice(0, 60))}</b><span style="color:var(--tx-accent);font-size:14px">${escapeHtml((m.webpage && m.webpage.display_url) || '')}</span></a>`).join('');
  } else {
    box.className = 'shared';
    box.innerHTML = list.map((m) => { const x = m.media && m.media[0]; return `<a class="cx-set" href="${escapeHtml(mu(x ? x.url : '#'))}" style="text-decoration:none;color:inherit">${I.file}<span>${escapeHtml(x ? (x.filename || x.title || t('Файл')) : '')}</span><em>${msgTime(m.date)}</em></a>`; }).join('');
  }
}

function moreMenu(x, y) {
  const i = state.info;
  const soon = () => toast(t('Скоро'));
  const user = i.kind === 'user';
  const items = user ? [
    { icon: I.timer, label: t('Автоудаление'), arrow: true, run: soon },
    { icon: I.share, label: t('Поделиться контактом'), sep: true, run: () => { const u = i.username ? `https://t.me/${i.username}` : ''; navigator.clipboard?.writeText(u || i.title).then(() => toast(t('Скопировано'))); } },
    { icon: I.block, label: i.blocked ? t('Разблокировать') : t('Заблокировать'), run: async () => { try { await S.tg.chatBlock(i.id, !i.blocked); i.blocked = !i.blocked; toast(i.blocked ? t('Пользователь заблокирован') : t('Пользователь разблокирован')); } catch { toast(t('Не удалось изменить')); } } },
    { icon: I.userEdit, label: t('Изменить контакт'), run: soon },
    { icon: I.trash, label: t('Удалить контакт'), run: async () => { if (await confirmBox(t('Удалить контакт «{a}»?', { a: i.title }), t('Удалить'))) { try { await S.tg.chatDeleteContact(i.id); toast(t('Контакт удалён')); } catch { toast(t('Не удалось удалить')); } } } },
    { icon: I.gift, label: t('Отправить подарок'), run: soon },
    { icon: I.lock, label: t('Начать секретный чат'), run: soon },
    { icon: I.noCopy, label: t('Запретить копирование'), run: soon },
    { icon: I.shortcut, label: t('Создать ярлык'), run: soon },
    { icon: I.download, label: t('Сохранить в галерею'), run: soon },
    { icon: I.report, label: t('Пожаловаться'), danger: true, run: soon },
  ] : [
    { icon: I.share, label: t('Поделиться'), run: () => { const u = i.username ? `https://t.me/${i.username}` : ''; navigator.clipboard?.writeText(u || i.title).then(() => toast(t('Скопировано'))); } },
    { icon: I.logout, label: i.kind === 'channel' ? t('Покинуть канал') : t('Покинуть группу'), danger: true, run: async () => { if (await confirmBox(t('Покинуть «{a}»?', { a: i.title }), t('Покинуть'))) { try { await S.tg.chatLeave(i.id); toast(t('Готово')); closeProfile(); } catch { toast(t('Не удалось изменить')); } } } },
    { icon: I.report, label: t('Пожаловаться'), danger: true, run: soon },
  ];
  showMenu(x, y, items);
}

async function onClick(e) {
  const b = e.target.closest('[data-a]');
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; state.el.querySelectorAll('[data-tab]').forEach((n) => n.classList.toggle('on', n === tabBtn)); loadTab(); return; }
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'back' || a === 'chat') return closeProfile();
  if (a === 'more') { const r = b.getBoundingClientRect(); return moreMenu(r.right - 300, r.bottom); }
  if (a === 'mute') { const i = state.info; try { await S.tg.chatMute(i.id, !i.muted); i.muted = !i.muted; const d = S.dialogs.get(i.id); if (d) d.muted = i.muted; draw(); } catch { toast(t('Не удалось изменить')); } return; }
  if (a === 'call' || a === 'video') return toast(t('Звонки скоро'));
}
