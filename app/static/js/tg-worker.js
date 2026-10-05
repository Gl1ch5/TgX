/**
 * ====================================================================
 * TELEGRAM WORKER — runs the whole GramJS client (MTProto, encryption,
 * downloads) in its own thread, like Telegram Web A, so decrypting media
 * never blocks scrolling and animations on the page.
 *
 * Protocol (page ⇄ worker):
 *   page → {type:'init', storage, visible}     storage = localStorage snapshot
 *   page → {type:'call', id, method, args}     args may contain {__cb:n} functions
 *   page → {type:'storage', key, value|null}   page-side change (prefs, …)
 *   page → {type:'visibility', visible}
 *   worker → {type:'ready'} | {type:'result', id, ok, result|error}
 *   worker → {type:'cb', id, args}             callback invocation
 *   worker → {type:'ls', key, value|null}      persist to the page's localStorage
 *   worker → {type:'event', name}              e.g. readChange
 *   worker → {type:'log', level, text}
 * ====================================================================
 */

let telegram = null;
let prefsModule = null;
const store = new Map();
const docListeners = new Set();

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

// ---------------- environment shims ----------------

function installShims(snapshot, visible) {
  // GramJS treats "no window" as Node.js and would try TCP sockets: make it see a browser.
  if (typeof self.window === 'undefined') self.window = self;
  for (const [k, v] of Object.entries(snapshot || {})) store.set(k, v);
  self.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      store.set(k, s);
      post({ type: 'ls', key: k, value: s });
    },
    removeItem: (k) => {
      store.delete(k);
      post({ type: 'ls', key: k, value: null });
    },
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  // telegram.js only needs visibility (to pause live polling in background).
  self.document = {
    visibilityState: visible ? 'visible' : 'hidden',
    addEventListener: (type, fn) => { if (type === 'visibilitychange') docListeners.add(fn); },
    removeEventListener: (type, fn) => docListeners.delete(fn),
  };
  for (const level of ['error', 'warn', 'info']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      try {
        post({ type: 'log', level, text: args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'object' ? safeJson(a) : String(a))).join(' ') });
      } catch {}
    };
  }
}

function safeJson(a) {
  try { return JSON.stringify(a); } catch { return String(a); }
}

// ---------------- callbacks & results ----------------

function revive(arg) {
  if (arg && typeof arg === 'object' && !Array.isArray(arg) && !(arg instanceof Blob)) {
    if ('__cb' in arg) {
      const id = arg.__cb;
      return (...args) => post({ type: 'cb', id, args });
    }
    const out = {};
    for (const [k, v] of Object.entries(arg)) out[k] = revive(v);
    return out;
  }
  return arg;
}

/** Media bytes are copied out of GramJS's pooled buffers, then transferred (zero-copy to the page). */
function prepare(method, result) {
  if (method === 'fetchMedia' && result && result.bytes) {
    const bytes = Uint8Array.prototype.slice.call(result.bytes);
    return { value: { ...result, bytes }, transfer: [bytes.buffer] };
  }
  return { value: result, transfer: [] };
}

function serializeError(e) {
  return {
    message: (e && e.message) || String(e),
    errorMessage: e && e.errorMessage,
    code: e && e.code,
    seconds: e && e.seconds,
  };
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === 'init') {
    installShims(msg.storage, msg.visible);
    prefsModule = await import('./core/prefs.js');
    ({ telegram } = await import('./telegram.js'));
    telegram.onReadChange = () => post({ type: 'event', name: 'readChange' });
    post({ type: 'ready' });
    return;
  }
  if (msg.type === 'storage') {
    if (msg.value == null) store.delete(msg.key);
    else store.set(msg.key, msg.value);
    if (prefsModule && prefsModule.reloadPrefs) prefsModule.reloadPrefs();
    return;
  }
  if (msg.type === 'visibility') {
    self.document.visibilityState = msg.visible ? 'visible' : 'hidden';
    docListeners.forEach((fn) => { try { fn(); } catch {} });
    return;
  }
  if (msg.type === 'call') {
    const { id, method, args } = msg;
    try {
      if (!telegram || typeof telegram[method] !== 'function') throw new Error(`unknown method ${method}`);
      const result = await telegram[method](...(args || []).map(revive));
      const { value, transfer } = prepare(method, result);
      post({ type: 'result', id, ok: true, result: value }, transfer);
    } catch (e) {
      post({ type: 'result', id, ok: false, error: serializeError(e) });
    }
  }
};
