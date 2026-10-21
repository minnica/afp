package com.garatachia.afp

import android.app.KeyguardManager
import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class CaptureNotificationListener : NotificationListenerService() {
    private val app get() = application as CaptureApplication
    override fun onListenerConnected() {
        app.connected.value = true
        // Android solo ofrece los avisos aún activos. No intentar reconstruir un historial.
        runCatching { activeNotifications.orEmpty().forEach(::capture) }.onSuccess {
            app.recoveryNotice.value = "Reconexión comprobada: se revisaron únicamente los avisos todavía activos. Los desaparecidos no se recuperan."
        }.onFailure {
            app.recoveryNotice.value = "No se pudieron revisar los avisos activos. Reconecta el lector; no se recuperó un historial."
        }
    }
    override fun onListenerDisconnected() { app.connected.value = false }
    override fun onDestroy() {
        app.connected.value = false
        super.onDestroy()
    }
    override fun onNotificationPosted(sbn: StatusBarNotification) = capture(sbn)
    private fun capture(sbn: StatusBarNotification) {
        val summary = sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0
        if (!CapturePolicy.accepts(sbn.packageName, app.active, app.captureSources, summary)) return
        if (sbn.notification.category == Notification.CATEGORY_PROMO) return
        runCatching {
            DiagnosticSample.fromNotification(sbn, getSystemService(KeyguardManager::class.java).isKeyguardLocked)
        }.onSuccess(app::append).onFailure { app.storageError.value = true }
    }
}
