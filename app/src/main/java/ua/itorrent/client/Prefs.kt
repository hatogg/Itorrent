package ua.itorrent.client

import android.content.Context
import org.json.JSONObject
import java.io.File
import kotlin.random.Random

/**
 * Налаштування застосунку. Зберігаються одним JSON-файлом, значення за замовчуванням
 * описані тут, щоб інтерфейс завжди отримував повний набір ключів.
 */
class Prefs(private val ctx: Context) {

    private val file = File(ctx.filesDir, "prefs.json")
    private var data = JSONObject()
    private val lock = Any()

    val defaults: JSONObject = JSONObject()
        // Поведінка
        .put("theme", "system")
        .put("confirmDelete", true)
        .put("deleteFilesDefault", false)
        .put("showAddDialog", true)
        .put("startOnBoot", false)
        .put("notifyFinished", true)
        .put("exitWhenDone", false)
        .put("keepAwake", true)
        // Завантаження
        .put("savePath", "")
        .put("tempPathEnabled", false)
        .put("tempPath", "")
        .put("addStopped", false)
        .put("preallocate", false)
        .put("seqDefault", false)
        .put("firstLastDefault", false)
        .put("subfolder", "original")
        // З'єднання
        .put("listenPort", 0)
        .put("randomPort", false)
        .put("upnp", true)
        .put("maxConn", 200)
        .put("maxConnTorrent", 100)
        .put("maxUploads", 20)
        .put("maxUploadsTorrent", 4)
        .put("proxyType", "none")
        .put("proxyHost", "")
        .put("proxyPort", 1080)
        .put("proxyAuth", false)
        .put("proxyUser", "")
        .put("proxyPass", "")
        .put("proxyPeers", true)
        .put("proxyHostnames", true)
        .put("ipFilterEnabled", false)
        .put("ipFilterPath", "")
        .put("ipFilterTrackers", false)
        .put("bannedIps", "")
        // Швидкість (КіБ/с, 0 — без обмежень)
        .put("dlLimit", 0)
        .put("upLimit", 0)
        .put("altDlLimit", 512)
        .put("altUpLimit", 128)
        .put("altEnabled", false)
        .put("altSchedule", false)
        .put("altFrom", "08:00")
        .put("altTo", "20:00")
        .put("altDays", "every")
        .put("limitUtp", true)
        .put("limitOverhead", false)
        // BitTorrent
        .put("dht", true)
        .put("pex", true)
        .put("lsd", true)
        .put("encryption", 0)
        .put("anonymous", false)
        .put("queueing", true)
        .put("maxActiveDl", 3)
        .put("maxActiveUp", 3)
        .put("maxActiveTorrents", 5)
        .put("dontCountSlow", false)
        .put("ratioLimitEnabled", false)
        .put("ratioLimit", 1.0)
        .put("seedTimeEnabled", false)
        .put("seedTime", 1440)
        .put("seedAction", "stop")
        .put("addTrackersEnabled", false)
        .put("addTrackers", "")
        // Живлення й мережа
        .put("wifiOnly", false)
        .put("chargingOnly", false)
        .put("batteryLimitEnabled", false)
        .put("batteryLimit", 15)
        .put("vpnOnly", false)
        .put("schedEnabled", false)
        .put("schedFrom", "01:00")
        .put("schedTo", "07:00")
        .put("schedDays", "every")
        // RSS
        .put("rssEnabled", true)
        .put("rssInterval", 30)
        .put("rssMaxArticles", 50)
        .put("rssAutoDownload", true)
        // Службове
        .put("ui", "{}")
        .put("categories", "{}")
        .put("tags", "[]")
        .put("allTimeDl", 0L)
        .put("allTimeUl", 0L)
        .put("firstRunDone", false)

    init {
        synchronized(lock) {
            data = runCatching { JSONObject(file.readText()) }.getOrElse { JSONObject() }
            if (data.optInt("listenPort", 0) == 0) {
                data.put("listenPort", Random.nextInt(20000, 60000))
                save()
            }
        }
    }

    private fun save() {
        val tmp = File(file.parentFile, "prefs.json.tmp")
        tmp.writeText(data.toString())
        tmp.renameTo(file)
    }

    fun all(): JSONObject = synchronized(lock) {
        val o = JSONObject(defaults.toString())
        val it = data.keys()
        while (it.hasNext()) {
            val k = it.next()
            o.put(k, data.get(k))
        }
        o
    }

    fun has(key: String) = synchronized(lock) { data.has(key) }

    fun str(key: String): String = synchronized(lock) {
        if (data.has(key)) data.optString(key) else defaults.optString(key)
    }

    fun bool(key: String): Boolean = synchronized(lock) {
        if (data.has(key)) data.optBoolean(key) else defaults.optBoolean(key)
    }

    fun int(key: String): Int = synchronized(lock) {
        if (data.has(key)) data.optInt(key) else defaults.optInt(key)
    }

    fun long(key: String): Long = synchronized(lock) {
        if (data.has(key)) data.optLong(key) else defaults.optLong(key)
    }

    fun double(key: String): Double = synchronized(lock) {
        if (data.has(key)) data.optDouble(key) else defaults.optDouble(key)
    }

    fun put(key: String, value: Any) = synchronized(lock) {
        data.put(key, value)
        save()
    }

    /** Записує кілька значень; повертає множину ключів, що справді змінилися. */
    fun merge(o: JSONObject): Set<String> = synchronized(lock) {
        val changed = HashSet<String>()
        val it = o.keys()
        while (it.hasNext()) {
            val k = it.next()
            val v = o.get(k)
            val old = if (data.has(k)) data.get(k) else defaults.opt(k)
            if (old?.toString() != v.toString()) changed.add(k)
            data.put(k, v)
        }
        save()
        changed
    }

    fun categories(): JSONObject = runCatching { JSONObject(str("categories")) }.getOrElse { JSONObject() }
    fun tags(): List<String> = runCatching {
        val a = org.json.JSONArray(str("tags"))
        (0 until a.length()).map { a.getString(it) }
    }.getOrElse { emptyList() }
}
