package ua.itorrent.client

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import org.libtorrent4j.AddTorrentParams
import org.libtorrent4j.AlertListener
import org.libtorrent4j.SessionManager
import org.libtorrent4j.SessionParams
import org.libtorrent4j.SettingsPack
import org.libtorrent4j.TorrentFlags
import org.libtorrent4j.Vectors
import org.libtorrent4j.alerts.AddTorrentAlert
import org.libtorrent4j.alerts.Alert
import org.libtorrent4j.alerts.AlertType
import org.libtorrent4j.alerts.ExternalIpAlert
import org.libtorrent4j.alerts.FastresumeRejectedAlert
import org.libtorrent4j.alerts.FileErrorAlert
import org.libtorrent4j.alerts.FileRenameFailedAlert
import org.libtorrent4j.alerts.FileRenamedAlert
import org.libtorrent4j.alerts.ListenFailedAlert
import org.libtorrent4j.alerts.ListenSucceededAlert
import org.libtorrent4j.alerts.MetadataFailedAlert
import org.libtorrent4j.alerts.MetadataReceivedAlert
import org.libtorrent4j.alerts.PieceFinishedAlert
import org.libtorrent4j.alerts.PortmapAlert
import org.libtorrent4j.alerts.PortmapErrorAlert
import org.libtorrent4j.alerts.SaveResumeDataAlert
import org.libtorrent4j.alerts.SaveResumeDataFailedAlert
import org.libtorrent4j.alerts.SessionErrorAlert
import org.libtorrent4j.alerts.StorageMovedAlert
import org.libtorrent4j.alerts.StorageMovedFailedAlert
import org.libtorrent4j.alerts.TorrentAlert
import org.libtorrent4j.alerts.TorrentDeleteFailedAlert
import org.libtorrent4j.alerts.TorrentErrorAlert
import org.libtorrent4j.alerts.TorrentFinishedAlert
import org.libtorrent4j.alerts.TorrentRemovedAlert
import org.libtorrent4j.alerts.TrackerErrorAlert
import org.libtorrent4j.alerts.UrlSeedAlert
import org.libtorrent4j.swig.add_torrent_params
import org.libtorrent4j.swig.address
import org.libtorrent4j.swig.alert
import org.libtorrent4j.swig.announce_entry
import org.libtorrent4j.swig.announce_entry_vector
import org.libtorrent4j.swig.byte_vector
import org.libtorrent4j.swig.error_code
import org.libtorrent4j.swig.info_hash_t
import org.libtorrent4j.swig.ip_filter
import org.libtorrent4j.swig.libtorrent
import org.libtorrent4j.swig.move_flags_t
import org.libtorrent4j.swig.session_handle
import org.libtorrent4j.swig.settings_pack
import org.libtorrent4j.swig.status_flags_t
import org.libtorrent4j.swig.storage_mode_t
import org.libtorrent4j.swig.tcp_endpoint
import org.libtorrent4j.swig.torrent_flags_t
import org.libtorrent4j.swig.torrent_handle
import org.libtorrent4j.swig.torrent_info
import org.libtorrent4j.swig.torrent_status
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Рушій: одна сесія libtorrent на весь застосунок, список торентів, черга, ліміти,
 * обмеження роздачі, умови роботи (Wi‑Fi, заряджання, розклад) і журнал подій.
 */
@SuppressLint("StaticFieldLeak")
object Engine {

    lateinit var ctx: Context
    lateinit var prefs: Prefs
    lateinit var rss: Rss
    lateinit var streamer: Streamer

