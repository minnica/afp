package com.garatachia.afp

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun BindingSection(controller: BindingController, openSettings: () -> Unit) {
    val view by controller.state.collectAsStateWithLifecycle()
    val binding = view.binding
    var confirmRevoke by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Vincular con tu cuenta", style = MaterialTheme.typography.titleLarge)
            Text(when (binding?.state) {
                "ACTIVE" -> "Teléfono autorizado para enviar eventos"
                "PAUSED" -> "Recepción pausada explícitamente"
                "PENDING" -> "Esperando autorización desde AFP"
                "REVOKED" -> "Autorización revocada"
                "EXPIRED" -> "Código vencido"
                else -> "Teléfono sin vincular"
            })
            if (binding?.code != null) {
                Text(binding.code, style = MaterialTheme.typography.headlineSmall)
                val expiration = runCatching { DateTimeFormatter.ofPattern("HH:mm:ss")
                    .withZone(ZoneId.of("America/Mexico_City")).format(Instant.parse(binding.expiresAt)) }.getOrDefault("pendiente")
                Text("Vence a las $expiration. Solo se puede autorizar una vez. Abre Configuración → Captura automática y escribe este código con tu cuenta.")
            }
            if (view.busy) CircularProgressIndicator()
            if (view.error != null) Text(view.error!!, color = MaterialTheme.colorScheme.error)
            if (binding == null || binding.replaceable || binding.state == "CREATED") {
                Button(onClick = { controller.act("start") }, enabled = !view.busy) {
                    Text(if (binding?.state == "CREATED") "Recuperar código" else "Generar código de vinculación")
                }
            }
            OutlinedButton(onClick = openSettings, enabled = !view.busy) { Text("Autorizar desde AFP") }
            if (binding?.deviceId != null) {
                OutlinedButton(onClick = { controller.act("status") }, enabled = !view.busy) { Text("Consultar estado") }
                if (binding.state in setOf("ACTIVE", "PAUSED")) {
                    OutlinedButton(onClick = { controller.act(if (binding.state == "PAUSED") "resume" else "pause") }, enabled = !view.busy) {
                        Text(if (binding.state == "PAUSED") "Reanudar recepción" else "Pausar recepción")
                    }
                }
                if (!binding.replaceable) TextButton(onClick = { confirmRevoke = true }, enabled = !view.busy) { Text("Desvincular teléfono") }
            }
            Text("La vinculación se guarda cifrada y es independiente de la sesión web. Cerrar AFP o salir del navegador no la cancela.", style = MaterialTheme.typography.bodySmall)
            Text("La sincronización de avisos estará disponible en una próxima actualización. El diagnóstico sigue guardándose en este teléfono y todavía no crea gastos.", style = MaterialTheme.typography.bodySmall)
        }
    }
    if (confirmRevoke) AlertDialog(onDismissRequest = { confirmRevoke = false },
        title = { Text("¿Desvincular este teléfono?") },
        text = { Text("Se revocará la autorización en AFP. Se conserva la identidad original para mantener separados sus datos. Necesitas conexión.") },
        confirmButton = { TextButton(onClick = { confirmRevoke = false; controller.act("revoke") }) { Text("Desvincular") } },
        dismissButton = { TextButton(onClick = { confirmRevoke = false }) { Text("Cancelar") } })
}
