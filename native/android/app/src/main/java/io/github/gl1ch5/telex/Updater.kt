package io.github.gl1ch5.telex

import android.app.Activity
import android.app.Dialog
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.view.Window
import android.widget.ImageView
import androidx.core.content.ContextCompat
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Self-update from the GitHub "nightly" release.
 *
 *  1. CI publishes version.json ({ versionCode, versionName, apk }) next to the APK.
 *  2. On every start (and when the app comes back after 10+ minutes) it is compared with our versionCode.
 *  3. A newer build opens a Telegram-style card: "Update available — Update / Not now".
 *  4. "Update" downloads the APK in the background (progress card), checks it is really TeleX, and installs it
 *     through the system PackageInstaller (one confirmation). A failure is explained, never silent.
 * Every check stores what happened; a manual check ("About → Check for updates") always answers with details.
 */
class Updater(private val activity: Activity) {

    private class Info(val code: Long, val name: String, val apkUrl: String)

    private val io = Executors.newSingleThreadExecutor()
    private val prefs = activity.getSharedPreferences("updater", Context.MODE_PRIVATE)
    private var pendingApk: File? = null
    private var busy = false
    private var card: View? = null
    private var cardTitle: TextView? = null
    private var cardBar: ProgressBar? = null
    private var cardSub: TextView? = null
    private var dialog: Dialog? = null
    private var receiverRegistered = false

    private val installResult = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                    if (confirm != null) runCatching { activity.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                        .onFailure { fail("Не удалось открыть установщик: ${it.message}") }
                }
                PackageInstaller.STATUS_SUCCESS -> record("installed")
                PackageInstaller.STATUS_FAILURE_CONFLICT, PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
                    fail("Подпись обновления отличается от установленной версии, поэтому Android не даёт обновить поверх. " +
                        "Удалите TeleX и установите свежий APK заново (вход в Telegram придётся повторить).")
                PackageInstaller.STATUS_FAILURE_ABORTED -> record("install cancelled by the user")
                else -> fail("Установка не удалась: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "неизвестная ошибка"}")
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var retryDelay = 20_000L
    private var retries = 0

