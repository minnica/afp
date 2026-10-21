package com.garatachia.afp

import android.app.Application
import androidx.core.content.edit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CaptureApplication : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))
    private val preferences by lazy { getSharedPreferences("diagnostic-settings", MODE_PRIVATE) }
    private val store by lazy { DiagnosticStore(this) }
    private val mutableSamples = MutableStateFlow<List<DiagnosticSample>>(emptyList())
    val samples = mutableSamples.asStateFlow()
    val connected = MutableStateFlow(false)
    val storageError = MutableStateFlow(false)
    var active: Boolean
        get() = preferences.getBoolean("active", false)
        set(value) { preferences.edit { putBoolean("active", value) } }
    var selected: Set<String>
        get() = CapturePolicy.selection(preferences.getStringSet("sources", null))
        set(value) { preferences.edit { putStringSet("sources", CapturePolicy.selection(value)) } }

    override fun onCreate() {
        super.onCreate()
        // Materializar la selección anterior antes de ampliar el catálogo; conserva también el vacío.
        selected = selected
        reload()
    }

    fun reload() { scope.launch {
        runCatching { store.read() }.onSuccess {
            mutableSamples.value = it
            storageError.value = false
        }.onFailure { storageError.value = true }
    } }

    fun append(sample: DiagnosticSample) { scope.launch {
        // Se comprueba otra vez después de esperar en la cola de escritura.
        if (!CapturePolicy.accepts(sample.packageName, active, selected, false)) return@launch
        runCatching { store.append(sample) }.onSuccess {
            mutableSamples.value = it
            storageError.value = false
        }.onFailure { storageError.value = true }
    } }

    fun clear() { scope.launch {
        runCatching { store.clear() }.onSuccess {
            mutableSamples.value = emptyList()
            storageError.value = false
        }.onFailure { storageError.value = true }
    } }
}
