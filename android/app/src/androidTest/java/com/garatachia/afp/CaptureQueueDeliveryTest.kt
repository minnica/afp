package com.garatachia.afp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.IOException
import java.net.URL
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.time.Instant
import java.util.UUID
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

@RunWith(AndroidJUnit4::class)
class CaptureQueueDeliveryTest {
    @Test fun roomReopensAndRetriesAfterRealServerCommitWithoutCreatingAnotherEvent() {
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("captureTestOrigin") ?: ""
        assumeTrue(origin.matches(Regex("https://localhost:[0-9]+")))
        val certificate = CertificateFactory.getInstance("X.509").generateCertificate(
            File(requireNotNull(args.getString("captureTestCertificate"))).inputStream().use { it.readBytes().inputStream() })
        val keys = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("local-test", certificate) }
        val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keys) }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }
        fun connection(url: URL) = (url.openConnection() as HttpsURLConnection).apply {
            sslSocketFactory = ssl.socketFactory; connectTimeout = 10000; readTimeout = 10000; instanceFollowRedirects = false
        }
        val client = CaptureApiClient(origin, ::connection)
        val pending = client.start(CaptureBinding.create(), "Cola Room · prueba sintética")
        val approval = connection(URL("$origin/api/captures/pairings"))
        try {
            approval.requestMethod = "PATCH"; approval.doOutput = true
            approval.setRequestProperty("Authorization", "Bearer capture-instrumentation")
            approval.setRequestProperty("Content-Type", "application/json")
            approval.outputStream.use { it.write(JSONObject().put("code", pending.code).toString().toByteArray()) }
            assertEquals(200, approval.responseCode)
        } finally { approval.disconnect() }
        val binding = client.status(pending)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "queue-https-${UUID.randomUUID()}"
        var db = CaptureQueueDatabase.open(context, "$name.db")
        var queue = CaptureQueue(db, QueueCipher(name))
        try {
            val time = Instant.now().toEpochMilli()
            val row = queue.enqueue(DiagnosticSample(UUID.randomUUID().toString(), "com.bancomer.mbanking", "c".repeat(64),
                time, time, time, true, mapOf("android.text" to "Compra sintética $125.50")), binding)
            var originalReceipt: String? = null
            val first = CaptureSyncEngine(queue, { listOf(binding) }, { identity, event ->
                originalReceipt = client.sendEvent(identity, event).getJSONObject("event").toString()
                throw IOException("Respuesta perdida después del commit real")
            }, { false })
            assertEquals(SyncOutcome.RETRY, first.drain())
            assertEquals("PENDING", queue.dao.byId(row.eventId)!!.state)
            db.close()
            db = CaptureQueueDatabase.open(context, "$name.db")
            queue = CaptureQueue(db, QueueCipher(name))
            val second = CaptureSyncEngine(queue, { listOf(binding) }, { identity, event ->
                val result = client.sendEvent(identity, event)
                assertEquals(originalReceipt, result.getJSONObject("event").toString())
                result
            }, { false })
            assertEquals(SyncOutcome.DONE, second.drain())
            assertEquals("SENT", queue.dao.byId(row.eventId)!!.state)
            assertEquals(2, queue.dao.byId(row.eventId)!!.attempts)
        } finally {
            client.change(binding, "revoke")
            db.close()
            for (suffix in listOf("", "-wal", "-shm")) File(context.noBackupFilesDir, "$name.db$suffix").delete()
            KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(name) }
        }
    }
}
