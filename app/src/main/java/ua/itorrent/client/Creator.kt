package ua.itorrent.client

import org.json.JSONObject
import org.libtorrent4j.TorrentBuilder
import java.io.File
import java.io.IOException

/** Створення торент-файлів (як «Створювач торентів» у qBittorrent). */
object Creator {

    @Volatile var busy = false
        private set

    fun create(o: JSONObject) {
        if (busy) throw IOException("Уже створюється інший торент")
        val src = File(o.optString("path"))
        if (!src.exists()) throw IOException("Файл або папку не знайдено")
        busy = true
        Engine.runIo {
            try {
                val b = TorrentBuilder()
                    .path(src)
                    .pieceSize(o.optInt("pieceSize", 0) * 1024)
                    .setPrivate(o.optBoolean("priv"))
                    .creator("Itorrent ${Engine.version}")
                    .creationDate(System.currentTimeMillis() / 1000)
                val comment = o.optString("comment").trim()
                if (comment.isNotEmpty()) b.comment(comment)
                when (o.optString("format", "v1")) {
                    "v1" -> b.flags(TorrentBuilder.V1_ONLY)
                    "v2" -> b.flags(TorrentBuilder.V2_ONLY)
                }
                var tier = 0
                var any = false
                for (line in o.optString("trackers").split('\n')) {
                    val t = line.trim()
                    if (t.isEmpty()) {
                        if (any) tier++
                        any = false
                        continue
                    }
                    b.addTracker(t, tier)
                    any = true
                }
                for (line in o.optString("webSeeds").split('\n')) {
                    val t = line.trim()
                    if (t.isNotEmpty()) b.addUrlSeed(t)
                }
                var lastSent = 0L
                b.listener(object : TorrentBuilder.Listener {
                    override fun accept(filename: String): Boolean = true
                    override fun progress(pieceIndex: Int, numPieces: Int) {
                        val now = System.currentTimeMillis()
                        if (now - lastSent > 250 || pieceIndex + 1 == numPieces) {
                            lastSent = now
                            Engine.emit("create.progress", JSONObject().put("done", pieceIndex + 1).put("total", numPieces))
                        }
                    }
                })
                val r = b.generate()
                val bytes = r.entry().bencode()
                val outDir = File(o.optString("outDir").ifBlank { Engine.defaultSavePath() }).apply { mkdirs() }
                val base = src.name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "torrent" }
                var out = File(outDir, "$base.torrent")
                var k = 1
                while (out.exists()) out = File(outDir, "$base (${k++}).torrent")
                out.writeBytes(bytes)
                Engine.log(0, "Створено торент-файл: ${out.path}")
                if (o.optBoolean("seed")) {
                    val opts = JSONObject().put("savePath", src.parentFile?.path ?: "").put("skipCheck", true).put("start", true)
                    Engine.addBytesDirect(bytes, opts)
                    if (o.optBoolean("ignoreLimits")) {
                        Engine.exec.schedule({
                            Engine.entries.values.firstOrNull { it.meta.ratioLimit == -2.0 && Engine.displayName(it) == src.name }?.let {
                                Engine.setShareLimits(listOf(it), -1.0, -1)
                            }
                        }, 2, java.util.concurrent.TimeUnit.SECONDS)
                    }
                }
                Engine.emit("create.done", JSONObject().put("path", out.path).put("pieces", r.numPieces()))
            } catch (t: Throwable) {
                Engine.log(3, "Не вдалося створити торент: ${t.message}")
                Engine.emit("create.error", JSONObject().put("msg", t.message ?: t.javaClass.simpleName))
            } finally {
                busy = false
            }
        }
    }
}
