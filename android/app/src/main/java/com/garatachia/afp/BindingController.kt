package com.garatachia.afp

import android.content.Context
import android.os.Build
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class BindingViewState(val binding: CaptureBinding? = null, val busy: Boolean = true, val error: String? = null)

class BindingController(context: Context, private val scope: CoroutineScope) {
    private val store = BindingStore(context)
    private val client = CaptureApiClient(context.getString(R.string.capture_origin))
    private val mutableState = MutableStateFlow(BindingViewState())
    val state = mutableState.asStateFlow()
    init { scope.launch {
        runCatching { store.read().lastOrNull() }.onSuccess { mutableState.value = BindingViewState(it, false) }
            .onFailure { mutableState.value = BindingViewState(busy = false, error = "No se pudo leer la vinculación cifrada. No se reemplazaron sus datos.") }
    } }
    fun act(action: String) {
        if (mutableState.value.busy) return
        mutableState.value = mutableState.value.copy(busy = true, error = null)
        scope.launch {
            runCatching {
                var binding = store.read().lastOrNull()
                if (action == "start") {
                    if (binding == null || binding.replaceable) {
                        binding = CaptureBinding.create()
                        // Persistir el secreto antes de enviar: una respuesta perdida usa el mismo secreto.
                        store.save(binding, newIdentity = true)
                    }
                    require(binding.deviceId == null)
                    try { binding = client.start(binding, "${Build.MANUFACTURER} ${Build.MODEL}".take(80)) }
                    catch (error: CaptureApiException) {
                        if (error.status == 410) store.save(binding.copy(state = "EXPIRED"))
                        throw error
                    }
                } else {
                    binding = requireNotNull(binding)
                    binding = if (action == "status") client.status(binding) else client.change(binding, action)
                }
                store.save(requireNotNull(binding))
                binding
            }.onSuccess { mutableState.value = BindingViewState(it, false) }.onFailure { error ->
                val saved = runCatching { store.read().lastOrNull() }.getOrNull()
                mutableState.value = BindingViewState(saved, false, if (error is CaptureApiException) error.message
                    else "No se pudo completar la vinculación. Los datos guardados se conservaron; vuelve a intentarlo.")
            }
        }
    }
}
