package com.garatachia.afp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ImportantNoticePolicyTest {
    private val binding = CaptureBinding("secret", "device-a", "owner-a", "ACTIVE")
    private fun row(key: String = "a".repeat(64), path: String = "/tarjetas") = JSONObject()
        .put("key", key).put("title", "Pago de tarjeta: HSBC 1").put("body", "Vence: hoy\nSaldo pendiente: $900.00").put("path", path)
    private fun response(vararg rows: JSONObject) = JSONObject().put("version", 1)
        .put("deviceId", binding.deviceId).put("ownerId", binding.ownerId).put("notices", JSONArray(rows.toList()))

    @Test fun acceptsPaymentAndEmptySnapshots() {
        val notices = ImportantNoticePolicy.parse(response(row()), binding)
        assertEquals("Pago de tarjeta: HSBC 1", notices.single().title)
        assertEquals("/tarjetas", notices.single().path)
        assertTrue(ImportantNoticePolicy.parse(response(), binding).isEmpty())
    }

    @Test fun doesNotResendSeenNoticesAfterReopening() {
        val notices = ImportantNoticePolicy.parse(response(row(), row("b".repeat(64))), binding)
        assertEquals(listOf(notices[1]), ImportantNoticePolicy.pending(notices, setOf(notices[0].key)))
        assertTrue(ImportantNoticePolicy.pending(notices, notices.map { it.key }.toSet()).isEmpty())
    }

    @Test fun refreshesVisibleNoticesWithoutResurrectingDismissedOnes() {
        val notices = ImportantNoticePolicy.parse(response(row(), row("b".repeat(64))), binding)
        val seen = notices.map { it.key }.toSet()
        assertEquals(listOf(notices[0]), ImportantNoticePolicy.pending(notices, seen, setOf(notices[0].key)))
    }

    @Test fun validatesOwnershipDeviceAndVersionBeforeDelivery() {
        for (invalid in listOf(response(row()).put("ownerId", "other"), response(row()).put("deviceId", "other"), response(row()).put("version", 2))) {
            assertThrows(IllegalArgumentException::class.java) { ImportantNoticePolicy.parse(invalid, binding) }
        }
    }

    @Test fun rejectsExternalLinksMalformedKeysAndDuplicateNotices() {
        for (invalid in listOf(response(row(path = "https://other.test")), response(row(path = "//other.test")),
            response(row(key = "bad")), response(row(), row()), response(row().put("title", "")))) {
            assertThrows(IllegalArgumentException::class.java) { ImportantNoticePolicy.parse(invalid, binding) }
        }
    }

    @Test fun neverTreatsAnIncompleteSnapshotAsEmpty() {
        assertThrows(org.json.JSONException::class.java) {
            ImportantNoticePolicy.parse(response().apply { remove("notices") }, binding)
        }
    }
}
