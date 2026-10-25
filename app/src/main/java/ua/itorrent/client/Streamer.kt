package ua.itorrent.client

import android.webkit.MimeTypeMap
import java.io.BufferedInputStream
import java.io.File
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Локальний HTTP-сервер для перегляду відео й аудіо під час завантаження.
 * Плеєр запитує діапазони байтів, а сервер підтягує потрібні шматки з найвищим пріоритетом
 * і віддає дані, щойно вони з'являються на диску.
 */
class Streamer {

    private var server: ServerSocket? = null
    private val pool = Executors.newCachedThreadPool { r -> Thread(r, "itorrent-stream").apply { isDaemon = true } }
    private val locks = ConcurrentHashMap<String, Object>()
    @Volatile var port = 0
        private set

    fun start() {
        if (server != null) return
        runCatching {
            val s = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
            server = s
            port = s.localPort
            Thread({
                while (!s.isClosed) {
                    val c = try { s.accept() } catch (e: Exception) { break }
                    pool.execute { handle(c) }
                }
            }, "itorrent-stream-accept").apply { isDaemon = true }.start()
        }.onFailure { Engine.log(2, "Не вдалося запустити сервер перегляду: ${it.message}") }
    }

    fun stop() {
        runCatching { server?.close() }
        server = null
    }

    private fun lock(id: String): Object = locks.getOrPut(id) { Object() }

    fun onPiece(id: String, piece: Int) {
        val l = locks[id] ?: return
        synchronized(l) { l.notifyAll() }
    }

    fun forget(id: String) {
        locks.remove(id)?.let { synchronized(it) { it.notifyAll() } }
    }

    fun url(e: Entry, index: Int): String {
        start()
        val name = File(Engine.relPath(e, index) ?: "file").name
        return "http://127.0.0.1:$port/${e.id}/$index/" + URLEncoder.encode(name, "UTF-8").replace("+", "%20")
    }

    fun mime(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: when (ext) {
            "mkv" -> "video/x-matroska"
            "flac" -> "audio/flac"
            "m4b" -> "audio/mp4"
            "ts" -> "video/mp2t"
            else -> "application/octet-stream"
        }
    }

    /** Готує торент до перегляду файлу: вмикає файл, ставить пріоритет на початок і кінець. */
    fun prepare(e: Entry, index: Int) {
        val th = e.th ?: return
        val ti = th.torrent_file_ptr() ?: return
        val fs = ti.layout()
        val pr = th.get_file_priorities_ex()
        if (index < pr.size && pr[index].toInt() == 0) {
            pr[index] = 4.toByte()
            th.prioritize_files_ex(pr)
        }
        val first = fs.piece_index_at_file(index)
        val last = fs.last_piece_index_at_file(index)
        if (first < 0 || last < 0) return
        val head = minOf(last, first + 3)
        for ((k, p) in (first..head).withIndex()) th.set_piece_deadline(p, 300 * (k + 1))
        th.set_piece_deadline(last, 500)
        if (last - 1 > head) th.set_piece_deadline(last - 1, 800)
        val flags = th.flags()
        if (flags.and_(org.libtorrent4j.TorrentFlags.PAUSED).non_zero()) {
            th.set_flags(org.libtorrent4j.TorrentFlags.AUTO_MANAGED)
            th.resume()
        }
    }

