package io.github.gl1ch5.telex

import android.Manifest
import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.URLUtil
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Saves files the user downloads from TeleX.
 *
 *  - Plain http(s) files from other sites go through the system DownloadManager.
 *  - TeleX's own media ("media/…" answered by its Service Worker) and blob:/data:
 *    URLs are fetched by the page and streamed here in chunks (see WebAssets).
 */
class Downloads(private val activity: Activity) {

    private class Pending(val name: String, val mime: String, val file: File, val out: FileOutputStream)

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val pending = HashMap<String, Pending>() // touched only on the io thread

    /** DownloadListener entry point. Returns JS to run in the page, or null. */
    fun onDownloadStart(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?): String? {
        val uri = Uri.parse(url)
        val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
        return try {
            when {
                uri.scheme == "blob" || uri.scheme == "data" || AppConfig.isSameOrigin(uri) ->
                    WebAssets.downloadCall(url, name, mimeType)
                uri.scheme == "http" || uri.scheme == "https" -> {
                    enqueueSystemDownload(uri, name, userAgent, mimeType)
                    null
                }
                else -> {
                    toast(activity.getString(R.string.download_failed))
                    null
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "download failed: $url", e)
            toast(activity.getString(R.string.download_failed))
            null
        }
    }

    private fun enqueueSystemDownload(uri: Uri, name: String, userAgent: String?, mimeType: String?) {
        val request = DownloadManager.Request(uri).apply {
            setTitle(name)
            setMimeType(mimeType)
            CookieManager.getInstance().getCookie(uri.toString())?.let { addRequestHeader("Cookie", it) }
            userAgent?.let { addRequestHeader("User-Agent", it) }
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        }
        try {
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "TeleX/$name")
        } catch (e: Exception) {
            // Android 9 and older without storage permission: keep it in the app's own folder.
            request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name)
        }
        val dm = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        dm.enqueue(request)
        toast(activity.getString(R.string.download_started, name))
    }

    /** Messages from the page helper: begin / chunk / end / fail. Called on the UI thread. */
    fun onBridgeMessage(msg: JSONObject) {
        val id = msg.optString("id")
        if (id.isEmpty()) return
        when (msg.optString("t")) {
            "begin" -> {
                val name = sanitize(msg.optString("name"))
                val mime = msg.optString("mime").ifBlank { guessMime(name) }
                if (needsLegacyPermission()) requestLegacyPermission()
                main.post { toast(activity.getString(R.string.download_started, name)) }
                io.execute {
                    try {
                        val dir = File(activity.cacheDir, "downloads").apply { mkdirs() }
                        val file = File(dir, id)
                        pending[id] = Pending(name, mime, file, FileOutputStream(file))
                    } catch (e: Exception) {
                        Log.w(TAG, "begin failed", e)
                    }
                }
            }
            "chunk" -> {
                val data = msg.optString("d")
                io.execute {
                    val p = pending[id] ?: return@execute
                    try {
                        p.out.write(Base64.decode(data, Base64.DEFAULT))
                    } catch (e: Exception) {
                        Log.w(TAG, "chunk failed", e)
                        abort(id)
                    }
                }
            }
            "end" -> io.execute {
                val p = pending.remove(id) ?: return@execute
                try {
                    p.out.close()
                    publish(p)
                    main.post { toast(activity.getString(R.string.download_saved, p.name)) }
                } catch (e: Exception) {
                    Log.w(TAG, "publish failed", e)
                    main.post { toast(activity.getString(R.string.download_failed)) }
                } finally {
                    p.file.delete()
                }
            }
            "fail" -> io.execute {
                Log.w(TAG, "page download failed: ${msg.optString("error")}")
                abort(id)
                main.post { toast(activity.getString(R.string.download_failed)) }
            }
        }
    }

    private fun abort(id: String) {
        val p = pending.remove(id) ?: return
        runCatching { p.out.close() }
        p.file.delete()
    }

    /** Copies a finished temp file into the user's Downloads/TeleX folder. */
    private fun publish(p: Pending) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = activity.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, p.name)
                put(MediaStore.Downloads.MIME_TYPE, p.mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TeleX")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("MediaStore insert failed")
            resolver.openOutputStream(item)!!.use { out -> p.file.inputStream().use { it.copyTo(out) } }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(item, values, null, null)
        } else {
            @Suppress("DEPRECATION")
            val dir = if (!needsLegacyPermission()) {
                File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "TeleX")
            } else {
                activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: activity.filesDir
            }
            dir.mkdirs()
            val target = uniqueFile(dir, p.name)
            p.file.copyTo(target)
            MediaScannerConnection.scanFile(activity, arrayOf(target.absolutePath), arrayOf(p.mime), null)
        }
    }

    private fun needsLegacyPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED

    private fun requestLegacyPermission() {
        main.post { activity.requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 42) }
    }

    private fun uniqueFile(dir: File, name: String): File {
        var f = File(dir, name)
        val base = name.substringBeforeLast('.', name)
        val ext = name.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }
        var i = 1
        while (f.exists()) f = File(dir, "$base (${i++})$ext")
        return f
    }

    private fun sanitize(name: String): String {
        val clean = name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().trim('.')
        return clean.ifEmpty { "file" }.take(120)
    }

    private fun guessMime(name: String): String =
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
            ?: "application/octet-stream"

    private fun toast(text: String) = Toast.makeText(activity, text, Toast.LENGTH_SHORT).show()

    fun shutdown() = io.shutdown()

    private companion object {
        const val TAG = "TeleX/Downloads"
    }
}
