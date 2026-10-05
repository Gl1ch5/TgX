// Shared state + tiny event bus + helpers of the chat client.
import { t, tn, locale } from '../i18n.js';
import { escapeHtml } from '../utils.js';
export { t, tn, locale, escapeHtml };

export const S = {
  tg: null,
  me: null,
  dialogs: new Map(),   // key -> dialog
  order: [],            // keys, as shown in "all chats"
  cursor: null,
  hasMore: true,
  loading: false,
  folders: [],          // [{id,title,...}]
  folder: 'all',
  archived: [],         // dialogs in the archive
  openId: null,
  tab: 'chats',
  typing: new Map(),    // key -> {name, until}
};

const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

/** Media URLs from the service are relative to /app/static/, this page is one level deeper. */
export const mu = (u) => u || '';

export function toast(msg) {
  const el = document.getElementById('toast');
  const m = document.getElementById('toast-msg');
  if (!el || !m) return;
  m.textContent = msg;
  el.classList.remove('opacity-0');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('opacity-0'), 2400);
}

export function initials(title) {
  const w = String(title || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (w.map((x) => Array.from(x)[0]).join('') || '?').toUpperCase();
}
export const peerColor = (id) => Math.abs(Number(String(id || 0).replace(/\D/g, '').slice(-9)) || 0) % 7;

export function avatar(p, extra = '') {
  const img = p.avatar ? `<img src="${escapeHtml(mu(p.avatar))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  return `<span class="tx-avatar tx-peer-${peerColor(p.id)} ${extra}"><span class="tx-avatar-ini">${escapeHtml(initials(p.title || p.name || p.senderName))}</span>${img}</span>`;
}

const WD = () => [t('вс'), t('пн'), t('вт'), t('ср'), t('чт'), t('пт'), t('сб')];
const hm = (d) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** Chat-list time: 11:53 today, «ср» this week, «10 сент.» earlier. */
export function listTime(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hm(d);
  if (now - d < 6 * 86400000) return WD()[d.getDay()];
  const o = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== now.getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString(locale(), o);
}
export const msgTime = (unix) => hm(new Date(unix * 1000));
export function dayLabel(unix) {
  const d = new Date(unix * 1000);
  const o = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
  return d.toLocaleDateString(locale(), o);
}
export const dayKey = (unix) => new Date(unix * 1000).toDateString();

/** "в сети" / "был(а) недавно" / "1 234 участника" for a dialog.status. */
export function statusText(st, kind) {
  if (!st) return '';
  switch (st.kind) {
    case 'online': return t('в сети');
    case 'bot': return t('бот');
    case 'recently': return t('был(а) недавно');
    case 'week': return t('был(а) на этой неделе');
    case 'month': return t('был(а) в этом месяце');
    case 'long': return t('был(а) давно');
    case 'offline': {
      const d = new Date(st.at * 1000);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return t('был(а) в {a}', { a: hm(d) });
      const y = new Date(now - 86400000);
      if (d.toDateString() === y.toDateString()) return t('был(а) вчера в {a}', { a: hm(d) });
      return t('был(а) {a}', { a: d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) });
    }
    case 'members':
      if (!st.count) return kind === 'channel' ? t('канал') : t('группа');
      return kind === 'channel'
        ? tn(['{n} подписчик', '{n} подписчика', '{n} подписчиков'], st.count, { n: st.count.toLocaleString(locale()) })
        : tn(['{n} участник', '{n} участника', '{n} участников'], st.count, { n: st.count.toLocaleString(locale()) });
    default: return '';
  }
}

/**
 * Opens a floating menu near (x, y): items = [{icon, label, danger, arrow, run}].
 * opts.reactions = ['👍', …] adds the quick-reaction bar above the menu; opts.onReact(emoji).
 */
export function showMenu(x, y, items, opts = {}) {
  const el = document.getElementById('cx-menu');
  const react = opts.reactions && opts.reactions.length
    ? `<div class="reactbar">${opts.reactions.map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>` : '';
  el.innerHTML = `${react}<div class="sheet">${items.map((it, i) => `<button class="${it.danger ? 'danger' : ''} ${it.sep ? 'sep' : ''}" data-i="${i}">${it.icon || ''}<span>${escapeHtml(it.label)}</span>${it.arrow ? '<em>›</em>' : ''}</button>`).join('')}</div>`;
  el.classList.remove('tx-hidden');
  const sheet = el.querySelector('.sheet');
  const bar = el.querySelector('.reactbar');
  const w = sheet.offsetWidth, h = sheet.offsetHeight + (bar ? 62 : 0);
  const left = Math.max(8, Math.min(x, innerWidth - w - 8));
  const top = Math.max(bar ? 70 : 8, Math.min(y, innerHeight - h - 8));
  if (bar) { bar.style.left = Math.max(8, Math.min(x - 20, innerWidth - bar.offsetWidth - 8)) + 'px'; bar.style.top = top - 62 + 'px'; }
  sheet.style.left = left + 'px';
  sheet.style.top = top + 'px';
  const close = () => { el.classList.add('tx-hidden'); el.innerHTML = ''; el.onclick = null; };
  el.onclick = (e) => {
    const r = e.target.closest('.reactbar button');
    if (r) { close(); opts.onReact && opts.onReact(r.dataset.e); return; }
    const b = e.target.closest('.sheet button');
    close();
    if (b) items[Number(b.dataset.i)].run();
  };
  el.oncontextmenu = (e) => { e.preventDefault(); close(); };
}

/** Confirmation sheet; resolves true/false. */
export function confirmBox(text, okLabel, danger = true) {
  return new Promise((resolve) => {
    const el = document.getElementById('cx-menu');
    el.innerHTML = `<div class="dlg"><p>${escapeHtml(text)}</p><div><button data-v="0">${t('Отмена')}</button><button data-v="1" class="${danger ? 'danger' : ''}">${escapeHtml(okLabel)}</button></div></div>`;
    el.classList.remove('tx-hidden');
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b && e.target.closest('.dlg')) return;
      el.classList.add('tx-hidden'); el.innerHTML = ''; el.onclick = null;
      resolve(!!b && b.dataset.v === '1');
    };
  });
}
