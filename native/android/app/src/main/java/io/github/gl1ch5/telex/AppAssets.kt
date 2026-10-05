package io.github.gl1ch5.telex

import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import android.webkit.WebResourceResponse
import java.io.FileNotFoundException

/**
 * The web app is packed into the APK (assets/web). Requests for https://telex-web.ru/app/static/…
 * are answered from there, without the network: the first screen is drawn at once and everything
 * works offline. The origin is unchanged, so localStorage / IndexedDB (the Telegram session) stay.
 * Files that are not packed fall through to the network.
 */
class AppAssets(private val context: Context) {

    fun intercept(uri: Uri): WebResourceResponse? {
        val url = uri.buildUpon().clearQuery().fragment(null).build().toString()
        if (!url.startsWith(AppConfig.START_URL)) return null
        var path = Uri.decode(url.removePrefix(AppConfig.START_URL))
        if (path.isEmpty() || path.endsWith("/")) path += "index.html"
        if (path.startsWith("media/") || path.contains("..")) return null // media is the service worker's job
        return try {
            val stream = context.assets.open("web/$path")
            val ext = path.substringAfterLast('.', "")
            val mime = when (ext) {
                "js", "mjs" -> "text/javascript"
                "css" -> "text/css"
                "html" -> "text/html"
                "json", "webmanifest" -> "application/json"
                "svg" -> "image/svg+xml"
                "webp" -> "image/webp"
                else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
            }
            WebResourceResponse(mime, if (mime.startsWith("text/") || mime == "application/json") "utf-8" else null, stream).apply {
                responseHeaders = mapOf("Cache-Control" to "no-cache", "Access-Control-Allow-Origin" to AppConfig.ORIGIN)
            }
        } catch (e: FileNotFoundException) {
            null
        } catch (e: Exception) {
            null
        }
    }
}
