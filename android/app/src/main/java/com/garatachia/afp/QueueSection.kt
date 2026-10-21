package com.garatachia.afp

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun QueueSection(app: CaptureApplication) {
    var queue by remember { mutableStateOf<CaptureQueue?>(null) }
    var loadError by remember { mutableStateOf(false) }
    var paused by remember { mutableStateOf(app.deliveryPaused) }
    val storageError by app.queueStorageError.collectAsStateWithLifecycle()
    val recovery by app.recoveryNotice.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { app.captureQueue } }
            .onSuccess { queue = it }.onFailure { loadError = true }
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Envío de avisos", style = MaterialTheme.typography.titleLarge)
            Text(if (paused) "Envíos pausados en este teléfono" else "Envío automático con conexión")
            val current = queue
            if (current != null) {
                val totals by remember(current) { current.dao.totals().catch {
                    loadError = true; emit(QueueTotals(0, 0, 0, null))
                } }.collectAsStateWithLifecycle(QueueTotals(0, 0, 0, null))
                val errors by remember(current) { current.dao.errors().catch {
                    loadError = true; emit(emptyList())
                } }.collectAsStateWithLifecycle(emptyList())
                val blocks by remember(current) { current.dao.blocks().catch {
                    loadError = true; emit(emptyList())
                } }.collectAsStateWithLifecycle(emptyList())
                Text("${totals.pending} pendientes · ${totals.review} por revisar · ${totals.sent} entregados",
                    Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                val formatter = remember { DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss").withZone(ZoneId.of("America/Mexico_City")) }
                Text(totals.lastConfirmedAt?.let { "Último envío confirmado: ${formatter.format(Instant.ofEpochMilli(it))}" }
                    ?: "Todavía no hay envíos confirmados", style = MaterialTheme.typography.bodySmall)
                if (blocks.isNotEmpty()) Text("Hay avisos de una autorización detenida. Consulta el estado en Vincular con tu cuenta; los pendientes de identidades anteriores conservan su cuenta original.",
                    color = MaterialTheme.colorScheme.error)
                for (code in errors.mapNotNull { it.error }.distinct()) Text(queueErrorMessage(code), color = MaterialTheme.colorScheme.error)
                for (row in errors.filter { it.state == "REVIEW" }) Text(
                    "Aviso ${row.eventId.take(8)} · ${formatter.format(Instant.ofEpochMilli(row.createdAt))} · ${queueErrorMessage(row.error ?: "REVIEW")}",
                    style = MaterialTheme.typography.bodySmall)
                if (totals.pending == 0 && totals.review == 0) Text("Los avisos admitidos se guardan aquí antes de enviarlos. Las muestras anteriores a la vinculación permanecen solo en diagnóstico.")
            } else if (!loadError) Text("Consultando avisos guardados…")
            if (loadError || storageError) Text("No se pudo abrir, guardar o programar la cola. Revisa el almacenamiento y vuelve a abrir AFP. Los datos existentes se conservaron; la captura durante este error no está garantizada.", color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = {
                app.deliveryPaused = !paused
                paused = app.deliveryPaused
            }, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (paused) "Reanudar envíos" else "Pausar envíos") }
            OutlinedButton(onClick = app::retryDelivery, enabled = !paused && queue != null,
                modifier = Modifier.heightIn(min = 48.dp)) { Text("Reintentar pendientes y errores") }
            Text("Pausar envíos conserva la captura local. Para detener también la captura, desactiva Guardar avisos y diagnóstico. Consultar estado o reanudar recepción comprueba de nuevo la autorización; reintentar por sí solo no la restablece.", style = MaterialTheme.typography.bodySmall)
            Text(recovery, style = MaterialTheme.typography.bodySmall)
            Text("AFP recibe avisos para observación. Todavía no interpreta compras ni crea gastos.", style = MaterialTheme.typography.bodySmall)
        }
    }
}
