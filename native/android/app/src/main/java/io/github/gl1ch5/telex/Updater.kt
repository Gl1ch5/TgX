package io.github.gl1ch5.telex

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Self-update from the GitHub "nightly" release.
 *
 * CI publishes version.json ({ versionCode, versionName, apk }) next to the APK.
 * On start (at most every few hours) the app compares versionCode with its own,
 * downloads the newer APK in the background and hands it to the system installer.
 * If "install unknown apps" is not allowed yet, the matching settings screen is
 * opened first and the install continues when the user comes back.
 */
class Updater(private val activity: Activity) {

    private val io = Executors.newSingleThreadExecutor()
    private val prefs = activity.getSharedPreferences("updater", Context.MODE_PRIVATE)
    private var pendingApk: File? = null
    private var busy = false

    /** Called from onCreate / onResume. `manual` = user pressed "check for updates". */
    fun check(manual: Boolean = false) {
        if (busy) {
            if (manual) toast("Обновление уже загружается…")
            return
        }
        val now = System.currentTimeMillis()
        if (!manual && now - prefs.getLong(KEY_LAST_CHECK, 0) < CHECK_EVERY_MS) return
        prefs.edit().putLong(KEY_LAST_CHECK, now).apply()
        busy = true
        io.execute {
            try {
                val info = JSONObject(httpText(VERSION_URL))
                val remote = info.optLong("versionCode", 0)
                val name = info.optString("versionName", remote.toString())
                val apkUrl = info.optString("apk", APK_URL).ifBlank { APK_URL }
                if (remote <= currentVersionCode()) {
                    busy = false
                    if (manual) ui { toast("У вас последняя версия TeleX") }
                    return@execute
                }
                ui { toast("Загружается TeleX $name…") }
                val apk = download(apkUrl)
                busy = false
                ui { offerInstall(apk, name) }
            } catch (e: Exception) {
                busy = false
                Log.w(TAG, "update check failed", e)
                if (manual) ui { toast("Не удалось проверить обновления") }
            }
        }
    }

    /** After returning from the "install unknown apps" screen. */
    fun onResume() {
        val apk = pendingApk ?: return
        if (canInstall()) {
            pendingApk = null
            install(apk)
        }
    }

    fun shutdown() = io.shutdownNow()

    // ------------------------------------------------------------------

    private fun offerInstall(apk: File, name: String) {
        if (activity.isFinishing) return
        AlertDialog.Builder(activity)
            .setTitle("Доступно обновление")
            .setMessage("TeleX $name загружен. Установить сейчас? Вход в Telegram сохранится.")
            .setPositiveButton("Установить") { _, _ -> startInstall(apk) }
            .setNegativeButton("Позже", null)
            .show()
    }

    private fun startInstall(apk: File) {
        if (canInstall()) {
            install(apk)
            return
        }
        pendingApk = apk
        toast("Разрешите TeleX устанавливать обновления")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
            runCatching { activity.startActivity(intent) }.onFailure { install(apk) }
        }
    }

    private fun canInstall(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return activity.packageManager.canRequestPackageInstalls()
    }

    private fun install(apk: File) {
        try {
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", apk)
            val intent = Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "install failed", e)
            toast("Не удалось открыть установщик")
        }
    }

    private fun download(url: String): File {
        val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val tmp = File(dir, "TeleX.apk.part")
        val conn = open(url)
        try {
            conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it, 64 * 1024) } }
        } finally {
            conn.disconnect()
        }
        val apk = File(dir, "TeleX.apk")
        if (!tmp.renameTo(apk)) throw IllegalStateException("rename failed")
        return apk
    }

    private fun httpText(url: String): String {
        val conn = open(url)
        try {
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /** GET with redirects (github.com -> objects.githubusercontent.com are both https). */
    private fun open(url: String): HttpURLConnection {
        var current = URL(url)
        repeat(5) {
            val conn = current.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.setRequestProperty("User-Agent", "TeleX-Android")
            conn.setRequestProperty("Cache-Control", "no-cache")
            val code = conn.responseCode
            if (code in 300..399) {
                val next = conn.getHeaderField("Location") ?: throw IllegalStateException("redirect without location")
                conn.disconnect()
                current = URL(current, next)
                if (current.protocol != "https") throw IllegalStateException("insecure redirect")
                return@repeat
            }
            if (code != 200) {
                conn.disconnect()
                throw IllegalStateException("HTTP $code")
            }
            return conn
        }
        throw IllegalStateException("too many redirects")
    }

    @Suppress("DEPRECATION")
    private fun currentVersionCode(): Long {
        val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
    }

    private fun ui(block: () -> Unit) = activity.runOnUiThread { if (!activity.isFinishing) block() }

    private fun toast(text: String) = Toast.makeText(activity, text, Toast.LENGTH_SHORT).show()

    private companion object {
        const val TAG = "TeleXUpdater"
        const val KEY_LAST_CHECK = "last_check"
        const val CHECK_EVERY_MS = 3 * 60 * 60 * 1000L
        const val VERSION_URL = "https://github.com/Gl1ch5/TgX/releases/download/nightly/version.json"
        const val APK_URL = "https://github.com/Gl1ch5/TgX/releases/download/nightly/TeleX-android.apk"
    }
}
