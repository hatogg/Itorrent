package ua.itorrent.client

import org.json.JSONArray
import org.json.JSONObject
import org.libtorrent4j.TorrentFlags
import org.libtorrent4j.swig.announce_infohash
import org.libtorrent4j.swig.int_vector
import org.libtorrent4j.swig.partial_piece_info_vector
import org.libtorrent4j.swig.peer_info
import org.libtorrent4j.swig.peer_info_vector
import org.libtorrent4j.swig.torrent_handle

/** Дані для вкладок нижньої панелі вибраного торента. */
object Details {

    private const val BINS = 480

    fun build(e: Entry, tab: String, filesVersion: String): JSONObject {
        val th = e.th ?: return JSONObject()
        if (!th.is_valid()) return JSONObject()
        val o = JSONObject().put("id", e.id).put("tab", tab)
        when (tab) {
            "general" -> o.put("general", general(e, th))
            "trackers" -> o.put("trackers", trackers(th))
            "peers" -> o.put("peers", peers(th))
            "http" -> o.put("http", http(th))
            "content" -> o.put("content", content(e, th, filesVersion))
        }
        return o
    }

    private fun general(e: Entry, th: torrent_handle): JSONObject {
        val flags = torrent_handle.query_pieces.or_(torrent_handle.query_distributed_copies)
            .or_(torrent_handle.query_last_seen_complete).or_(torrent_handle.query_save_path).or_(torrent_handle.query_name)
        val st = th.status(flags)
        val ti = th.torrent_file_ptr()
        val o = JSONObject()
        val n = st.getNum_pieces().let { if (ti != null) ti.num_pieces() else it }
        val pieces = st.get_pieces()
        var have = 0
        if (n > 0 && pieces.size() >= n) {
            val bins = minOf(BINS, n)
            val havebins = JSONArray()
            val partial = BooleanArray(n)
            runCatching {
                val q = partial_piece_info_vector()
                th.get_download_queue(q)
                for (i in 0 until q.size) {
                    val idx = q[i].getPiece_index()
                    if (idx in 0 until n) partial[idx] = true
                }
            }
            val partbins = JSONArray()
            for (b in 0 until bins) {
                val from = (b.toLong() * n / bins).toInt()
                val to = maxOf(from + 1, ((b + 1).toLong() * n / bins).toInt())
                var h = 0
                var p = 0
                for (i in from until to) {
                    if (pieces.get_bit(i)) h++ else if (partial[i]) p++
                }
                have += h
                havebins.put(h * 100 / (to - from))
                partbins.put(p * 100 / (to - from))
            }
            o.put("pieces", havebins).put("partial", partbins)
            runCatching {
                val av = int_vector()
                th.piece_availability(av)
                if (av.size == n) {
                    val ab = JSONArray()
                    for (b in 0 until bins) {
                        val from = (b.toLong() * n / bins).toInt()
                        val to = maxOf(from + 1, ((b + 1).toLong() * n / bins).toInt())
                        var sum = 0L
                        for (i in from until to) sum += if (pieces.get_bit(i)) maxOf(av[i], 1) else av[i]
                        ab.put((sum * 100 / (to - from)).toInt())
                    }
                    o.put("avail", ab)
                }
            }
        }
        val row = e.row ?: JSONObject()
        val active = st.get_active_duration() / 1000
        val nextAnn = st.get_next_announce() / 1000
        o.put("have", have)
            .put("numPieces", n)
            .put("pieceLen", ti?.piece_length() ?: 0)
            .put("totalSize", ti?.total_size() ?: 0)
            .put("copies", st.getDistributed_copies().toDouble())
            .put("timeActive", active)
            .put("seedingTime", st.get_seeding_duration() / 1000)
            .put("conns", st.getNum_connections()).put("connsLim", st.getConnections_limit())
            .put("seeds", st.getNum_seeds()).put("seedsT", maxOf(st.getNum_complete(), st.getList_seeds()))
            .put("peers", (st.getNum_peers() - st.getNum_seeds()).coerceAtLeast(0)).put("peersT", maxOf(st.getNum_incomplete(), st.getList_peers() - st.getList_seeds()))
            .put("dlS", st.getTotal_payload_download()).put("ulS", st.getTotal_payload_upload())
            .put("dlAll", st.getAll_time_download()).put("ulAll", st.getAll_time_upload())
            .put("dl", st.getDownload_payload_rate()).put("ul", st.getUpload_payload_rate())
            .put("dlAvg", if (active > 0) st.getAll_time_download() / active else 0)
            .put("ulAvg", if (active > 0) st.getAll_time_upload() / active else 0)
            .put("dlLim", th.download_limit().let { if (it <= 0) 0 else it / 1024 })
            .put("ulLim", th.upload_limit().let { if (it <= 0) 0 else it / 1024 })
            .put("wasted", st.getTotal_failed_bytes() + st.getTotal_redundant_bytes())
            .put("ratio", row.optDouble("ratio", 0.0))
            .put("eta", row.optLong("eta", -1))
            .put("reannounce", if (nextAnn > 0) nextAnn else 0)
            .put("lastSeen", st.getLast_seen_complete() * 1000)
            .put("added", e.meta.addedOn)
            .put("completed", row.optLong("completed"))
            .put("createdBy", e.meta.createdBy)
            .put("created", e.meta.createdOn)
            .put("comment", e.meta.comment)
            .put("priv", ti?.priv() ?: false)
            .put("savePath", st.getSave_path())
            .put("name", Engine.displayName(e))
            .put("state", e.state)
            .put("err", row.optString("err"))
            .put("magnet", Engine.magnet(e))
            .put("seq", st.getFlags().and_(TorrentFlags.SEQUENTIAL_DOWNLOAD).non_zero())
        val ih = th.info_hashes()
        o.put("v1", if (ih.has_v1()) ih.getV1().to_hex() else "")
        o.put("v2", if (ih.has_v2()) ih.getV2().to_hex() else "")
        return o
    }

