package ua.itorrent.client

import org.json.JSONArray
import org.json.JSONObject
import org.libtorrent4j.swig.torrent_handle
import org.libtorrent4j.swig.torrent_status

/** Дані про торент, яких libtorrent не зберігає: категорія, мітки, власна назва тощо. */
class Meta(val id: String) {
    var name = ""
    var category = ""
    val tags = LinkedHashSet<String>()
    var addedOn = System.currentTimeMillis()
    var completedOn = 0L
    var target = ""
    var ratioLimit = -2.0
    var seedLimit = -2
    var firstLast = false
    var done = false
    var magnet = ""
    var comment = ""
    var createdBy = ""
    var createdOn = 0L
    val renamed = HashMap<Int, String>()

    fun toJson(): JSONObject {
        val r = JSONObject()
        for ((k, v) in renamed) r.put(k.toString(), v)
        return JSONObject()
            .put("id", id).put("name", name).put("category", category)
            .put("tags", JSONArray(tags.toList()))
            .put("addedOn", addedOn).put("completedOn", completedOn)
            .put("target", target).put("ratioLimit", ratioLimit).put("seedLimit", seedLimit)
            .put("firstLast", firstLast).put("done", done).put("magnet", magnet)
            .put("comment", comment).put("createdBy", createdBy).put("createdOn", createdOn)
            .put("renamed", r)
    }

    companion object {
        fun from(o: JSONObject): Meta {
            val m = Meta(o.getString("id"))
            m.name = o.optString("name")
            m.category = o.optString("category")
            o.optJSONArray("tags")?.let { a -> for (i in 0 until a.length()) m.tags.add(a.getString(i)) }
            m.addedOn = o.optLong("addedOn", System.currentTimeMillis())
            m.completedOn = o.optLong("completedOn")
            m.target = o.optString("target")
            m.ratioLimit = o.optDouble("ratioLimit", -2.0)
            m.seedLimit = o.optInt("seedLimit", -2)
            m.firstLast = o.optBoolean("firstLast")
            m.done = o.optBoolean("done")
            m.magnet = o.optString("magnet")
            m.comment = o.optString("comment")
            m.createdBy = o.optString("createdBy")
            m.createdOn = o.optLong("createdOn")
            o.optJSONObject("renamed")?.let { r ->
                val it = r.keys()
                while (it.hasNext()) {
                    val k = it.next()
                    k.toIntOrNull()?.let { idx -> m.renamed[idx] = r.getString(k) }
                }
            }
            return m
        }
    }
}

/** Торент у списку передач. */
class Entry(val id: String, val meta: Meta) {
    @Volatile var th: torrent_handle? = null
    @Volatile var st: torrent_status? = null
    @Volatile var row: JSONObject? = null
    var dlAvg = 0.0
    var upAvg = 0.0
    var lastActive = 0L
    var state = "stoppedDL"
    var exporting: String? = null
    var wasFinished = false
}
