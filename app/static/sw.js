/**
 * TeleX service worker: serves "media/…" URLs (avatars, photos, video/audio
 * streams) by asking the open page to download them from Telegram via GramJS.
 * Images are cached in Cache Storage; documents are streamed in chunks via Range.
 */

/**
 * TeleX service worker.
 *  1. The whole app (html/css/js/icons) is precached on install (precache.json, built by
 *     tools/build-precache.mjs) and served cache-first: the interface opens instantly, offline,
 *     and inside the Android/Windows apps. A new release changes BUILD → a new worker installs the
 *     new files in the background and they are used from the next start (no half-updated mix:
 *     the cache is replaced as a whole).
 *  2. Emoji, wallpapers and other big static files are cached the first time they are used.
 *  3. "media/…" URLs (avatars, photos, video/audio) are answered by asking the open page to
 *     download them from Telegram via GramJS. Images are cached; documents are streamed (Range).
 */

const MEDIA_CACHE = 'telex-media-v1';
const BUILD = '3dbbb19898'; // replaced by tools/build-precache.mjs: changes with every file → a new worker
const SW_VERSION = '3.14.0';
const CACHEABLE = new Set(['avatar', 'avatarbig', 'photo', 'thumb', 'webpage', 'cemoji', 'cmedia', 'cthumb', 'storythumb', 'photofull', 'wallpaper']);
const STREAMED = new Set(['doc', 'story']);

const APP_CACHE = `telex-app-${BUILD}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      const list = await (await fetch('precache.json', { cache: 'no-store' })).json();
      // addAll is all-or-nothing; fall back to one by one so a single missing file never blocks the update.
      try { await cache.addAll(list.files); } catch { await Promise.all(list.files.map((f) => cache.add(f).catch(() => {}))); }
    } catch {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Drop app caches of older builds (the media cache is kept).
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('telex-app-') && k !== APP_CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

/** Static app file: cache first (it is precached); files not listed (emoji, wallpapers) are cached when first used. */
async function appFile(request) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') cache.put(request, res.clone()).catch(() => {});
  return res;
}

// Tap on a notification: focus the app and open the chat/channel.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all.find((c) => c.visibilityState === 'visible') || all[0];
    if (client) await client.focus();
    else await self.clients.openWindow(self.registration.scope);
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || event.request.method !== 'GET') return;

  if (url.pathname.startsWith(scope.pathname + 'media/')) {
    event.respondWith(serveMedia(event, url.pathname.slice(scope.pathname.length + 'media/'.length)));
    return;
  }
  // Everything else under the scope is the app itself. It must be answered here: inside the
  // Android WebView a request the worker passes through bypasses the native asset interceptor.
  if (url.pathname.startsWith(scope.pathname)) event.respondWith(appFile(event.request));
});

async function pageClient(event) {
  const own = event.clientId && await self.clients.get(event.clientId);
  if (own) return own;
  const all = await self.clients.matchAll({ type: 'window' });
  return all[0];
}

async function askPage(event, path, range) {
  const client = await pageClient(event);
  if (!client) return { ok: false, status: 503 };
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve({ ok: false, status: 504 }), 120000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    client.postMessage({ type: 'telex-media', path, range }, [channel.port2]);
  });
}

function parseRange(header) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(header || '');
  return m ? { start: Number(m[1]), end: m[2] ? Number(m[2]) : null } : null;
}

async function serveMedia(event, path) {
  const kind = path.split('/')[0];
  const range = STREAMED.has(kind) ? parseRange(event.request.headers.get('range')) : null;

  if (CACHEABLE.has(kind)) {
    const cache = await caches.open(MEDIA_CACHE);
    const hit = await cache.match(event.request.url);
    if (hit) return hit;
    const res = await askPage(event, path, null);
    if (!res.ok) return new Response(null, { status: res.status || 404 });
    const response = new Response(res.body, {
      headers: { 'Content-Type': res.mime, 'Cache-Control': 'max-age=31536000' },
    });
    await cache.put(event.request.url, response.clone());
    return response;
  }

  // Small documents are cached whole; serve any range from the cached copy.
  const cache = await caches.open(MEDIA_CACHE);
  let cached = await cache.match(event.request.url);
  if (!cached) {
    const first = await askPage(event, path, range);
    if (!first.ok) return new Response(null, { status: first.status || 404 });
    if (!first.full) return rangeResponse(first, range);
    cached = new Response(first.body, { headers: { 'Content-Type': first.mime, 'Content-Length': String(first.size) } });
    await cache.put(event.request.url, cached.clone());
  }
  if (!range) return cached;
  const body = await cached.arrayBuffer();
  return rangeResponse({ body, mime: cached.headers.get('Content-Type'), size: body.byteLength, offset: 0 }, range);
}

function rangeResponse(res, range) {

  if (range && res.size != null) {
    if (range.start >= res.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${res.size}` } });
    }
    // Streamed chunk: the page fetched an aligned block starting at res.offset.
    const body = new Uint8Array(res.body);
    const from = range.start - res.offset;
    let to = body.length;
    if (range.end != null) to = Math.min(to, range.end - res.offset + 1);
    const slice = body.slice(Math.max(0, from), Math.max(0, to));
    const end = range.start + slice.length - 1;
    return new Response(slice, {
      status: 206,
      headers: {
        'Content-Type': res.mime,
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${range.start}-${end}/${res.size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  return new Response(res.body, {
    headers: { 'Content-Type': res.mime, 'Accept-Ranges': 'bytes' },
  });
}
