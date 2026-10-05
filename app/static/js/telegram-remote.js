import { t } from './i18n.js';
/**
 * ====================================================================
 * TELEGRAM (WORKER MODE) — same interface as telegram.js, but every call
 * goes to js/tg-worker.js, where GramJS runs in its own thread. The page
 * never loads GramJS itself. A few synchronous helpers are answered here.
 * ====================================================================
 */

const worker = new Worker(new URL('./tg-worker.js', import.meta.url), { type: 'module' });

let seq = 0;
let cbSeq = 0;
const pending = new Map();   // call id -> { resolve, reject, cbs }
const callbacks = new Map(); // cb id -> function
const PERSISTENT = new Set(['startLive', 'startChatLive']); // their callbacks live on after the call returns

let ready;
const readyPromise = new Promise((r) => { ready = r; });

function snapshot() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('telex.')) out[k] = localStorage.getItem(k);
    }
  } catch {}
  return out;
}

worker.onmessage = (event) => {
  const msg = event.data || {};
  switch (msg.type) {
    case 'ready':
      ready();
      break;
    case 'result': {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      p.cbs.forEach((id) => callbacks.delete(id));
      if (msg.ok) p.resolve(msg.result);
      else p.reject(Object.assign(new Error(msg.error.message), msg.error));
      break;
    }
    case 'cb': {
      const fn = callbacks.get(msg.id);
      if (fn) fn(...(msg.args || []));
      break;
    }
    case 'ls':
      try {
        if (msg.value == null) localStorage.removeItem(msg.key);
        else localStorage.setItem(msg.key, msg.value);
      } catch {}
      break;
    case 'event':
      if (msg.name === 'readChange' && remote.onReadChange) remote.onReadChange();
      break;
    case 'log':
      (console[msg.level] || console.log)('[TeleX worker]', msg.text);
      break;
    default:
  }
};
worker.onerror = (e) => console.error('[TeleX] worker failed', e.message || e);

worker.postMessage({ type: 'init', storage: snapshot(), visible: document.visibilityState === 'visible' });

// Keep the worker's view of the page in sync.
document.addEventListener('visibilitychange', () => worker.postMessage({ type: 'visibility', visible: document.visibilityState === 'visible' }));
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('telex.')) worker.postMessage({ type: 'storage', key: e.key, value: e.newValue });
});

/** Replace functions (anywhere in plain objects) with callback handles. */
function pack(arg, cbs) {
  if (typeof arg === 'function') {
    const id = ++cbSeq;
    callbacks.set(id, arg);
    cbs.push(id);
    return { __cb: id };
  }
  if (arg && typeof arg === 'object' && !Array.isArray(arg) && !(arg instanceof Blob) && Object.getPrototypeOf(arg) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(arg)) out[k] = pack(v, cbs);
    return out;
  }
  return arg;
}

async function call(method, args) {
  await readyPromise;
  const id = ++seq;
  const cbs = [];
  const packed = args.map((a) => pack(a, cbs));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, cbs: PERSISTENT.has(method) ? [] : cbs });
    worker.postMessage({ type: 'call', id, method, args: packed });
  });
}

// ---------------- synchronous helpers answered on the page ----------------

function lsJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const commentsCache = new Map();
let lastInfo = { connected: false, dc: null, hasSession: false, authorized: false };

const local = {
  hasSession: () => !!lsJson('telex.session', ''),
  cachedMe: () => lsJson('telex.me', null),
  exportSession: () => lsJson('telex.session', ''),
  cachedComments: (ch, msg) => commentsCache.get(`${ch}_${msg}`) || null,
  connectionInfo: () => {
    call('connectionInfo', []).then((i) => { lastInfo = i; }).catch(() => {});
    return { ...lastInfo, hasSession: local.hasSession() };
  },
  authError(e) {
    const code = e && e.errorMessage;
    const messages = {
      PHONE_CODE_INVALID: t('Неверный код подтверждения'),
      PHONE_CODE_EXPIRED: t('Срок действия кода истёк. Запросите новый.'),
      PHONE_NUMBER_INVALID: t('Неверный номер телефона'),
      PASSWORD_HASH_INVALID: t('Неверный облачный пароль'),
    };
    if (code === 'SESSION_PASSWORD_NEEDED') return { status: '2fa_needed', message: t('Требуется облачный пароль (2FA)') };
    if (code && code.startsWith('FLOOD_WAIT')) return { status: 'error', message: t('Слишком много попыток. Попробуйте позже.') };
    return { status: 'error', message: messages[code] || (e && e.message) || String(e) };
  },
  // Fire-and-forget calls: same names, no awaited result.
  warmUp: () => { call('warmUp', []).catch(() => {}); },
  markSeen: (...a) => { call('markSeen', a).catch(() => {}); },
  cancelQrLogin: () => { call('cancelQrLogin', []).catch(() => {}); },
  setVerbose: (on) => { call('setVerbose', [on]).catch(() => {}); },
  async getComments(ch, msg, opts = {}) {
    const res = await call('getComments', [ch, msg, opts]);
    if (!opts.offsetId) commentsCache.set(`${ch}_${msg}`, res);
    return res;
  },
};

const remote = new Proxy({ onReadChange: null, isWorker: true }, {
  get(target, name) {
    if (name in target) return target[name];
    if (name in local) return local[name];
    if (name === 'then') return undefined; // not a thenable
    return (...args) => call(name, args);
  },
  set(target, name, value) {
    target[name] = value;
    return true;
  },
});

export const telegram = remote;

/** Tell the worker that the page changed a setting (prefs live in localStorage). */
export function syncStorage(key) {
  try {
    worker.postMessage({ type: 'storage', key, value: localStorage.getItem(key) });
  } catch {}
}
