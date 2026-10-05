// Anchored popup menu for the views ported from TeleX (settings, profile): items = [{icon, label, danger, run}].
import { showMenu } from '../ui/store.js';
import { icon } from '../ui/icons.js';

const FILES = { reload: 'msg_retry.webp', faq: 'settings_faq.svg', link: 'msg_link2.webp', logout: 'msg_leave.webp', 'profile-edit': 'msg_edit.webp', 'profile-photo': 'msg_photos.webp', photo: 'msg_photos.webp' };

export function openPopup(anchor, { items = [] } = {}) {
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { right: 200, bottom: 60, left: 0 };
  showMenu(Math.max(8, r.right - 250), r.bottom, items.map((it) => ({ ...it, icon: FILES[it.icon] ? icon(FILES[it.icon]) : '' })));
}
