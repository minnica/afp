package com.garatachia.afp

import org.json.JSONObject
import java.net.URL
import java.io.ByteArrayOutputStream
import javax.net.ssl.HttpsURLConnection

class CaptureApiException(val status: Int, val retryAfterMs: Long = 0) : Exception(when (status) {
    401, 403 -> "La autorización no permite esta acción. Consulta el estado del teléfono."
    404 -> "El servidor todavía no ofrece la vinculación. Requiere la actualización de AFP."
    409 -> "La vinculación ya se utilizó. Consulta el estado."
    410 -> "El código venció. Genera una nueva vinculación."
    429 -> "Demasiados intentos. Espera cinco minutos antes de volver a consultar."
    else -> "No se pudo conectar con AFP. Conservamos la vinculación para reintentar."
})

class CaptureApiClient(private val origin: String,
    private val connectionFactory: (URL) -> HttpsURLConnection = { it.openConnection() as HttpsURLConnection },
    private val configurationReceived: (CaptureBinding, JSONObject) -> Unit = { _, _ -> }) {
    init {
        val url = URL(origin)
        require(url.protocol == "https" && url.userInfo == null && url.query == null && url.ref == null)
        require(url.path.isEmpty() || url.path == "/")
    }
    private fun request(path: String, method: String = "GET", binding: CaptureBinding? = null, body: JSONObject? = null, maxBytes: Int = 64 * 1024): JSONObject {
        val connection = connectionFactory(URL("${origin.trimEnd('/')}/api/captures/$path"))
        try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000; connection.readTimeout = 10_000
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            // Independiente de CookieManager y de la sesión del proveedor TWA.
            if (binding != null) connection.setRequestProperty("Authorization", "Capture ${requireNotNull(binding.deviceId)}.${binding.secret}")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            if (status !in 200..299) throw CaptureApiException(status,
                retryAfterMillis(connection.getHeaderField("Retry-After")))
            val bytes = connection.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(4096)
                while (true) {
                    val count = input.read(buffer)
                    if (count == -1) break
                    require(output.size() + count <= maxBytes)
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            return JSONObject(String(bytes, Charsets.UTF_8))
        } finally { connection.disconnect() }
    }
    fun start(binding: CaptureBinding, name: String): CaptureBinding {
        require(binding.deviceId == null && binding.ownerId == null)
        val response = request("pairings", "POST", body = JSONObject().put("secret", binding.secret).put("name", name))
        return binding.copy(deviceId = response.getString("deviceId"), state = "PENDING",
            code = response.getString("code"), expiresAt = response.getString("expiresAt"))
    }
    fun status(binding: CaptureBinding): CaptureBinding {
        val response = request("device", binding = binding)
        val current = merge(binding, response)
        response.optJSONObject("configuration")?.let { configurationReceived(current, it) }
        return current
    }
    fun report(binding: CaptureBinding, report: JSONObject) { request("device", "POST", binding, report) }
    fun notices(binding: CaptureBinding): JSONObject {
        val zone = java.net.URLEncoder.encode(java.time.ZoneId.systemDefault().id, "UTF-8")
        return request("notices?timeZone=$zone", binding = binding, maxBytes = 512 * 1024)
    }
    fun change(binding: CaptureBinding, action: String): CaptureBinding {
        require(action in setOf("pause", "resume", "revoke"))
        return merge(binding, request("device", if (action == "revoke") "DELETE" else "POST", binding,
            if (action == "revoke") null else JSONObject().put("action", action)))
    }
    // La cola entrega exactamente el cuerpo persistido y conserva el UUID hasta recibir su recibo.
    fun sendEvent(binding: CaptureBinding, event: JSONObject): JSONObject {
        require(binding.state == "ACTIVE" && binding.ownerId != null)
        return request(if (event.optInt("receiptVersion") == 1) "payment-receipts" else "events", "POST", binding, event)
    }
    fun receiptStatus(binding: CaptureBinding, eventId: String): JSONObject {
        require(runCatching { java.util.UUID.fromString(eventId) }.isSuccess)
        return request("payment-receipts?eventId=$eventId", binding = binding).getJSONObject("result")
    }
    private fun merge(binding: CaptureBinding, response: JSONObject) = binding.withStatus(
        response.getString("deviceId"), if (response.isNull("ownerId")) null else response.getString("ownerId"), response.getString("state"))
    companion object {
        fun retryAfterMillis(value: String?, now: Long = System.currentTimeMillis()): Long {
            val seconds = value?.trim()?.toLongOrNull()
            if (seconds != null) return seconds.coerceIn(0, 86400) * 1000
            return runCatching { java.time.ZonedDateTime.parse(value, java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME)
                .toInstant().toEpochMilli().minus(now).coerceIn(0, 86400000) }.getOrDefault(0)
        }
    }
}
