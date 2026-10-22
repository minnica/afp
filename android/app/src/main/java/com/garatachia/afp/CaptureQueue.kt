package com.garatachia.afp

import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant
import java.util.concurrent.Callable

class CaptureQueue(val database: CaptureQueueDatabase, private val cipher: QueueCipher = QueueCipher()) {
    val dao = database.queue()
    fun enqueue(sample: DiagnosticSample, binding: CaptureBinding): QueuedCapture {
        require(binding.state in setOf("ACTIVE", "PAUSED"))
        val device = requireNotNull(binding.deviceId)
        val owner = requireNotNull(binding.ownerId)
        require(sample.packageName in CapturePolicy.sources && !CaptureContentFilter.excluded(sample.fields))
        // La recuperación de la misma publicación no genera otro UUID ni otra recepción.
        val fingerprint = MessageDigest.getInstance("SHA-256").digest(JSONObject().apply {
            put("source", sample.packageName); put("key", sample.notificationKeyHash); put("postedAt", sample.postedAt)
            put("fields", JSONObject(sample.fields.toSortedMap()))
        }.toString().toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        return database.runInTransaction(Callable {
            // Una publicación ya observada mantiene su cuenta incluso al reconectar tras revincular.
            dao.originalPublication(fingerprint) ?: run {
                val event = JSONObject().apply {
                    put("contractVersion", 1); put("eventId", sample.id); put("sourcePackage", sample.packageName)
                    put("notificationKeyHash", sample.notificationKeyHash)
                    put("postedAt", Instant.ofEpochMilli(sample.postedAt).toString())
                    put("receivedAt", Instant.ofEpochMilli(sample.receivedAt).toString())
                    put("fields", JSONObject(sample.fields))
                }
                val row = QueuedCapture(sample.id, device, owner, fingerprint, byteArrayOf(), sample.receivedAt)
                dao.insert(row.copy(payload = cipher.encrypt(event.toString(), row.identity())))
                requireNotNull(dao.byFingerprint(device, owner, fingerprint))
            }
        })
    }
    fun payload(row: QueuedCapture) = JSONObject(cipher.decrypt(row.payload, row.identity()))
    fun enqueueReceipt(contentHash: String, text: String, mimeType: String, binding: CaptureBinding, receivedAt: Long = System.currentTimeMillis()): QueuedCapture {
        require(binding.state in setOf("ACTIVE", "PAUSED") && contentHash.matches(Regex("[a-f0-9]{64}")))
        require(text.isNotBlank() && text.length <= 20000 && mimeType in ReceiptTextReader.mimeTypes)
        val device = requireNotNull(binding.deviceId)
        val owner = requireNotNull(binding.ownerId)
        val fingerprint = "payment-receipt:$contentHash"
        return database.runInTransaction(Callable {
            dao.byFingerprint(device, owner, fingerprint) ?: run {
                val row = QueuedCapture(java.util.UUID.randomUUID().toString(), device, owner, fingerprint, byteArrayOf(), receivedAt)
                val payload = JSONObject().put("receiptVersion", 1).put("eventId", row.eventId).put("contentHash", contentHash)
                    .put("receivedAt", Instant.ofEpochMilli(receivedAt).toString()).put("extractedText", text).put("mimeType", mimeType)
                dao.insert(row.copy(payload = cipher.encrypt(payload.toString(), row.identity())))
                requireNotNull(dao.byFingerprint(device, owner, fingerprint))
            }
        })
    }
    fun authorized(binding: CaptureBinding) {
        if (binding.state == "ACTIVE" && binding.deviceId != null && binding.ownerId != null)
            dao.unblock(binding.deviceId, binding.ownerId)
    }
}
