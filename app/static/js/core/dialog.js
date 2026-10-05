// Telegram-style dialogs (the browser's alert/confirm look foreign, especially on a phone).
//   tgDialog({ title, text, ok, cancel, icon, danger, html }) → Promise<boolean>   (cancel: false = a single button)
import { t } from '../i18n.js';
import { escapeHtml } from '../utils.js';

export function tgDialog({ title = '', text = '', ok, cancel, icon = '', danger = false, html = '' } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'tx-dialog-back';
    const okLabel = ok || t('ОК');
    const cancelLabel = cancel === undefined ? t('Отмена') : cancel;
    el.innerHTML = `<div class="tx-dialog" role="dialog" aria-modal="true">
      ${icon ? `<div class="tx-dialog-icon">${icon}</div>` : ''}
      ${title ? `<h3 class="tx-dialog-title">${escapeHtml(title)}</h3>` : ''}
      ${html || (text ? `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` : '')}
      <div class="tx-dialog-btns">${cancelLabel === false ? '' : `<button data-v="0">${escapeHtml(cancelLabel)}</button>`}<button data-v="1" class="is-main${danger ? ' is-danger' : ''}">${escapeHtml(okLabel)}</button></div>
    </div>`;
    const done = (v) => { el.classList.add('is-out'); setTimeout(() => el.remove(), 140); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b && e.target !== el) return;
      done(!!b && b.dataset.v === '1');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(el);
  });
}

/** A one-button notice. */
export const tgNotice = (title, text, ok) => tgDialog({ title, text, ok: ok || t('ОК'), cancel: false });
