/**
 * ====================================================================
 * COMPONENT: AVATARS (Telegram peer colors + initials fallback)
 * ====================================================================
 */

import { escapeHtml } from '../utils.js';

export function peerColor(id) {
  const n = Math.abs(Number(String(id || 0).replace(/\D/g, '').slice(-9)) || 0);
  return n % 7;
}

function initials(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0]).join('');
  return letters.toUpperCase() || '?';
}

/** Avatar markup for a channel / user ({ id, title|name, avatar }). */
export function avatarHtml(peer, size = '', extra = '') {
  const p = peer || {};
  const title = p.title || p.name || '';
  // Initials are always underneath: if the photo fails to load, the letters stay visible.
  const img = p.avatar
    ? `<img src="${escapeHtml(p.avatar)}" alt="" loading="lazy" decoding="async" onerror="this.remove()" />`
    : '';
  return `<span class="tx-avatar ${size} tx-peer-${peerColor(p.id)} ${extra}"><span class="tx-avatar-ini">${escapeHtml(initials(title))}</span>${img}</span>`;
}
