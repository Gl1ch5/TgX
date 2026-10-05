// Minimal navigation for the settings/profile views ported from TeleX: the chat app owns the real routing.
export function go(view, params = {}) {
  window.dispatchEvent(new CustomEvent('cx:go', { detail: { view, params } }));
}
export function back() {
  window.dispatchEvent(new Event('cx:back'));
}
