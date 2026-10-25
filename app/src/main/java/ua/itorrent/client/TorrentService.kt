package ua.itorrent.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import org.json.JSONObject

/** Служба переднього плану: тримає сесію живою, показує швидкості та стежить за мережею й батареєю. */
class TorrentService : Service() {

    companion object {
        const val CH_MAIN = "transfers"
        const val CH_DONE = "finished"
        const val NOTIF_ID = 1
        const val ACTION_EXIT = "ua.itorrent.client.EXIT"
        const val ACTION_STOP_ALL = "ua.itorrent.client.STOP_ALL"
        const val ACTION_START_ALL = "ua.itorrent.client.START_ALL"
        @Volatile var running = false

        fun start(ctx: Context) {
            val i = Intent(ctx, TorrentService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun exit(ctx: Context) {
            val i = Intent(ctx, TorrentService::class.java).setAction(ACTION_EXIT)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }
    }

    private lateinit var nm: NotificationManager
    private var wake: PowerManager.WakeLock? = null
    private var netCb: ConnectivityManager.NetworkCallback? = null
    private var lastNotif = 0L
    private var lastText = ""
    private var doneId = 100
    private var exiting = false

    private val battery = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            if (level >= 0 && scale > 0) Engine.battery = level * 100 / scale
            Engine.charging = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        Engine.init(this)
        nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CH_MAIN, "Передачі", NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
                description = "Швидкість завантаження й вивантаження"
            })
            nm.createNotificationChannel(NotificationChannel(CH_DONE, "Завершені завантаження", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val n = build("Запуск…", "")
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(NOTIF_ID, n)
        registerReceiver(battery, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        watchNetwork()
        Engine.onTick = { onTick() }
        Engine.onFinished = { e -> notifyFinished(e) }
        Engine.onExitRequest = { exit(this) }
        Engine.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_EXIT -> doExit()
            ACTION_STOP_ALL -> Engine.stopAll()
            ACTION_START_ALL -> Engine.startAll()
        }
        return START_STICKY
    }

    private fun doExit() {
        if (exiting) return
        exiting = true
        Engine.emit("exit")
        nm.notify(NOTIF_ID, build("Зупинка…", "Збереження стану торентів"))
        Engine.shutdown {
            releaseWake()
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
            stopSelf()
            android.os.Process.killProcess(android.os.Process.myPid())
        }
    }

    override fun onDestroy() {
        running = false
        runCatching { unregisterReceiver(battery) }
        netCb?.let { cb -> runCatching { (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(cb) } }
        releaseWake()
        Engine.onTick = null
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Служба працює далі, як у Flud: вихід лише з меню або сповіщення.
        super.onTaskRemoved(rootIntent)
    }

    private fun watchNetwork() {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        fun update() {
            val n = cm.activeNetwork
            val caps = n?.let { cm.getNetworkCapabilities(it) }
            Engine.netConnected = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            Engine.netUnmetered = caps != null && (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
            Engine.netVpn = caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            Engine.vpnIface = if (Engine.netVpn) n?.let { cm.getLinkProperties(it)?.interfaceName }.orEmpty() else ""
        }
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = changed()
            override fun onLost(network: Network) = changed()
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) = changed()
            override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) = changed()
            private var pending = false
            fun changed() {
                if (pending) return
                pending = true
                Engine.exec.schedule({
                    pending = false
                    runCatching { update() }
                    if (Engine.started) {
                        runCatching { Engine.sm.reopenNetworkSockets() }
                        Engine.updateConditions()
                    }
                }, 700, java.util.concurrent.TimeUnit.MILLISECONDS)
            }
        }
        runCatching { cm.registerDefaultNetworkCallback(cb) }.onSuccess { netCb = cb }
        runCatching { update() }
    }

    private fun onTick() {
        val s = Engine.sessionJson
        val downloading = s.optInt("downloading")
        val active = downloading > 0 || s.optLong("ul") > 0
        if (Engine.prefs.bool("keepAwake") && active && Engine.pauseReason.isEmpty()) acquireWake() else releaseWake()
        val now = System.currentTimeMillis()
        if (now - lastNotif < 2000) return
        lastNotif = now
        val total = Engine.entries.size
        val title = when {
            Engine.pauseReason.isNotEmpty() -> "Призупинено: ${Engine.pauseReason}"
            downloading > 0 -> "Завантажується: $downloading із $total"
            total > 0 -> "Торентів: $total"
            else -> "Немає торентів"
        }
        val text = "↓ ${Fmt.speed(s.optLong("dl"))}  ·  ↑ ${Fmt.speed(s.optLong("ul"))}"
        if (title + text == lastText) return
        lastText = title + text
        nm.notify(NOTIF_ID, build(title, text))
    }

    private fun pi(action: String, code: Int): PendingIntent =
        PendingIntent.getService(this, code, Intent(this, TorrentService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    @Suppress("DEPRECATION")
    private fun build(title: String, text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CH_MAIN) else Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
        b.setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(open)
            .setColor(0xFF1F6FEB.toInt())
        val allStopped = Engine.entries.values.isNotEmpty() && Engine.entries.values.all { it.state.startsWith("stopped") }
        if (allStopped) b.addAction(Notification.Action.Builder(null, "Запустити все", pi(ACTION_START_ALL, 2)).build())
        else b.addAction(Notification.Action.Builder(null, "Зупинити все", pi(ACTION_STOP_ALL, 1)).build())
        b.addAction(Notification.Action.Builder(null, "Вихід", pi(ACTION_EXIT, 3)).build())
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        return b.build()
    }

    @Suppress("DEPRECATION")
    private fun notifyFinished(e: Entry) {
        if (!Engine.prefs.bool("notifyFinished")) return
        val open = PendingIntent.getActivity(this, doneId, Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("select", e.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CH_DONE) else Notification.Builder(this)
        b.setSmallIcon(R.drawable.ic_stat_done)
            .setContentTitle("Завантаження завершено")
            .setContentText(Engine.displayName(e))
            .setAutoCancel(true)
            .setContentIntent(open)
            .setColor(0xFF1A7F37.toInt())
        nm.notify(doneId++, b.build())
        Engine.emit("finished", JSONObject().put("id", e.id).put("name", Engine.displayName(e)))
    }

    private fun acquireWake() {
        if (wake?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Itorrent:transfers").apply {
            setReferenceCounted(false)
            acquire(60 * 60 * 1000L)
        }
    }

    private fun releaseWake() {
        runCatching { if (wake?.isHeld == true) wake?.release() }
        wake = null
    }
}