    private fun handle(sock: Socket) {
        sock.use { s ->
            try {
                s.soTimeout = 60000
                val inp = BufferedInputStream(s.getInputStream())
                val reqLine = readLine(inp) ?: return
                val headers = HashMap<String, String>()
                while (true) {
                    val l = readLine(inp) ?: break
                    if (l.isEmpty()) break
                    val i = l.indexOf(':')
                    if (i > 0) headers[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim()
                }
                val parts = reqLine.split(' ')
                if (parts.size < 2) return
                val method = parts[0]
                val path = parts[1].substringBefore('?').trim('/').split('/')
                val out = s.getOutputStream()
                if (path.size < 2) { status(out, 404, "Not Found"); return }
                val e = Engine.entries[path[0]] ?: run { status(out, 404, "Not Found"); return }
                val index = path[1].toIntOrNull() ?: run { status(out, 400, "Bad Request"); return }
                val th = e.th ?: run { status(out, 404, "Not Found"); return }
                val ti = th.torrent_file_ptr() ?: run { status(out, 503, "No Metadata"); return }
                val fs = ti.layout()
                if (index !in 0 until fs.num_files()) { status(out, 404, "Not Found"); return }
                val size = fs.file_size(index)
                val fileOff = fs.file_offset(index)
                val pieceLen = ti.piece_length().toLong()
                val filePath = Engine.filePath(e, index) ?: run { status(out, 404, "Not Found"); return }
                var start = 0L
                var end = size - 1
                var partial = false
                headers["range"]?.let { r ->
                    val m = Regex("bytes=(\\d*)-(\\d*)").find(r)
                    if (m != null) {
                        val a = m.groupValues[1]
                        val b = m.groupValues[2]
                        if (a.isEmpty() && b.isNotEmpty()) {
                            start = (size - b.toLong()).coerceAtLeast(0)
                        } else {
                            start = a.toLongOrNull() ?: 0
                            if (b.isNotEmpty()) end = minOf(b.toLong(), size - 1)
                        }
                        partial = true
                    }
                }
                if (start >= size || start > end) {
                    out.write("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$size\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                    return
                }
                val len = end - start + 1
                val sb = StringBuilder()
                sb.append(if (partial) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
                sb.append("Content-Type: ").append(mime(filePath)).append("\r\n")
                sb.append("Accept-Ranges: bytes\r\n")
                sb.append("Content-Length: ").append(len).append("\r\n")
                if (partial) sb.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(size).append("\r\n")
                sb.append("Connection: close\r\n\r\n")
                out.write(sb.toString().toByteArray())
                if (method == "HEAD") return
                val lock = lock(e.id)
                val buf = ByteArray(64 * 1024)
                var pos = start
                var raf: RandomAccessFile? = null
                try {
                    while (pos <= end) {
                        if (Engine.entries[e.id] == null) return
                        val piece = ((fileOff + pos) / pieceLen).toInt()
                        if (!th.have_piece(piece)) {
                            val lastPiece = ((fileOff + size - 1) / pieceLen).toInt()
                            for (k in 0 until 8) {
                                val p = piece + k
                                if (p > lastPiece) break
                                if (!th.have_piece(p)) th.set_piece_deadline(p, 200 * (k + 1))
                            }
                            var waited = 0
                            while (!th.have_piece(piece)) {
                                synchronized(lock) { lock.wait(1000) }
                                waited++
                                if (waited > 600 || Engine.entries[e.id] == null) return
                            }
                        }
                        val pieceEnd = (piece + 1) * pieceLen - fileOff
                        val chunkEnd = minOf(end + 1, pieceEnd)
                        if (raf == null) {
                            val f = File(filePath)
                            var tries = 0
                            while (!f.exists() && tries < 20) { Thread.sleep(250); tries++ }
                            raf = RandomAccessFile(f, "r")
                        }
                        raf.seek(pos)
                        while (pos < chunkEnd) {
                            val n = raf.read(buf, 0, minOf(buf.size.toLong(), chunkEnd - pos).toInt())
                            if (n <= 0) { Thread.sleep(100); break }
                            out.write(buf, 0, n)
                            pos += n
                        }
                    }
                    out.flush()
                } finally {
                    runCatching { raf?.close() }
                }
            } catch (_: SocketException) {
            } catch (_: InterruptedException) {
            } catch (t: Throwable) {
                Engine.log(2, "Перегляд: ${t.message}")
            }
        }
    }

    private fun status(out: OutputStream, code: Int, msg: String) {
        out.write("HTTP/1.1 $code $msg\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
    }

    private fun readLine(inp: BufferedInputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val c = inp.read()
            if (c < 0) return if (sb.isEmpty()) null else sb.toString()
            if (c == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(c.toChar())
            if (sb.length > 8192) return null
        }
    }
}
