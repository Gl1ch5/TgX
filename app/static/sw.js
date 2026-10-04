/**
 * TeleX service worker: serves "media/…" URLs (avatars, photos, video/audio
 * streams) by asking the open page to download them from Telegram via GramJS.
 * Images are cached in Cache Storage; documents are streamed in chunks via Range.
 */

const MEDIA_CACHE = 'telex-media-v1';
const SW_VERSION = '3.3.0';
const CACHEABLE = new Set(['avatar', 'avatarbig', 'photo', 'thumb', 'webpage', 'cemoji', 'cmedia', 'cthumb', 'storythumb']);
const STREAMED = new Set(['doc', 'story']);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// App code (HTML/CSS/JS) is always revalidated with the server, so a new
// release never mixes with stale cached modules. Stable assets (emoji,
// wallpapers, vendor bundles) keep using the normal HTTP cache.
const STABLE = /\/(emoji|wallpapers|js\/vendor)\//;
const APP_CODE = /(\.(js|css|html)$|\/$)/;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || event.request.method !== 'GET') return;

  if (url.pathname.startsWith(scope.pathname + 'media/')) {
    event.respondWith(serveMedia(event, url.pathname.slice(scope.pathname.length + 'media/'.length)));
    return;
  }

  if (APP_CODE.test(url.pathname) && !STABLE.test(url.pathname)) {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).catch(() => caches.match(event.request)));
  }
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
