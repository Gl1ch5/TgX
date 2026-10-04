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

function apply(view, params = {}) {
  const app = document.getElementById('app');
  if (!app) return;
  const prev = currentView;
  if (prev !== view) scrollMemory[prev] = window.scrollY;
  handlers.get(prev)?.leave?.(view);
  currentView = view;
  app.dataset.view = view;
  document.querySelectorAll('.tx-dock-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === view));
  handlers.get(view)?.enter?.(params);
  const restore = params.page ? 0 : scrollMemory[view] || 0;
  requestAnimationFrame(() => window.scrollTo({ top: prev === view && !params.page ? window.scrollY : restore }));
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
