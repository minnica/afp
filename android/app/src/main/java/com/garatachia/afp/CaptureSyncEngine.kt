package com.garatachia.afp

import org.json.JSONObject
import java.time.Instant

enum class SyncOutcome { DONE, RETRY }

// Sin dependencia del planificador: las pruebas ejercitan Room, cifrado y fallos de transporte reales.
class CaptureSyncEngine(
    private val queue: CaptureQueue,
    private val bindings: () -> List<CaptureBinding>,
    private val send: (CaptureBinding, JSONObject) -> JSONObject,
    private val paused: () -> Boolean,
    private val stopped: () -> Boolean = { false },
    private val now: () -> Long = System::currentTimeMillis,
) {
    fun drain(): SyncOutcome {
        if (paused() || stopped()) return SyncOutcome.DONE
        var retry = false
        for (row in queue.dao.pending()) {
            if (paused() || stopped()) return SyncOutcome.DONE
            if (queue.dao.blockFor(row.deviceId, row.ownerId) != null) continue
            val binding = bindings().find { it.deviceId == row.deviceId && it.ownerId == row.ownerId }
            if (binding?.state != "ACTIVE") {
                queue.dao.block(CaptureBlock(row.deviceId, row.ownerId, "AUTH"))
                continue
            }
            if (row.nextAttemptAt > now()) { retry = true; continue }
            val payload = try { queue.payload(row) } catch (_: Exception) {
                queue.dao.fail(row.eventId, "REVIEW", "CIPHER")
                continue
            }
            queue.dao.attempted(row.eventId)
            try {
                val response = send(binding, payload).getJSONObject("event")
                require(response.getString("eventId") == row.eventId && response.getString("status") == "RECEIVED")
                require(response.getString("id").isNotBlank())
                val confirmedAt = Instant.parse(response.getString("receivedAt")).toEpochMilli()
                queue.dao.confirm(row.eventId, confirmedAt)
            } catch (error: Exception) {
                if (error is CaptureApiException && error.status in setOf(401, 403)) {
                    queue.dao.block(CaptureBlock(row.deviceId, row.ownerId, "AUTH"))
                    queue.dao.fail(row.eventId, "PENDING", "AUTH")
                } else if (error is CaptureApiException && error.status in 400..499 && error.status !in setOf(408, 425, 429)) {
                    queue.dao.fail(row.eventId, "REVIEW", if (error.status == 409) "CONFLICT" else "HTTP_${error.status}")
                } else {
                    val wait = if (error is CaptureApiException) error.retryAfterMs else 0
                    queue.dao.fail(row.eventId, "PENDING", "TEMPORARY", now() + wait)
                    // Un fallo de red o límite suspende este lote, evitando una ráfaga de peticiones.
                    return SyncOutcome.RETRY
                }
            }
        }
        if (retry) return SyncOutcome.RETRY
        // Lotes acotados; se continúa hasta vaciar los pendientes elegibles.
        return if (queue.dao.pending().any { queue.dao.blockFor(it.deviceId, it.ownerId) == null }) SyncOutcome.RETRY else SyncOutcome.DONE
    }
}

fun queueErrorMessage(code: String): String = when (code) {
    "AUTH" -> "Envíos detenidos: consulta la autorización del teléfono y vuelve a intentar."
    "CIPHER" -> "No se pudo abrir un aviso cifrado. Se conserva para revisión; no se sobrescribió."
    "CONFLICT" -> "AFP recibió otro contenido con este identificador. El aviso se conserva para revisión."
    "TEMPORARY" -> "Sin confirmación de AFP. Se conserva el aviso y se reintentará con conexión."
    else -> "AFP rechazó el aviso (${code.removePrefix("HTTP_")}). Revisa la versión de la app y reintenta."
}
