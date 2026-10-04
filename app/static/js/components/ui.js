/**
 * ====================================================================
 * UI BUILDERS — Telegram list rows, switches, sliders, page headers
 * ====================================================================
 */

import { escapeHtml } from '../utils.js';

/** Page title bar; pass `back` to show the arrow (nested pages). */
export function titleBar(title, { back = false, actions = '' } = {}) {
  return `
    <div class="tx-titlebar">
      ${back ? '<button class="tx-icon-btn" onclick="window.TelegramX.back()" title="Назад"><i class="icon icon-arrow-left"></i></button>' : ''}
      <h1>${escapeHtml(title)}</h1>
      ${actions}
    </div>`;
}

export function group(content, { title = '', hint = '' } = {}) {
  return `
    <div class="tx-group">
      ${title ? `<div class="tx-group-title">${escapeHtml(title)}</div>` : ''}
      ${content}
    </div>
    ${hint ? `<div class="tx-group-hint" style="margin-top:-8px;padding-bottom:16px">${escapeHtml(hint)}</div>` : ''}`;
}

/** A tappable row. `icon` + `color` render Telegram's colored square. */
export function row({ icon = '', color = '', avatar = '', title, sub = '', value = '', onclick = '', danger = false, html = '' }) {
  const tag = onclick ? 'button' : 'div';
  return `
    <${tag} class="tx-row ${danger ? 'is-danger' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
      ${icon ? `<span class="tx-row-icon" style="--c:${color}"><i class="icon icon-${icon}"></i></span>` : ''}
      ${avatar}
      <span class="tx-row-body">
        <span class="tx-row-title">${title}</span>
        ${sub ? `<span class="tx-row-sub">${sub}</span>` : ''}
      </span>
      ${value ? `<span class="tx-row-value">${value}</span>` : ''}
      ${html}
    </${tag}>`;
}

/** Row with a switch on the right; `onchange` receives `this.checked`. */
export function switchRow({ icon = '', color = '', avatar = '', title, sub = '', checked = false, onchange }) {
  return `
    <label class="tx-row">
      ${icon ? `<span class="tx-row-icon" style="--c:${color}"><i class="icon icon-${icon}"></i></span>` : ''}
      ${avatar}
      <span class="tx-row-body">
        <span class="tx-row-title">${title}</span>
        ${sub ? `<span class="tx-row-sub">${sub}</span>` : ''}
      </span>
      <span class="tx-switch"><input type="checkbox" ${checked ? 'checked' : ''} onchange="${onchange}" /><span></span></span>
    </label>`;
}

export function slider({ min, max, value, step = 1, oninput, left = '', right = '' }) {
  const p = ((value - min) / (max - min)) * 100;
  return `
    <div class="tx-slider">
      <span>${left}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="--p:${p}%"
        oninput="this.style.setProperty('--p', ((this.value-${min})/(${max - min})*100)+'%'); ${oninput}" />
      <span>${right}</span>
    </div>`;
}

export function segments(options, current, onpick) {
  return `<div class="tx-segments">${options.map(([v, label]) =>
    `<button class="${String(v) === String(current) ? 'is-active' : ''}" onclick="${onpick.replace('$v', JSON.stringify(v).replace(/"/g, '&quot;'))}">${escapeHtml(label)}</button>`).join('')}</div>`;
}
