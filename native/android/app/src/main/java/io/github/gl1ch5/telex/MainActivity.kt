package io.github.gl1ch5.telex

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/** Single-screen TeleX: a WebView showing the live web app, plus native glue. */
class MainActivity : ComponentActivity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var downloads: Downloads
    private lateinit var updater: Updater

    private val startedAt = SystemClock.uptimeMillis()
    private var firstPaint = false
    private var showingError = false
    private var clearHistoryOnLoad = false

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
        fileCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // Keep the splash (icon on black) until the page paints, at most ~3 s.
        splash.setKeepOnScreenCondition { !firstPaint && SystemClock.uptimeMillis() - startedAt < 3000 }

        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        if (Build.VERSION.SDK_INT >= 29) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }
        window.setBackgroundDrawableResource(R.color.black)

        downloads = Downloads(this)
        updater = Updater(this)
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK) // no white flash before the page paints
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        root.addView(webView, FrameLayout.LayoutParams(MATCH, MATCH))
        setContentView(root)
        applyInsets()

        configureWebView()
        configureServiceWorkers()
        installBridge()
        onBackPressedDispatcher.addCallback(this, backHandler)
        watchNetwork()

        val restored = savedInstanceState?.let { webView.restoreState(it) } != null
        if (!restored) {
            // The app moved to its own domain: bring the Telegram session along once.
            val migration = StorageMigration(this)
            if (migration.needed()) migration.run { webView.loadUrl(AppConfig.START_URL) }
            else webView.loadUrl(AppConfig.START_URL)
        }
        updater.check()
    }

    // ---------------------------------------------------------------- insets

    /**
     * Edge-to-edge like Telegram: the page draws under the transparent status
     * and navigation bars. Their sizes are handed to the page as CSS variables
     * (--tx-safe-top / --tx-safe-bottom, in CSS px) because some WebView
     * versions report env(safe-area-inset-*) as 0. Only side cutouts and the
     * keyboard are padded natively.
     */
    private var insetTopPx = 0
    private var insetBottomPx = 0

    private fun applyInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            if (customView != null) {
                v.setPadding(0, 0, 0, 0)
            } else {
                val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
                val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
                val keyboard = ime.bottom > bars.bottom
                v.setPadding(bars.left, 0, bars.right, if (keyboard) ime.bottom else 0)
                insetTopPx = bars.top
                insetBottomPx = if (keyboard) 0 else bars.bottom
                pushInsetsToPage()
            }
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun pushInsetsToPage() {
        if (!::webView.isInitialized) return
        val density = resources.displayMetrics.density
        val top = insetTopPx / density
        val bottom = insetBottomPx / density
        webView.evaluateJavascript(
            "(function(){var s=document.documentElement.style;" +
                "s.setProperty('--tx-safe-top','${top}px');s.setProperty('--tx-safe-bottom','${bottom}px');" +
                "document.documentElement.classList.add('tx-native');})()",
            null,
        )
    }

    // -------------------------------------------------------------- web view

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true // localStorage keeps the Telegram session
            @Suppress("DEPRECATION")
            databaseEnabled = true // IndexedDB / WebSQL
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false) // window.open / target=_blank -> shouldOverrideUrlLoading
            javaScriptCanOpenWindowsAutomatically = true
            cacheMode = WebSettings.LOAD_DEFAULT // HTTP cache + the site's own Service Worker cache
            allowFileAccess = false
            allowContentAccess = false
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100 // keep the glass layout intact regardless of system font scale
            userAgentString = "$userAgentString TeleXAndroid/${appVersion()}"
        }
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.webViewClient = Client()
        webView.webChromeClient = Chrome()
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            downloads.onDownloadStart(url, userAgent, contentDisposition, mimeType)?.let { js ->
                webView.evaluateJavascript(js, null)
            }
        }
    }

    /**
     * Service Workers work out of the box in Android System WebView (API 24+);
     * TeleX's sw.js serves avatars/photos/video. We only make the SW requests
     * use the normal HTTP cache and never touch file:/content: URLs.
     */
    private fun configureServiceWorkers() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) return
        try {
            val controller = ServiceWorkerControllerCompat.getInstance()
            val sw = controller.serviceWorkerWebSettings
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_CACHE_MODE)) {
                sw.cacheMode = WebSettings.LOAD_DEFAULT
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BLOCK_NETWORK_LOADS)) {
                sw.blockNetworkLoads = false
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_FILE_ACCESS)) {
                sw.allowFileAccess = false
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_CONTENT_ACCESS)) {
                sw.allowContentAccess = false
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
                controller.setServiceWorkerClient(object : ServiceWorkerClientCompat() {
                    override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? = null
                })
            }
        } catch (e: Exception) {
            Log.w(TAG, "service worker setup", e)
        }
    }

    /** window.TeleXNative.postMessage(...) — only for the app's own origin. */
    private fun installBridge() {
        val origins = setOf(AppConfig.ORIGIN)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, AppConfig.BRIDGE_NAME, origins) { _, message, origin, isMainFrame, _ ->
                if (isMainFrame && origin.toString().trimEnd('/') == AppConfig.ORIGIN) {
                    message.data?.let(::onBridgeMessage)
                }
            }
        } else {
            @SuppressLint("JavascriptInterface")
            webView.addJavascriptInterface(LegacyBridge(), AppConfig.BRIDGE_NAME)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, WebAssets.DOWNLOAD_HELPER_JS, origins)
        }
    }

    /** Fallback bridge for very old WebView builds without WebMessageListener. */
    inner class LegacyBridge {
        @JavascriptInterface
        fun postMessage(message: String) {
            runOnUiThread {
                val url = webView.url ?: return@runOnUiThread
                if (showingError || AppConfig.isSameOrigin(Uri.parse(url))) onBridgeMessage(message)
            }
        }
    }

    private fun onBridgeMessage(message: String) {
        if (message == "retry") {
            retry()
            return
        }
        if (message == "checkUpdate") {
            updater.check(manual = true)
            return
        }
        try {
            downloads.onBridgeMessage(JSONObject(message))
        } catch (e: Exception) {
            Log.w(TAG, "bad bridge message", e)
        }
    }

    // ----------------------------------------------------- navigation/errors

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            val uri = request.url
            return when (uri.scheme?.lowercase()) {
                "about", "data", "blob", "javascript" -> false
                "http", "https" -> if (AppConfig.isInScope(uri)) false else openExternal(uri).let { true }
                else -> openExternal(uri).let { true } // tg:, intent:, mailto:, tel:, …
            }
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            firstPaint = true
        }

        override fun onPageFinished(view: WebView, url: String) {
            pushInsetsToPage()
            firstPaint = true
            if (clearHistoryOnLoad && !showingError && url.startsWith("http")) {
                clearHistoryOnLoad = false
                view.clearHistory()
            }
            // Make sure the download helper exists even without document-start scripts.
            if (AppConfig.isSameOrigin(Uri.parse(url))) view.evaluateJavascript(WebAssets.DOWNLOAD_HELPER_JS, null)
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            if (error.errorCode == ERROR_UNSUPPORTED_SCHEME) return
            showError(error.description?.toString())
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's renderer crashed or was killed for memory: rebuild instead of crashing the app.
            Log.w(TAG, "renderer gone, recreating")
            recreate()
            return true
        }
    }

    private fun showError(details: String?) {
        showingError = true
        firstPaint = true
        webView.stopLoading()
        webView.loadDataWithBaseURL(AppConfig.START_URL, WebAssets.errorPage(details), "text/html", "utf-8", null)
    }

    private fun retry() {
        showingError = false
        clearHistoryOnLoad = true
        webView.loadUrl(AppConfig.START_URL)
    }

    private fun openExternal(uri: Uri) {
        try {
            val intent = if (uri.scheme == "intent") {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    component = null
                    selector = null
                }
            } else {
                Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                val fallback = intent.getStringExtra("browser_fallback_url")
                if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fallback)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } else {
                    Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "cannot open $uri", e)
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    /** Back: close fullscreen video, then go back in page history (pushState screens), then minimize. */
    private val backHandler = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            when {
                customView != null -> hideCustomView()
                !showingError && webView.canGoBack() -> webView.goBack()
                else -> moveTaskToBack(true)
            }
        }
    }

    /** Leave the offline page automatically once the network is back. */
    private fun watchNetwork() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                runOnUiThread { if (showingError && !isFinishing) retry() }
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
            networkCallback = cb
        } catch (e: Exception) {
            Log.w(TAG, "network callback", e)
        }
    }

    // -------------------------------------------------- chrome: video, files

    private inner class Chrome : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customViewCallback = callback
            root.addView(view, FrameLayout.LayoutParams(MATCH, MATCH))
            WindowCompat.getInsetsController(window, root).apply {
                systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                hide(WindowInsetsCompat.Type.systemBars())
            }
            ViewCompat.requestApplyInsets(root)
        }

        override fun onHideCustomView() = hideCustomView()

        /** No grey "play" poster on the black UI. */
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)

        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                filePicker.launch(params.createIntent())
                true
            } catch (e: Exception) {
                fileCallback = null
                false
            }
        }
    }

    private fun hideCustomView() {
        val view = customView ?: return
        root.removeView(view)
        customView = null
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
        WindowCompat.getInsetsController(window, root).show(WindowInsetsCompat.Type.systemBars())
        ViewCompat.requestApplyInsets(root)
    }

    // ------------------------------------------------------------- lifecycle

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!showingError) webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
        // Let the page re-check its Telegram connection after being in background.
        webView.evaluateJavascript("window.dispatchEvent(new Event('tx:resume'))", null)
        updater.onResume()
        updater.check()
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        networkCallback?.let {
            runCatching { (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it) }
        }
        downloads.shutdown()
        updater.shutdown()
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun appVersion(): String =
        runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: "1"

    private companion object {
        const val TAG = "TeleX"
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    }
}
