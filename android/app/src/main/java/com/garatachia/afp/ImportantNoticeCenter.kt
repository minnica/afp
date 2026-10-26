package com.garatachia.afp

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.net.toUri
import com.google.androidbrowserhelper.trusted.LauncherActivity
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject

class ImportantNoticeCenter(private val context: Context) {
    private val manager = context.getSystemService(NotificationManager::class.java)
    private val preferences = context.getSharedPreferences("important-notices", Context.MODE_PRIVATE)
    val status = MutableStateFlow("Los avisos también permanecen disponibles dentro de AFP.")
    val enabled: Boolean get() = preferences.getBoolean("enabled", false)

    fun createChannel() {
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Avisos importantes", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Pagos de tarjetas, cortes, suscripciones en efectivo y cobros pendientes de AFP"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
    }

    fun permitted(): Boolean = manager.areNotificationsEnabled() &&
        manager.getNotificationChannel(CHANNEL_ID)?.importance != NotificationManager.IMPORTANCE_NONE

    fun setEnabled(value: Boolean) = synchronized(lock) {
        check(preferences.edit().putBoolean("enabled", value).commit())
        if (value) ImportantNoticeScheduler.enqueue(context) else clear()
    }

    fun clear() = synchronized(lock) {
        manager.activeNotifications.filter { it.tag?.startsWith(TAG_PREFIX) == true }.forEach { manager.cancel(it.tag, it.id) }
    }

    fun apply(binding: CaptureBinding, response: JSONObject) = synchronized(lock) {
        // Validar la respuesta completa antes de retirar o publicar notificaciones.
        val notices = ImportantNoticePolicy.parse(response, binding)
        val current = BindingStore(context).read().lastOrNull()
        if (current == null || current.deviceId != binding.deviceId || current.ownerId != binding.ownerId || current.state != "ACTIVE") return@synchronized
        if (!enabled || !permitted()) return@synchronized
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return@synchronized
        val identity = "${binding.ownerId}/${binding.deviceId}"
        val delivered = if (preferences.getString("identity", null) == identity)
            preferences.getStringSet("delivered", emptySet()).orEmpty().toSet() else emptySet()
        fun tag(notice: ImportantNotice) = "$TAG_PREFIX$identity/${notice.key}"
        val activeTags = notices.map(::tag).toSet()
        val displayed = manager.activeNotifications.associateBy { it.tag }
        displayed.values.filter { it.tag?.startsWith(TAG_PREFIX) == true && it.tag !in activeTags }
            .forEach { manager.cancel(it.tag, it.id) }
        val confirmed = delivered.toMutableSet()
        val displayedKeys = notices.filter { tag(it) in displayed }.map { it.key }.toSet()
        for (notice in ImportantNoticePolicy.pending(notices, delivered, displayedKeys)) {
            val previous = displayed[tag(notice)]?.notification
            if (notice.key in delivered && previous?.extras?.getString(Notification.EXTRA_TITLE) == notice.title &&
                previous.extras?.getString(Notification.EXTRA_TEXT) == notice.body) continue
            val intent = Intent(context, LauncherActivity::class.java)
                .setData("${context.getString(R.string.capture_origin)}${notice.path}".toUri())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val target = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val publicVersion = Notification.Builder(context, CHANNEL_ID).setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("AFP").setContentText("Tienes un aviso importante").build()
            val notification = Notification.Builder(context, CHANNEL_ID).setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(notice.title).setContentText(notice.body)
                .setStyle(Notification.BigTextStyle().bigText(notice.body))
                .setContentIntent(target).setAutoCancel(true).setOnlyAlertOnce(true)
                .setWhen(previous?.`when` ?: System.currentTimeMillis())
                .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion).build()
            manager.notify(tag(notice), 0, notification)
            confirmed.add(notice.key)
            // Guardar después de publicar: un fallo previo no da el aviso por enviado.
            check(preferences.edit().putString("identity", identity)
                .putStringSet("delivered", confirmed.takeLastKeys(2048)).commit())
        }
        status.value = if (notices.isEmpty()) "No hay avisos importantes pendientes." else "Avisos actualizados. Los avisos sin cambios no vuelven a sonar."
    }

    private fun Set<String>.takeLastKeys(limit: Int) = toList().takeLast(limit).toSet()

    companion object {
        const val CHANNEL_ID = "afp-important-notices"
        private const val TAG_PREFIX = "afp-notice/"
        private val lock = Any()
    }
}
