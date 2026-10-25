# Міст для WebView
-keepclassmembers class ua.itorrent.client.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
# libtorrent4j: JNI шукає класи й методи за іменами
-keep class org.libtorrent4j.** { *; }
-dontwarn org.libtorrent4j.**
