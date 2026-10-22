package com.garatachia.afp

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

data class ReadPaymentReceipt(val contentHash: String, val text: String, val mimeType: String)

object ReceiptTextReader {
    val mimeTypes = setOf("image/png", "image/jpeg", "image/webp", "application/pdf")
    private const val MAX_BYTES = 12 * 1024 * 1024
    fun read(context: Context, uri: Uri, declaredType: String?): ReadPaymentReceipt {
        require(uri.scheme == "content") { "Comparte una imagen o PDF desde su aplicación." }
        val mime = context.contentResolver.getType(uri) ?: declaredType
        require(mime in mimeTypes) { "Comparte un comprobante PNG, JPG, WebP o PDF." }
        val bytes = requireNotNull(context.contentResolver.openInputStream(uri)).use { input ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val count = input.read(buffer)
                if (count == -1) break
                require(output.size() + count <= MAX_BYTES) { "El comprobante supera 12 MB." }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
        return readBytes(context, bytes, requireNotNull(mime))
    }
    fun readBytes(context: Context, bytes: ByteArray, mime: String): ReadPaymentReceipt {
        require(bytes.isNotEmpty() && bytes.size <= MAX_BYTES && mime in mimeTypes)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        fun recognize(bitmap: Bitmap): String = try {
            val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 30, TimeUnit.SECONDS)
            // El orden de bloques de ML Kit puede desplazar una parte del título
            // al medio del comprobante. Conservar el orden visual de las líneas.
            result.textBlocks.flatMap { it.lines }.sortedWith(compareBy({ it.boundingBox?.top ?: 0 }, { it.boundingBox?.left ?: 0 }))
                .joinToString("\n") { it.text }
        } finally { bitmap.recycle() }
        val text = try {
            if (mime == "application/pdf") {
                require(bytes.take(5).toByteArray().toString(Charsets.US_ASCII) == "%PDF-")
                val file = File.createTempFile("receipt-", ".pdf", context.noBackupFilesDir)
                try {
                    file.writeBytes(bytes)
                    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                        PdfRenderer(descriptor).use { pdf ->
                            require(pdf.pageCount in 1..3) { "Comparte un comprobante de hasta tres páginas." }
                            (0 until pdf.pageCount).joinToString("\n") { index ->
                                pdf.openPage(index).use { page ->
                                    val scale = minOf(1600f / page.width, 4000f / page.height, 2.5f)
                                    val bitmap = Bitmap.createBitmap((page.width * scale).toInt(), (page.height * scale).toInt(), Bitmap.Config.ARGB_8888)
                                    bitmap.eraseColor(android.graphics.Color.WHITE)
                                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                    recognize(bitmap)
                                }
                            }
                        }
                    }
                } finally { file.delete() }
            } else {
                val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                require(options.outWidth > 0 && options.outHeight > 0)
                var sample = 1
                while (options.outWidth.toLong() * options.outHeight / sample / sample > 8_000_000) sample *= 2
                val decoded = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }))
                if (decoded.width < 900 && decoded.height.toLong() * 900 / decoded.width < 6000) {
                    val scaled = Bitmap.createScaledBitmap(decoded, 900, decoded.height * 900 / decoded.width, true)
                    decoded.recycle(); recognize(scaled)
                } else recognize(decoded)
            }
        } finally { recognizer.close() }
        require(text.isNotBlank() && text.length <= 20000) { "No se pudo leer el comprobante completo. Comparte el archivo original con buena resolución." }
        val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        return ReadPaymentReceipt(hash, text, mime)
    }
}
