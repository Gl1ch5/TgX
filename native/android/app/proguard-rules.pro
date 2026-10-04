# The JS bridge fallback (addJavascriptInterface) must keep its method name.
-keepclassmembers class io.github.gl1ch5.telex.MainActivity$LegacyBridge {
    @android.webkit.JavascriptInterface <methods>;
}
