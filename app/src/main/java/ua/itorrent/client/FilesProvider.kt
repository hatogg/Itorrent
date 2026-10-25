package ua.itorrent.client

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException

/**
 * Віддає завантажені файли іншим застосункам (переглядачам, плеєрам) за content://-посиланням.
 * Провайдер не експортується: доступ мають лише ті, кому застосунок явно надав дозвіл.
 */
class FilesProvider : ContentProvider() {

    companion object {
        fun uri(ctx: Context, f: File): Uri {
            val enc = Base64.encodeToString(f.absolutePath.toByteArray(), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            return Uri.Builder().scheme("content").authority("${ctx.packageName}.files")
                .appendPath(enc).appendPath(f.name).build()
        }

        fun mime(name: String): String {
            val ext = name.substringAfterLast('.', "").lowercase()
            return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: when (ext) {
                "mkv" -> "video/x-matroska"
                "flac" -> "audio/flac"
                "torrent" -> "application/x-bittorrent"
                else -> "application/octet-stream"
            }
        }
    }

    private fun file(uri: Uri): File {
        val seg = uri.pathSegments.firstOrNull() ?: throw FileNotFoundException()
        val path = String(Base64.decode(seg, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
        val f = File(path)
        if (!f.isFile) throw FileNotFoundException(path)
        return f
    }

    override fun onCreate(): Boolean = true

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val f = file(uri)
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val c = MatrixCursor(cols)
        c.addRow(cols.map { col ->
            when (col) {
                OpenableColumns.DISPLAY_NAME -> f.name
                OpenableColumns.SIZE -> f.length()
                else -> null
            }
        }.toTypedArray())
        return c
    }

    override fun getType(uri: Uri): String = mime(uri.lastPathSegment ?: "")

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor =
        ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY)

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
