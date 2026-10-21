package com.garatachia.afp

import java.text.Normalizer
import java.util.Locale

// Solo descarta señales explícitas; un formato desconocido se conserva para revisión.
object CaptureContentFilter {
    private fun normalized(value: String) = Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "").lowercase(Locale.ROOT)
    private val accessCode = Regex("\\b(otp|token|tu codigo|codigo (de |para )?(acceso|seguridad|verificacion|autenticacion|confirmacion)|codigo de un solo uso|clave (dinamica|de acceso|de seguridad)|verification code|one[ -]time (password|code)|security code)\\b")
    private val promotion = Regex("\\b(promocion|promociones|oferta exclusiva|aprovecha (esta|nuestra|tu)|participa y gana|solicita tu (tarjeta|credito)|preaprobado|preaprobada|tienes un credito disponible)\\b")
    // No excluir una compra que informa de una promoción aplicada.
    private val transaction = Regex("\\b(compra|compraste|pagaste|pago (aprobado|realizado)|cargo (por|de)|retiro|devolucion|cancelacion|purchase|payment|refund)\\b")
    private val marketing = Regex("\\b(compra y gana|compra y participa|haz (una|tu) compra|aprovecha (esta|nuestra)|solicita tu (tarjeta|credito))\\b")
    fun excluded(fields: Map<String, String>): Boolean {
        val text = normalized(fields.values.joinToString("\n"))
        return accessCode.containsMatchIn(text) || marketing.containsMatchIn(text) ||
            (promotion.containsMatchIn(text) && !transaction.containsMatchIn(text))
    }
}
