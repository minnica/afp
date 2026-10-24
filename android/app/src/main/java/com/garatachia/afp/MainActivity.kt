package com.garatachia.afp

import android.app.NotificationManager
import android.app.ActivityManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.net.toUri
import com.google.androidbrowserhelper.trusted.LauncherActivity
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    private val app get() = application as CaptureApplication
    private var access by mutableStateOf(false)
    private var installed by mutableStateOf<Map<String, String?>>(emptyMap())
    private var batteryExempt by mutableStateOf(false)
    private var backgroundRestricted by mutableStateOf(false)
    private var powerSave by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF34D399),
                background = Color(0xFF09090B), surface = Color(0xFF18181B))) {
                DiagnosticScreen()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        access = getSystemService(NotificationManager::class.java)
            .isNotificationListenerAccessGranted(ComponentName(this, CaptureNotificationListener::class.java))
        installed = CapturePolicy.sources.keys.associateWith { packageVersion(it) }
        val power = getSystemService(PowerManager::class.java)
        batteryExempt = power.isIgnoringBatteryOptimizations(packageName)
        powerSave = power.isPowerSaveMode
        backgroundRestricted = getSystemService(ActivityManager::class.java).isBackgroundRestricted
        app.reload()
    }

    @Suppress("DEPRECATION")
    private fun packageVersion(name: String): String? = try {
        packageManager.getPackageInfo(name, 0).versionName ?: "Versión no disponible"
    } catch (_: PackageManager.NameNotFoundException) { null }

    private fun openSettings(action: String, data: Uri? = null) {
        runCatching { startActivity(Intent(action, data)) }.onFailure {
            startActivity(Intent(Settings.ACTION_SETTINGS))
        }
    }

    @Composable
    private fun DiagnosticScreen() {
        val samples by app.samples.collectAsStateWithLifecycle()
        val connected by app.connected.collectAsStateWithLifecycle()
        val remotePauses by app.remotePauses.collectAsStateWithLifecycle()
        val storageError by app.storageError.collectAsStateWithLifecycle()
        var active by remember { mutableStateOf(app.active) }
        var selected by remember { mutableStateOf(app.selected) }
        var confirmClear by remember { mutableStateOf(false) }
        var exportError by remember { mutableStateOf(false) }
        var exportJson by remember { mutableStateOf("") }
        val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
            if (uri != null) app.scope.launch {
                val result = runCatching {
                    requireNotNull(contentResolver.openOutputStream(uri, "wt")).use {
                        it.write(exportJson.toByteArray(Charsets.UTF_8))
                    }
                }
                exportError = result.isFailure
            }
        }
        Scaffold { insets ->
            LazyColumn(modifier = Modifier.padding(insets),
                contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item {
                    Text("Captura automática", style = MaterialTheme.typography.headlineMedium)
                    Text("Captura y sincronización", color = MaterialTheme.colorScheme.primary)
                    Text("Comprueba los avisos disponibles en este teléfono. El registro financiero depende de los formatos y tarjetas habilitados en AFP.",
                        modifier = Modifier.padding(top = 8.dp))
                }
                item {
                    Button(onClick = {
                        // Browser Helper exige NEW_TASK; CLEAR_TOP vuelve a abrir una TWA existente.
                        startActivity(Intent(this@MainActivity, LauncherActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
                    },
                        modifier = Modifier.fillMaxWidth()) { Text("Abrir AFP") }
                    Text("La sesión financiera se inicia en AFP. La captura se controla desde esta pantalla.",
                        style = MaterialTheme.typography.bodySmall)
                }
                item {
                    BindingSection(app.bindingController) {
                        startActivity(Intent(this@MainActivity, LauncherActivity::class.java)
                            .setData("${getString(R.string.capture_origin)}/configuracion?tab=capture".toUri())
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
                    }
                }
                item { QueueSection(app) }
                item {
                    Section("Activación") {
                        ToggleRow("Guardar avisos y diagnóstico", active) {
                            active = it
                            app.active = it
                            if (it && access) NotificationListenerService.requestRebind(
                                ComponentName(this@MainActivity, CaptureNotificationListener::class.java))
                        }
                        Text(when {
                            !active -> "Captura pausada"
                            !access -> "Falta permitir el acceso a notificaciones"
                            !connected -> "Acceso permitido; lector desconectado"
                            else -> "Lector conectado; esperando avisos nuevos"
                        })
                        Text("El acceso a notificaciones permite leer avisos. Es distinto del permiso para mostrar notificaciones propias, que AFP no solicita en esta fase.")
                        OutlinedButton(onClick = { openSettings(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS) }) {
                            Text("Configurar acceso a notificaciones")
                        }
                        if (access && !connected) TextButton(onClick = {
                            NotificationListenerService.requestRebind(
                                ComponentName(this@MainActivity, CaptureNotificationListener::class.java))
                        }) { Text("Reconectar lector") }
                        Text("Si Android bloquea el acceso por instalación externa: Ajustes → Aplicaciones → AFP → menú ⋮ → Permitir ajustes restringidos. El nombre puede variar según One UI.",
                            style = MaterialTheme.typography.bodySmall)
                    }
                }
                item {
                    Section("Fuentes admitidas") {
                        Text("${installed.values.count { it != null }}/${CapturePolicy.sources.size} instaladas · ${selected.count { installed[it] != null }} seleccionadas e instaladas")
                        Text("Las fuentes añadidas en una actualización empiezan desactivadas. Selecciona las que quieras revisar.")
                        OutlinedButton(onClick = {
                            selected = selected + installed.filterValues { it != null }.keys
                            app.selected = selected
                        }) { Text("Seleccionar todas las instaladas") }
                        Text("Solo se leen estas fuentes seleccionadas. Se excluyen resúmenes agrupados, códigos de acceso reconocibles y promociones explícitas. Un formato desconocido se conserva para revisión. Una actualización del aviso no representa necesariamente otra compra.")
                        Text("HSBC y Banamex pueden emitir avisos de varias tarjetas; Wallet puede representar tarjetas de varios bancos. Capturar un aviso no identifica todavía cuál se usó ni activa registros automáticos.")
                        Text("Uber, DiDi viajes y Uber Eats: los avisos se guardan para revisar sus formatos. Todavía no registran gastos automáticamente. DiDi viajes es una fuente distinta de DiDi Finanzas.")
                        if (selected.isEmpty()) Text("No hay fuentes seleccionadas. El lector no guardará avisos.")
                    }
                }
                items(CapturePolicy.sources.entries.toList(), key = { it.key }) { (name, label) ->
                    Section(label) {
                        if (name in remotePauses) Text("Pausada desde AFP. Reanúdala en Configuración → Captura automática.")
                        ToggleRow("Capturar $label", name in selected,
                            enabled = installed[name] != null || name in selected) { enabled ->
                            selected = if (enabled) selected + name else selected - name
                            app.selected = selected
                        }
                        Text(name, style = MaterialTheme.typography.bodySmall)
                        Text(installed[name]?.let { "Instalada · $it" } ?: "No detectada en este perfil; no se puede activar",
                            style = MaterialTheme.typography.bodySmall)
                        val sourceSamples = samples.filter { it.packageName == name }
                        Text("${sourceSamples.size} muestras · ${sourceSamples.count { it.screenLocked }} con pantalla bloqueada",
                            style = MaterialTheme.typography.bodySmall)
                        if (sourceSamples.isEmpty()) Text("Formato de compra pendiente de comprobar",
                            style = MaterialTheme.typography.bodySmall)
                    }
                }
                item {
                    Section("Samsung y pantalla bloqueada") {
                        Text(if (batteryExempt) "Optimización de batería: AFP exenta" else "Optimización de batería: AFP no exenta")
                        Text(if (backgroundRestricted) "Actividad en segundo plano: restringida" else "Actividad en segundo plano: sin restricción reportada por Android")
                        Text(if (powerSave) "Ahorro de energía del teléfono: activo" else "Ahorro de energía del teléfono: inactivo")
                        Text("Estos estados se actualizan al volver a AFP. No comprueban por sí solos las listas de suspensión de Samsung ni la entrega con pantalla bloqueada.",
                            style = MaterialTheme.typography.bodySmall)
                        Text("En Ajustes → Aplicaciones → AFP → Batería, selecciona No restringido (Sin restricciones en otras versiones).")
                        Text("En Ajustes → Batería → Límites de uso en segundo plano, retira AFP de Aplicaciones suspendidas y en suspensión profunda. Revisa Aplicaciones sin autosuspensión; una app ya exenta de optimización puede no aparecer para añadirla.")
                        OutlinedButton(onClick = { openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            "package:$packageName".toUri()) }) { Text("Abrir ajustes de AFP") }
                        OutlinedButton(onClick = { openSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS) }) {
                            Text("Revisar optimización de batería")
                        }
                        Text("Activa el diagnóstico y permite el acceso. Bloquea el teléfono y espera un aviso real de compra de una fuente seleccionada. Al volver, verifica si aparece como recibido con pantalla bloqueada. No se recuperan avisos que desaparecieron antes de activar el lector.")
                        Text("Android puede ocultar contenido sensible. Una muestra vacía indica contenido no disponible; no confirma una compra ni permite recuperar el texto oculto.")
                        TextButton(onClick = { startActivity(Intent(Intent.ACTION_VIEW,
                            "https://developer.samsung.com/mobile/app-management.html".toUri())) }) {
                            Text("Consultar guía oficial de Samsung")
                        }
                    }
                }
                item {
                    HorizontalDivider()
                    Text("Muestras locales (${samples.size}/100)", style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.padding(top = 16.dp))
                    Text("Se cifran con Android Keystore y se conservan las 100 más recientes. Los avisos admitidos recibidos con el teléfono vinculado también se guardan en la cola y se envían a AFP. Borrar estas muestras conserva los pendientes y recibos de la cola. No se incluyen en copias de seguridad.")
                    if (storageError) Text("No se pudo leer o guardar una muestra. Revisa el almacenamiento; no se garantiza la captura durante este error.",
                        color = MaterialTheme.colorScheme.error)
                    if (exportError) Text("No se pudo guardar la exportación. Vuelve a intentarlo.", color = MaterialTheme.colorScheme.error)
                    if (samples.isEmpty()) Text("Todavía no hay muestras. Se capturan avisos nuevos y, al reconectar, los que aún siguen activos.")
                    if (samples.isNotEmpty()) {
                        OutlinedButton(onClick = {
                            exportError = false
                            exportJson = JSONObject().apply {
                                put("version", 1)
                                put("kind", "anonymous-shape-only")
                                put("realFormatVerified", false)
                                put("samples", JSONArray(samples.map { it.anonymousJson() }))
                            }.toString(2)
                            exporter.launch("afp-diagnostico-anonimo.json")
                        }) { Text("Exportar estructura anonimizada") }
                        Text("La exportación oculta letras y cifras, fechas e identificadores. Sirve para revisar campos disponibles; no es una muestra validada para interpretar compras.",
                            style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { confirmClear = true }) { Text("Borrar muestras locales") }
                    }
                }
                items(samples, key = { it.id }) { sample -> SampleCard(sample) }
            }
        }
        if (confirmClear) AlertDialog(onDismissRequest = { confirmClear = false },
            title = { Text("¿Borrar las muestras?") }, text = { Text("Se eliminará el diagnóstico guardado en este teléfono.") },
            confirmButton = { TextButton(onClick = { app.clear(); confirmClear = false }) { Text("Borrar") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancelar") } })
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            content()
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, enabled: Boolean = true, change: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked, onCheckedChange = change, enabled = enabled,
            modifier = Modifier.semantics { contentDescription = label })
    }
}

@Composable
private fun SampleCard(sample: DiagnosticSample) {
    var visible by remember(sample.id) { mutableStateOf(false) }
    Section(CapturePolicy.sources[sample.packageName] ?: sample.packageName) {
        val formatter = remember { DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss").withZone(ZoneId.of("America/Mexico_City")) }
        Text("Recibido: ${formatter.format(Instant.ofEpochMilli(sample.receivedAt))}")
        Text("Publicado: ${formatter.format(Instant.ofEpochMilli(sample.postedAt))}")
        Text(if (sample.screenLocked) "Recibido con pantalla bloqueada" else "Recibido con pantalla desbloqueada")
        Text(if (sample.fields.values.any { it.isNotBlank() }) "Campos disponibles: ${sample.fields.keys.joinToString()}" else "Sin texto accesible")
        TextButton(onClick = { visible = !visible }) { Text(if (visible) "Ocultar texto" else "Ver texto solo en este teléfono") }
        if (visible) for ((key, text) in sample.fields) {
            Text(key, style = MaterialTheme.typography.labelSmall)
            Text(text)
        }
    }
}
