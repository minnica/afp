package com.garatachia.afp

import org.junit.Assert.*
import org.junit.Test

class GmailReceiptPolicyTest {
    private val receipt = mapOf("android.title" to "Recibos de Uber",
        "android.text" to "Tu viaje del miércoles por la noche con Uber\n14/10/2026\nTotal MXN 160.25")

    @Test fun gmailIsOptInAndUnrelatedEmailsNeverEnterStorage() {
        assertFalse(GmailReceiptPolicy.source in CapturePolicy.selection(null))
        assertFalse(CapturePolicy.accepts(GmailReceiptPolicy.source, true,
            CapturePolicy.sources.keys - GmailReceiptPolicy.source, false))
        assertNull(GmailReceiptPolicy.fields(GmailReceiptPolicy.source, mapOf("android.title" to "Banco", "android.text" to "Compra aprobada")))
        assertNull(GmailReceiptPolicy.fields(GmailReceiptPolicy.source, mapOf("android.title" to "Recibos de Uber", "android.text" to "Promoción")))
        assertNull(GmailReceiptPolicy.fields(GmailReceiptPolicy.source, emptyMap()))
    }

    @Test fun receiptsKeepEvidenceAndRemoveTheMailboxIdentityBeforeQueueAndDiagnostics() {
        val fields = GmailReceiptPolicy.fields(GmailReceiptPolicy.source,
            receipt + mapOf("android.subText" to "private@example.test", "android.summaryText" to "private@example.test"))
        assertEquals(receipt, fields)
        assertEquals(receipt, GmailReceiptPolicy.fields("com.bancomer.mbanking", receipt))
    }

    @Test fun partialReceiptIsPreservedForReviewAndSummariesRemainExcluded() {
        assertNotNull(GmailReceiptPolicy.fields(GmailReceiptPolicy.source, receipt))
        assertFalse(CapturePolicy.accepts(GmailReceiptPolicy.source, true, setOf(GmailReceiptPolicy.source), true))
    }
}
