/**
 * ====================================================================
 * NAVIGATION — screens + browser history, so the phone's back gesture
 * closes the discussion / settings subpage / media viewer like the app.
 * ====================================================================
 */

const handlers = new Map(); // view -> { enter(params), leave() }
let currentView = 'wall';
let scrollMemory = {};

export function registerView(name, hooks) {
  handlers.set(name, hooks);
}

export function currentScreen() {
  return currentView;
}

const TABS = ['wall', 'settings', 'profile'];

function depth(view, params) {
  if (view === 'thread') return 1;
  if (params && params.page && params.page !== 'root') return 1;
  return 0;
}

let current = { view: 'wall', params: {} };

function swap(view, params) {
  const app = document.getElementById('app');
  const prev = currentView;
  if (prev !== view) scrollMemory[prev] = window.scrollY;
  handlers.get(prev)?.leave?.(view);
  currentView = view;
  app.dataset.view = view;
  document.querySelectorAll('.tx-dock-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
  window.dispatchEvent(new CustomEvent('tx:view', { detail: { view, prev } }));
  handlers.get(view)?.enter?.(params);
  const restore = params.page ? 0 : scrollMemory[view] || 0;
  window.scrollTo({ top: prev === view && !params.page ? window.scrollY : restore });
}

/**
 * Telegram-like transitions via the View Transitions API: nested screens
 * slide in from the right (and out to the right on back), tab switches
 * cross-fade. Browsers without the API just switch instantly.
 */
function apply(view, params = {}) {
  if (!document.getElementById('app')) return;
  const from = current;
  current = { view, params };
  const d = depth(view, params) - depth(from.view, from.params);
  const kind = d > 0 ? 'push' : d < 0 ? 'pop' : (TABS.includes(view) && view !== from.view ? 'tab' : 'none');
  const reduce = document.body.classList.contains('tx-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!document.startViewTransition || kind === 'none' || reduce) {
    swap(view, params);
    return;
  }
  document.documentElement.dataset.nav = kind;
  const t = document.startViewTransition(() => swap(view, params));
  t.finished.finally(() => { delete document.documentElement.dataset.nav; });
}

/**
 * Switch screens. Tabs (wall/settings/profile) replace the history entry;
 * nested screens (thread, settings subpages) push one so "back" returns.
 */
export function go(view, params = {}, { push } = {}) {
  const nested = push ?? (view === 'thread' || !!params.page);
  const entry = { view, ...params };
  if (nested) history.pushState(entry, '');
  else history.replaceState(entry, '');
  apply(view, params);
}

export function back() {
  if (history.state && (history.state.view === 'thread' || history.state.page || history.state.viewer)) history.back();
  else go('wall');
}

export function initNav(onPop) {
  history.replaceState({ view: 'wall' }, '');
  window.addEventListener('popstate', (e) => {
    if (onPop && onPop(e)) return;
    const s = e.state || { view: 'wall' };
    apply(s.view || 'wall', s);
  });
}
