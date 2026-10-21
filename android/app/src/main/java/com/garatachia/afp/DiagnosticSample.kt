package com.garatachia.afp

import android.app.Notification
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

data class DiagnosticSample(
    val id: String,
    val packageName: String,
    val notificationKeyHash: String,
    val postedAt: Long,
    val receivedAt: Long,
    val notificationWhen: Long,
    val screenLocked: Boolean,
    val fields: Map<String, String>,
) {
    fun toJson() = JSONObject().apply {
        put("id", id)
        put("packageName", packageName)
        put("notificationKeyHash", notificationKeyHash)
        put("postedAt", postedAt)
        put("receivedAt", receivedAt)
        put("notificationWhen", notificationWhen)
        put("screenLocked", screenLocked)
        put("fields", JSONObject(fields))
    }

    fun anonymousJson() = JSONObject().apply {
        put("packageName", packageName)
        put("screenLocked", screenLocked)
        put("contentAvailable", fields.values.any { it.isNotBlank() })
        put("fields", JSONObject(fields.mapValues { CapturePolicy.anonymize(it.value) }))
    }

    companion object {
        fun fromNotification(sbn: StatusBarNotification, locked: Boolean): DiagnosticSample {
            val extras = sbn.notification.extras
            val fields = linkedMapOf<String, String>()
            val names = listOf(Notification.EXTRA_TITLE, Notification.EXTRA_TEXT,
                Notification.EXTRA_BIG_TEXT, Notification.EXTRA_SUB_TEXT,
                Notification.EXTRA_TITLE_BIG, Notification.EXTRA_SUMMARY_TEXT)
            for (key in names) {
                runCatching { extras.getCharSequence(key)?.toString()?.take(4096) }
                    .getOrNull()?.let { fields[key] = it }
            }
            runCatching { extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES) }
                .getOrNull()?.take(12)?.forEachIndexed { index, line ->
                    fields["android.textLines.$index"] = line.toString().take(4096)
                }
            return DiagnosticSample(UUID.randomUUID().toString(), sbn.packageName,
                MessageDigest.getInstance("SHA-256").digest(sbn.key.toByteArray())
                    .joinToString("") { "%02x".format(it) },
                sbn.postTime, System.currentTimeMillis(), sbn.notification.`when`, locked, fields)
        }

        fun fromJson(json: JSONObject): DiagnosticSample {
            val fields = json.getJSONObject("fields")
            return DiagnosticSample(json.getString("id"), json.getString("packageName"),
                json.getString("notificationKeyHash"), json.getLong("postedAt"),
                json.getLong("receivedAt"), json.getLong("notificationWhen"),
                json.getBoolean("screenLocked"), fields.keys().asSequence()
                    .associateWith { fields.getString(it) })
        }
    }
}
