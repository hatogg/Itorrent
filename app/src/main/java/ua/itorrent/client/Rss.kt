package ua.itorrent.client

import android.content.Context
import android.util.Xml
import org.json.JSONArray
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** RSS-канали з автоматичним завантаженням за правилами (як «RSS-завантажувач» у qBittorrent). */
class Rss(private val ctx: Context) {

    private val file = File(ctx.filesDir, "rss.json")
    private val lock = Any()
    private var feeds = JSONArray()
    private var rules = JSONArray()
    private var downloaded = JSONArray()
    private val exec = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "itorrent-rss").apply { isDaemon = true } }
    private var job: ScheduledFuture<*>? = null
    @Volatile var version = 0
        private set
    @Volatile private var refreshing = HashSet<String>()

    init {
        runCatching {
            val o = JSONObject(file.readText())
            feeds = o.optJSONArray("feeds") ?: JSONArray()
            rules = o.optJSONArray("rules") ?: JSONArray()
            downloaded = o.optJSONArray("downloaded") ?: JSONArray()
        }
    }

    private fun save() {
        val o = JSONObject().put("feeds", feeds).put("rules", rules).put("downloaded", downloaded)
        runCatching {
            val tmp = File(file.parentFile, "rss.json.tmp")
            tmp.writeText(o.toString())
            tmp.renameTo(file)
        }
        version++
        Engine.emit("rss", JSONObject().put("v", version))
    }

    fun start() = reschedule()

    fun stop() {
        job?.cancel(false)
        job = null
    }

    fun reschedule() {
        job?.cancel(false)
        job = null
        if (!Engine.prefs.bool("rssEnabled")) return
        val every = Engine.prefs.int("rssInterval").coerceAtLeast(5).toLong()
        job = exec.scheduleWithFixedDelay({ refreshAll() }, 15, every * 60, TimeUnit.SECONDS)
    }

    fun json(): JSONObject = synchronized(lock) {
        val fs = JSONArray()
        for (i in 0 until feeds.length()) {
            val f = feeds.getJSONObject(i)
            val c = JSONObject(f.toString())
            c.put("refreshing", refreshing.contains(f.optString("url")))
            fs.put(c)
        }
        JSONObject().put("feeds", fs).put("rules", JSONArray(rules.toString())).put("v", version)
    }

    private fun feedIndex(url: String): Int {
        for (i in 0 until feeds.length()) if (feeds.getJSONObject(i).optString("url") == url) return i
        return -1
    }

    fun addFeed(url: String, name: String) {
        val u = url.trim()
        if (!u.startsWith("http://", true) && !u.startsWith("https://", true)) throw IllegalArgumentException("Адреса каналу має починатися з http:// або https://")
        synchronized(lock) {
            if (feedIndex(u) >= 0) throw IllegalArgumentException("Такий канал уже є")
            feeds.put(JSONObject().put("url", u).put("name", name.trim()).put("title", "").put("articles", JSONArray()).put("updated", 0L).put("error", ""))
            save()
        }
        exec.execute { refresh(u) }
    }

    fun removeFeed(url: String) = synchronized(lock) {
        val i = feedIndex(url)
        if (i >= 0) { feeds.remove(i); save() }
    }

    fun renameFeed(url: String, name: String) = synchronized(lock) {
        val i = feedIndex(url)
        if (i >= 0) { feeds.getJSONObject(i).put("name", name.trim()); save() }
    }

    fun markRead(url: String?, articleId: String?) = synchronized(lock) {
        for (i in 0 until feeds.length()) {
            val f = feeds.getJSONObject(i)
            if (url != null && f.optString("url") != url) continue
            val arts = f.optJSONArray("articles") ?: continue
            for (k in 0 until arts.length()) {
                val a = arts.getJSONObject(k)
                if (articleId == null || a.optString("id") == articleId) a.put("read", true)
            }
        }
        save()
    }

    fun saveRules(a: JSONArray) = synchronized(lock) {
        rules = a
        save()
    }

    fun refreshAll() {
        val urls = synchronized(lock) { (0 until feeds.length()).map { feeds.getJSONObject(it).optString("url") } }
        for (u in urls) refresh(u)
    }

    fun refreshAsync(url: String?) = exec.execute { if (url == null) refreshAll() else refresh(url) }

    private fun refresh(url: String) {
        synchronized(lock) { refreshing.add(url) }
        version++
        Engine.emit("rss", JSONObject().put("v", version))
        var error = ""
        var parsed: Pair<String, List<JSONObject>>? = null
        try {
            parsed = parse(download(url))
        } catch (t: Throwable) {
            error = t.message ?: t.javaClass.simpleName
            Engine.log(2, "RSS: не вдалося оновити канал $url — $error")
        }
        val fresh = ArrayList<Pair<JSONObject, JSONObject>>()
        synchronized(lock) {
            refreshing.remove(url)
            val i = feedIndex(url)
            if (i < 0) return
            val f = feeds.getJSONObject(i)
            f.put("error", error).put("updated", System.currentTimeMillis())
            if (parsed != null) {
                f.put("title", parsed.first)
                val old = f.optJSONArray("articles") ?: JSONArray()
                val known = HashMap<String, JSONObject>()
                for (k in 0 until old.length()) known[old.getJSONObject(k).optString("id")] = old.getJSONObject(k)
                val merged = ArrayList<JSONObject>()
                for (a in parsed.second) {
                    val prev = known.remove(a.optString("id"))
                    if (prev != null) {
                        a.put("read", prev.optBoolean("read"))
                    } else {
                        a.put("read", false)
                        fresh.add(Pair(f, a))
                    }
                    merged.add(a)
                }
                merged.addAll(known.values)
                merged.sortByDescending { it.optLong("date") }
                val max = Engine.prefs.int("rssMaxArticles").coerceAtLeast(5)
                f.put("articles", JSONArray(merged.take(max)))
            }
            save()
        }
        if (Engine.prefs.bool("rssAutoDownload")) for ((f, a) in fresh) autoDownload(f, a)
    }

    private fun download(url: String): InputStream {
        var u = url
        repeat(5) {
            val c = URL(u).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 30000
            c.setRequestProperty("User-Agent", "Itorrent/${Engine.version}")
            val code = c.responseCode
            if (code in 300..399) {
                u = URL(URL(u), c.getHeaderField("Location") ?: throw java.io.IOException("Переадресація без адреси")).toString()
                c.disconnect()
                return@repeat
            }
            if (code != 200) {
                c.disconnect()
                throw java.io.IOException("Сервер відповів кодом $code")
            }
            return c.inputStream
        }
        throw java.io.IOException("Забагато переадресацій")
    }

    private val dateFormats = listOf(
        "EEE, dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss zzz", "EEE, d MMM yyyy HH:mm:ss Z",
        "dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm Z", "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd HH:mm:ss"
    )

    private fun parseDate(s: String): Long {
        val t = s.trim()
        if (t.isEmpty()) return 0
        for (f in dateFormats) {
            val d = runCatching { SimpleDateFormat(f, Locale.US).parse(t) }.getOrNull()
            if (d != null) return d.time
        }
        return 0
    }

    private fun parse(inp: InputStream): Pair<String, List<JSONObject>> {
        inp.use { stream ->
            val p = Xml.newPullParser()
            p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
            p.setInput(stream, null)
            var title = ""
            val items = ArrayList<JSONObject>()
            var cur: HashMap<String, String>? = null
            var depthItem = -1
            var ev = p.eventType
            var text = StringBuilder()
            while (ev != XmlPullParser.END_DOCUMENT) {
                when (ev) {
                    XmlPullParser.START_TAG -> {
                        val n = p.name.lowercase()
                        text = StringBuilder()
                        if ((n == "item" || n == "entry") && cur == null) {
                            cur = HashMap()
                            depthItem = p.depth
                        } else if (cur != null) {
                            when (n) {
                                "enclosure" -> {
                                    val url = p.getAttributeValue(null, "url").orEmpty()
                                    val type = p.getAttributeValue(null, "type").orEmpty()
                                    if (url.isNotEmpty() && (type.contains("bittorrent") || url.endsWith(".torrent", true) || url.startsWith("magnet:", true) || !cur.containsKey("enclosure"))) {
                                        cur["enclosure"] = url
                                        p.getAttributeValue(null, "length")?.let { cur["size"] = it }
                                    }
                                }
                                "link" -> {
                                    val href = p.getAttributeValue(null, "href")
                                    if (href != null) {
                                        val rel = p.getAttributeValue(null, "rel").orEmpty()
                                        val type = p.getAttributeValue(null, "type").orEmpty()
                                        if (rel == "enclosure" || type.contains("bittorrent")) cur["enclosure"] = href
                                        else if (!cur.containsKey("link")) cur["link"] = href
                                    }
                                }
                            }
                        }
                    }
                    XmlPullParser.TEXT, XmlPullParser.CDSECT -> text.append(p.text)
                    XmlPullParser.END_TAG -> {
                        val n = p.name.lowercase()
                        val t = text.toString().trim()
                        val c = cur
                        if (c != null && (n == "item" || n == "entry") && p.depth == depthItem) {
                            items.add(toArticle(c))
                            cur = null
                        } else if (c != null) {
                            when (n) {
                                "title" -> c["title"] = t
                                "link" -> if (t.isNotEmpty() && !c.containsKey("link")) c["link"] = t
                                "guid", "id" -> if (t.isNotEmpty()) c["guid"] = t
                                "pubdate", "published", "updated", "date" -> if (t.isNotEmpty() && !c.containsKey("date")) c["date"] = t
                                "description", "summary", "content" -> if (t.isNotEmpty() && !c.containsKey("desc")) c["desc"] = t
                                "magneturi" -> if (t.isNotEmpty()) c["magnet"] = t
                                "infohash" -> if (t.isNotEmpty()) c["infohash"] = t
                                "contentlength", "size" -> if (t.isNotEmpty()) c["size"] = t
                            }
                        } else if (n == "title" && title.isEmpty()) {
                            title = t
                        }
                        text = StringBuilder()
                    }
                }
                ev = p.next()
            }
            return Pair(title, items)
        }
    }

    private fun toArticle(c: Map<String, String>): JSONObject {
        val link = c["link"].orEmpty()
        val enc = c["enclosure"].orEmpty()
        val torrent = when {
            enc.isNotEmpty() -> enc
            c["magnet"]?.isNotEmpty() == true -> c["magnet"]!!
            link.startsWith("magnet:", true) || link.endsWith(".torrent", true) -> link
            c["infohash"]?.isNotEmpty() == true -> "magnet:?xt=urn:btih:${c["infohash"]}&dn=" + java.net.URLEncoder.encode(c["title"].orEmpty(), "UTF-8")
            else -> link
        }
        val title = c["title"].orEmpty()
        val id = c["guid"]?.takeIf { it.isNotEmpty() } ?: torrent.ifEmpty { title }
        return JSONObject().put("id", id).put("title", title).put("link", link).put("torrent", torrent)
            .put("date", parseDate(c["date"].orEmpty())).put("desc", c["desc"].orEmpty().take(4000))
            .put("size", c["size"]?.toLongOrNull() ?: -1L)
    }

    fun download(url: String, articleId: String, dialog: Boolean) {
        val a = synchronized(lock) {
            val i = feedIndex(url)
            if (i < 0) null else {
                val arts = feeds.getJSONObject(i).optJSONArray("articles")
                var found: JSONObject? = null
                if (arts != null) for (k in 0 until arts.length()) if (arts.getJSONObject(k).optString("id") == articleId) found = arts.getJSONObject(k)
                found?.put("read", true)
                found
            }
        } ?: return
        save()
        Engine.addLink(a.optString("torrent"), dialog)
    }

    // ---------------- правила

    private fun wildcardToRegex(s: String): String {
        val sb = StringBuilder()
        for (ch in s) when (ch) {
            '*' -> sb.append(".*")
            '?' -> sb.append('.')
            else -> sb.append(Regex.escape(ch.toString()))
        }
        return sb.toString()
    }

    /** Збіг як у qBittorrent: пробіл — «і», «|» — «або», * і ? — шаблони. */
    private fun matchesWildcard(expr: String, title: String): Boolean {
        val alts = expr.split('|').map { it.trim() }.filter { it.isNotEmpty() }
        if (alts.isEmpty()) return true
        return alts.any { alt ->
            alt.split(' ').filter { it.isNotEmpty() }.all { w ->
                Regex(wildcardToRegex(w), RegexOption.IGNORE_CASE).containsMatchIn(title)
            }
        }
    }

    fun matches(rule: JSONObject, title: String): Boolean {
        val must = rule.optString("mustContain")
        val not = rule.optString("mustNotContain")
        val regex = rule.optBoolean("useRegex")
        return try {
            val okMust = if (must.isBlank()) true else if (regex) Regex(must, RegexOption.IGNORE_CASE).containsMatchIn(title) else matchesWildcard(must, title)
            val okNot = if (not.isBlank()) true else if (regex) !Regex(not, RegexOption.IGNORE_CASE).containsMatchIn(title) else {
                val alts = not.split('|').map { it.trim() }.filter { it.isNotEmpty() }
                alts.none { matchesWildcard(it, title) }
            }
            okMust && okNot
        } catch (t: Throwable) {
            false
        }
    }

    /** Попередній перегляд правила: які статті з наявних каналів йому відповідають. */
    fun test(rule: JSONObject): JSONArray = synchronized(lock) {
        val out = JSONArray()
        val fl = rule.optJSONArray("feeds")
        val feedSet = HashSet<String>()
        if (fl != null) for (i in 0 until fl.length()) feedSet.add(fl.getString(i))
        for (i in 0 until feeds.length()) {
            val f = feeds.getJSONObject(i)
            if (feedSet.isNotEmpty() && f.optString("url") !in feedSet) continue
            val arts = f.optJSONArray("articles") ?: continue
            for (k in 0 until arts.length()) {
                val t = arts.getJSONObject(k).optString("title")
                if (matches(rule, t)) out.put(t)
            }
        }
        out
    }

    private fun autoDownload(feed: JSONObject, a: JSONObject) {
        val title = a.optString("title")
        val rs = synchronized(lock) { JSONArray(rules.toString()) }
        for (i in 0 until rs.length()) {
            val r = rs.getJSONObject(i)
            if (!r.optBoolean("enabled", true)) continue
            val fl = r.optJSONArray("feeds")
            if (fl != null && fl.length() > 0) {
                var ok = false
                for (k in 0 until fl.length()) if (fl.getString(k) == feed.optString("url")) ok = true
                if (!ok) continue
            }
            if (!matches(r, title)) continue
            val key = a.optString("id")
            val already = synchronized(lock) { (0 until downloaded.length()).any { downloaded.getString(it) == key } }
            if (already) return
            synchronized(lock) {
                downloaded.put(key)
                while (downloaded.length() > 3000) downloaded.remove(0)
                for (k in 0 until rules.length()) {
                    val rr = rules.getJSONObject(k)
                    if (rr.optString("name") == r.optString("name")) rr.put("lastMatch", System.currentTimeMillis())
                }
                a.put("read", true)
                save()
            }
            val opts = JSONObject()
            if (r.optString("category").isNotBlank()) opts.put("category", r.optString("category"))
            if (r.optString("savePath").isNotBlank()) opts.put("savePath", r.optString("savePath"))
            when (r.optString("addStopped")) {
                "yes" -> opts.put("start", false)
                "no" -> opts.put("start", true)
            }
            Engine.log(1, "RSS: правило «${r.optString("name")}» — завантаження «$title»")
            Engine.addLink(a.optString("torrent"), false, opts)
            return
        }
    }
}
