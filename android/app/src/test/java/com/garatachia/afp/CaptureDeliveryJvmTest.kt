package com.garatachia.afp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.net.URL
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.time.Instant
import java.util.UUID
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

class CaptureDeliveryJvmTest {
    @Test fun httpsPairingDeliveryPauseAndRevocationAgainstLocalServer() {
        val origin = System.getenv("AFP_CAPTURE_TEST_ORIGIN") ?: ""
        // Nunca apunta al dominio personal ni modifica la confianza de la APK.
        assumeTrue(origin.matches(Regex("https://localhost:[0-9]+")))
        val certificate = CertificateFactory.getInstance("X.509").generateCertificate(
            File(requireNotNull(System.getenv("AFP_CAPTURE_TEST_CERTIFICATE"))).inputStream().use { it.readBytes().inputStream() })
        val keys = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("local-test", certificate) }
        val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keys) }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }
        fun connection(url: URL) = (url.openConnection() as HttpsURLConnection).apply {
            sslSocketFactory = ssl.socketFactory
            connectTimeout = 10000; readTimeout = 10000; instanceFollowRedirects = false
        }
        val client = CaptureApiClient(origin, ::connection)
        val pending = client.start(CaptureBinding.create(), "Android · prueba sintética")
        assertEquals("PENDING", client.status(pending).state)
        val event = JSONObject().put("contractVersion", 1).put("eventId", UUID.randomUUID().toString())
            .put("sourcePackage", "com.bancomer.mbanking").put("notificationKeyHash", "c".repeat(64))
            .put("postedAt", Instant.now().toString()).put("receivedAt", Instant.now().toString())
            .put("fields", JSONObject().put("android.text", "Aviso ficticio de prueba"))
        fun denied(expected: Int, block: () -> Unit) {
            try { block(); fail("La petición debía rechazarse") }
            catch (error: CaptureApiException) { assertEquals(expected, error.status) }
        }
        denied(403) { client.sendEvent(pending.copy(state = "ACTIVE", ownerId = "forged"), event) }
        val approval = HttpClient.newBuilder().sslContext(ssl).build().send(
            HttpRequest.newBuilder(URI("$origin/api/captures/pairings"))
                .header("Authorization", "Bearer capture-instrumentation").header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(JSONObject().put("code", pending.code).toString())).build(),
            HttpResponse.BodyHandlers.discarding())
        assertEquals(200, approval.statusCode())
        val active = client.status(pending)
        assertEquals("ACTIVE", active.state); assertNotNull(active.ownerId)
        val sourcePause = HttpClient.newBuilder().sslContext(ssl).build().send(
            HttpRequest.newBuilder(URI("$origin/api/captures/devices"))
                .header("Authorization", "Bearer capture-instrumentation").header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(JSONObject().put("deviceId", active.deviceId)
                    .put("action", "source").put("sourcePackage", "com.bancomer.mbanking").put("paused", true).toString())).build(),
            HttpResponse.BodyHandlers.discarding())
        assertEquals(200, sourcePause.statusCode())
        var configured = false
        val configurableClient = CaptureApiClient(origin, ::connection) { owner, configuration ->
            assertEquals(active.ownerId, owner.ownerId)
            assertEquals("com.bancomer.mbanking", configuration.getJSONArray("pausedPackages").getString(0))
            configured = true
        }
        configurableClient.status(active)
        assertTrue(configured)
        configurableClient.report(active, JSONObject().put("action", "report").put("version", 1).put("active", true)
            .put("listenerConnected", false).put("notificationAccess", false).put("batteryExempt", false).put("deliveryPaused", false)
            .put("selectedPackages", org.json.JSONArray()).put("pausedPackages", org.json.JSONArray(listOf("com.bancomer.mbanking"))))
        val receipt = client.sendEvent(active, event).getJSONObject("event")
        assertEquals("RECEIVED", receipt.getString("status"))
        assertEquals(receipt.toString(), client.sendEvent(active, event).getJSONObject("event").toString())
        denied(409) { client.sendEvent(active, JSONObject(event.toString()).put("fields", JSONObject())) }
        val paused = client.change(active, "pause")
        assertEquals("PAUSED", paused.state)
        denied(403) { client.sendEvent(active, event) }
        val resumed = client.change(paused, "resume")
        assertEquals(active.ownerId, resumed.ownerId)
        assertEquals("ACTIVE", resumed.state)
        val revoked = client.change(resumed, "revoke")
        assertEquals("REVOKED", revoked.state); assertEquals(active.ownerId, revoked.ownerId)
        denied(401) { client.sendEvent(active, event) }
        assertEquals("REVOKED", client.status(revoked).state)
    }
}
