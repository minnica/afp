package com.garatachia.afp

import java.security.SecureRandom
import java.util.Base64

data class CaptureBinding(
    val secret: String,
    val deviceId: String? = null,
    val ownerId: String? = null,
    val state: String = "CREATED",
    val code: String? = null,
    val expiresAt: String? = null,
) {
    val replaceable get() = state in setOf("REVOKED", "EXPIRED")
    fun withStatus(id: String, owner: String?, status: String): CaptureBinding {
        require(id == deviceId) { "La identidad del teléfono cambió" }
        require(ownerId == null || ownerId == owner) { "El propietario original no puede cambiar" }
        require(status in setOf("PENDING", "EXPIRED", "ACTIVE", "PAUSED", "REVOKED"))
        require(status !in setOf("ACTIVE", "PAUSED") || !owner.isNullOrBlank())
        require(state != "REVOKED" || status == "REVOKED")
        return copy(ownerId = owner, state = status,
            code = if (status == "PENDING") code else null)
    }
    override fun toString() = "CaptureBinding(state=$state, credentials=redacted)"
    companion object {
        fun create() = CaptureBinding(Base64.getUrlEncoder().withoutPadding()
            .encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) }))
    }
}
