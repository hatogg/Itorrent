package ua.itorrent.client

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != "android.intent.action.QUICKBOOT_POWERON") return
        Engine.init(context)
        if (Engine.prefs.bool("startOnBoot")) runCatching { TorrentService.start(context) }
    }
}
