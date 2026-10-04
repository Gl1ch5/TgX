package io.github.gl1ch5.telex

import org.json.JSONObject

/** Small HTML/JS snippets injected into the WebView. */
object WebAssets {

    /**
     * Download helper, injected into every TeleX page (idempotent).
     *
     * Media in TeleX is served by the page's Service Worker ("media/…" URLs) or is
     * a blob:/data: URL, so Android's DownloadManager cannot fetch it. Instead the
     * page fetches the bytes itself (through its Service Worker) and streams them
     * to the app in base64 chunks over window.TeleXNative.
     */
    val DOWNLOAD_HELPER_JS: String = """
(function () {
  if (window.__telexDl) return;
  var BRIDGE = '${AppConfig.BRIDGE_NAME}';
  var CHUNK = 192 * 1024;
  var seq = 0;
  function bridge() { return window[BRIDGE]; }
  function send(o) { bridge().postMessage(JSON.stringify(o)); }
  function readB64(blob) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); ok(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { fail(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function nameFrom(res, url) {
    var cd = res.headers.get('content-disposition') || '';
    var m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    try {
      var p = new URL(url).pathname.split('/').pop();
      if (p) return decodeURIComponent(p);
    } catch (e) {}
    return 'file';
  }
  window.__telexDl = function (url, name, mime) {
    if (!bridge()) return false;
    var id = 'd' + Date.now() + '_' + (seq++);
    (async function () {
      try {
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var blob = await res.blob();
        var type = mime || blob.type || res.headers.get('content-type') || 'application/octet-stream';
        send({ t: 'begin', id: id, name: name || nameFrom(res, url), mime: type, size: blob.size });
        for (var off = 0; off < blob.size; off += CHUNK) {
          send({ t: 'chunk', id: id, d: await readB64(blob.slice(off, off + CHUNK)) });
        }
        send({ t: 'end', id: id });
      } catch (e) {
        send({ t: 'fail', id: id, error: String(e && e.message || e) });
      }
    })();
    return true;
  };
  window.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (!a || !a.href || !bridge()) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.protocol === 'blob:' || u.protocol === 'data:' || u.origin === location.origin) {
      e.preventDefault();
      window.__telexDl(u.href, a.getAttribute('download') || '');
    }
  }, true);
})();
""".trimIndent()

    /** JS call that hands one download to the page helper above. */
    fun downloadCall(url: String, name: String, mime: String?): String =
        "window.__telexDl ? window.__telexDl(${JSONObject.quote(url)}, ${JSONObject.quote(name)}, " +
            "${JSONObject.quote(mime ?: "")}) : false"

    /** Dark offline page shown when the main frame fails to load. */
    fun errorPage(details: String?): String {
        val safe = (details ?: "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return """
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Нет соединения</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; color: #fff;
    font-family: -apple-system, system-ui, Roboto, "Segoe UI", sans-serif; }
  .wrap { min-height: 100%; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 24px; box-sizing: border-box; text-align: center; }
  .icon { width: 84px; height: 84px; border-radius: 50%; background: #5a83f3;
    display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
  p { color: #8e8e93; font-size: 15px; line-height: 1.4; margin: 0 0 28px; max-width: 320px; }
  small { color: #48484a; font-size: 12px; margin-top: 18px; word-break: break-word; }
  button { appearance: none; border: 0; border-radius: 14px; background: #5a83f3; color: #fff;
    font-size: 17px; font-weight: 600; padding: 14px 44px; }
  button:active { opacity: .7; }
</style>
</head>
<body>
<div class="wrap">
  <div class="icon">
    <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff"><path d="M2.5,11.2L20.8,4.1C21.7,3.8 22.4,4.4 22.1,5.7L19,20.3C18.8,21.3 18.1,21.6 17.3,21.1L12.6,17.6L10.3,19.8C10.1,20 9.8,20.2 9.4,20.2L9.7,15.4L18.4,7.5C18.8,7.2 18.3,7 17.8,7.3L7,14.1L2.4,12.7C1.4,12.4 1.4,11.7 2.5,11.2Z"/></svg>
  </div>
  <h1>Нет соединения</h1>
  <p>Не удалось загрузить TeleX. Проверьте подключение к интернету и попробуйте ещё раз.</p>
  <button id="retry">Повторить</button>
  <small>$safe</small>
</div>
<script>
  document.getElementById('retry').onclick = function () {
    try { window.${AppConfig.BRIDGE_NAME}.postMessage('retry'); }
    catch (e) { location.replace(${JSONObject.quote(AppConfig.START_URL)}); }
  };
</script>
</body>
</html>
""".trimIndent()
    }
}
