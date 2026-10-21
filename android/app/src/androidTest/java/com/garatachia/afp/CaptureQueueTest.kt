package com.garatachia.afp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.IOException
import java.security.KeyStore
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors

@RunWith(AndroidJUnit4::class)
class CaptureQueueTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "queue-test-${UUID.randomUUID()}"
    private var database = CaptureQueueDatabase.open(context, "$name.db")
    private var queue = CaptureQueue(database, QueueCipher(name))
    private val binding = CaptureBinding("synthetic-secret", UUID.randomUUID().toString(), "synthetic-owner", "ACTIVE")
    private var clock = 1792584000000L
    private fun sample(index: Int = 0) = DiagnosticSample(UUID.randomUUID().toString(), "com.bancomer.mbanking",
        "a".repeat(64), clock + index, clock + 100 + index, clock, true,
        mapOf("android.title" to "Compra sintética", "android.text" to "Compra $123.45 ejemplo privado $index"))
    private fun receipt(event: JSONObject) = JSONObject().put("event", JSONObject().put("id", UUID.randomUUID().toString())
        .put("eventId", event.getString("eventId")).put("status", "RECEIVED").put("receivedAt", Instant.ofEpochMilli(clock).toString()))
    private fun engine(identities: () -> List<CaptureBinding> = { listOf(binding) },
        paused: () -> Boolean = { false }, send: (CaptureBinding, JSONObject) -> JSONObject) = CaptureSyncEngine(queue, identities, send, paused, now = { clock })
    private fun reopen() {
        database.close()
        database = CaptureQueueDatabase.open(context, "$name.db")
        queue = CaptureQueue(database, QueueCipher(name))
    }
    @After fun cleanup() {
        database.close()
        for (suffix in listOf("", "-wal", "-shm")) File(context.noBackupFilesDir, "$name.db$suffix").delete()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(name) }
    }
    @Test fun persistsEncryptedBeforeNetworkAndRecoversSameUuidAfterReopening() {
        val sample = sample()
        val first = queue.enqueue(sample, binding)
        reopen()
        val recovered = queue.enqueue(sample.copy(id = UUID.randomUUID().toString(), receivedAt = clock + 9000), binding)
        assertEquals(first.eventId, recovered.eventId)
        assertEquals(sample.receivedAt, recovered.createdAt)
        assertEquals(sample.fields["android.text"], queue.payload(recovered).getJSONObject("fields").getString("android.text"))
        for (suffix in listOf("", "-wal", "-shm")) {
            val file = File(context.noBackupFilesDir, "$name.db$suffix")
            if (file.exists()) assertFalse(file.readBytes().toString(Charsets.ISO_8859_1).contains("ejemplo privado"))
        }
        assertTrue(database.openHelper.databaseName!!.startsWith(context.noBackupFilesDir.absolutePath))
    }
    @Test fun lostResponseAndProcessReopeningReuseReceiptAndClearOnlyAcknowledgedPayload() {
        val row = queue.enqueue(sample(), binding)
        val server = mutableMapOf<String, JSONObject>()
        var lose = true
        val send: (CaptureBinding, JSONObject) -> JSONObject = { _, event ->
            val result = server.getOrPut(event.getString("eventId")) { receipt(event) }
            if (lose) { lose = false; throw IOException("synthetic lost response after commit") }
            result
        }
        assertEquals(SyncOutcome.RETRY, engine(send = send).drain())
        assertEquals("PENDING", queue.dao.byId(row.eventId)!!.state)
        reopen()
        assertEquals(SyncOutcome.DONE, engine(send = send).drain())
        assertEquals(1, server.size)
        val sent = queue.dao.byId(row.eventId)!!
        assertEquals("SENT", sent.state); assertEquals(2, sent.attempts)
        assertTrue(sent.payload.isEmpty()); assertNotNull(sent.confirmedAt)
        assertEquals(SyncOutcome.DONE, engine { _, _ -> error("Already confirmed") }.drain())
    }
    @Test fun activeNotificationReplayDoesNotRequeueDeliveredButRevisionsAndDistinctPublicationsRemain() {
        val sample = sample()
        val row = queue.enqueue(sample, binding)
        engine { _, event -> receipt(event) }.drain()
        assertEquals(row.eventId, queue.enqueue(sample.copy(id = UUID.randomUUID().toString()), binding).eventId)
        assertEquals("SENT", queue.dao.byId(row.eventId)!!.state)
        assertNotEquals(row.eventId, queue.enqueue(sample.copy(id = UUID.randomUUID().toString(), fields = mapOf("android.text" to "Aviso actualizado")), binding).eventId)
        assertNotEquals(row.eventId, queue.enqueue(sample.copy(id = UUID.randomUUID().toString(), postedAt = sample.postedAt + 1), binding).eventId)
        assertEquals(2, queue.dao.pending().size)
    }
    @Test fun concurrentCallbacksPersistOnlyOneIdentityAndNeverCapPendingQueueAtHundred() {
        val sample = sample()
        val pool = Executors.newFixedThreadPool(4)
        try {
            val saved = (0..7).map { pool.submit<String> { queue.enqueue(sample.copy(id = UUID.randomUUID().toString()), binding).eventId } }.map { it.get() }
            assertEquals(1, saved.toSet().size)
        } finally { pool.shutdownNow() }
        repeat(120) { queue.enqueue(sample(it + 1), binding) }
        reopen()
        assertEquals(121, runBlocking { queue.dao.totals().first() }.pending)
    }
    @Test fun invalidCredentialBlocksIdentityUntilExplicitSuccessfulStatusCheck() {
        queue.enqueue(sample(), binding); queue.enqueue(sample(1), binding)
        var calls = 0
        engine { _, _ -> calls++; throw CaptureApiException(401) }.drain()
        assertEquals(1, calls)
        reopen()
        engine { _, _ -> error("Blocked credential must not send") }.drain()
        assertEquals(2, runBlocking { queue.dao.totals().first() }.pending)
        queue.authorized(binding)
        engine { _, event -> receipt(event) }.drain()
        assertEquals(2, runBlocking { queue.dao.totals().first() }.sent)
    }
    @Test fun oldOwnerNeverUsesNewCredentialAndCannotStarveNewIdentity() {
        repeat(105) { queue.enqueue(sample(it), binding) }
        val other = binding.copy(secret = "other-secret", deviceId = UUID.randomUUID().toString(), ownerId = "other-owner")
        assertEquals(binding.ownerId, queue.enqueue(sample(), other).ownerId)
        val fresh = queue.enqueue(sample(200), other)
        repeat(3) {
            engine(identities = { listOf(other) }) { credential, event -> assertEquals(other, credential); receipt(event) }.drain()
        }
        assertEquals("SENT", queue.dao.byId(fresh.eventId)!!.state)
        assertEquals(105, runBlocking { queue.dao.totals().first() }.pending)
    }
    @Test fun localPauseAndServerPauseRetainEventsWithoutSending() {
        val row = queue.enqueue(sample(), binding.copy(state = "PAUSED"))
        engine(paused = { true }) { _, _ -> error("Paused") }.drain()
        assertEquals(0, queue.dao.byId(row.eventId)!!.attempts)
        engine { _, _ -> throw CaptureApiException(403) }.drain()
        assertEquals("PENDING", queue.dao.byId(row.eventId)!!.state)
        assertNotNull(queue.dao.blockFor(binding.deviceId!!, binding.ownerId!!))
    }
    @Test fun temporaryFailuresAndRetryAfterNeverDiscardOrChangeUuid() {
        val row = queue.enqueue(sample(), binding)
        for (status in listOf(500, 503, 408, 425, 429)) {
            assertEquals(SyncOutcome.RETRY, engine { _, _ -> throw CaptureApiException(status, 300000) }.drain())
            assertEquals("PENDING", queue.dao.byId(row.eventId)!!.state)
            assertEquals(SyncOutcome.RETRY, engine { _, _ -> error("Retry-After not elapsed") }.drain())
            clock += 300000
        }
        engine { _, event -> assertEquals(row.eventId, event.getString("eventId")); receipt(event) }.drain()
        assertEquals("SENT", queue.dao.byId(row.eventId)!!.state)
    }
    @Test fun malformedAndMismatchedReceiptsStayPendingWhilePermanentRejectionNeedsReview() {
        val row = queue.enqueue(sample(), binding)
        assertEquals(SyncOutcome.RETRY, engine { _, _ -> JSONObject() }.drain())
        assertEquals(SyncOutcome.RETRY, engine { _, _ -> receipt(JSONObject().put("eventId", "wrong")) }.drain())
        engine { _, _ -> throw CaptureApiException(409) }.drain()
        assertEquals("REVIEW", queue.dao.byId(row.eventId)!!.state)
        queue.dao.retryReview()
        engine { _, event -> receipt(event) }.drain()
        assertEquals("SENT", queue.dao.byId(row.eventId)!!.state)
    }
    @Test fun alteredCiphertextIsPreservedForReviewAndCannotBeTransplantedToAnotherIdentity() {
        val row = queue.enqueue(sample(), binding)
        try { QueueCipher(name).decrypt(row.payload, row.identity() + "different-owner"); fail("AAD must match") }
        catch (_: javax.crypto.AEADBadTagException) { /* esperado */ }
        val broken = row.payload.copyOf().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }
        database.openHelper.writableDatabase.execSQL("UPDATE capture_queue SET payload = ? WHERE eventId = ?", arrayOf(broken, row.eventId))
        engine { _, _ -> error("Corrupt data must not reach network") }.drain()
        assertEquals("REVIEW", queue.dao.byId(row.eventId)!!.state)
        assertArrayEquals(broken, queue.dao.byId(row.eventId)!!.payload)
        queue.dao.retryReview()
        assertEquals("REVIEW", queue.dao.byId(row.eventId)!!.state)
    }
}
