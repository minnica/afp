package com.garatachia.afp

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.lifecycleScope
import com.google.androidbrowserhelper.trusted.LauncherActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class SharePaymentActivity : ComponentActivity() {
    private var message by mutableStateOf("Leyendo comprobante…")
    private var busy by mutableStateOf(true)
    private var failure by mutableStateOf(false)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent { MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF34D399))) {
            Scaffold { insets -> Column(Modifier.fillMaxSize().padding(insets).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text("Comprobante de pago", style = MaterialTheme.typography.headlineSmall)
                if (busy) CircularProgressIndicator()
                Text(message)
                if (!busy) {
                    Button(onClick = { startActivity(Intent(this@SharePaymentActivity, LauncherActivity::class.java)
                        .setData("${getString(R.string.capture_origin)}/configuracion?tab=capture".toUri())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)); finish() }) { Text(if (failure) "Revisar en AFP" else "Abrir AFP") }
                    OutlinedButton(onClick = { finish() }) { Text("Cerrar") }
                }
            } }
        } }
        lifecycleScope.launch {
            try {
                message = withContext(Dispatchers.IO) { receive() }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                failure = true
                message = "No pudimos preparar este comprobante. Comparte de nuevo una imagen o PDF legible y comprueba la vinculación del teléfono."
            } finally { busy = false }
        }
    }
    @Suppress("DEPRECATION")
    private fun receive(): String {
        require(intent.action == Intent.ACTION_SEND)
        val uri = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM)
        val app = application as CaptureApplication
        val binding = requireNotNull(BindingStore(this).read().lastOrNull()).also { require(it.state in setOf("ACTIVE", "PAUSED")) }
        val read = ReceiptTextReader.read(this, requireNotNull(uri), intent.type)
        val row = app.captureQueue.enqueueReceipt(read.contentHash, read.text, read.mimeType, binding)
        require(row.ownerId == binding.ownerId && row.deviceId == binding.deviceId)
        CaptureSyncScheduler.enqueue(this)
        if (app.deliveryPaused || binding.state == "PAUSED") return "Comprobante guardado. Reanuda los envíos de AFP para registrarlo."
        return runCatching {
            val api = CaptureApiClient(getString(R.string.capture_origin))
            if (row.state != "SENT") {
                val response = api.sendEvent(binding, app.captureQueue.payload(row))
                val receipt = response.getJSONObject("event")
                require(receipt.getString("eventId") == row.eventId && receipt.getString("status") == "RECEIVED")
                app.captureQueue.dao.confirm(row.eventId, java.time.Instant.parse(receipt.getString("receivedAt")).toEpochMilli())
            }
            val status = api.receiptStatus(binding, row.eventId)
            if (status.getString("status") == "REGISTERED") "Pago registrado: ${status.getString("card")} · $${status.getString("amount")} MXN · corte ${status.getInt("month")}/${status.getInt("year")}."
            else "Comprobante recibido. Abre Captura automática → Bandeja en AFP para revisar los datos que necesitan confirmación."
        }.getOrElse { "Comprobante guardado. AFP confirmará su registro al recuperar conexión; puedes revisar el resultado en la bandeja." }
    }
}
