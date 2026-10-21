package com.garatachia.afp

import android.app.KeyguardManager
import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class CaptureNotificationListener : NotificationListenerService() {
    private val app get() = application as CaptureApplication
    override fun onListenerConnected() { app.connected.value = true }
    override fun onListenerDisconnected() { app.connected.value = false }
    override fun onDestroy() {
        app.connected.value = false
        super.onDestroy()
    }
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val summary = sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0
        if (!CapturePolicy.accepts(sbn.packageName, app.active, app.selected, summary)) return
        runCatching {
            DiagnosticSample.fromNotification(sbn, getSystemService(KeyguardManager::class.java).isKeyguardLocked)
        }.onSuccess(app::append).onFailure { app.storageError.value = true }
    }
}
