package ua.itorrent.client

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import org.libtorrent4j.TorrentFlags
import java.io.File
import java.io.IOException

class MainActivity : Activity() {

    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var ready = false
    private val pending = ArrayList<Intent>()
    private var lastStorage: Boolean? = null
    private var lastDark: Boolean? = null
    private var mySink: ((String, JSONObject) -> Unit)? = null

    companion object {
        const val REQ_TORRENT = 10
        const val REQ_IPFILTER = 11
        const val REQ_PERM = 12
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Engine.init(this)
        if (BuildConfig.DEBUG && intent?.getBooleanExtra("skipWelcome", false) == true) Engine.prefs.put("firstRunDone", true)
        TorrentService.start(this)
        web = WebView(this)
        val dark = isDark()
        web.setBackgroundColor(Color.parseColor(if (dark) "#1b1b1b" else "#f0f0f0"))
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.textZoom = 100
        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG || m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) {
                    android.util.Log.i("ItorrentJS", "${m.message()} (${m.sourceId()?.substringAfterLast('/')}:${m.lineNumber()})")
                }
                if (m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) Engine.log(2, "Інтерфейс: ${m.message()}")
                return true
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                ready = true
                val list = ArrayList(pending)
                pending.clear()
                for (i in list) handleIntent(i)
            }

            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url != null && !url.startsWith("file:")) {
                    openUrl(url)
                    return true
                }
                return false
            }
        }
        web.addJavascriptInterface(Bridge(), "Android")
        setContentView(web)
        setBars(dark)
        val sink: (String, JSONObject) -> Unit = { t, d -> send(t, d) }
        mySink = sink
        Engine.sink = sink
        web.loadUrl("file:///android_asset/www/index.html")
        // Після перестворення (зміна теми) початковий інтент уже оброблено.
        if (savedInstanceState == null) intent?.let { pending.add(it) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (ready) handleIntent(intent) else pending.add(intent)
    }

    override fun onStop() {
        super.onStop()
        web.onPause()
        web.pauseTimers()
    }

    override fun onStart() {
        super.onStart()
        web.resumeTimers()
        web.onResume()
    }

    override fun onResume() {
        super.onResume()
        checkStorage()
        val d = systemDark()
        if (lastDark != null && lastDark != d) send("theme", JSONObject().put("dark", d))
        lastDark = d
    }

    private fun checkStorage() {
        val s = Engine.hasStorageAccess()
        if (lastStorage != null && lastStorage != s) {
            send("storage", JSONObject().put("granted", s).put("savePath", Engine.defaultSavePath()))
            if (s) Engine.log(1, "Отримано доступ до файлів")
        }
        lastStorage = s
    }

    override fun onDestroy() {
        if (Engine.sink === mySink) Engine.sink = null
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val d = (newConfig.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        lastDark = d
        send("theme", JSONObject().put("dark", d))
    }

    private fun send(type: String, data: JSONObject) {
        val js = "window.It&&It.onEvent(" + JSONObject.quote(type) + "," + data.toString() + ")"
        main.post { if (ready) web.evaluateJavascript(js, null) }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("window.It?It.back():false") { r ->
            if (r != "true") moveTaskToBack(true)
        }
    }

    private fun systemDark() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    private fun isDark(): Boolean = when (Engine.prefs.str("theme")) {
        "dark" -> true
        "light" -> false
        else -> systemDark()
    }

    @Suppress("DEPRECATION")
    private fun setBars(dark: Boolean) {
        val color = Color.parseColor(if (dark) "#2b2b2b" else "#f3f3f3")
        val nav = Color.parseColor(if (dark) "#202020" else "#f0f0f0")
        window.statusBarColor = color
        window.navigationBarColor = nav
        web.setBackgroundColor(nav)
        if (Build.VERSION.SDK_INT >= 30) {
            val flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (dark) 0 else flags, flags)
        } else {
            var f = window.decorView.systemUiVisibility
            f = if (dark) f and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv() else f or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            if (Build.VERSION.SDK_INT >= 26) {
                f = if (dark) f and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv() else f or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            window.decorView.systemUiVisibility = f
        }
    }

    // ---------------------------------------------------------------- вхідні посилання

    private fun handleIntent(i: Intent) {
        i.getStringExtra("select")?.let { send("select", JSONObject().put("id", it)) }
        if (BuildConfig.DEBUG) i.getStringExtra("js")?.let { js -> web.evaluateJavascript(js, null) }
        if (BuildConfig.DEBUG) i.getStringExtra("autoAdd")?.let { link ->
            Engine.runIo {
                Engine.awaitReady()
                Engine.addLink(link, false)
            }
        }
        val dialog = Engine.prefs.bool("showAddDialog")
        when (i.action) {
            Intent.ACTION_VIEW -> {
                val u = i.data ?: return
                when (u.scheme?.lowercase()) {
                    "magnet", "http", "https" -> Engine.runIo { Engine.awaitReady(); Engine.addLink(u.toString(), dialog) }
                    else -> readTorrent(u, dialog)
                }
            }
            Intent.ACTION_SEND -> {
                @Suppress("DEPRECATION")
                val stream = i.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                if (stream != null) {
                    readTorrent(stream, dialog)
                } else {
                    val text = i.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                    val m = Regex("magnet:\\?[^\\s\"'<>]+").find(text)?.value
                        ?: Regex("https?://[^\\s\"'<>]+").find(text)?.value
                        ?: text.trim()
                    if (m.isNotBlank()) Engine.runIo { Engine.awaitReady(); Engine.addLink(m, dialog) }
                }
            }
        }
        setIntent(Intent())
    }

    private fun readBytes(u: Uri): ByteArray {
        val inp = contentResolver.openInputStream(u) ?: throw IOException("Не вдалося відкрити файл")
        inp.use { s ->
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(16384)
            while (true) {
                val n = s.read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
                if (out.size() > 32 * 1024 * 1024) throw IOException("Файл завеликий для торента")
            }
            return out.toByteArray()
        }
    }

    private fun readTorrent(u: Uri, dialog: Boolean) {
        Engine.runIo {
            Engine.awaitReady()
            val bytes = readBytes(u)
            if (dialog) Engine.emit("preview", Engine.previewBytes(bytes)) else Engine.addBytesDirect(bytes)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data == null) return
        val uris = ArrayList<Uri>()
        data.clipData?.let { c -> for (k in 0 until c.itemCount) c.getItemAt(k).uri?.let { uris.add(it) } }
        if (uris.isEmpty()) data.data?.let { uris.add(it) }
        when (requestCode) {
            REQ_TORRENT -> {
                val dialog = Engine.prefs.bool("showAddDialog") && uris.size == 1
                for (u in uris) readTorrent(u, dialog)
            }
            REQ_IPFILTER -> {
                val u = uris.firstOrNull() ?: return
                Engine.runIo {
                    val dest = File(filesDir, "ipfilter.dat")
                    contentResolver.openInputStream(u)?.use { inp -> dest.outputStream().use { inp.copyTo(it) } }
                    val name = runCatching {
                        contentResolver.query(u, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                            if (c.moveToFirst()) c.getString(0) else null
                        }
                    }.getOrNull() ?: "ipfilter.dat"
                    send("ipfilter", JSONObject().put("path", dest.path).put("name", name))
                }
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        @Suppress("DEPRECATION")
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        checkStorage()
    }

    private fun openUrl(url: String) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    }

    private fun requestStorage() {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
            } catch (e: ActivityNotFoundException) {
                runCatching { startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) }
            }
        } else {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_EXTERNAL_STORAGE), REQ_PERM)
        }
    }

    private fun roots(): JSONArray {
        val a = JSONArray()
        val seen = HashSet<String>()
        @Suppress("DEPRECATION")
        val internal = Environment.getExternalStorageDirectory().path
        if (Engine.hasStorageAccess()) {
            a.put(JSONObject().put("name", "Внутрішня пам'ять").put("path", internal))
            seen.add(internal)
            for (d in getExternalFilesDirs(null)) {
                if (d == null) continue
                val p = d.path
                val idx = p.indexOf("/Android/data/")
                if (idx > 0) {
                    val root = p.substring(0, idx)
                    if (seen.add(root)) a.put(JSONObject().put("name", "Карта пам'яті").put("path", root))
                }
            }
        }
        getExternalFilesDir(null)?.let { a.put(JSONObject().put("name", "Папка застосунку").put("path", it.path)) }
        return a
    }

    private fun listDir(path: String, files: Boolean): JSONObject {
        val f = File(path)
        val o = JSONObject().put("path", f.path).put("parent", f.parent ?: JSONObject.NULL)
            .put("roots", roots()).put("writable", f.canWrite())
        val dirs = JSONArray()
        val fl = JSONArray()
        val list = f.listFiles()
        if (list == null) {
            o.put("error", if (f.exists()) "Немає доступу до папки" else "Папки не існує")
        } else {
            for (c in list.sortedBy { it.name.lowercase() }) {
                if (c.name.startsWith(".")) continue
                if (c.isDirectory) dirs.put(c.name)
                else if (files) fl.put(JSONArray().put(c.name).put(c.length()))
            }
        }
        return o.put("dirs", dirs).put("files", fl)
    }

    private fun openFile(path: String) {
        val f = File(path)
        if (!f.exists()) throw IOException("Файл ще не створено на диску")
        val uri = FilesProvider.uri(this, f)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, FilesProvider.mime(f.name)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        main.post {
            try {
                startActivity(Intent.createChooser(i, "Відкрити за допомогою"))
            } catch (e: ActivityNotFoundException) {
                send("error", JSONObject().put("msg", "Немає застосунку, щоб відкрити цей файл"))
            }
        }
    }

    private fun stream(e: Entry, index: Int) {
        val path = Engine.filePath(e, index)
        val prog = e.th?.file_progress(org.libtorrent4j.swig.torrent_handle.piece_granularity)
        val size = e.th?.torrent_file_ptr()?.layout()?.file_size(index) ?: -1
        if (path != null && prog != null && index < prog.size && prog[index] >= size && size >= 0) {
            openFile(path)
            return
        }
        Engine.streamer.prepare(e, index)
        val url = Engine.streamer.url(e, index)
        val i = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(url), Engine.streamer.mime(path ?: url))
        main.post {
            try {
                startActivity(Intent.createChooser(i, "Переглянути за допомогою"))
            } catch (x: ActivityNotFoundException) {
                send("error", JSONObject().put("msg", "Немає плеєра для цього файлу"))
            }
        }
    }

    // ---------------------------------------------------------------- міст

    inner class Bridge {

        @JavascriptInterface
        fun call(method: String, args: String): String = try {
            val a = if (args.isBlank()) JSONObject() else JSONObject(args)
            JSONObject().put("ok", true).put("r", dispatch(method, a) ?: JSONObject.NULL).toString()
        } catch (t: Throwable) {
            JSONObject().put("ok", false).put("error", t.message ?: t.javaClass.simpleName).toString()
        }

        private fun ents(a: JSONObject) = Engine.ids(a.optJSONArray("ids"))
        private fun one(a: JSONObject): Entry = Engine.entries[a.optString("id")] ?: throw IOException("Торент не знайдено")
        private fun strs(arr: JSONArray?): List<String> = if (arr == null) emptyList() else (0 until arr.length()).map { arr.optString(it) }

        private fun dispatch(m: String, a: JSONObject): Any? {
            val p = Engine.prefs
            when (m) {
                "init" -> return JSONObject()
                    .put("prefs", p.all())
                    .put("version", BuildConfig.VERSION_NAME)
                    .put("debug", BuildConfig.DEBUG)
                    .put("dark", systemDark())
                    .put("storage", Engine.hasStorageAccess())
                    .put("sdk", Build.VERSION.SDK_INT)
                    .put("defaultSave", Engine.defaultSavePath())
                    .put("publicDownloads", Engine.publicDownloads())
                    .put("notifPerm", Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
                "poll" -> {
                    val o = JSONObject().put("s", Engine.sessionJson).put("t", Engine.rowsJson)
                        .put("started", Engine.started)
                    val sel = a.optString("sel")
                    if (sel.isNotEmpty()) Engine.entries[sel]?.let { e ->
                        runCatching { Details.build(e, a.optString("tab"), a.optString("fv")) }.onSuccess { o.put("d", it) }
                    }
                    o.put("cats", p.categories()).put("tags", JSONArray(p.tags()))
                    o.put("logs", Engine.logsSince(a.optInt("logSince", 0)))
                    o.put("rssV", Engine.rss.version)
                    o.put("save", Engine.defaultSavePath())
                    return o
                }
                "prefs.get" -> return p.all()
                "prefs.set" -> {
                    val v = a.getJSONObject("values")
                    val changed = p.merge(v)
                    Engine.onPrefsChanged(changed)
                    if (changed.contains("theme")) main.post { setBars(isDark()) }
                    return p.all()
                }
                "ui.save" -> p.put("ui", a.optString("ui", "{}"))
                "setBars" -> main.post { setBars(a.optBoolean("dark")) }
                "haptic" -> main.post { web.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS) }
                "add.file" -> main.post {
                    val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/x-bittorrent", "application/octet-stream", "*/*"))
                        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    try {
                        @Suppress("DEPRECATION")
                        startActivityForResult(i, REQ_TORRENT)
                    } catch (e: ActivityNotFoundException) {
                        send("error", JSONObject().put("msg", "Немає застосунку для вибору файлів"))
                    }
                }
                "add.links" -> {
                    val links = a.optString("text").split('\n').map { it.trim() }.filter { it.isNotEmpty() }
                    val dialog = a.optBoolean("dialog") && links.size == 1
                    val opts = a.optJSONObject("opts") ?: JSONObject()
                    for (l in links) Engine.runIo { Engine.awaitReady(); Engine.addLink(l, dialog, opts) }
                    return links.size
                }
                "add.confirm" -> { Engine.awaitReady(); Engine.confirmAdd(a.getString("pid"), a.optJSONObject("opts") ?: JSONObject()) }
                "add.cancel" -> Engine.cancelPreview(a.optString("pid"))
                "t.start" -> Engine.startTorrents(ents(a))
                "t.force" -> Engine.startTorrents(ents(a), true)
                "t.stop" -> Engine.stopTorrents(ents(a))
                "t.remove" -> Engine.removeTorrents(ents(a), a.optBoolean("files"))
                "t.recheck" -> Engine.recheck(ents(a))
                "t.reannounce" -> Engine.reannounce(ents(a))
                "t.location" -> Engine.setLocation(ents(a), a.getString("path"))
                "t.rename" -> Engine.rename(one(a), a.optString("name"))
                "t.category" -> Engine.setCategory(ents(a), a.optString("cat"))
                "t.tags" -> Engine.changeTags(ents(a), strs(a.optJSONArray("add")), strs(a.optJSONArray("remove")), a.optBoolean("clear"))
                "t.limits" -> Engine.setLimits(ents(a), if (a.has("dl")) a.optInt("dl") else null, if (a.has("ul")) a.optInt("ul") else null)
                "t.shareLimits" -> Engine.setShareLimits(ents(a), a.optDouble("ratio", -2.0), a.optInt("seed", -2))
                "t.seq" -> Engine.setFlag(ents(a), TorrentFlags.SEQUENTIAL_DOWNLOAD, a.optBoolean("on"))
                "t.superSeed" -> Engine.setFlag(ents(a), TorrentFlags.SUPER_SEEDING, a.optBoolean("on"))
                "t.firstLast" -> Engine.setFirstLast(ents(a), a.optBoolean("on"))
                "t.queue" -> Engine.queue(ents(a), a.optString("op"))
                "t.magnet" -> return ents(a).joinToString("\n") { Engine.magnet(it) }
                "t.export" -> {
                    val list = ents(a)
                    val dir = File(a.optString("dir").ifBlank { Engine.defaultSavePath() }).apply { mkdirs() }
                    var last = ""
                    for (e in list) {
                        val base = Engine.displayName(e).replace(Regex("[\\\\/:*?\"<>|]"), "_")
                        var f = File(dir, "$base.torrent")
                        var k = 1
                        while (f.exists()) f = File(dir, "$base (${k++}).torrent")
                        Engine.exportTorrent(e, f.path)
                        last = f.path
                    }
                    return last
                }
                "t.shareMagnet" -> {
                    val text = ents(a).joinToString("\n") { Engine.magnet(it) }
                    main.post { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Поділитися magnet-посиланням")) }
                }
                "startAll" -> Engine.startAll()
                "stopAll" -> Engine.stopAll()
                "files.prio" -> Engine.setFilePrio(one(a), a.getJSONArray("idx"), a.optInt("prio", 4))
                "files.rename" -> Engine.renameFile(one(a), a.getInt("index"), a.getString("path"))
                "files.open" -> {
                    val e = one(a)
                    openFile(Engine.filePath(e, a.getInt("index")) ?: throw IOException("Файл недоступний"))
                }
                "files.stream" -> stream(one(a), a.getInt("index"))
                "files.path" -> return Engine.filePath(one(a), a.getInt("index"))
                "trackers.add" -> Engine.addTrackers(one(a), strs(a.optJSONArray("urls")))
                "trackers.edit" -> Engine.editTracker(one(a), a.getString("old"), a.getString("new"))
                "trackers.remove" -> Engine.removeTrackers(one(a), strs(a.optJSONArray("urls")).toSet())
                "seeds.add" -> { val th = one(a).th; for (u in strs(a.optJSONArray("urls"))) th?.add_url_seed(u.trim()) }
                "seeds.remove" -> { val th = one(a).th; for (u in strs(a.optJSONArray("urls"))) th?.remove_url_seed(u) }
                "peers.add" -> return Engine.addPeers(one(a), strs(a.optJSONArray("peers")))
                "peers.ban" -> Engine.banPeers(strs(a.optJSONArray("ips")))
                "cat.save" -> Engine.saveCategory(a.getString("name").trim(), a.optString("savePath").trim(), a.optString("old").ifBlank { null })
                "cat.remove" -> Engine.removeCategory(a.getString("name"))
                "tag.add" -> Engine.addTag(a.getString("name"))
                "tag.remove" -> Engine.removeTag(a.getString("name"))
                "alt.toggle" -> { Engine.setAlt(!Engine.altActive); return Engine.altActive }
                "fs.list" -> return listDir(a.optString("path").ifBlank { Engine.defaultSavePath().let { if (File(it).exists()) it else File(it).parent ?: "/" } }, a.optBoolean("files"))
                "fs.mkdir" -> { val f = File(a.getString("path")); if (!f.mkdirs() && !f.isDirectory) throw IOException("Не вдалося створити папку"); return f.path }
                "copy" -> {
                    val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                    main.post { cm.setPrimaryClip(ClipData.newPlainText("Itorrent", a.optString("text"))) }
                }
                "clip.get" -> {
                    val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                    return runCatching { cm.primaryClip?.getItemAt(0)?.coerceToText(this@MainActivity)?.toString() }.getOrNull() ?: ""
                }
                "share" -> main.post { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, a.optString("text")), "Поділитися")) }
                "openUrl" -> main.post { openUrl(a.optString("url")) }
                "create" -> Creator.create(a.getJSONObject("opts"))
                "rss.get" -> return Engine.rss.json()
                "rss.addFeed" -> Engine.rss.addFeed(a.getString("url"), a.optString("name"))
                "rss.removeFeed" -> Engine.rss.removeFeed(a.getString("url"))
                "rss.renameFeed" -> Engine.rss.renameFeed(a.getString("url"), a.optString("name"))
                "rss.refresh" -> Engine.rss.refreshAsync(a.optString("url").ifBlank { null })
                "rss.markRead" -> Engine.rss.markRead(a.optString("url").ifBlank { null }, a.optString("id").ifBlank { null })
                "rss.download" -> Engine.rss.download(a.getString("url"), a.getString("id"), a.optBoolean("dialog"))
                "rss.rules" -> Engine.rss.saveRules(a.getJSONArray("rules"))
                "rss.test" -> return Engine.rss.test(a.getJSONObject("rule"))
                "perm.storage" -> main.post { requestStorage() }
                "perm.notifications" -> if (Build.VERSION.SDK_INT >= 33) main.post { requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_PERM) }
                "ipfilter.pick" -> main.post {
                    val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                    @Suppress("DEPRECATION")
                    runCatching { startActivityForResult(i, REQ_IPFILTER) }
                }
                "stats" -> {
                    val sdl = Engine.sm.totalDownload()
                    val sul = Engine.sm.totalUpload()
                    var wasted = 0L
                    var peers = 0
                    for (e in Engine.entries.values) e.st?.let {
                        wasted += it.getTotal_failed_bytes() + it.getTotal_redundant_bytes()
                        peers += it.getNum_peers()
                    }
                    return JSONObject().put("allDl", p.long("allTimeDl")).put("allUl", p.long("allTimeUl"))
                        .put("sesDl", sdl).put("sesUl", sul).put("wasted", wasted).put("peers", peers)
                        .put("torrents", Engine.entries.size).put("dht", Engine.sm.dhtNodes())
                        .put("free", Engine.sessionJson.optLong("free", -1))
                }
                "exit" -> {
                    TorrentService.exit(this@MainActivity)
                    main.postDelayed({ finishAndRemoveTask() }, 300)
                }
                "firstRunDone" -> p.put("firstRunDone", true)
                else -> throw IllegalArgumentException("Невідомий виклик: $m")
            }
            return null
        }
    }
}
