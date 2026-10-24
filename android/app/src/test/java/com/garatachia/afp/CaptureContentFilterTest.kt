package com.garatachia.afp

import org.junit.Assert.*
import org.junit.Test

class CaptureContentFilterTest {
    private fun excluded(text: String) = CaptureContentFilter.excluded(mapOf("android.text" to text))
    @Test fun excludesExplicitAccessCodesIncludingAccentsAndEnglish() {
        for (text in listOf("Tu código de verificación es 123456", "Código de acceso: 98765",
            "Clave dinámica 4321", "Your one-time password is 5678", "Security code: 4321")) assertTrue(text, excluded(text))
    }
    @Test fun excludesPromotionsAndPreservesTransactionEvidence() {
        assertTrue(excluded("Aprovecha esta promoción exclusiva"))
        assertTrue(excluded("Solicita tu crédito preaprobado"))
        assertTrue(excluded("Promoción: compra y gana puntos"))
        assertFalse(excluded("Compra aprobada por $120 con promoción aplicada"))
        assertFalse(excluded("Devolución de tu compra por $120"))
        assertFalse(excluded("Compra declinada"))
    }
    @Test fun preservesUnknownOrHiddenContentForLaterReview() {
        assertFalse(excluded("")); assertFalse(excluded("Nuevo formato desconocido"))
        assertFalse(excluded("Compra en PROMOCIONES COMERCIALES SA"))
        assertFalse(CaptureContentFilter.excluded(mapOf("android.title" to "Promociones Comerciales SA", "android.text" to "Compra aprobada por $120")))
    }
    @Test fun serviceEvidenceCanBeCollectedWithoutClaimingACompletedPurchase() {
        // Textos hipotéticos: verifican conservación, no acreditan formatos reales.
        for (text in listOf("Tu conductor está llegando", "Viaje finalizado",
            "Pedido entregado", "Tarifa estimada: $150", "Recibo de tu viaje",
            "Cargo por $150", "Cancelación del viaje", "Reembolso por $150")) {
            assertFalse(text, excluded(text))
        }
        assertTrue(excluded("Tu código de acceso es 123456"))
        assertTrue(excluded("Aprovecha esta promoción exclusiva para tu próximo viaje"))
    }
    @Test fun retryAfterAcceptsSecondsAndHttpDateAndBoundsMalformedValues() {
        assertEquals(300000L, CaptureApiClient.retryAfterMillis("300"))
        assertEquals(0L, CaptureApiClient.retryAfterMillis("invalid"))
        assertEquals(0L, CaptureApiClient.retryAfterMillis("-1"))
        assertEquals(86400000L, CaptureApiClient.retryAfterMillis("99999999999"))
        assertEquals(30000L, CaptureApiClient.retryAfterMillis("Wed, 21 Oct 2026 12:00:30 GMT", 1792584000000L))
    }
}
