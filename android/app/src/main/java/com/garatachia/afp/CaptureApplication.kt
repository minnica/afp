package com.garatachia.afp

import android.app.Application
import androidx.core.content.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex

class CaptureApplication : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))
    private val preferences by lazy { getSharedPreferences("diagnostic-settings", MODE_PRIVATE) }
    private val store by lazy { DiagnosticStore(this) }
    private val mutableSamples = MutableStateFlow<List<DiagnosticSample>>(emptyList())
    val samples = mutableSamples.asStateFlow()
    val connected = MutableStateFlow(false)
    val storageError = MutableStateFlow(false)
    val queueStorageError = MutableStateFlow(false)
    val recoveryNotice = MutableStateFlow("Al reconectar se revisan solo los avisos que siguen activos; no es un historial completo.")
    val syncMutex = Mutex()
    val importantNotices by lazy { ImportantNoticeCenter(this) }
    val captureQueue by lazy { CaptureQueue(CaptureQueueDatabase.open(this)) }
    private val bindingScope = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))
    val bindingController by lazy { BindingController(this, bindingScope) { binding ->
        scope.launch {
            runCatching {
                captureQueue.authorized(binding)
                CaptureSyncScheduler.enqueue(this@CaptureApplication, manual = true)
                if (binding.state != "ACTIVE") importantNotices.clear()
                ImportantNoticeScheduler.enqueue(this@CaptureApplication)
            }.onFailure { queueStorageError.value = true }
        }
    } }
    var deliveryPaused: Boolean
        get() = preferences.getBoolean("delivery-paused", false)
        set(value) {
            // Commit antes de reprogramar: un reinicio conserva la pausa local.
            if (!preferences.edit().putBoolean("delivery-paused", value).commit()) {
                queueStorageError.value = true
                return
            }
            CaptureSyncScheduler.enqueue(this, manual = true)
        }
    var active: Boolean
        get() = preferences.getBoolean("active", false)
        set(value) { preferences.edit { putBoolean("active", value) } }
    var selected: Set<String>
        get() = CapturePolicy.selection(preferences.getStringSet("sources", null))
        set(value) { preferences.edit { putStringSet("sources", CapturePolicy.selection(value)) } }

    private val remoteSettings by lazy { CaptureRemoteSettings(preferences) { BindingStore(this).read().lastOrNull()?.deviceId } }
    val remotePauses = MutableStateFlow<Set<String>>(emptySet())
    val remotePausedPackages: Set<String> get() = remoteSettings.pausedPackages()
    val captureSources: Set<String> get() = selected - remotePausedPackages

    fun applyRemoteConfiguration(binding: CaptureBinding, configuration: org.json.JSONObject) {
        remoteSettings.apply(binding, configuration)
        remotePauses.value = remotePausedPackages
    }

    fun reportState(): org.json.JSONObject {
        val access = android.provider.Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            .orEmpty().split(':').any { android.content.ComponentName.unflattenFromString(it)?.packageName == packageName }
        val battery = getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        return org.json.JSONObject().put("action", "report").put("version", 1)
            .put("active", active).put("listenerConnected", connected.value).put("notificationAccess", access)
            .put("batteryExempt", battery).put("deliveryPaused", deliveryPaused)
            .put("selectedPackages", org.json.JSONArray(selected.toList()))
            .put("pausedPackages", org.json.JSONArray(remotePausedPackages.toList()))
    }

    override fun onCreate() {
        super.onCreate()
        // Materializar la selección anterior antes de ampliar el catálogo; conserva también el vacío.
        selected = selected
        runCatching { remotePauses.value = remotePausedPackages }.onFailure { queueStorageError.value = true }
        reload()
        CaptureSyncScheduler.recover(this)
        importantNotices.createChannel()
        ImportantNoticeScheduler.recover(this)
    }

    fun reload() { scope.launch {
        runCatching { store.read() }.onSuccess {
            mutableSamples.value = it
            storageError.value = false
        }.onFailure { storageError.value = true }
    } }

    fun append(received: DiagnosticSample) {
        val fields = GmailReceiptPolicy.fields(received.packageName, received.fields) ?: return
        val sample = received.copy(fields = fields)
        // Fijar la identidad al recibir, antes de esperar otras escrituras o una revinculación.
        val binding = runCatching { BindingStore(this).read().lastOrNull() }.getOrElse {
            queueStorageError.value = true
            null
        }
        scope.launch {
        // Se comprueba otra vez después de esperar en la cola de escritura.
        if (!CapturePolicy.accepts(sample.packageName, active, captureSources, false)) return@launch
        if (sample.packageName != GmailReceiptPolicy.source && CaptureContentFilter.excluded(sample.fields)) return@launch
        if (binding?.ownerId != null && binding.state in setOf("ACTIVE", "PAUSED")) {
            // El commit cifrado de Room sucede antes de programar cualquier entrega.
            runCatching { captureQueue.enqueue(sample, binding) }.onSuccess {
                queueStorageError.value = false
                CaptureSyncScheduler.enqueue(this@CaptureApplication)
            }.onFailure { queueStorageError.value = true }
        }
        runCatching { store.append(sample) }.onSuccess {
            mutableSamples.value = it
            storageError.value = false
        }.onFailure { storageError.value = true }
    } }

    fun retryDelivery() { scope.launch {
        runCatching {
            captureQueue.dao.retryReview()
            CaptureSyncScheduler.enqueue(this@CaptureApplication, manual = true)
        }.onFailure { queueStorageError.value = true }
    } }

    fun clear() { scope.launch {
        runCatching { store.clear() }.onSuccess {
            mutableSamples.value = emptyList()
            storageError.value = false
        }.onFailure { storageError.value = true }
    } }
}
