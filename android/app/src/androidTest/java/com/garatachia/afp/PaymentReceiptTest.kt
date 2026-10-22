package com.garatachia.afp

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class PaymentReceiptTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val sample = """BBVA
Comprobante de la operación
Tipo de operación
Transferencia a otros bancos
21 octubre 2026
Importe
${'$'} -123.45
Nombre del ordenante
PERSONA FICTICIA
Cuenta origen
012180000000000002
Nombre del beneficiario
PERSONA FICTICIA
Cuenta destino
646180000000000009
Banco destino
STP
Concepto
estado de cuenta octubre
Fecha de operación
21 octubre 2026, 22:32:27
Fecha de aplicación
2026-10-21T22:32:49.011-06:00
Clave de rastreo
MBAN010026102200000000001
Referencia
100001
Folio de operación
00000000001 646"""
    private fun image(): Bitmap {
        val bitmap = Bitmap.createBitmap(1100, 2200, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 34f }
        sample.lines().forEachIndexed { i, line -> canvas.drawText(line, 40f, 65f + i * 60f, paint) }
        return bitmap
    }
    @Test fun shareMenuAcceptsImagesAndPdfAndOcrReadsActualPixels() {
        for (mime in ReceiptTextReader.mimeTypes) {
            val matches = context.packageManager.queryIntentActivities(Intent(Intent.ACTION_SEND).setType(mime).setPackage(context.packageName), 0)
            assertTrue(matches.any { it.activityInfo.name.endsWith("SharePaymentActivity") })
        }
        val bitmap = image()
        val bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        bitmap.recycle()
        val receipt = ReceiptTextReader.readBytes(context, bytes, "image/png")
        assertTrue(receipt.text.contains("646180000000000009"))
        assertTrue(receipt.text.contains("estado de cuenta octubre"))
        assertTrue(receipt.text.contains("123.45"))
        assertEquals(64, receipt.contentHash.length)
    }
    @Test fun pdfRenderingAndOcrWorkWithoutUploadingTheFile() {
        val bitmap = image()
        val pdf = PdfDocument()
        val page = pdf.startPage(PdfDocument.PageInfo.Builder(1100, 2200, 1).create())
        page.canvas.drawBitmap(bitmap, 0f, 0f, null); pdf.finishPage(page)
        val bytes = ByteArrayOutputStream().also { pdf.writeTo(it) }.toByteArray()
        pdf.close(); bitmap.recycle()
        val receipt = ReceiptTextReader.readBytes(context, bytes, "application/pdf")
        assertTrue(receipt.text.contains("646180000000000009"))
        assertFalse(context.noBackupFilesDir.listFiles().orEmpty().any { it.name.startsWith("receipt-") && it.name.endsWith(".pdf") })
    }
    @Test fun encryptedReceiptQueueKeepsUuidAcrossRetryAndDeletesTextOnlyAfterAck() {
        val name = "receipt-test-${UUID.randomUUID()}"
        var database = CaptureQueueDatabase.open(context, "$name.db")
        var queue = CaptureQueue(database, QueueCipher(name))
        val binding = CaptureBinding("fictitious", UUID.randomUUID().toString(), "fictitious-owner", "ACTIVE")
        try {
            val row = queue.enqueueReceipt("a".repeat(64), sample, "image/png", binding)
            database.close(); database = CaptureQueueDatabase.open(context, "$name.db"); queue = CaptureQueue(database, QueueCipher(name))
            assertEquals(row.eventId, queue.enqueueReceipt("a".repeat(64), sample, "image/png", binding).eventId)
            assertEquals(1, queue.payload(row).getInt("receiptVersion"))
            val engine = CaptureSyncEngine(queue, { listOf(binding) }, { _, input -> JSONObject().put("event", JSONObject()
                .put("id", UUID.randomUUID().toString()).put("eventId", input.getString("eventId")).put("status", "RECEIVED").put("receivedAt", "2026-10-22T10:00:00Z")) }, { false })
            assertEquals(SyncOutcome.DONE, engine.drain())
            assertTrue(queue.dao.byId(row.eventId)!!.payload.isEmpty())
            assertEquals("SENT", queue.enqueueReceipt("a".repeat(64), sample, "image/png", binding).state)
        } finally {
            database.close()
            listOf("", "-wal", "-shm").forEach { File(context.noBackupFilesDir, "$name.db$it").delete() }
            java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(name) }
        }
    }
    @Test fun suppliedReceiptProbeWhenRequestedKeepsOriginalTextPrivate() {
        if (InstrumentationRegistry.getArguments().getString("receiptProbe") != "1") return
        require(context.packageName.endsWith(".dev"))
        val file = File(context.filesDir, "receipt-probe.png")
        val receipt = ReceiptTextReader.readBytes(context, file.readBytes(), "image/png")
        File(context.filesDir, "receipt-probe-ocr.txt").writeText(receipt.text)
        assertTrue(receipt.text.contains("720.94"))
        assertTrue(receipt.text.contains("estado de cuenta noviembre"))
        file.delete()
    }
    @Test fun pixelsToQueueToHttpsApiRecordsExactlyOneAutomaticPayment() {
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("captureTestOrigin") ?: return
        require(origin.matches(Regex("https://localhost:[0-9]+")) && context.packageName.endsWith(".dev"))
        val cert = java.security.cert.CertificateFactory.getInstance("X.509").generateCertificate(File(requireNotNull(args.getString("captureTestCertificate"))).inputStream())
        val keys = java.security.KeyStore.getInstance(java.security.KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("qa", cert) }
        val trust = javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm()).apply { init(keys) }
        val ssl = javax.net.ssl.SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }
        fun connection(url: java.net.URL) = (url.openConnection() as javax.net.ssl.HttpsURLConnection).apply { sslSocketFactory = ssl.socketFactory }
        val client = CaptureApiClient(origin, ::connection)
        val pending = client.start(CaptureBinding.create(), "Comprobante ficticio Android")
        val approve = connection(java.net.URL("$origin/api/captures/pairings"))
        approve.requestMethod = "PATCH"; approve.doOutput = true
        approve.setRequestProperty("Authorization", "Bearer capture-instrumentation")
        approve.setRequestProperty("Content-Type", "application/json")
        approve.outputStream.use { it.write(JSONObject().put("code", pending.code).toString().toByteArray()) }
        assertEquals(200, approve.responseCode); approve.disconnect()
        val binding = client.status(pending)
        val bitmap = image()
        val bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray(); bitmap.recycle()
        val read = ReceiptTextReader.readBytes(context, bytes, "image/png")
        val name = "receipt-https-${UUID.randomUUID()}"
        val db = CaptureQueueDatabase.open(context, "$name.db")
        val queue = CaptureQueue(db, QueueCipher(name))
        try {
            val row = queue.enqueueReceipt(read.contentHash, read.text, read.mimeType, binding)
            assertEquals(SyncOutcome.DONE, CaptureSyncEngine(queue, { listOf(binding) }, client::sendEvent, { false }).drain())
            val first = client.receiptStatus(binding, row.eventId)
            assertEquals("REGISTERED", first.getString("status")); assertEquals("123.45", first.getString("amount"))
            assertEquals(row.eventId, queue.enqueueReceipt(read.contentHash, read.text, read.mimeType, binding).eventId)
            assertEquals("SENT", queue.dao.byId(row.eventId)!!.state)
        } finally {
            client.change(binding, "revoke"); db.close()
            listOf("", "-wal", "-shm").forEach { File(context.noBackupFilesDir, "$name.db$it").delete() }
            java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(name) }
        }
    }
}