    /**
     * Called from onCreate / onResume / the page. `manual` = the user pressed "check for updates".
     * The throttle only counts SUCCESSFUL checks: a failed one (no network yet right after start, VPN reconnecting…)
     * is retried after 20 s, 40 s, 80 s … instead of silencing the updater for the next ten minutes.
     */
    fun check(manual: Boolean = false, onStart: Boolean = false) {
        if (busy) {
            if (manual) toast("Обновление уже загружается…")
            return
        }
        val now = System.currentTimeMillis()
        if (!manual && !onStart && now - prefs.getLong(KEY_LAST_OK, 0) < RESUME_EVERY_MS) return
        busy = true
        io.execute {
            try {
                val info = fetchInfo()
                val local = currentVersionCode()
                prefs.edit().putLong(KEY_LAST_OK, System.currentTimeMillis()).apply()
                retryDelay = 20_000L; retries = 0
                record("remote ${info.code} (${info.name}), local $local")
                if (info.code <= local) {
                    busy = false
                    if (manual) ui { message("Обновлений нет", "У вас последняя версия TeleX ${currentVersionName()}.\n\nСборка: $local · на сервере: ${info.code}") }
                    return@execute
                }
                // "Not now" is remembered for a few hours so the card does not nag on every launch
                val snoozed = prefs.getLong(KEY_SNOOZE_CODE, 0) == info.code && now - prefs.getLong(KEY_SNOOZE_AT, 0) < SNOOZE_MS
                busy = false
                if (snoozed && !manual) return@execute
                ui { offerUpdate(info) }
            } catch (e: Exception) {
                busy = false
                Log.w(TAG, "update check failed", e)
                record("error: ${e.javaClass.simpleName}: ${e.message}")
                if (manual) ui { message("Не удалось проверить обновления", "${e.message ?: e.javaClass.simpleName}\n\nПроверьте подключение к интернету и попробуйте ещё раз.") }
                else if (retries < 6) {
                    retries++
                    val delay = retryDelay
                    retryDelay = (retryDelay * 2).coerceAtMost(10 * 60_000L)
                    handler.postDelayed({ if (!activity.isFinishing) check(onStart = true) }, delay)
                }
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

    fun shutdown() {
        handler.removeCallbacksAndMessages(null)
        io.shutdownNow()
        dialog?.dismiss()
        if (receiverRegistered) runCatching { activity.unregisterReceiver(installResult) }
    }

    /** Short text about the last check, for diagnostics. */
    fun lastStatus(): String = prefs.getString(KEY_STATUS, "—") ?: "—"

    /** JSON for the About screen: build number, version name and what the last check said. */
    fun statusJson(): String = JSONObject().put("code", currentVersionCode()).put("name", currentVersionName()).put("status", lastStatus()).toString()

    // ------------------------------------------------------------------ the card

    private fun offerUpdate(info: Info) {
        if (activity.isFinishing) return
        dialog?.dismiss()
        val d = Dialog(activity)
        d.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val pad = dp(22)
        val icon = ImageView(activity).apply {
            setImageDrawable(activity.packageManager.getApplicationIcon(activity.packageName))
            layoutParams = LinearLayout.LayoutParams(dp(56), dp(56))
        }
        val title = TextView(activity).apply { text = "Доступно обновление"; setTextColor(Color.WHITE); textSize = 20f; typeface = Typeface.DEFAULT_BOLD }
        val sub = TextView(activity).apply {
            text = "TeleX ${info.name}\nОбновление загрузится в фоне и установится. Вход в Telegram сохранится."
            setTextColor(0xFF9A9AA0.toInt()); textSize = 15f; setLineSpacing(0f, 1.15f)
        }
        fun button(label: String, bold: Boolean, run: () -> Unit) = TextView(activity).apply {
            text = label.uppercase(java.util.Locale.getDefault()); setTextColor(0xFF6AA8FF.toInt()); textSize = 14.5f
            typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT; letterSpacing = 0.04f
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setOnClickListener { d.dismiss(); run() }
        }
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END
            addView(button("Не сейчас", false) { prefs.edit().putLong(KEY_SNOOZE_CODE, info.code).putLong(KEY_SNOOZE_AT, System.currentTimeMillis()).apply() })
            addView(button("Обновить", true) { startDownload(info) })
        }
        val box = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, dp(10))
            background = GradientDrawable().apply { setColor(0xFF1C1C1E.toInt()); cornerRadius = dp(22).toFloat() }
            addView(icon)
            addView(title, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })
            addView(sub, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6); bottomMargin = dp(12) })
            addView(row)
        }
        d.setContentView(box)
        d.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout((activity.resources.displayMetrics.widthPixels * 0.88f).toInt().coerceAtMost(dp(380)), ViewGroup.LayoutParams.WRAP_CONTENT)
            setDimAmount(0.6f)
            attributes = attributes.apply { windowAnimations = android.R.style.Animation_Dialog }
        }
        d.show()
        dialog = d
    }

    /** Simple dark message dialog in the same style. */
    private fun message(title: String, text: String) {
        if (activity.isFinishing) return
        dialog?.dismiss()
        val d = Dialog(activity)
        d.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val t1 = TextView(activity).apply { this.text = title; setTextColor(Color.WHITE); textSize = 19f; typeface = Typeface.DEFAULT_BOLD }
        val t2 = TextView(activity).apply { this.text = text; setTextColor(0xFF9A9AA0.toInt()); textSize = 15f; setLineSpacing(0f, 1.15f) }
        val ok = TextView(activity).apply { this.text = "ОК"; setTextColor(0xFF6AA8FF.toInt()); textSize = 14.5f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.END; setPadding(dp(14), dp(12), dp(14), dp(12)); setOnClickListener { d.dismiss() } }
        d.setContentView(LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(22), dp(22), dp(8))
            background = GradientDrawable().apply { setColor(0xFF1C1C1E.toInt()); cornerRadius = dp(22).toFloat() }
            addView(t1); addView(t2, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8); bottomMargin = dp(10) }); addView(ok)
        })
        d.window?.apply { setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT)); setLayout((activity.resources.displayMetrics.widthPixels * 0.88f).toInt().coerceAtMost(dp(380)), ViewGroup.LayoutParams.WRAP_CONTENT); setDimAmount(0.6f) }
        d.show()
        dialog = d
    }

    private fun fail(text: String) {
        record("failed: $text")
        ui { message("Не удалось обновиться", text) }
    }

    private fun record(text: String) {
        prefs.edit().putString(KEY_STATUS, "${java.text.SimpleDateFormat("dd.MM HH:mm", java.util.Locale.US).format(java.util.Date())} — $text").apply()
    }

    // --------------------------------------------------------------- download + install

    private fun startDownload(info: Info) {
        if (busy) return
        busy = true
        showCard(info.name)
        io.execute {
            try {
                val apk = download(info.apkUrl)
                val archive = activity.packageManager.getPackageArchiveInfo(apk.path, 0)
                if (archive == null || archive.packageName != activity.packageName) throw IllegalStateException("Скачанный файл повреждён или это не TeleX. Попробуйте ещё раз.")
                busy = false
                ui { hideCard(); startInstall(apk) }
            } catch (e: Exception) {
                busy = false
                Log.w(TAG, "download failed", e)
                ui { hideCard() }
                fail("Не удалось загрузить обновление: ${e.message ?: e.javaClass.simpleName}")
            }
        }
    }

    private fun startInstall(apk: File) {
        if (canInstall()) {
            install(apk)
            return
        }
        pendingApk = apk
        toast("Разрешите TeleX устанавливать обновления, затем вернитесь назад")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
            runCatching { activity.startActivity(intent) }.onFailure { install(apk) }
        }
    }

    private fun canInstall(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return activity.packageManager.canRequestPackageInstalls()
    }

    /** Hand the APK to the system installer through a PackageInstaller session (it reports why it failed). */
    private fun install(apk: File) {
        try {
            if (!receiverRegistered) {
                ContextCompat.registerReceiver(activity, installResult, IntentFilter(ACTION_INSTALL), ContextCompat.RECEIVER_NOT_EXPORTED)
                receiverRegistered = true
            }
            val installer = activity.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(activity.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            val id = installer.createSession(params)
            installer.openSession(id).use { session ->
                apk.inputStream().use { input ->
                    session.openWrite("TeleX.apk", 0, apk.length()).use { out ->
                        input.copyTo(out, 64 * 1024)
                        session.fsync(out)
                    }
                }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
                val pi = PendingIntent.getBroadcast(activity, id, Intent(ACTION_INSTALL).setPackage(activity.packageName), flags)
                session.commit(pi.intentSender)
            }
            record("install started")
        } catch (e: Exception) {
            Log.w(TAG, "install failed", e)
            fail("Не удалось запустить установку: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    private fun fetchInfo(): Info {
        val json = JSONObject(httpText("$VERSION_URL?t=${System.currentTimeMillis()}"))
        val code = json.optLong("versionCode", 0)
        if (code <= 0) throw IllegalStateException("version.json без versionCode")
        return Info(code, json.optString("versionName", code.toString()), json.optString("apk", APK_URL).ifBlank { APK_URL })
    }

    private fun download(url: String): File {
        val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val tmp = File(dir, "TeleX.apk.part")
        val conn = open(url)
        try {
            val total = conn.contentLengthLong
            var done = 0L
            var lastUi = 0L
            conn.inputStream.use { input ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        val now = System.currentTimeMillis()
                        if (now - lastUi > 120) { lastUi = now; ui { updateCard(done, total) } }
                    }
                }
            }
            ui { updateCard(done, total) }
            if (total > 0 && done != total) throw IllegalStateException("загрузка прервана ($done из $total байт)")
        } finally {
            conn.disconnect()
        }
        val apk = File(dir, "TeleX.apk")
        if (!tmp.renameTo(apk)) throw IllegalStateException("не удалось сохранить файл")
        return apk
    }

    // ------------------------------------------------------------- progress card

    private fun dp(v: Int) = (v * activity.resources.displayMetrics.density).toInt()

    /** A card above the bottom bar: "Loading TeleX 1.2" + progress bar + "12.3 of 28 MB". */
    private fun showCard(name: String) {
        hideCard()
        val host = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        val title = TextView(activity).apply { setTextColor(Color.WHITE); textSize = 15f; text = "Загрузка TeleX $name" }
        val bar = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply { isIndeterminate = true; max = 1000 }
        val sub = TextView(activity).apply { setTextColor(0xFF9A9AA0.toInt()); textSize = 13f; text = "Подготовка…" }
        val box = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(14), dp(18), dp(14))
            background = GradientDrawable().apply { setColor(0xF2202022.toInt()); cornerRadius = dp(20).toFloat() }
            elevation = dp(8).toFloat()
            addView(title)
            addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(18)).apply { topMargin = dp(6) })
            addView(sub)
        }
        host.addView(box, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM).apply {
            setMargins(dp(16), 0, dp(16), dp(110))
        })
        card = box; cardTitle = title; cardBar = bar; cardSub = sub
    }

    private fun updateCard(done: Long, total: Long) {
        val bar = cardBar ?: return
        val mb = { b: Long -> String.format(java.util.Locale.US, "%.1f", b / 1048576.0) }
        if (total > 0) {
            bar.isIndeterminate = false
            bar.progress = (done * 1000 / total).toInt()
            cardSub?.text = "${mb(done)} из ${mb(total)} МБ · ${done * 100 / total}%"
        } else {
            cardSub?.text = "${mb(done)} МБ"
        }
    }

    private fun hideCard() {
        card?.let { (it.parent as? ViewGroup)?.removeView(it) }
        card = null; cardTitle = null; cardBar = null; cardSub = null
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

    private fun currentVersionName(): String = runCatching { activity.packageManager.getPackageInfo(activity.packageName, 0).versionName }.getOrNull() ?: ""

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
        const val RESUME_EVERY_MS = 10 * 60 * 1000L
        const val SNOOZE_MS = 6 * 60 * 60 * 1000L
        const val KEY_SNOOZE_CODE = "snooze_code"
        const val KEY_SNOOZE_AT = "snooze_at"
        const val KEY_STATUS = "status"
        const val KEY_LAST_OK = "last_ok"
        const val ACTION_INSTALL = "io.github.gl1ch5.telex.INSTALL_RESULT"
        const val VERSION_URL = "https://github.com/Gl1ch5/TgX/releases/download/nightly/version.json"
        const val APK_URL = "https://github.com/Gl1ch5/TgX/releases/download/nightly/TeleX-android.apk"
    }
}