    val sm = SessionManager(false)
    val entries = ConcurrentHashMap<String, Entry>()
    val exec = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "itorrent-engine") }
    private val io = Executors.newCachedThreadPool { r -> Thread(r, "itorrent-io").apply { isDaemon = true } }
    private val main = Handler(Looper.getMainLooper())

    @Volatile var started = false
        private set
    @Volatile var stopping = false
        private set
    private var inited = false
    private var ticker: ScheduledFuture<*>? = null

    private val pendingMeta = ConcurrentHashMap<String, Meta>()
    private val pendingAdd = ConcurrentHashMap<String, Pair<add_torrent_params, Meta>>()
    private val previews = ConcurrentHashMap<String, Preview>()
    private val metaFetch = ConcurrentHashMap<String, MetaFetch>()
    @Volatile private var shutdownLatch: CountDownLatch? = null
    private val readyLatch = CountDownLatch(1)
    val isReady: Boolean get() = readyLatch.count == 0L && started && !stopping

    /** Чекає, доки сесія libtorrent запуститься. */
    fun awaitReady() {
        if (!readyLatch.await(20, TimeUnit.SECONDS)) throw IOException("Сесія ще не запустилася")
        if (stopping) throw IOException("Застосунок завершує роботу")
    }

    /** Події для інтерфейсу: тип і дані. */
    @Volatile var sink: ((String, JSONObject) -> Unit)? = null
    /** Сповіщення про завершене завантаження (показує служба). */
    @Volatile var onFinished: ((Entry) -> Unit)? = null
    /** Викликається щосекунди після оновлення стану. */
    @Volatile var onTick: (() -> Unit)? = null
    /** Запит на вихід (усі завантаження завершено). */
    @Volatile var onExitRequest: (() -> Unit)? = null

    // Умови, які повідомляє служба
    @Volatile var netConnected = true
    @Volatile var netUnmetered = true
    @Volatile var netVpn = false
    @Volatile var vpnIface = ""
    @Volatile var charging = true
    @Volatile var battery = 100

    @Volatile var pauseReason = ""
        private set
    private var lastAltWindow: Boolean? = null
    private var hadDownloads = false
    private var tickNo = 0L
    @Volatile var sessionJson = JSONObject()
        private set
    @Volatile var rowsJson = JSONArray()
        private set
    private var statsBaseDl = 0L
    private var statsBaseUl = 0L
    private var freeSpace = -1L

    private val torrentsDir by lazy { File(ctx.filesDir, "torrents").apply { mkdirs() } }

    val version: String get() = BuildConfig.VERSION_NAME

    class Preview(val pid: String, val id: String) {
        @Volatile var bytes: ByteArray? = null
        @Volatile var magnet: String? = null
        @Volatile var name = ""
    }

    class MetaFetch(val pid: String) {
        @Volatile var th: torrent_handle? = null
        @Volatile var cancelled = false
        @Volatile var removing = false
    }

    fun init(c: Context) {
        if (inited) return
        inited = true
        ctx = c.applicationContext
        prefs = Prefs(ctx)
        rss = Rss(ctx)
        streamer = Streamer()
    }

    // ---------------------------------------------------------------- журнал

    class LogLine(val id: Int, val time: Long, val level: Int, val msg: String)

    private val logs = ArrayDeque<LogLine>()
    private var logId = 0

    /** level: 0 — звичайне, 1 — інформація, 2 — попередження, 3 — критичне. */
    fun log(level: Int, msg: String) {
        synchronized(logs) {
            logs.addLast(LogLine(++logId, System.currentTimeMillis(), level, msg))
            while (logs.size > 1500) logs.removeFirst()
        }
    }

    fun logsSince(since: Int): JSONArray = synchronized(logs) {
        val a = JSONArray()
        for (l in logs) if (l.id > since) a.put(JSONArray().put(l.id).put(l.time).put(l.level).put(l.msg))
        a
    }

    fun emit(type: String, data: JSONObject = JSONObject()) {
        sink?.invoke(type, data)
    }

    fun toast(msg: String) = emit("toast", JSONObject().put("msg", msg))

    // ---------------------------------------------------------------- шляхи

    fun hasStorageAccess(): Boolean = if (Build.VERSION.SDK_INT >= 30) {
        Environment.isExternalStorageManager()
    } else {
        ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    @Suppress("DEPRECATION")
    fun publicDownloads(): String = if (hasStorageAccess()) {
        File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Itorrent").path
    } else {
        File(ctx.getExternalFilesDir(null) ?: ctx.filesDir, "Download").path
    }

    fun defaultSavePath(): String {
        val p = prefs.str("savePath")
        return if (p.isNotBlank()) p else publicDownloads()
    }

    fun categorySavePath(cat: String): String {
        if (cat.isBlank()) return defaultSavePath()
        val p = prefs.categories().optJSONObject(cat)?.optString("savePath").orEmpty()
        return if (p.isNotBlank()) p else defaultSavePath()
    }

    // ---------------------------------------------------------------- ідентифікатори

    fun idOf(ih: info_hash_t): String = if (ih.has_v1()) ih.getV1().to_hex() else ih.get_best().to_hex()
    fun idOf(th: torrent_handle): String = idOf(th.info_hashes())

    /** Власний (не прив'язаний до пам'яті події) дескриптор торента. */
    private fun own(th: torrent_handle): torrent_handle? {
        val h = sm.swig()?.find_torrent(th.info_hashes().get_best()) ?: return null
        return if (h.is_valid()) h else null
    }

    // ---------------------------------------------------------------- запуск і зупинка

    fun start() {
        synchronized(this) {
            if (started || stopping) return
            started = true
        }
        exec.execute {
            try {
                startSession()
            } catch (t: Throwable) {
                log(3, "Не вдалося запустити сесію: ${t.message}")
                started = false
            }
        }
    }

    private fun startSession() {
        val sp = settingsPack()
        val stateFile = File(ctx.filesDir, "session.dat")
        val params = (if (stateFile.exists()) runCatching { SessionParams(stateFile.readBytes()) }.getOrNull() else null)
            ?: SessionParams()
        params.setSettings(sp)
        params.setPosixDiskIO()
        installCaBundle()
        sm.addListener(listener)
        sm.start(params)
        sm.applySettings(settingsPack())
        log(0, "Itorrent $version запущено")
        log(1, "libtorrent ${runCatching { libtorrent.version() }.getOrDefault("2")}")
        if (!hasStorageAccess()) log(2, "Немає доступу до спільних папок — торенти зберігатимуться в папці застосунку")
        applyIpFilter()
        loadSaved()
        statsBaseDl = 0
        statsBaseUl = 0
        streamer.start()
        rss.start()
        ticker = exec.scheduleWithFixedDelay({ tick() }, 1000, 1000, TimeUnit.MILLISECONDS)
        readyLatch.countDown()
    }

    /**
     * Вбудований у libtorrent OpenSSL не знає, де Android тримає кореневі сертифікати,
     * тож HTTPS-трекери й веб-сіди не проходили б перевірку. Збираємо системні сертифікати
     * в один PEM-файл і показуємо його OpenSSL через SSL_CERT_FILE.
     */
    private fun installCaBundle() {
        try {
            val f = File(ctx.filesDir, "cacert.pem")
            if (!f.exists() || f.length() < 1000 || System.currentTimeMillis() - f.lastModified() > 3L * 86400_000) {
                val ks = java.security.KeyStore.getInstance("AndroidCAStore")
                ks.load(null)
                val sb = StringBuilder()
                val aliases = ks.aliases()
                var n = 0
                while (aliases.hasMoreElements()) {
                    val c = ks.getCertificate(aliases.nextElement()) ?: continue
                    val b64 = android.util.Base64.encodeToString(c.encoded, android.util.Base64.NO_WRAP)
                    sb.append("-----BEGIN CERTIFICATE-----\n")
                    var i = 0
                    while (i < b64.length) { sb.append(b64, i, minOf(i + 64, b64.length)).append('\n'); i += 64 }
                    sb.append("-----END CERTIFICATE-----\n")
                    n++
                }
                val tmp = File(ctx.filesDir, "cacert.pem.tmp")
                tmp.writeText(sb.toString())
                tmp.renameTo(f)
                log(1, "Кореневих сертифікатів для HTTPS: $n")
            }
            android.system.Os.setenv("SSL_CERT_FILE", f.path, true)
        } catch (t: Throwable) {
            log(2, "Не вдалося підготувати сертифікати для HTTPS: ${t.message}")
        }
    }

    /** Зберігає дані відновлення, стан DHT і зупиняє сесію. Блокує потік рушія, але не головний. */
    fun shutdown(done: () -> Unit) {
        synchronized(this) {
            if (stopping) return
            stopping = true
        }
        exec.execute {
            try {
                if (started) {
                    ticker?.cancel(false)
                    rss.stop()
                    streamer.stop()
                    sm.pause()
                    val live = entries.values.mapNotNull { e -> e.th?.takeIf { it.is_valid() } }
                    val latch = CountDownLatch(live.size)
                    shutdownLatch = latch
                    for (th in live) runCatching { th.save_resume_data(torrent_handle.save_info_dict) }.onFailure { latch.countDown() }
                    latch.await(8, TimeUnit.SECONDS)
                    saveStats()
                    runCatching { sm.saveState()?.let { File(ctx.filesDir, "session.dat").writeBytes(it) } }
                    sm.removeListener(listener)
                    sm.stop()
                }
            } catch (t: Throwable) {
                log(3, "Помилка під час зупинки: ${t.message}")
            } finally {
                started = false
                entries.clear()
                main.post { done() }
            }
        }
    }

    // ---------------------------------------------------------------- налаштування сесії

    private fun alertMask(): Int = alert.error_notification
        .or_(alert.status_notification)
        .or_(alert.storage_notification)
        .or_(alert.port_mapping_notification)
        .or_(alert.performance_warning)
        .or_(alert.piece_progress_notification)
        .to_int()

    val altActive: Boolean get() = prefs.bool("altEnabled")

    fun effectiveDl(): Int = if (altActive) prefs.int("altDlLimit") else prefs.int("dlLimit")
    fun effectiveUl(): Int = if (altActive) prefs.int("altUpLimit") else prefs.int("upLimit")

    private fun settingsPack(): SettingsPack {
        val sp = SettingsPack()
        fun b(k: settings_pack.bool_types, v: Boolean) { sp.setBoolean(k.swigValue(), v) }
        fun i(k: settings_pack.int_types, v: Int) { sp.setInteger(k.swigValue(), v) }
        fun s(k: settings_pack.string_types, v: String) { sp.setString(k.swigValue(), v) }
        val p = prefs
        s(settings_pack.string_types.user_agent, "Itorrent/$version")
        s(settings_pack.string_types.peer_fingerprint, "-IT1000-")
        s(settings_pack.string_types.handshake_client_version, "Itorrent $version")
        val port = p.int("listenPort")
        val iface = if (p.bool("vpnOnly") && vpnIface.isNotBlank()) vpnIface else ""
        if (iface.isNotBlank()) {
            s(settings_pack.string_types.listen_interfaces, "$iface:$port")
            s(settings_pack.string_types.outgoing_interfaces, iface)
        } else {
            s(settings_pack.string_types.listen_interfaces, "0.0.0.0:$port,[::]:$port")
            s(settings_pack.string_types.outgoing_interfaces, "")
        }
        b(settings_pack.bool_types.enable_upnp, p.bool("upnp"))
        b(settings_pack.bool_types.enable_natpmp, p.bool("upnp"))
        b(settings_pack.bool_types.enable_dht, p.bool("dht"))
        b(settings_pack.bool_types.enable_lsd, p.bool("lsd"))
        i(settings_pack.int_types.connections_limit, p.int("maxConn").coerceAtLeast(2))
        i(settings_pack.int_types.unchoke_slots_limit, p.int("maxUploads").let { if (it <= 0) -1 else it })
        i(settings_pack.int_types.download_rate_limit, effectiveDl() * 1024)
        i(settings_pack.int_types.upload_rate_limit, effectiveUl() * 1024)
        b(settings_pack.bool_types.rate_limit_ip_overhead, p.bool("limitOverhead"))
        if (p.bool("queueing")) {
            i(settings_pack.int_types.active_downloads, p.int("maxActiveDl"))
            i(settings_pack.int_types.active_seeds, p.int("maxActiveUp"))
            i(settings_pack.int_types.active_limit, p.int("maxActiveTorrents"))
        } else {
            i(settings_pack.int_types.active_downloads, -1)
            i(settings_pack.int_types.active_seeds, -1)
            i(settings_pack.int_types.active_limit, -1)
        }
        b(settings_pack.bool_types.dont_count_slow_torrents, p.bool("dontCountSlow"))
        when (p.int("encryption")) {
            1 -> {
                i(settings_pack.int_types.in_enc_policy, settings_pack.enc_policy.pe_forced.swigValue())
                i(settings_pack.int_types.out_enc_policy, settings_pack.enc_policy.pe_forced.swigValue())
                i(settings_pack.int_types.allowed_enc_level, settings_pack.enc_level.pe_rc4.swigValue())
                b(settings_pack.bool_types.prefer_rc4, true)
            }
            2 -> {
                i(settings_pack.int_types.in_enc_policy, settings_pack.enc_policy.pe_disabled.swigValue())
                i(settings_pack.int_types.out_enc_policy, settings_pack.enc_policy.pe_disabled.swigValue())
                i(settings_pack.int_types.allowed_enc_level, settings_pack.enc_level.pe_both.swigValue())
                b(settings_pack.bool_types.prefer_rc4, false)
            }
            else -> {
                i(settings_pack.int_types.in_enc_policy, settings_pack.enc_policy.pe_enabled.swigValue())
                i(settings_pack.int_types.out_enc_policy, settings_pack.enc_policy.pe_enabled.swigValue())
                i(settings_pack.int_types.allowed_enc_level, settings_pack.enc_level.pe_both.swigValue())
                b(settings_pack.bool_types.prefer_rc4, false)
            }
        }
        b(settings_pack.bool_types.anonymous_mode, p.bool("anonymous"))
        val pt = when (p.str("proxyType")) {
            "socks4" -> settings_pack.proxy_type_t.socks4
            "socks5" -> if (p.bool("proxyAuth")) settings_pack.proxy_type_t.socks5_pw else settings_pack.proxy_type_t.socks5
            "http" -> if (p.bool("proxyAuth")) settings_pack.proxy_type_t.http_pw else settings_pack.proxy_type_t.http
            else -> settings_pack.proxy_type_t.none
        }
        i(settings_pack.int_types.proxy_type, pt.swigValue())
        s(settings_pack.string_types.proxy_hostname, p.str("proxyHost"))
        i(settings_pack.int_types.proxy_port, p.int("proxyPort"))
        s(settings_pack.string_types.proxy_username, p.str("proxyUser"))
        s(settings_pack.string_types.proxy_password, p.str("proxyPass"))
        b(settings_pack.bool_types.proxy_peer_connections, p.bool("proxyPeers"))
        b(settings_pack.bool_types.proxy_hostnames, p.bool("proxyHostnames"))
        b(settings_pack.bool_types.proxy_tracker_connections, true)
        b(settings_pack.bool_types.apply_ip_filter_to_trackers, p.bool("ipFilterEnabled") && p.bool("ipFilterTrackers"))
        b(settings_pack.bool_types.announce_to_all_tiers, true)
        b(settings_pack.bool_types.announce_to_all_trackers, false)
        i(settings_pack.int_types.alert_queue_size, 5000)
        i(settings_pack.int_types.max_metadata_size, 64 * 1024 * 1024)
        i(settings_pack.int_types.alert_mask, alertMask())
        return sp
    }

    fun applySettings() {
        if (!started) return
        exec.execute { runCatching { sm.applySettings(settingsPack()) }.onFailure { log(3, "Не вдалося застосувати налаштування: ${it.message}") } }
    }

    /** Застосовує зміни налаштувань із інтерфейсу. */
    fun onPrefsChanged(changed: Set<String>) {
        if (changed.isEmpty()) return
        val ipKeys = setOf("ipFilterEnabled", "ipFilterPath", "bannedIps")
        if (changed.any { it in ipKeys }) exec.execute { applyIpFilter() }
        if (changed.contains("listenPort")) log(1, "Порт прослуховування змінено на ${prefs.int("listenPort")}")
        if (changed.contains("pex")) {
            val off = !prefs.bool("pex")
            for (e in entries.values) e.th?.let { if (off) it.set_flags(TorrentFlags.DISABLE_PEX) else it.unset_flags(TorrentFlags.DISABLE_PEX) }
        }
        if (changed.contains("maxConnTorrent") || changed.contains("maxUploadsTorrent")) {
            for (e in entries.values) e.th?.let {
                it.set_max_connections(prefs.int("maxConnTorrent").let { v -> if (v <= 0) -1 else v })
                it.set_max_uploads(prefs.int("maxUploadsTorrent").let { v -> if (v <= 0) -1 else v })
            }
        }
        if (changed.any { it.startsWith("rss") }) rss.reschedule()
        applySettings()
    }

    fun setAlt(on: Boolean) {
        prefs.put("altEnabled", on)
        log(1, if (on) "Увімкнено альтернативні ліміти швидкості" else "Вимкнено альтернативні ліміти швидкості")
        applySettings()
    }

    fun applyIpFilter() {
        if (!started) return
        val f = ip_filter()
        var rules = 0
        fun rule(a: String, b: String) {
            val ec = error_code()
            val x = address.from_string(a.trim(), ec)
            if (ec.value() != 0) return
            val ec2 = error_code()
            val y = address.from_string(b.trim(), ec2)
            if (ec2.value() != 0) return
            runCatching { f.add_rule(x, y, ip_filter.access_flags.blocked.swigValue().toLong()); rules++ }
        }
        fun line(raw: String) {
            val s = raw.trim()
            if (s.isEmpty() || s.startsWith("#") || s.startsWith("//")) return
            // eMule .dat: 001.002.003.004 - 001.002.003.255 , 000 , опис
            val dat = Regex("^([0-9a-fA-F.:]+)\\s*-\\s*([0-9a-fA-F.:]+)\\s*,\\s*(\\d+)").find(s)
            if (dat != null) {
                val level = dat.groupValues[3].toIntOrNull() ?: 0
                if (level <= 127) rule(stripZeros(dat.groupValues[1]), stripZeros(dat.groupValues[2]))
                return
            }
            // P2P: опис:1.2.3.4-1.2.3.255
            val p2p = Regex(":([0-9.]+)\\s*-\\s*([0-9.]+)$").find(s)
            if (p2p != null) { rule(stripZeros(p2p.groupValues[1]), stripZeros(p2p.groupValues[2])); return }
            // CIDR або одна адреса
            val cidr = Regex("^([0-9.]+)/(\\d+)$").find(s)
            if (cidr != null) {
                val base = ipv4ToLong(cidr.groupValues[1]) ?: return
                val bits = cidr.groupValues[2].toInt().coerceIn(0, 32)
                val mask = if (bits == 0) 0L else (0xFFFFFFFFL shl (32 - bits)) and 0xFFFFFFFFL
                val lo = base and mask
                val hi = lo or (mask.inv() and 0xFFFFFFFFL)
                rule(longToIpv4(lo), longToIpv4(hi))
                return
            }
            val range = Regex("^([0-9a-fA-F.:]+)\\s*-\\s*([0-9a-fA-F.:]+)$").find(s)
            if (range != null) { rule(stripZeros(range.groupValues[1]), stripZeros(range.groupValues[2])); return }
            if (Regex("^[0-9a-fA-F.:]+$").matches(s)) rule(stripZeros(s), stripZeros(s))
        }
        if (prefs.bool("ipFilterEnabled")) {
            val path = prefs.str("ipFilterPath")
            if (path.isNotBlank()) {
                runCatching { File(path).forEachLine { line(it) } }
                    .onFailure { log(3, "Не вдалося прочитати IP-фільтр: ${it.message}") }
            }
        }
        val before = rules
        prefs.str("bannedIps").split('\n', ',', ';', ' ').forEach { line(it) }
        runCatching { sm.swig().set_ip_filter(f) }
        if (rules > 0) log(1, "IP-фільтр застосовано: правил ${before}, заблокованих вручну ${rules - before}")
    }

    private fun stripZeros(ip: String): String =
        if (ip.contains('.') && !ip.contains(':')) ip.split('.').joinToString(".") { (it.toIntOrNull() ?: 0).toString() } else ip

    private fun ipv4ToLong(ip: String): Long? {
        val p = ip.split('.')
        if (p.size != 4) return null
        var r = 0L
        for (x in p) r = (r shl 8) or ((x.toIntOrNull() ?: return null).toLong() and 0xFF)
        return r
    }

    private fun longToIpv4(v: Long) = "${(v shr 24) and 0xFF}.${(v shr 16) and 0xFF}.${(v shr 8) and 0xFF}.${v and 0xFF}"

    // ---------------------------------------------------------------- збереження

    private fun metaFile(id: String) = File(torrentsDir, "$id.json")
    private fun resumeFile(id: String) = File(torrentsDir, "$id.resume")

    fun saveMeta(m: Meta) {
        runCatching {
            val tmp = File(torrentsDir, "${m.id}.json.tmp")
            tmp.writeText(m.toJson().toString())
            tmp.renameTo(metaFile(m.id))
        }
    }

    private fun readMeta(id: String): Meta? = runCatching { Meta.from(JSONObject(metaFile(id).readText())) }.getOrNull()

    private fun writeResume(id: String, data: ByteArray) {
        runCatching {
            val tmp = File(torrentsDir, "$id.resume.tmp")
            tmp.writeBytes(data)
            tmp.renameTo(resumeFile(id))
        }.onFailure { log(3, "Не вдалося зберегти дані відновлення: ${it.message}") }
    }

    private fun loadSaved() {
        val files = torrentsDir.listFiles { f -> f.name.endsWith(".resume") } ?: return
        val list = files.map { f ->
            val id = f.name.removeSuffix(".resume")
            Pair(f, readMeta(id) ?: Meta(id))
        }.sortedBy { it.second.addedOn }
        var n = 0
        for ((f, meta) in list) {
            try {
                val ec = error_code()
                val atp = libtorrent.read_resume_data_ex(Vectors.bytes2byte_vector(f.readBytes()), ec)
                if (ec.value() != 0) {
                    log(3, "Пошкоджені дані відновлення ${meta.id}: ${ec.message()}")
                    continue
                }
                pendingMeta[meta.id] = meta
                sm.swig().async_add_torrent(atp)
                n++
            } catch (t: Throwable) {
                log(3, "Не вдалося відновити торент ${meta.id}: ${t.message}")
            }
        }
        if (n > 0) log(1, "Відновлення торентів: $n")
    }

    private fun saveStats() {
        val dl = sm.totalDownload()
        val ul = sm.totalUpload()
        val ddl = dl - statsBaseDl
        val dul = ul - statsBaseUl
        if (ddl > 0 || dul > 0) {
            prefs.merge(JSONObject().put("allTimeDl", prefs.long("allTimeDl") + ddl.coerceAtLeast(0))
                .put("allTimeUl", prefs.long("allTimeUl") + dul.coerceAtLeast(0)))
            statsBaseDl = dl
            statsBaseUl = ul
        }
    }

    // ---------------------------------------------------------------- події libtorrent

    private val alertTypes = intArrayOf(
        AlertType.ADD_TORRENT.swig(), AlertType.METADATA_RECEIVED.swig(), AlertType.METADATA_FAILED.swig(),
        AlertType.TORRENT_FINISHED.swig(), AlertType.SAVE_RESUME_DATA.swig(), AlertType.SAVE_RESUME_DATA_FAILED.swig(),
        AlertType.TORRENT_REMOVED.swig(), AlertType.TORRENT_DELETE_FAILED.swig(), AlertType.TORRENT_ERROR.swig(),
        AlertType.FILE_ERROR.swig(), AlertType.STORAGE_MOVED.swig(), AlertType.STORAGE_MOVED_FAILED.swig(),
        AlertType.LISTEN_SUCCEEDED.swig(), AlertType.LISTEN_FAILED.swig(), AlertType.PORTMAP.swig(),
        AlertType.PORTMAP_ERROR.swig(), AlertType.EXTERNAL_IP.swig(), AlertType.FASTRESUME_REJECTED.swig(),
        AlertType.PIECE_FINISHED.swig(), AlertType.FILE_RENAMED.swig(), AlertType.FILE_RENAME_FAILED.swig(),
        AlertType.SESSION_ERROR.swig(), AlertType.URL_SEED.swig(), AlertType.TRACKER_ERROR.swig()
    )

    private val listener = object : AlertListener {
        override fun types(): IntArray = alertTypes
        override fun alert(a: Alert<*>) {
            try {
                onAlert(a)
            } catch (t: Throwable) {
                log(3, "Помилка обробки події ${a.type()}: ${t.message}")
            }
        }
    }

    private fun nameOf(e: Entry?): String = e?.let { displayName(it) } ?: "?"

    fun displayName(e: Entry): String {
        if (e.meta.name.isNotBlank()) return e.meta.name
        val n = e.st?.getName().orEmpty()
        if (n.isNotBlank()) return n
        return runCatching { e.th?.torrent_file_ptr()?.name() }.getOrNull()?.takeIf { it.isNotBlank() } ?: e.id
    }

    private var lastPerfLog = 0L
    private val seedErrors = java.util.Collections.synchronizedSet(HashSet<String>())
    private val trackerErrors = java.util.Collections.synchronizedSet(HashSet<String>())

    private fun onAlert(a: Alert<*>) {
        when (a) {
            is AddTorrentAlert -> onAdded(a)
            is MetadataReceivedAlert -> {
                val th = a.handle().swig()
                val id = idOf(th)
                if (metaFetch.containsKey(id)) {
                    th.save_resume_data(torrent_handle.save_info_dict)
                    return
                }
                val e = entries[id] ?: return
                if (e.meta.firstLast) applyFirstLast(e, true)
                th.save_resume_data(torrent_handle.save_info_dict)
                log(0, "Отримано метадані: ${nameOf(e)}")
            }
            is MetadataFailedAlert -> log(2, "Не вдалося отримати метадані: ${a.message()}")
            is SaveResumeDataAlert -> {
                val th = a.handle().swig()
                val id = idOf(th)
                val params = a.params()
                val mf = metaFetch[id]
                if (mf != null) {
                    onFetchedMetadata(id, mf, th, params)
                    return
                }
                val e = entries[id]
                if (e != null) {
                    writeResume(id, AddTorrentParams.writeResumeDataBuf(params))
                    e.exporting?.let { dest ->
                        e.exporting = null
                        try {
                            val buf = Vectors.byte_vector2bytes(libtorrent.write_torrent_file_buf_ex(params.swig()))
                            File(dest).parentFile?.mkdirs()
                            File(dest).writeBytes(buf)
                            toast("Збережено: $dest")
                            log(0, "Експортовано торент-файл: $dest")
                        } catch (t: Throwable) {
                            emit("error", JSONObject().put("msg", "Не вдалося експортувати: ${t.message}"))
                        }
                    }
                }
                shutdownLatch?.countDown()
            }
            is SaveResumeDataFailedAlert -> shutdownLatch?.countDown()
            is TorrentFinishedAlert -> {
                val th = a.handle().swig()
                val e = entries[idOf(th)] ?: return
                if (!e.meta.done) {
                    e.meta.done = true
                    e.meta.completedOn = System.currentTimeMillis()
                    saveMeta(e.meta)
                    log(0, "Завантаження завершено: ${nameOf(e)}")
                    onFinished?.invoke(e)
                    if (e.meta.target.isNotBlank()) {
                        val target = e.meta.target
                        e.meta.target = ""
                        saveMeta(e.meta)
                        File(target).mkdirs()
                        th.move_storage(target, move_flags_t.dont_replace)
                        log(0, "Переміщення «${nameOf(e)}» до $target")
                    }
                }
                th.save_resume_data(torrent_handle.save_info_dict)
            }
            is TorrentRemovedAlert -> {
                val id = idOf(a.swig().getInfo_hashes())
                val mf = metaFetch[id]
                if (mf != null && (mf.removing || mf.cancelled)) metaFetch.remove(id)
                pendingAdd.remove(id)?.let { (atp, meta) -> doAdd(atp, meta) }
            }
            is TorrentDeleteFailedAlert -> log(3, "Не вдалося видалити файли: ${a.message()}")
            is TorrentErrorAlert -> {
                val e = entries[idOf(a.handle().swig())]
                log(3, "Помилка торента «${nameOf(e)}»: ${a.error().message} ${a.filename()}".trim())
            }
            is FileErrorAlert -> {
                val e = entries[idOf(a.handle().swig())]
                log(3, "Помилка файлу в «${nameOf(e)}»: ${a.error().message} — ${a.filename()}")
            }
            is StorageMovedAlert -> {
                val th = a.handle().swig()
                val e = entries[idOf(th)]
                log(0, "Файли «${nameOf(e)}» переміщено до ${a.storagePath()}")
                th.save_resume_data(torrent_handle.save_info_dict)
            }
            is StorageMovedFailedAlert -> {
                val e = entries[idOf(a.handle().swig())]
                val msg = "Не вдалося перемістити «${nameOf(e)}»: ${a.error().message}"
                log(3, msg)
                emit("error", JSONObject().put("msg", msg))
            }
            is ListenSucceededAlert -> log(1, "Прослуховування: ${a.address()}, порт ${a.socketType()}/${a.port()}")
            is ListenFailedAlert -> if (a.port() != 0) log(3, "Не вдалося прослуховувати ${a.address()}:${a.port()} — ${a.error().message}")
            is PortmapAlert -> log(1, "Переадресацію порту налаштовано: ${a.message()}")
            is PortmapErrorAlert -> log(2, "Не вдалося переадресувати порт: ${a.message()}")
            is ExternalIpAlert -> log(1, "Зовнішня IP-адреса: ${a.externalAddress()}")
            is FastresumeRejectedAlert -> {
                val e = entries[idOf(a.handle().swig())]
                log(2, "Дані відновлення «${nameOf(e)}» відхилено, торент буде перевірено: ${a.error().message}")
            }
            is PieceFinishedAlert -> streamer.onPiece(idOf(a.handle().swig()), a.pieceIndex())
            is FileRenamedAlert -> {
                val e = entries[idOf(a.handle().swig())] ?: return
                e.meta.renamed[a.index()] = a.newName()
                saveMeta(e.meta)
                e.th?.save_resume_data(torrent_handle.save_info_dict)
            }
            is FileRenameFailedAlert -> {
                val msg = "Не вдалося перейменувати файл: ${a.error.message}"
                log(3, msg)
                emit("error", JSONObject().put("msg", msg))
            }
            is SessionErrorAlert -> log(3, "Помилка сесії: ${a.message()}")
            is TrackerErrorAlert -> {
                val key = a.trackerUrl() + "|" + a.error().message
                if (trackerErrors.add(key)) {
                    val e = entries[idOf(a.handle().swig())]
                    val msg = a.errorMessage().ifBlank { a.error().message }
                    log(2, "Трекер ${a.trackerUrl().take(100)} («${nameOf(e)}»): $msg")
                }
            }
            is UrlSeedAlert -> {
                val key = a.serverUrl()
                if (seedErrors.add(key)) {
                    val msg = a.errorMessage().ifBlank { a.error().message }
                    log(2, "Веб-сід ${key.take(120)} не відповідає: $msg")
                }
            }
            is TorrentAlert<*> -> {
                if (a.type() == AlertType.PERFORMANCE) {
                    val now = System.currentTimeMillis()
                    if (now - lastPerfLog > 60_000) {
                        lastPerfLog = now
                        log(2, "Продуктивність: ${a.message()}")
                    }
                }
            }
            else -> {}
        }
    }

    private fun onAdded(a: AddTorrentAlert) {
        val err = a.error()
        if (err.isError) {
            val id = runCatching { idOf(a.params().swig().getInfo_hashes()) }.getOrDefault("")
            val meta = pendingMeta.remove(id)
            if (metaFetch.containsKey(id)) {
                metaFetch.remove(id)
                return
            }
            if (meta != null && !resumeFile(id).exists()) metaFile(id).delete()
            val msg = "Не вдалося додати торент: ${err.message}"
            log(3, msg)
            emit("error", JSONObject().put("msg", msg))
            return
        }
        // Дескриптор із події вказує на пам'ять події, яка звільняється після обробки, тож беремо власну копію.
        val id = idOf(a.handle().swig())
        val th = own(a.handle().swig()) ?: return
        val mf = metaFetch[id]
        if (mf != null) {
            mf.th = th
            if (mf.cancelled) {
                mf.removing = true
                sm.swig().remove_torrent(th)
            }
            return
        }
        val fresh = !resumeFile(id).exists()
        val meta = pendingMeta.remove(id) ?: readMeta(id) ?: Meta(id)
        val e = Entry(id, meta)
        e.th = th
        e.wasFinished = meta.done
        entries[id] = e
        if (fresh) {
            saveMeta(meta)
            th.save_resume_data(torrent_handle.save_info_dict)
            log(0, "Додано торент: ${nameOf(e)}")
            emit("added", JSONObject().put("id", id))
        }
        if (meta.firstLast && th.torrent_file_ptr() != null) applyFirstLast(e, true)
        if (!prefs.bool("pex")) th.set_flags(TorrentFlags.DISABLE_PEX)
    }

    // ---------------------------------------------------------------- додавання

    private fun previewJson(p: Preview, atp: add_torrent_params?, ti: torrent_info?): JSONObject {
        val o = JSONObject().put("pid", p.pid).put("id", p.id).put("name", p.name)
            .put("exists", entries.containsKey(p.id))
            .put("hasMeta", ti != null)
        if (atp != null) {
            o.put("comment", atp.getComment().orEmpty())
            o.put("createdBy", atp.getCreated_by().orEmpty())
            o.put("created", atp.getCreation_date() * 1000)
            o.put("trackers", atp.getTrackers().size)
        }
        if (ti != null) {
            val fs = ti.layout()
            val files = JSONArray()
            for (i in 0 until fs.num_files()) {
                if (fs.pad_file_at(i)) continue
                files.put(JSONArray().put(i).put(fs.file_path(i)).put(fs.file_size(i)))
            }
            o.put("files", files).put("nfiles", fs.num_files())
            o.put("size", ti.total_size())
            o.put("pieces", ti.num_pieces()).put("pieceLen", ti.piece_length())
            o.put("priv", ti.priv())
            val ih = ti.info_hashes()
            o.put("v1", if (ih.has_v1()) ih.getV1().to_hex() else "")
            o.put("v2", if (ih.has_v2()) ih.getV2().to_hex() else "")
        } else {
            o.put("size", -1)
        }
        o.put("savePath", defaultSavePath())
        return o
    }

    private fun loadBuffer(bytes: ByteArray): add_torrent_params {
        val ec = error_code()
        val atp = add_torrent_params.load_torrent_buffer(Vectors.bytes2byte_vector(bytes), ec)
        if (ec.value() != 0) throw IOException("Це не торент-файл або він пошкоджений (${ec.message()})")
        return atp
    }

    private fun parseMagnet(uri: String): add_torrent_params {
        val ec = error_code()
        val atp = libtorrent.parse_magnet_uri(uri.trim(), ec)
        if (ec.value() != 0) throw IOException("Неправильне magnet-посилання (${ec.message()})")
        return atp
    }

    fun previewBytes(bytes: ByteArray): JSONObject {
        val atp = loadBuffer(bytes)
        val ti = atp.ti_ptr() ?: throw IOException("Торент-файл не містить метаданих")
        val p = Preview(UUID.randomUUID().toString(), idOf(ti.info_hashes()))
        p.bytes = bytes
        p.name = ti.name()
        previews[p.pid] = p
        return previewJson(p, atp, ti)
    }

    fun previewMagnet(uri: String): JSONObject {
        val atp = parseMagnet(uri)
        val id = idOf(atp.getInfo_hashes())
        val p = Preview(UUID.randomUUID().toString(), id)
        p.magnet = uri.trim()
        p.name = atp.getName().orEmpty().ifBlank { id }
        previews[p.pid] = p
        if (!entries.containsKey(id) && isReady) startMetaFetch(p, atp)
        return previewJson(p, atp, null)
    }

    private fun startMetaFetch(p: Preview, atp: add_torrent_params) {
        if (metaFetch.containsKey(p.id)) return
        metaFetch[p.id] = MetaFetch(p.pid)
        val dir = File(ctx.cacheDir, "meta").apply { mkdirs() }
        atp.setSave_path(dir.absolutePath)
        var f = atp.getFlags()
        f = f.and_(TorrentFlags.PAUSED.inv()).and_(TorrentFlags.AUTO_MANAGED.inv()).or_(TorrentFlags.UPLOAD_MODE)
        atp.setFlags(f)
        sm.swig().async_add_torrent(atp)
    }

    private fun onFetchedMetadata(id: String, mf: MetaFetch, th: torrent_handle, params: AddTorrentParams) {
        try {
            val bytes = Vectors.byte_vector2bytes(libtorrent.write_torrent_file_buf_ex(params.swig()))
            val p = previews[mf.pid]
            if (p != null) {
                p.bytes = bytes
                val atp = loadBuffer(bytes)
                val ti = atp.ti_ptr()
                if (ti != null) {
                    p.name = ti.name()
                    emit("preview.meta", previewJson(p, atp, ti))
                }
            }
        } catch (t: Throwable) {
            log(2, "Не вдалося підготувати метадані: ${t.message}")
        } finally {
            mf.removing = true
            sm.swig().remove_torrent(th)
        }
    }

    fun cancelPreview(pid: String) {
        val p = previews.remove(pid) ?: return
        val mf = metaFetch[p.id] ?: return
        if (mf.pid != pid) return
        val th = mf.th
        if (th != null) {
            if (!mf.removing) {
                mf.removing = true
                sm.swig().remove_torrent(th)
            }
        } else {
            mf.cancelled = true
        }
    }

    /** Додає торент із попереднього перегляду з вибраними параметрами. */
    fun confirmAdd(pid: String, opts: JSONObject) {
        val p = previews.remove(pid) ?: throw IOException("Діалог застарів, додайте торент ще раз")
        val bytes = p.bytes
        val atp = if (bytes != null) loadBuffer(bytes) else parseMagnet(p.magnet ?: throw IOException("Немає даних торента"))
        if (entries.containsKey(p.id)) {
            mergeInto(entries[p.id]!!, atp)
            return
        }
        val meta = Meta(p.id)
        meta.magnet = p.magnet.orEmpty()
        applyOpts(atp, meta, opts)
        val mf = metaFetch[p.id]
        if (mf != null) {
            pendingAdd[p.id] = Pair(atp, meta)
            val th = mf.th
            if (th != null) {
                if (!mf.removing) {
                    mf.removing = true
                    sm.swig().remove_torrent(th)
                }
            } else {
                mf.cancelled = true
            }
            exec.schedule({ pendingAdd.remove(p.id)?.let { (a, m) -> doAdd(a, m) } }, 5, TimeUnit.SECONDS)
        } else {
            doAdd(atp, meta)
        }
    }

    private fun mergeInto(e: Entry, atp: add_torrent_params) {
        val th = e.th ?: return
        val have = HashSet<String>()
        val cur = th.trackers()
        for (i in 0 until cur.size) have.add(cur[i].getUrl())
        var added = 0
        val urls = ArrayList<String>()
        val tv = atp.getTrackers()
        for (i in 0 until tv.size) urls.add(tv[i])
        for (u in urls) if (u !in have) {
            th.add_tracker(announce_entry(u))
            added++
        }
        val msg = if (added > 0) "Торент «${nameOf(e)}» уже є у списку. Додано трекерів: $added" else "Торент «${nameOf(e)}» уже є у списку передач"
        toast(msg)
        log(1, msg)
    }

    private fun applyOpts(atp: add_torrent_params, meta: Meta, opts: JSONObject) {
        val cat = opts.optString("category")
        var save = opts.optString("savePath").ifBlank { categorySavePath(cat) }
        if (save.endsWith("/") && save.length > 1) save = save.dropLast(1)
        File(save).mkdirs()
        val skipCheck = opts.optBoolean("skipCheck")
        val temp = prefs.str("tempPath")
        if (prefs.bool("tempPathEnabled") && temp.isNotBlank() && !skipCheck && temp != save) {
            File(temp).mkdirs()
            meta.target = save
            atp.setSave_path(temp)
        } else {
            atp.setSave_path(save)
        }
        meta.category = cat
        opts.optJSONArray("tags")?.let { a -> for (i in 0 until a.length()) meta.tags.add(a.getString(i)) }
        val rename = opts.optString("rename")
        if (rename.isNotBlank() && rename != atp.getName() && rename != atp.ti_ptr()?.name()) meta.name = rename
        meta.comment = atp.getComment().orEmpty()
        meta.createdBy = atp.getCreated_by().orEmpty()
        meta.createdOn = atp.getCreation_date() * 1000
        var f = atp.getFlags()
        val start = if (opts.has("start")) opts.optBoolean("start") else !prefs.bool("addStopped")
        f = if (start) f.or_(TorrentFlags.AUTO_MANAGED).and_(TorrentFlags.PAUSED.inv())
        else f.or_(TorrentFlags.PAUSED).and_(TorrentFlags.AUTO_MANAGED.inv())
        val seq = if (opts.has("seq")) opts.optBoolean("seq") else prefs.bool("seqDefault")
        if (seq) f = f.or_(TorrentFlags.SEQUENTIAL_DOWNLOAD)
        if (skipCheck) f = f.or_(TorrentFlags.SEED_MODE)
        if (!prefs.bool("pex")) f = f.or_(TorrentFlags.DISABLE_PEX)
        if (opts.optBoolean("superSeed")) f = f.or_(TorrentFlags.SUPER_SEEDING)
        atp.setFlags(f)
        meta.firstLast = if (opts.has("firstLast")) opts.optBoolean("firstLast") else prefs.bool("firstLastDefault")
        val ti = atp.ti_ptr()
        val pr = opts.optJSONArray("prio")
        if (ti != null && pr != null && pr.length() == ti.num_files()) {
            val v = byte_vector()
            for (i in 0 until pr.length()) v.add(pr.optInt(i, 4).coerceIn(0, 7).toByte())
            atp.set_file_priorities(v)
        }
        atp.setStorage_mode(if (prefs.bool("preallocate")) storage_mode_t.storage_mode_allocate else storage_mode_t.storage_mode_sparse)
        if (prefs.bool("addTrackersEnabled")) {
            val tv = atp.getTrackers()
            val have = HashSet<String>()
            for (i in 0 until tv.size) have.add(tv[i])
            prefs.str("addTrackers").split('\n').map { it.trim() }.filter { it.isNotEmpty() && it !in have }.forEach { tv.add(it) }
            atp.setTrackers(tv)
        }
        atp.setMax_connections(prefs.int("maxConnTorrent").let { if (it <= 0) -1 else it })
        atp.setMax_uploads(prefs.int("maxUploadsTorrent").let { if (it <= 0) -1 else it })
        val dl = opts.optInt("dlLimit", 0)
        val ul = opts.optInt("ulLimit", 0)
        if (dl > 0) atp.setDownload_limit(dl * 1024)
        if (ul > 0) atp.setUpload_limit(ul * 1024)
    }

    private fun doAdd(atp: add_torrent_params, meta: Meta) {
        if (!isReady) {
            emit("error", JSONObject().put("msg", "Сесія ще не запущена"))
            return
        }
        pendingMeta[meta.id] = meta
        sm.swig().async_add_torrent(atp)
    }

    private fun defaultOpts(): JSONObject = JSONObject()

    /** Додає без діалогу (з налаштувань за замовчуванням). */
    fun addBytesDirect(bytes: ByteArray, opts: JSONObject = defaultOpts()) {
        val atp = loadBuffer(bytes)
        val ti = atp.ti_ptr() ?: throw IOException("Торент-файл не містить метаданих")
        val id = idOf(ti.info_hashes())
        entries[id]?.let { mergeInto(it, atp); return }
        val meta = Meta(id)
        applyOpts(atp, meta, opts)
        doAdd(atp, meta)
    }

    fun addMagnetDirect(uri: String, opts: JSONObject = defaultOpts()) {
        val atp = parseMagnet(uri)
        val id = idOf(atp.getInfo_hashes())
        entries[id]?.let { mergeInto(it, atp); return }
        val meta = Meta(id)
        meta.magnet = uri.trim()
        applyOpts(atp, meta, opts)
        doAdd(atp, meta)
    }

    /** Завантажує торент-файл за посиланням. Повертає байти або magnet-посилання (після переадресації). */
    fun fetchUrl(url: String): Any {
        var u = url.trim()
        repeat(6) {
            val c = URL(u).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 20000
            c.setRequestProperty("User-Agent", "Itorrent/$version")
            c.setRequestProperty("Accept", "application/x-bittorrent, */*")
            try {
                val code = c.responseCode
                if (code in 300..399) {
                    val loc = c.getHeaderField("Location") ?: throw IOException("Переадресація без адреси")
                    if (loc.startsWith("magnet:", true)) return loc
                    u = URL(URL(u), loc).toString()
                    return@repeat
                }
                if (code != 200) throw IOException("Сервер відповів кодом $code")
                val out = java.io.ByteArrayOutputStream()
                c.inputStream.use { inp ->
                    val buf = ByteArray(16384)
                    while (true) {
                        val n = inp.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        if (out.size() > 32 * 1024 * 1024) throw IOException("Файл завеликий для торента")
                    }
                }
                return out.toByteArray()
            } finally {
                c.disconnect()
            }
        }
        throw IOException("Забагато переадресацій")
    }

    /** Розбирає посилання (magnet або http) і додає/показує діалог. Виконується у фоні. */
    fun addLink(link: String, dialog: Boolean, opts: JSONObject = defaultOpts()) {
        io.execute {
            try {
                val l = link.trim()
                if (l.startsWith("magnet:", true)) {
                    if (dialog) emit("preview", previewMagnet(l)) else addMagnetDirect(l, opts)
                } else if (Regex("^[0-9a-fA-F]{40}$").matches(l) || Regex("^[A-Za-z2-7]{32}$").matches(l)) {
                    val m = "magnet:?xt=urn:btih:$l"
                    if (dialog) emit("preview", previewMagnet(m)) else addMagnetDirect(m, opts)
                } else if (l.startsWith("http://", true) || l.startsWith("https://", true)) {
                    when (val r = fetchUrl(l)) {
                        is String -> if (dialog) emit("preview", previewMagnet(r)) else addMagnetDirect(r, opts)
                        is ByteArray -> if (dialog) emit("preview", previewBytes(r)) else addBytesDirect(r, opts)
                    }
                } else {
                    throw IOException("Не схоже на magnet-посилання чи адресу торент-файлу")
                }
            } catch (t: Throwable) {
                val msg = "Не вдалося додати «${link.take(80)}»: ${t.message}"
                log(3, msg)
                emit("error", JSONObject().put("msg", msg))
            }
        }
    }

    fun runIo(r: () -> Unit) = io.execute {
        try {
            r()
        } catch (t: Throwable) {
            emit("error", JSONObject().put("msg", t.message ?: t.javaClass.simpleName))
        }
    }

    // ---------------------------------------------------------------- дії з торентами

    fun ids(a: JSONArray?): List<Entry> {
        if (a == null) return emptyList()
        return (0 until a.length()).mapNotNull { entries[a.optString(it)] }
    }

    fun startTorrents(list: List<Entry>, force: Boolean = false) {
        for (e in list) {
            val th = e.th ?: continue
            th.clear_error()
            if (force) th.unset_flags(TorrentFlags.AUTO_MANAGED) else th.set_flags(TorrentFlags.AUTO_MANAGED)
            th.resume()
            th.save_resume_data(torrent_handle.save_info_dict)
        }
    }

    fun stopTorrents(list: List<Entry>) {
        for (e in list) {
            val th = e.th ?: continue
            th.unset_flags(TorrentFlags.AUTO_MANAGED)
            th.pause()
            th.save_resume_data(torrent_handle.save_info_dict)
        }
    }

    fun startAll() = startTorrents(entries.values.toList())
    fun stopAll() = stopTorrents(entries.values.toList())

    fun removeTorrents(list: List<Entry>, deleteFiles: Boolean) {
        for (e in list) {
            val th = e.th
            val name = nameOf(e)
            entries.remove(e.id)
            streamer.forget(e.id)
            if (th != null && th.is_valid()) {
                if (deleteFiles) sm.swig().remove_torrent(th, session_handle.delete_files)
                else sm.swig().remove_torrent(th)
            }
            metaFile(e.id).delete()
            resumeFile(e.id).delete()
            log(0, if (deleteFiles) "Видалено торент і файли: $name" else "Видалено торент: $name")
        }
    }

    fun recheck(list: List<Entry>) = list.forEach { e -> e.th?.let { it.force_recheck(); log(0, "Примусова перевірка: ${nameOf(e)}") } }
    fun reannounce(list: List<Entry>) = list.forEach { e ->
        e.th?.let {
            it.force_reannounce(0, -1)
            if (prefs.bool("dht")) it.force_dht_announce()
        }
    }

    fun setLocation(list: List<Entry>, path: String) {
        File(path).mkdirs()
        for (e in list) {
            val th = e.th ?: continue
            e.meta.target = ""
            saveMeta(e.meta)
            th.move_storage(path, move_flags_t.dont_replace)
            log(0, "Переміщення «${nameOf(e)}» до $path")
        }
    }

    fun rename(e: Entry, name: String) {
        e.meta.name = name.trim()
        saveMeta(e.meta)
    }

    fun setCategory(list: List<Entry>, cat: String) {
        for (e in list) {
            e.meta.category = cat
            saveMeta(e.meta)
        }
    }

    fun changeTags(list: List<Entry>, add: List<String>, remove: List<String>, clear: Boolean) {
        val all = LinkedHashSet(prefs.tags())
        var newTags = false
        for (t in add) if (all.add(t)) newTags = true
        if (newTags) prefs.put("tags", JSONArray(all.toList()).toString())
        for (e in list) {
            if (clear) e.meta.tags.clear()
            e.meta.tags.addAll(add)
            e.meta.tags.removeAll(remove.toSet())
            saveMeta(e.meta)
        }
    }

    fun setLimits(list: List<Entry>, dlKib: Int?, ulKib: Int?) {
        for (e in list) {
            val th = e.th ?: continue
            if (dlKib != null) th.set_download_limit(if (dlKib <= 0) -1 else dlKib * 1024)
            if (ulKib != null) th.set_upload_limit(if (ulKib <= 0) -1 else ulKib * 1024)
            th.save_resume_data(torrent_handle.save_info_dict)
        }
    }

    fun setShareLimits(list: List<Entry>, ratio: Double, seedMin: Int) {
        for (e in list) {
            e.meta.ratioLimit = ratio
            e.meta.seedLimit = seedMin
            saveMeta(e.meta)
        }
    }

    fun setFlag(list: List<Entry>, flag: torrent_flags_t, on: Boolean) {
        for (e in list) {
            val th = e.th ?: continue
            if (on) th.set_flags(flag) else th.unset_flags(flag)
            th.save_resume_data(torrent_handle.save_info_dict)
        }
    }

    fun setFirstLast(list: List<Entry>, on: Boolean) {
        for (e in list) {
            e.meta.firstLast = on
            saveMeta(e.meta)
            applyFirstLast(e, on)
        }
    }

    private fun applyFirstLast(e: Entry, on: Boolean) {
        val th = e.th ?: return
        val ti = th.torrent_file_ptr() ?: return
        val fs = ti.layout()
        val fp = th.get_file_priorities_ex()
        if (!on) {
            th.prioritize_files_ex(fp)
            return
        }
        for (i in 0 until fs.num_files()) {
            if (fs.pad_file_at(i) || fs.file_size(i) == 0L) continue
            if (i < fp.size && fp[i].toInt() == 0) continue
            val first = fs.piece_index_at_file(i)
            val last = fs.last_piece_index_at_file(i)
            if (first < 0 || last < 0) continue
            th.piece_priority_ex(first, 7.toByte())
            th.piece_priority_ex(last, 7.toByte())
        }
    }

    fun queue(list: List<Entry>, op: String) {
        val sorted = when (op) {
            "top", "down" -> list.sortedByDescending { it.st?.get_queue_position() ?: 0 }
            else -> list.sortedBy { it.st?.get_queue_position() ?: 0 }
        }
        for (e in sorted) {
            val th = e.th ?: continue
            when (op) {
                "top" -> th.queue_position_top()
                "up" -> th.queue_position_up()
                "down" -> th.queue_position_down()
                "bottom" -> th.queue_position_bottom()
            }
        }
    }

    fun magnet(e: Entry): String {
        val th = e.th ?: return e.meta.magnet
        return runCatching { libtorrent.make_magnet_uri_from_torrent_handle(th) }.getOrNull()?.takeIf { it.isNotBlank() } ?: e.meta.magnet
    }

    fun exportTorrent(e: Entry, dest: String) {
        val th = e.th ?: throw IOException("Торент ще не завантажено")
        if (th.torrent_file_ptr() == null) throw IOException("Метадані ще не отримано")
        e.exporting = dest
        th.save_resume_data(torrent_handle.save_info_dict)
    }

    // файли

    fun setFilePrio(e: Entry, idx: JSONArray, prio: Int) {
        val th = e.th ?: return
        val v = th.get_file_priorities_ex()
        for (k in 0 until idx.length()) {
            val i = idx.optInt(k, -1)
            if (i in 0 until v.size) v[i] = prio.coerceIn(0, 7).toByte()
        }
        th.prioritize_files_ex(v)
        if (e.meta.firstLast) applyFirstLast(e, true)
        if (prio > 0 && e.meta.done) {
            e.meta.done = false
            saveMeta(e.meta)
        }
        th.save_resume_data(torrent_handle.save_info_dict)
    }

    fun filePath(e: Entry, i: Int): String? {
        val th = e.th ?: return null
        val ti = th.torrent_file_ptr() ?: return null
        val rel = e.meta.renamed[i] ?: ti.layout().file_path(i)
        val save = e.st?.getSave_path()?.takeIf { it.isNotBlank() } ?: return null
        return if (rel.startsWith("/")) rel else File(save, rel).path
    }

    fun relPath(e: Entry, i: Int): String? {
        val ti = e.th?.torrent_file_ptr() ?: return null
        return e.meta.renamed[i] ?: ti.layout().file_path(i)
    }

    fun renameFile(e: Entry, i: Int, newRel: String) {
        val th = e.th ?: return
        th.rename_file(i, newRel)
    }

    // трекери, джерела, піри

    fun addTrackers(e: Entry, urls: List<String>) {
        val th = e.th ?: return
        val cur = th.trackers()
        var maxTier = -1
        val have = HashSet<String>()
        for (i in 0 until cur.size) {
            have.add(cur[i].getUrl())
            maxTier = maxOf(maxTier, cur[i].getTier().toInt())
        }
        for (u in urls.map { it.trim() }.filter { it.isNotEmpty() && it !in have }) {
            val ae = announce_entry(u)
            ae.setTier((maxTier + 1).toShort())
            th.add_tracker(ae)
        }
        th.save_resume_data(torrent_handle.save_info_dict)
    }

    fun editTracker(e: Entry, old: String, new: String) {
        val th = e.th ?: return
        val cur = th.trackers()
        val v = announce_entry_vector()
        for (i in 0 until cur.size) {
            val ae = cur[i]
            if (ae.getUrl() == old) {
                val n = announce_entry(new.trim())
                n.setTier(ae.getTier())
                v.add(n)
            } else v.add(ae)
        }
        th.replace_trackers(v)
        th.force_reannounce(0, -1)
        th.save_resume_data(torrent_handle.save_info_dict)
    }

    fun removeTrackers(e: Entry, urls: Set<String>) {
        val th = e.th ?: return
        val cur = th.trackers()
        val v = announce_entry_vector()
        for (i in 0 until cur.size) if (cur[i].getUrl() !in urls) v.add(cur[i])
        th.replace_trackers(v)
        th.save_resume_data(torrent_handle.save_info_dict)
    }

    fun addPeers(e: Entry, peers: List<String>): Int {
        val th = e.th ?: return 0
        var n = 0
        for (s in peers.map { it.trim() }.filter { it.isNotEmpty() }) {
            val m = Regex("^\\[?([^\\]]+?)]?:(\\d+)$").find(s) ?: continue
            val ec = error_code()
            val addr = address.from_string(m.groupValues[1], ec)
            if (ec.value() != 0) continue
            runCatching { th.connect_peer(tcp_endpoint(addr, m.groupValues[2].toInt())) }.onSuccess { n++ }
        }
        return n
    }

    fun banPeers(ips: List<String>) {
        val cur = prefs.str("bannedIps").split('\n').map { it.trim() }.filter { it.isNotEmpty() }.toMutableList()
        for (ip in ips) if (ip !in cur) cur.add(ip)
        prefs.put("bannedIps", cur.joinToString("\n"))
        exec.execute { applyIpFilter() }
        log(1, "Заблоковано пірів: ${ips.joinToString(", ")}")
    }

    // ---------------------------------------------------------------- категорії й мітки

    fun saveCategory(name: String, savePath: String, oldName: String?) {
        val c = prefs.categories()
        if (oldName != null && oldName != name) {
            c.remove(oldName)
            for (e in entries.values) if (e.meta.category == oldName) { e.meta.category = name; saveMeta(e.meta) }
        }
        c.put(name, JSONObject().put("savePath", savePath))
        prefs.put("categories", c.toString())
    }

    fun removeCategory(name: String) {
        val c = prefs.categories()
        c.remove(name)
        prefs.put("categories", c.toString())
        for (e in entries.values) if (e.meta.category == name) { e.meta.category = ""; saveMeta(e.meta) }
    }

    fun addTag(name: String) {
        val t = LinkedHashSet(prefs.tags())
        if (t.add(name.trim())) prefs.put("tags", JSONArray(t.toList()).toString())
    }

    fun removeTag(name: String) {
        val t = LinkedHashSet(prefs.tags())
        t.remove(name)
        prefs.put("tags", JSONArray(t.toList()).toString())
        for (e in entries.values) if (e.meta.tags.remove(name)) saveMeta(e.meta)
    }

    // ---------------------------------------------------------------- щосекундне оновлення

    private val rowFlags: status_flags_t = torrent_handle.query_name.or_(torrent_handle.query_save_path)

    private fun tick() {
        if (!started || stopping) return
        tickNo++
        try {
            sm.postSessionStats()
            if (tickNo % 5 == 0L) sm.postDhtStats()
            val rows = JSONArray()
            var dl = 0L
            var ul = 0L
            var incoming = false
            var downloading = 0
            for (e in entries.values) {
                val th = e.th ?: continue
                if (!th.is_valid()) continue
                val st = try { th.status(rowFlags) } catch (t: Throwable) { continue }
                e.st = st
                val row = buildRow(e, th, st)
                e.row = row
                rows.put(row)
                dl += st.getDownload_payload_rate()
                ul += st.getUpload_payload_rate()
                if (st.getHas_incoming()) incoming = true
                if (e.state in DL_STATES) downloading++
                if (e.state == "downloading" || e.state == "forcedDL" || e.state == "stalledDL" || e.state == "metaDL") hadDownloads = true
                if (e.meta.done && !st.getIs_finished() && !st.getIs_seeding() && st.getState() == torrent_status.state_t.downloading) {
                    e.meta.done = false
                    saveMeta(e.meta)
                }
                checkShareLimits(e, st)
            }
            rowsJson = rows
            if (tickNo % 10 == 1L) freeSpace = runCatching { File(defaultSavePath()).let { f -> f.mkdirs(); f.usableSpace } }.getOrDefault(-1)
            updateConditions()
            val conn = when {
                !netConnected -> "disconnected"
                incoming || !sm.isFirewalled() -> "online"
                else -> "firewalled"
            }
            sessionJson = JSONObject()
                .put("dl", dl).put("ul", ul)
                .put("dlS", sm.totalDownload()).put("ulS", sm.totalUpload())
                .put("dht", sm.dhtNodes())
                .put("conn", conn)
                .put("alt", altActive)
                .put("dlLim", effectiveDl()).put("ulLim", effectiveUl())
                .put("pause", pauseReason)
                .put("free", freeSpace)
                .put("port", prefs.int("listenPort"))
                .put("ip", sm.externalAddress() ?: "")
                .put("storage", hasStorageAccess())
                .put("downloading", downloading)
                .put("sport", streamer.port)
            if (tickNo % 60 == 0L) {
                saveStats()
                for (e in entries.values) e.th?.let { if (it.is_valid() && it.need_save_resume_data()) it.save_resume_data(torrent_handle.save_info_dict) }
            }
            if (prefs.bool("exitWhenDone") && hadDownloads && downloading == 0 && entries.isNotEmpty()) {
                hadDownloads = false
                log(1, "Усі завантаження завершено — вихід за налаштуванням")
                onExitRequest?.invoke()
            }
            onTick?.invoke()
            if (BuildConfig.DEBUG && tickNo % 5 == 0L) debugDump()
        } catch (t: Throwable) {
            log(3, "Помилка оновлення: ${t.message}")
        }
    }

    /** Лише в налагоджувальній збірці: стан для перевірки в емуляторі (CI). */
    private fun debugDump() {
        runCatching {
            val dir = ctx.getExternalFilesDir(null) ?: return
            val tr = JSONObject()
            for (e in entries.values) runCatching { tr.put(displayName(e), Details.build(e, "trackers", "").optJSONObject("trackers")) }
            File(dir, "state.json").writeText(JSONObject().put("s", sessionJson).put("t", rowsJson).put("tr", tr).toString(2))
            val sb = StringBuilder()
            synchronized(logs) { for (l in logs) sb.append(l.level).append(' ').append(l.msg).append('\n') }
            File(dir, "log.txt").writeText(sb.toString())
        }
    }

    val DL_STATES = setOf("downloading", "forcedDL", "stalledDL", "metaDL", "forcedMetaDL", "queuedDL", "checkingDL")

    private fun nowMono() = System.nanoTime() / 1_000_000

    private fun buildRow(e: Entry, th: torrent_handle, st: torrent_status): JSONObject {
        val flags = st.getFlags()
        val paused = flags.and_(TorrentFlags.PAUSED).non_zero()
        val auto = flags.and_(TorrentFlags.AUTO_MANAGED).non_zero()
        val finished = st.getIs_finished() || st.getIs_seeding()
        val dlr = st.getDownload_payload_rate()
        val ulr = st.getUpload_payload_rate()
        val hasErr = st.getErrc().value() != 0
        val state = when {
            hasErr -> "error"
            st.getMoving_storage() -> "moving"
            paused && auto -> if (finished) "queuedUP" else "queuedDL"
            paused -> if (finished) "stoppedUP" else "stoppedDL"
            st.getState() == torrent_status.state_t.checking_resume_data -> "checkingResumeData"
            st.getState() == torrent_status.state_t.checking_files -> if (finished) "checkingUP" else "checkingDL"
            st.getState() == torrent_status.state_t.downloading_metadata -> if (auto) "metaDL" else "forcedMetaDL"
            finished -> if (!auto) "forcedUP" else if (ulr > 0) "uploading" else "stalledUP"
            else -> if (!auto) "forcedDL" else if (dlr > 0) "downloading" else "stalledDL"
        }
        e.state = state
        e.dlAvg = if (e.dlAvg == 0.0) dlr.toDouble() else e.dlAvg * 0.8 + dlr * 0.2
        e.upAvg = if (e.upAvg == 0.0) ulr.toDouble() else e.upAvg * 0.8 + ulr * 0.2
        val wanted = st.getTotal_wanted()
        val left = (wanted - st.getTotal_wanted_done()).coerceAtLeast(0)
        val eta = if (!finished && !paused && e.dlAvg >= 1) (left / e.dlAvg).toLong() else -1L
        val up = st.getAll_time_upload()
        val down = st.getAll_time_download().let { if (it < st.getTotal_done() * 0.01) st.getTotal_done() else it }
        val ratio = if (down == 0L) (if (up == 0L) 0.0 else 9999.0) else minOf(up.toDouble() / down, 9999.0)
        val now = nowMono()
        val lu = st.get_last_upload()
        val ld = st.get_last_download()
        val last = maxOf(lu, ld)
        val lastAct = if (dlr > 0 || ulr > 0) 0L else if (last <= 0) -1L else ((now - last) / 1000).coerceAtLeast(0)
        val ti = th.torrent_file_ptr()
        val tags = JSONArray()
        for (t in e.meta.tags) tags.put(t)
        val ratioLim = e.meta.ratioLimit
        val seedLim = e.meta.seedLimit
        return JSONObject()
            .put("id", e.id)
            .put("name", displayName(e))
            .put("size", wanted)
            .put("total", ti?.total_size() ?: st.getTotal())
            .put("progress", st.getProgress().toDouble())
            .put("state", state)
            .put("dl", dlr).put("ul", ulr)
            .put("seeds", st.getNum_seeds()).put("seedsT", maxOf(st.getNum_complete(), st.getList_seeds()))
            .put("peers", (st.getNum_peers() - st.getNum_seeds()).coerceAtLeast(0)).put("peersT", maxOf(st.getNum_incomplete(), st.getList_peers() - st.getList_seeds()))
            .put("eta", eta)
            .put("ratio", ratio)
            .put("cat", e.meta.category)
            .put("tags", tags)
            .put("added", e.meta.addedOn)
            .put("completed", if (st.getCompleted_time() > 0) st.getCompleted_time() * 1000 else e.meta.completedOn)
            .put("path", if (e.meta.target.isNotBlank()) e.meta.target else st.getSave_path())
            .put("dlAll", st.getAll_time_download()).put("ulAll", up)
            .put("dlS", st.getTotal_payload_download()).put("ulS", st.getTotal_payload_upload())
            .put("left", left)
            .put("active", st.get_active_duration() / 1000)
            .put("seeding", st.get_seeding_duration() / 1000)
            .put("seq", flags.and_(TorrentFlags.SEQUENTIAL_DOWNLOAD).non_zero())
            .put("fl", e.meta.firstLast)
            .put("superSeed", flags.and_(TorrentFlags.SUPER_SEEDING).non_zero())
            .put("dlLim", th.download_limit().let { if (it <= 0) 0 else it / 1024 })
            .put("ulLim", th.upload_limit().let { if (it <= 0) 0 else it / 1024 })
            .put("tracker", st.getCurrent_tracker().orEmpty())
            .put("lastAct", lastAct)
            .put("queue", st.get_queue_position())
            .put("meta", st.getHas_metadata())
            .put("err", if (hasErr) st.getErrc().message() else "")
            .put("priv", ti?.priv() ?: false)
            .put("ratioLim", ratioLim).put("seedLim", seedLim)
            .put("conns", st.getNum_connections())
    }

    private fun checkShareLimits(e: Entry, st: torrent_status) {
        if (e.state !in setOf("uploading", "stalledUP", "forcedUP")) return
        val r = e.row ?: return
        val ratioLim = when {
            e.meta.ratioLimit > -1.5 -> e.meta.ratioLimit
            prefs.bool("ratioLimitEnabled") -> prefs.double("ratioLimit")
            else -> -1.0
        }
        val seedLim = when {
            e.meta.seedLimit > -2 -> e.meta.seedLimit
            prefs.bool("seedTimeEnabled") -> prefs.int("seedTime")
            else -> -1
        }
        val ratio = r.optDouble("ratio")
        val seedMin = st.get_seeding_duration() / 60000
        val hit = (ratioLim >= 0 && ratio >= ratioLim) || (seedLim >= 0 && seedMin >= seedLim)
        if (!hit) return
        val name = nameOf(e)
        when (prefs.str("seedAction")) {
            "remove" -> { log(1, "«$name» досяг обмеження роздачі — торент видалено"); removeTorrents(listOf(e), false) }
            "removeFiles" -> { log(1, "«$name» досяг обмеження роздачі — торент і файли видалено"); removeTorrents(listOf(e), true) }
            "superSeed" -> {
                val th = e.th ?: return
                if (!st.getFlags().and_(TorrentFlags.SUPER_SEEDING).non_zero()) {
                    th.set_flags(TorrentFlags.SUPER_SEEDING)
                    log(1, "«$name» досяг обмеження роздачі — увімкнено суперроздачу")
                }
            }
            else -> { log(1, "«$name» досяг обмеження роздачі — зупинено"); stopTorrents(listOf(e)) }
        }
    }

    // ---------------------------------------------------------------- умови роботи й розклад

    private fun minutesOf(s: String): Int {
        val p = s.split(':')
        return (p.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (p.getOrNull(1)?.toIntOrNull() ?: 0)
    }

    private fun dayOk(days: String, cal: Calendar): Boolean {
        val d = cal.get(Calendar.DAY_OF_WEEK)
        return when (days) {
            "weekdays" -> d in Calendar.MONDAY..Calendar.FRIDAY
            "weekends" -> d == Calendar.SATURDAY || d == Calendar.SUNDAY
            "mon" -> d == Calendar.MONDAY
            "tue" -> d == Calendar.TUESDAY
            "wed" -> d == Calendar.WEDNESDAY
            "thu" -> d == Calendar.THURSDAY
            "fri" -> d == Calendar.FRIDAY
            "sat" -> d == Calendar.SATURDAY
            "sun" -> d == Calendar.SUNDAY
            else -> true
        }
    }

    fun inWindow(from: String, to: String, days: String): Boolean {
        val cal = Calendar.getInstance()
        val now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        val f = minutesOf(from)
        val t = minutesOf(to)
        if (f == t) return dayOk(days, cal)
        return if (f < t) {
            now in f until t && dayOk(days, cal)
        } else {
            if (now >= f) dayOk(days, cal)
            else if (now < t) {
                val y = cal.clone() as Calendar
                y.add(Calendar.DAY_OF_YEAR, -1)
                dayOk(days, y)
            } else false
        }
    }

    private fun computePauseReason(): String {
        val p = prefs
        if (p.bool("vpnOnly") && !netVpn) return "Очікування VPN"
        if (p.bool("wifiOnly") && netConnected && !netUnmetered) return "Очікування Wi‑Fi"
        if (p.bool("chargingOnly") && !charging) return "Очікування заряджання"
        if (p.bool("batteryLimitEnabled") && !charging && battery <= p.int("batteryLimit")) return "Низький заряд батареї"
        if (p.bool("schedEnabled") && !inWindow(p.str("schedFrom"), p.str("schedTo"), p.str("schedDays"))) return "Поза розкладом"
        return ""
    }

    private var lastVpnIface = ""

    fun updateConditions() {
        if (!started || stopping) return
        val reason = computePauseReason()
        if (reason != pauseReason) {
            pauseReason = reason
            if (reason.isNotEmpty()) {
                sm.pause()
                log(2, "Передачі призупинено: $reason")
            } else {
                sm.resume()
                log(1, "Передачі відновлено")
            }
        }
        if (prefs.bool("altSchedule")) {
            val w = inWindow(prefs.str("altFrom"), prefs.str("altTo"), prefs.str("altDays"))
            if (lastAltWindow != w) {
                lastAltWindow = w
                if (altActive != w) setAlt(w)
            }
        } else {
            lastAltWindow = null
        }
        if (prefs.bool("vpnOnly") && vpnIface != lastVpnIface) {
            lastVpnIface = vpnIface
            applySettings()
        }
    }
}
