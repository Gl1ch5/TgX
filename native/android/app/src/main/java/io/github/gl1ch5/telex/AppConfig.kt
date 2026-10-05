package io.github.gl1ch5.telex

import android.net.Uri

/** The one place that says which site the app shows. */
object AppConfig {
    const val HOST = "telex-web.ru"

    /** Live TeleX web app — the APK always opens the current version. */
    const val START_URL = "https://$HOST/app/static/"

    /** Everything under this prefix stays inside the app; other links open outside. */
    const val SCOPE_PREFIX = "https://$HOST/"

    /** Origin allowed to talk to the native bridge (downloads, retry). */
    const val ORIGIN = "https://$HOST"

    /** Where the app lived before the domain (GitHub Pages now redirects it here). */
    const val LEGACY_HOST = "gl1ch5.github.io"
    const val LEGACY_PREFIX = "https://$LEGACY_HOST/TgX/"
    const val LEGACY_START_URL = "https://$LEGACY_HOST/TgX/app/static/"
    const val LEGACY_ORIGIN = "https://$LEGACY_HOST"

    /** Name of the JS object the page sees (window.TeleXNative.postMessage). */
    const val BRIDGE_NAME = "TeleXNative"

    fun isInScope(uri: Uri): Boolean {
        val url = uri.toString()
        return url.startsWith(SCOPE_PREFIX) || url == SCOPE_PREFIX.trimEnd('/') ||
            url.startsWith(LEGACY_PREFIX) // redirects to the domain
    }

    fun isSameOrigin(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host.equals(HOST, ignoreCase = true) &&
            (uri.port == -1 || uri.port == 443)
}
