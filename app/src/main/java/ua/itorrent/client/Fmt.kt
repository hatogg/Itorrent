package ua.itorrent.client

import java.util.Locale

object Fmt {
    private val units = arrayOf("Б", "КіБ", "МіБ", "ГіБ", "ТіБ")

    fun size(b: Long): String {
        if (b < 1024) return "$b Б"
        var v = b.toDouble()
        var i = 0
        while (v >= 1024 && i < units.size - 1) { v /= 1024; i++ }
        val s = if (v >= 100) String.format(Locale.US, "%.0f", v) else if (v >= 10) String.format(Locale.US, "%.1f", v) else String.format(Locale.US, "%.2f", v)
        return s.replace('.', ',') + " " + units[i]
    }

    fun speed(b: Long): String = size(b) + "/с"
}
