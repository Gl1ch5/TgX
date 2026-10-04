/**
 * ====================================================================
 * DEVELOPER TOOLS — in-memory log buffer, connection overlay, helpers
 * used by Settings → "Для разработчиков".
 * ====================================================================
 */

import { api } from '../api.js';
import { getPrefs, onPrefsChange } from './prefs.js';
import { APP_VERSION } from '../version.js';

const MAX_LOGS = 400;
const logs = [];

function push(level, args) {
  const text = args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (a && typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
  logs.push(`${new Date().toISOString().slice(11, 23)} ${level} ${text}`);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
}

/** Keep the last few hundred warnings/errors so they can be exported from the app. */
export function captureLogs() {
  for (const level of ['error', 'warn', 'info']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      push(level.toUpperCase(), args);
      original(...args);
    };
  }
  window.addEventListener('error', (e) => push('UNCAUGHT', [e.message, `${e.filename}:${e.lineno}`]));
  window.addEventListener('unhandledrejection', (e) => push('REJECTION', [e.reason]));
}

export function logCount() {
  return logs.length;
}

export function clearLogs() {
  logs.length = 0;
}

export function nativeVersion() {
  const m = /TeleXAndroid\/([\w.]+)/.exec(navigator.userAgent);
  if (m) return `Android ${m[1]}`;
  return /Electron/.test(navigator.userAgent) ? 'Windows (Electron)' : null;
}

export function isAndroidApp() {
  return /TeleXAndroid\//.test(navigator.userAgent);
}

export function postNative(message) {
  const bridge = window.TeleXNative;
  if (!bridge) return false;
  bridge.postMessage(message);
  return true;
}

export function diagnostics() {
  const info = api.connectionInfo();
  return [
    `TeleX ${APP_VERSION}`,
    `Native: ${nativeVersion() || 'нет (браузер)'}`,
    `URL: ${location.href}`,
    `UA: ${navigator.userAgent}`,
    `Screen: ${screen.width}x${screen.height} @${devicePixelRatio}`,
    `Viewport: ${innerWidth}x${innerHeight}`,
    `SW: ${navigator.serviceWorker && navigator.serviceWorker.controller ? 'active' : 'none'}`,
    `Telegram: ${getPrefs().workerMode ? 'worker thread' : 'page thread'}`,
    `MTProto: ${info.connected ? 'connected' : 'disconnected'}, DC ${info.dc ?? '—'}, session ${info.hasSession ? 'yes' : 'no'}`,
    `Prefs: ${JSON.stringify(getPrefs())}`,
  ].join('\n');
}

/** Save text as a file (the Android app intercepts a[download] and saves it natively). */
export function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function exportLogs() {
  downloadText(`telex-log-${Date.now()}.txt`, `${diagnostics()}\n\n---- log ----\n${logs.join('\n')}\n`);
}

/** Drop the Service Worker and cached app code, then reload from the network. */
export async function hardReload() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {}
  try { sessionStorage.clear(); } catch {}
  location.reload();
}

// ---------------- Connection overlay ----------------

let overlay = null;
let timer = null;

async function tick() {
  if (!overlay) return;
  const info = api.connectionInfo();
  let ping = '—';
  if (info.connected) {
    try { ping = `${await api.ping()} ms`; } catch { ping = 'timeout'; }
  }
  if (!overlay) return;
  overlay.textContent = `${info.connected ? '●' : '○'} DC${info.dc ?? '?'} · ${ping} · ${logs.length} log`;
  overlay.classList.toggle('is-bad', !info.connected || ping === 'timeout');
}

function syncOverlay() {
  const on = !!getPrefs().devOverlay;
  if (on && !overlay) {
    overlay = document.createElement('div');
    overlay.className = 'tx-dev-overlay';
    overlay.textContent = '…';
    document.body.appendChild(overlay);
    tick();
    timer = setInterval(tick, 5000);
  } else if (!on && overlay) {
    overlay.remove();
    overlay = null;
    clearInterval(timer);
  }
  api.setVerbose(!!getPrefs().devVerbose);
}

export function initDevtools() {
  syncOverlay();
  onPrefsChange(syncOverlay);
}
