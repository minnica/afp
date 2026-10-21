package com.garatachia.afp

import android.content.Intent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkManager
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.URL
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

/** Pantalla real y estado del teléfono; solo admite la APK dev sin vinculación y la API localhost. */
@RunWith(AndroidJUnit4::class)
class CaptureRemoteScreenTest {
    @get:Rule val screen = createEmptyComposeRule()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val app get() = context.applicationContext as CaptureApplication
    private val source = "com.bancomer.mbanking"
    private val wallet = "com.google.android.apps.walletnfcrel"
    private val pauseText = "Pausada desde AFP. Reanúdala en Configuración → Captura automática."

    @Test fun sourcePauseResumeIsVisibleAndRealPhoneStateReachesLocalApi() {
        val args = InstrumentationRegistry.getArguments()
        val origin = requireNotNull(args.getString("captureTestOrigin"))
        require(origin.matches(Regex("https://localhost:[0-9]+")))
        require(context.packageName.endsWith(".dev"))
        val store = BindingStore(context)
        // No reemplazar una identidad o configuración de desarrollo del usuario.
        assertTrue("Esta comprobación requiere una APK dev sin vinculación", store.read().isEmpty())
        val preferences = context.getSharedPreferences("diagnostic-settings", 0)
        val selectedBefore = app.selected.toSet()
        val activeBefore = app.active
        val remoteDeviceBefore = preferences.getString("remote-device", null)
        val remoteSourcesBefore = preferences.getStringSet("remote-paused-sources", null)?.toSet()
        val certificate = CertificateFactory.getInstance("X.509").generateCertificate(
            File(requireNotNull(args.getString("captureTestCertificate"))).inputStream().use { it.readBytes().inputStream() })
        val keys = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("local-test", certificate) }
        val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(keys) }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }
        fun connection(url: URL) = (url.openConnection() as HttpsURLConnection).apply {
            sslSocketFactory = ssl.socketFactory
            connectTimeout = 10000; readTimeout = 10000; instanceFollowRedirects = false
        }
        fun administrative(path: String, body: JSONObject? = null): JSONObject {
            val request = connection(URL("$origin/api/captures/$path"))
            try {
                request.setRequestProperty("Authorization", "Bearer capture-instrumentation")
                if (body != null) {
                    request.requestMethod = "PATCH"; request.doOutput = true
                    request.setRequestProperty("Content-Type", "application/json")
                    request.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }
                assertEquals("La API local debe aceptar $path", 200, request.responseCode)
                return JSONObject(request.inputStream.bufferedReader().use { it.readText() })
            } finally { request.disconnect() }
        }
        val client = CaptureApiClient(origin, ::connection, app::applyRemoteConfiguration)
        // El cliente local se invoca explícitamente: no se cambia el origen de la APK,
        // la confianza TLS global ni se deja que WorkManager use una identidad ficticia.
        WorkManager.getInstance(context).cancelAllWork().result.get(10, TimeUnit.SECONDS)
        runBlocking { app.syncMutex.lock() }
        var activity: android.app.Activity? = null
        lateinit var binding: CaptureBinding
        var linked = false
        try {
            app.active = false
            app.selected = setOf(source, wallet)
            val pending = client.start(CaptureBinding.create(), "Pantalla Android · prueba sintética")
            administrative("pairings", JSONObject().put("code", pending.code))
            binding = client.status(pending)
            store.save(binding, newIdentity = true)
            linked = true
            administrative("devices", JSONObject().put("deviceId", binding.deviceId)
                .put("action", "source").put("sourcePackage", source).put("paused", true))
            binding = client.status(binding)
            assertEquals(setOf(source), app.remotePausedPackages)
            assertEquals(setOf(wallet), app.captureSources)
            activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
            assertSame(app, activity.application)
            screen.onNodeWithText("Captura automática").assertIsDisplayed()
            screen.onNode(hasScrollAction()).performScrollToNode(hasText(pauseText))
            screen.onNodeWithText(pauseText).assertIsDisplayed()
            assertEquals(setOf(source, wallet), app.selected)
            val pausedReport = app.reportState()
            client.report(binding, pausedReport)
            fun reported(): JSONObject {
                val devices = administrative("devices").getJSONArray("devices")
                val device = (0 until devices.length()).map { devices.getJSONObject(it) }
                    .single { it.getString("id") == binding.deviceId }
                assertFalse(device.isNull("reportedAt"))
                return device.getJSONObject("reportedState")
            }
            val savedPause = reported()
            pausedReport.keys().forEach { key -> assertEquals(key, pausedReport.get(key).toString(), savedPause.get(key).toString()) }
            administrative("devices", JSONObject().put("deviceId", binding.deviceId)
                .put("action", "source").put("sourcePackage", source).put("paused", false))
            binding = client.status(binding)
            screen.onNodeWithText(pauseText).assertDoesNotExist()
            screen.onNode(hasScrollAction()).performScrollToNode(hasContentDescription("Capturar BBVA México"))
            screen.onNodeWithContentDescription("Capturar BBVA México").assertIsDisplayed().assertIsOn()
            assertEquals(setOf(source, wallet), app.captureSources)
            assertEquals(setOf(source, wallet), app.selected)
            val resumedReport = app.reportState()
            client.report(binding, resumedReport)
            val savedResume = reported()
            resumedReport.keys().forEach { key -> assertEquals(key, resumedReport.get(key).toString(), savedResume.get(key).toString()) }
            assertEquals(0, reported().getJSONArray("pausedPackages").length())
        } finally {
            activity?.let { instrumentation.runOnMainSync { it.finish() } }
            if (linked) {
                runCatching { client.change(binding, "revoke") }
                File(context.noBackupFilesDir, "capture-bindings.enc").delete()
            }
            app.selected = selectedBefore
            app.active = activeBefore
            preferences.edit().apply {
                if (remoteDeviceBefore == null) remove("remote-device") else putString("remote-device", remoteDeviceBefore)
                if (remoteSourcesBefore == null) remove("remote-paused-sources") else putStringSet("remote-paused-sources", remoteSourcesBefore)
            }.commit()
            app.remotePauses.value = app.remotePausedPackages
            app.syncMutex.unlock()
            CaptureSyncScheduler.recover(context)
        }
    }
}
