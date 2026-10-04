/**
 * ====================================================================
 * MEDIA BRIDGE — the service worker (sw.js) intercepts requests to
 * "media/…" and asks this page to download the bytes through GramJS.
 * ====================================================================
 */

import { telegram } from './telegram.js';

export async function initMediaBridge() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[TeleX] Service workers are not supported: media will not load');
    return;
  }

  navigator.serviceWorker.addEventListener('message', async (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'telex-media' || !event.ports[0]) return;
    const port = event.ports[0];
    try {
      const res = await telegram.fetchMedia(msg.path, msg.range);
      if (!res) {
        port.postMessage({ ok: false, status: 404 });
        return;
      }
      const buf = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength);
      port.postMessage({ ok: true, body: buf, mime: res.mime, size: res.size, offset: res.offset }, [buf]);
    } catch (e) {
      console.warn('[TeleX] media failed', msg.path, e);
      port.postMessage({ ok: false, status: 502 });
    }
  });

  await navigator.serviceWorker.register('sw.js', { scope: './' });
  await navigator.serviceWorker.ready;

  // First visit: the page loaded before the worker existed — wait until it takes control.
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      setTimeout(resolve, 3000);
    });
  }
}