    private fun aiStatus(ai: announce_infohash): Int = when {
        ai.getUpdating() -> 1
        ai.getFails() > 0 -> 3
        ai.getStart_sent() -> 0
        else -> 2
    }

    private fun trackers(th: torrent_handle): JSONObject {
        val o = JSONObject()
        val rows = JSONArray()
        val v = th.trackers()
        val now = System.nanoTime() / 1_000_000
        for (i in 0 until v.size) {
            val ae = v[i]
            // 0 працює, 1 оновлюється, 2 ще не зв'язувався, 3 не працює, 4 вимкнено
            var status = 4
            var msg = ""
            var seeds = -1
            var leeches = -1
            var downloaded = -1
            var next = -1L
            val eps = ae.getEndpoints()
            for (k in 0 until eps.size) {
                val ep = eps[k]
                if (!ep.getEnabled()) continue
                for (ai in listOf(ep.get_infohash_v1(), ep.get_infohash_v2())) {
                    val s = aiStatus(ai)
                    if (status == 4 || rank(s) < rank(status)) status = s
                    if (ai.getMessage().isNotBlank()) msg = ai.getMessage()
                    else if (ai.getFails() > 0) {
                        val le = ai.getLast_error()
                        if (le.value() != 0) msg = le.message()
                    }
                    seeds = maxOf(seeds, ai.getScrape_complete())
                    leeches = maxOf(leeches, ai.getScrape_incomplete())
                    downloaded = maxOf(downloaded, ai.getScrape_downloaded())
                    val na = ai.get_next_announce()
                    if (na > 0) {
                        val left = (na - now) / 1000
                        if (left >= 0 && (next < 0 || left < next)) next = left
                    }
                }
            }
            if (eps.size == 0) status = 2
            rows.put(
                JSONObject().put("url", ae.getUrl()).put("tier", ae.getTier().toInt()).put("status", status)
                    .put("msg", msg).put("seeds", seeds).put("leeches", leeches).put("downloaded", downloaded)
                    .put("next", next)
            )
        }
        o.put("list", rows)
        // DHT, PeX, LSD як у qBittorrent: кількість пірів за джерелом
        var dht = 0
        var pex = 0
        var lsd = 0
        runCatching {
            val pv = peer_info_vector()
            th.get_peer_info(pv)
            for (i in 0 until pv.size) {
                val src = pv[i].getSource()
                if (src.and_(peer_info.dht).non_zero()) dht++
                if (src.and_(peer_info.pex).non_zero()) pex++
                if (src.and_(peer_info.lsd).non_zero()) lsd++
            }
        }
        val ti = th.torrent_file_ptr()
        val priv = ti?.priv() ?: false
        val p = Engine.prefs
        o.put("dht", JSONObject().put("on", p.bool("dht") && !priv).put("peers", dht))
        o.put("pex", JSONObject().put("on", p.bool("pex") && !priv).put("peers", pex))
        o.put("lsd", JSONObject().put("on", p.bool("lsd") && !priv).put("peers", lsd))
        o.put("priv", priv)
        return o
    }

    private fun rank(s: Int) = when (s) {
        0 -> 0
        1 -> 1
        3 -> 2
        2 -> 3
        else -> 4
    }

