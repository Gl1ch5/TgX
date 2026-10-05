package io.github.gl1ch5.telex

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * One-time move of the web app's data (Telegram session, settings, cached
 * feed) from the old address (gl1ch5.github.io) to the domain. Web storage
 * belongs to an origin, so without this everyone would be logged out.
 *
 * A hidden WebView opens an empty page *as* the old origin (no network:
 * loadDataWithBaseURL), reads its telex.* keys, then opens an empty page as
 * the new origin and writes them there, unless that origin already has a
 * session of its own.
 */
class StorageMigration(private val context: Context) {
    private val prefs = context.getSharedPreferences("telex", Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())

    fun needed(): Boolean = !prefs.getBoolean(DONE_KEY, false)

    @SuppressLint("SetJavaScriptEnabled")
    fun run(done: () -> Unit) {
        var finished = false
        val view = WebView(context)
        val finish = {
            if (!finished) {
                finished = true
                prefs.edit().putBoolean(DONE_KEY, true).apply()
                main.post { view.destroy() }
                done()
            }
        }
        main.postDelayed({ finish() }, TIMEOUT_MS)
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        var step = 0
        var data: String? = null
        view.webViewClient = object : WebViewClient() {
            override fun onPageFinished(v: WebView, url: String?) {
                if (finished) return
                when (step) {
                    0 -> v.evaluateJavascript(READ_JS) { result ->
                        data = result?.takeIf { it != "null" && it.length > 2 }
                        if (data == null || !data!!.contains("telex.session")) {
                            finish()
                        } else {
                            step = 1
                            v.loadDataWithBaseURL(AppConfig.START_URL, BLANK, "text/html", "utf-8", null)
                        }
                    }
                    1 -> {
                        step = 2
                        // evaluateJavascript returns the JSON string quoted: decode it once.
                        val json = try { org.json.JSONTokener(data).nextValue() as String } catch (e: Exception) { null }
                        if (json == null) {
                            finish()
                        } else {
                            v.evaluateJavascript(writeJs(json)) { r ->
                                Log.i(TAG, "storage migration: $r")
                                finish()
                            }
                        }
                    }
                }
            }
        }
        view.loadDataWithBaseURL(AppConfig.LEGACY_START_URL, BLANK, "text/html", "utf-8", null)
    }

    private fun writeJs(json: String): String = """
        (function(){
          try {
            if (localStorage.getItem('telex.session')) return 'kept';
            var d = ${JSONObject.quote(json)};
            var o = JSON.parse(d), n = 0;
            for (var k in o) { localStorage.setItem(k, o[k]); n++; }
            return 'copied ' + n;
          } catch (e) { return 'failed ' + e; }
        })()
    """.trimIndent()

    companion object {
        private const val TAG = "TeleX"
        private const val DONE_KEY = "storageMigrated"
        private const val TIMEOUT_MS = 4000L
        private const val BLANK = "<!doctype html><html><body></body></html>"
        private const val READ_JS = """
            (function(){
              try {
                var o = {};
                for (var i = 0; i < localStorage.length; i++) {
                  var k = localStorage.key(i);
                  if (k && k.indexOf('telex.') === 0) o[k] = localStorage.getItem(k);
                }
                return JSON.stringify(o);
              } catch (e) { return null; }
            })()
        """
    }
}
