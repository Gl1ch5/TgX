/**
 * ====================================================================
 * MEDIA BRIDGE — the service worker (sw.js) intercepts requests to
 * "media/…" and asks this page to download the bytes through GramJS.
 * ====================================================================
 */

import { telegram, workerMode } from './tg.js';

/*
 * Download scheduler. Fast scrolling used to fire dozens of downloads at once,
 * and since MTProto decryption runs on the page thread everything froze.
 * Now small things (avatars, thumbnails, custom emoji) and video chunks that
 * are playing go first, big photos wait in a LIFO queue (the newest request is
 * what's on screen right now), and only a few run at the same time.
 * Identical requests share one download.
 */
const SMALL = new Set(['avatar', 'cemoji', 'thumb', 'cthumb', 'storythumb']);
// With GramJS in a worker, decryption no longer competes with the interface,
// so more downloads can run side by side.
const LIMIT = workerMode ? { high: 8, normal: 6 } : { high: 6, normal: 3 };
const running = { high: 0, normal: 0 };
const queues = { high: [], normal: [] };
const shared = new Map();

function priorityOf(path, range) {
  const kind = path.split('/')[0];
  return SMALL.has(kind) || range ? 'high' : 'normal';
}

function pump() {
  for (const lane of ['high', 'normal']) {
    while (running[lane] < LIMIT[lane] && queues[lane].length) {
      const job = lane === 'normal' ? queues[lane].pop() : queues[lane].shift();
      running[lane] += 1;
      job.run().finally(() => {
        running[lane] -= 1;
        pump();
      });
    }
  }
}

function schedule(path, range) {
  const key = range ? null : path;
  if (key && shared.has(key)) return shared.get(key);
  const lane = priorityOf(path, range);
  const promise = new Promise((resolve, reject) => {
    queues[lane].push({ run: () => telegram.fetchMedia(path, range).then(resolve, reject) });
    pump();
  });
  if (key) {
    shared.set(key, promise);
    promise.finally(() => shared.delete(key)).catch(() => {});
  }
  return promise;
}

export async function initMediaBridge(swUrl = 'sw.js', scope = './') {
  if (!('serviceWorker' in navigator)) {
    console.warn('[TeleX] Service workers are not supported: media will not load');
    return;
  }

  navigator.serviceWorker.addEventListener('message', async (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'telex-media' || !event.ports[0]) return;
    const port = event.ports[0];
    try {
      const res = await schedule(msg.path, msg.range);
      if (!res) {
        port.postMessage({ ok: false, status: 404 });
        return;
      }
      const buf = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength);
      port.postMessage({ ok: true, body: buf, mime: res.mime, size: res.size, offset: res.offset, full: !!res.full }, [buf]);
    } catch (e) {
      console.warn('[TeleX] media failed', msg.path, e);
      port.postMessage({ ok: false, status: 502 });
    }
  });

  // A new release activated its service worker: reload once to run fresh code.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    try {
      if (sessionStorage.getItem('telex.swReload')) return;
      sessionStorage.setItem('telex.swReload', '1');
    } catch {}
    location.reload();
  });
  setTimeout(() => { try { sessionStorage.removeItem('telex.swReload'); } catch {} }, 10000);

  // Keep the media cache from being evicted (Chrome grants this to installed/engaged sites).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const reg = await navigator.serviceWorker.register(swUrl, { scope, updateViaCache: 'none' });
  reg.update().catch(() => {});
  await navigator.serviceWorker.ready;

  // First visit: the page loaded before the worker existed — wait until it takes control.
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      setTimeout(resolve, 3000);
    });
  }
}