    private fun peers(th: torrent_handle): JSONArray {
        val a = JSONArray()
        val pv = peer_info_vector()
        th.get_peer_info(pv)
        for (i in 0 until pv.size) {
            val p = pv[i]
            val f = p.getFlags()
            val src = p.getSource()
            val ep = p.remote_endpoint()
            val ip = ep.address().to_string()
            val ct = p.getConnection_type()
            val type = when {
                ct.eq(peer_info.web_seed) || ct.eq(peer_info.http_seed) -> "Web"
                f.and_(peer_info.utp_socket).non_zero() -> "µTP"
                else -> "BT"
            }
            fun has(x: org.libtorrent4j.swig.peer_flags_t) = f.and_(x).non_zero()
            val sb = StringBuilder()
            val interesting = has(peer_info.interesting)
            val choked = has(peer_info.choked)
            val remoteInterested = has(peer_info.remote_interested)
            val remoteChoked = has(peer_info.remote_choked)
            if (interesting) sb.append(if (remoteChoked) 'd' else 'D')
            if (remoteInterested) sb.append(if (choked) 'u' else 'U')
            if (!remoteChoked && !interesting) sb.append('K')
            if (!choked && !remoteInterested) sb.append('?')
            if (has(peer_info.optimistic_unchoke)) sb.append('O')
            if (has(peer_info.snubbed)) sb.append('S')
            if (!has(peer_info.outgoing_connection)) sb.append('I')
            if (has(peer_info.rc4_encrypted)) sb.append('E') else if (has(peer_info.plaintext_encrypted)) sb.append('e')
            if (src.and_(peer_info.pex).non_zero()) sb.append('X')
            if (src.and_(peer_info.dht).non_zero()) sb.append('H')
            if (src.and_(peer_info.lsd).non_zero()) sb.append('L')
            if (has(peer_info.utp_socket)) sb.append('P')
            val client = runCatching { org.libtorrent4j.Vectors.byte_vector2utf8(p.get_client()) }.getOrDefault("")
            a.put(
                JSONArray().put(ip).put(ep.port()).put(type).put(sb.toString().toCharArray().joinToString(" "))
                    .put(client).put(p.getProgress().toDouble())
                    .put(p.getPayload_down_speed()).put(p.getPayload_up_speed())
                    .put(p.getTotal_download()).put(p.getTotal_upload())
                    .put(if (has(peer_info.seed)) 1 else 0)
            )
        }
        return a
    }

    private fun http(th: torrent_handle): JSONArray {
        val a = JSONArray()
        val v = th.get_url_seeds()
        for (i in 0 until v.size) a.put(v[i])
        return a
    }

    private fun content(e: Entry, th: torrent_handle, fv: String): JSONObject {
        val o = JSONObject()
        val ti = th.torrent_file_ptr() ?: return o.put("nometa", true)
        val fs = ti.layout()
        val nf = fs.num_files()
        val ver = "${e.id}:$nf:${e.meta.renamed.hashCode()}"
        o.put("v", ver)
        if (fv != ver) {
            val files = JSONArray()
            for (i in 0 until nf) {
                if (fs.pad_file_at(i)) continue
                files.put(JSONArray().put(i).put(Engine.relPath(e, i) ?: fs.file_path(i)).put(fs.file_size(i)))
            }
            o.put("files", files)
        }
        val prog = th.file_progress(torrent_handle.piece_granularity)
        val pa = JSONArray()
        for (i in 0 until prog.size) pa.put(prog[i])
        o.put("prog", pa)
        val pr = th.get_file_priorities_ex()
        val pra = JSONArray()
        for (i in 0 until pr.size) pra.put(pr[i].toInt())
        o.put("prio", pra)
        runCatching {
            val st = th.status(torrent_handle.query_pieces)
            val pieces = st.get_pieces()
            val av = int_vector()
            th.piece_availability(av)
            val n = ti.num_pieces()
            if (av.size == n && pieces.size() >= n) {
                val aa = JSONArray()
                for (i in 0 until nf) {
                    val sz = fs.file_size(i)
                    if (sz == 0L || fs.pad_file_at(i)) { aa.put(-1); continue }
                    val first = fs.piece_index_at_file(i)
                    val last = fs.last_piece_index_at_file(i)
                    var ok = 0
                    var cnt = 0
                    for (k in first..last) {
                        if (k < 0 || k >= n) continue
                        cnt++
                        if (pieces.get_bit(k) || av[k] > 0) ok++
                    }
                    aa.put(if (cnt == 0) -1 else ok * 1000 / cnt)
                }
                o.put("avail", aa)
            }
        }
        return o
    }
}
