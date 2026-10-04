package io.github.gl1ch5.telex

import android.net.Uri

/** The one place that says which site the app shows. */
object AppConfig {
    /** Live TeleX web app on GitHub Pages — the APK always opens the current version. */
    const val START_URL = "https://gl1ch5.github.io/TgX/app/static/"

    /** Everything under this prefix stays inside the app; other links open outside. */
    const val SCOPE_PREFIX = "https://gl1ch5.github.io/TgX/"

    /** Origin allowed to talk to the native bridge (downloads, retry). */
    const val ORIGIN = "https://gl1ch5.github.io"

    /** Name of the JS object the page sees (window.TeleXNative.postMessage). */
    const val BRIDGE_NAME = "TeleXNative"

    fun isInScope(uri: Uri): Boolean {
        val url = uri.toString()
        return url.startsWith(SCOPE_PREFIX) || url == SCOPE_PREFIX.trimEnd('/')
    }

    fun isSameOrigin(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host.equals("gl1ch5.github.io", ignoreCase = true) &&
            (uri.port == -1 || uri.port == 443)
}
