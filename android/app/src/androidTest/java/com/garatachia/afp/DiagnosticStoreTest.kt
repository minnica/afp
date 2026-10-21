package com.garatachia.afp

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Process
import android.os.UserHandle
import android.service.notification.StatusBarNotification
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.androidbrowserhelper.trusted.LauncherActivity
import com.google.androidbrowserhelper.trusted.FocusActivity
import com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class DiagnosticStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "test-${UUID.randomUUID()}"
    private val store = DiagnosticStore(context, name)
    private val file get() = File(context.noBackupFilesDir, "$name.enc")
    private fun sample(index: Int = 0) = DiagnosticSample("synthetic-$index", "com.bancomer.mbanking",
        "synthetic-hash", 1000L, 2000L, 900L, true,
        mapOf("android.title" to "Ejemplo sintético María", "android.text" to "Compra $123.45 tarjeta 9876"))

    @After fun cleanup() {
        store.clear()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry("afp.$name.v1") }
    }

    @Test fun encryptedSamplesSurviveNewStoreInstance() {
        assertTrue(store.read().isEmpty())
        store.append(sample())
        assertEquals(listOf(sample()), DiagnosticStore(context, name).read())
        val encrypted = file.readBytes().toString(Charsets.ISO_8859_1)
        assertFalse(encrypted.contains("Compra"))
        assertFalse(encrypted.contains("9876"))
        store.clear()
        assertTrue(store.read().isEmpty())
    }

    @Test fun retainsOnlyMostRecentHundredSamples() {
        repeat(103) { store.append(sample(it)) }
        val saved = store.read()
        assertEquals(100, saved.size)
        assertEquals("synthetic-102", saved.first().id)
        assertEquals("synthetic-3", saved.last().id)
    }

    @Test fun tamperingIsReportedAndNeverSilentlyOverwritten() {
        store.append(sample())
        val bytes = file.readBytes().apply { this[lastIndex] = (last().toInt() xor 1).toByte() }
        file.writeBytes(bytes)
        assertTrue(runCatching { store.read() }.isFailure)
        assertTrue(runCatching { store.append(sample(1)) }.isFailure)
        assertArrayEquals(bytes, file.readBytes())
    }

    @Test fun anonymousExportRemovesIdentityAndTimestamps() {
        val json = sample().anonymousJson()
        assertFalse(json.has("id"))
        assertFalse(json.has("notificationKeyHash"))
        assertFalse(json.has("postedAt"))
        assertFalse(json.toString().contains("María"))
        assertFalse(json.toString().contains("123.45"))
        assertFalse(json.toString().contains("9876"))
        assertTrue(json.getBoolean("screenLocked"))
    }

    @Test fun sourceSelectionMigrationPreservesChoicesAndExcludesUnknownPackages() {
        val app = context.applicationContext as CaptureApplication
        val preferences = context.getSharedPreferences("diagnostic-settings", Context.MODE_PRIVATE)
        val previous = preferences.getStringSet("sources", null)?.toSet()
        try {
            preferences.edit().remove("sources").commit()
            app.selected = app.selected // Mismo paso de migración que Application.onCreate.
            assertEquals(setOf("com.bancomer.mbanking", "com.google.android.apps.walletnfcrel"), app.selected)
            assertEquals(app.selected, preferences.getStringSet("sources", null))
            app.selected = setOf("com.nu.production", "unrelated.app")
            assertEquals(setOf("com.nu.production"), preferences.getStringSet("sources", null))
            app.selected = emptySet()
            assertTrue(app.selected.isEmpty())
            assertTrue(preferences.getStringSet("sources", null)!!.isEmpty())
        } finally {
            preferences.edit().apply {
                if (previous == null) remove("sources") else putStringSet("sources", previous)
            }.commit()
        }
    }

    @Suppress("DEPRECATION")
    @Test fun allVerifiedSourcesRetainSeparateIdentityAndMissingText() {
        val notification = Notification.Builder(context, "synthetic-only").build()
        val expected = CapturePolicy.sources.keys.map { source ->
            val sbn = StatusBarNotification(source, context.packageName, 19, null,
                Process.myUid(), 0, 0, notification,
                UserHandle.getUserHandleForUid(Process.myUid()), 456L)
            DiagnosticSample.fromNotification(sbn, false).also {
                assertFalse(it.anonymousJson().getBoolean("contentAvailable"))
                assertTrue(it.fields.values.all(String::isBlank))
                store.append(it)
            }
        }.reversed()
        assertEquals(expected, DiagnosticStore(context, name).read())
        assertEquals(CapturePolicy.sources.keys, store.read().map { it.packageName }.toSet())
    }

    @Suppress("DEPRECATION")
    @Test fun twaUrlIsResolvedAsTextInTheInstalledManifest() {
        val info = context.packageManager.getActivityInfo(
            ComponentName(context, LauncherActivity::class.java), PackageManager.GET_META_DATA)
        assertEquals("https://finanzas.garatachia.com/dashboard",
            info.metaData.getString("android.support.customtabs.trusted.DEFAULT_URL"))
        val listener = context.packageManager.getServiceInfo(
            ComponentName(context, CaptureNotificationListener::class.java), 0)
        assertEquals("android.permission.BIND_NOTIFICATION_LISTENER_SERVICE", listener.permission)
        assertTrue(listener.exported)
    }

    @Suppress("DEPRECATION")
    @Test fun twaAuxiliaryComponentsCanBeManagedByBrowserHelper() {
        val manager = context.packageManager
        val manage = ComponentName(context, ManageDataLauncherActivity::class.java)
        val focus = ComponentName(context, FocusActivity::class.java)
        assertFalse(manager.getActivityInfo(manage, 0).exported)
        assertFalse(manager.getActivityInfo(focus, 0).exported)
        val previous = manager.getComponentEnabledSetting(manage)
        try {
            // Reproduce la rama que antes cerraba la APK al gestionar un componente ausente.
            ManageDataLauncherActivity.addSiteSettingsShortcut(context, "not.a.twa.provider")
            assertEquals(PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                manager.getComponentEnabledSetting(manage))
        } finally {
            manager.setComponentEnabledSetting(manage, previous, PackageManager.DONT_KILL_APP)
        }
    }

    @Suppress("DEPRECATION")
    @Test fun readsExpandedNotificationWithoutInventingMissingFields() {
        val notification = Notification.Builder(context, "synthetic-only")
            .setContentTitle("Compra sintética").setContentText("Ejemplo $123.45")
            .setStyle(Notification.BigTextStyle().bigText("Ejemplo ampliado tarjeta 9876"))
            .setWhen(123L).build()
        val sbn = StatusBarNotification("com.bancomer.mbanking", context.packageName, 17,
            "private-tag", Process.myUid(), 0, 0, notification,
            UserHandle.getUserHandleForUid(Process.myUid()), 456L)
        val sample = DiagnosticSample.fromNotification(sbn, true)
        assertEquals("Compra sintética", sample.fields[Notification.EXTRA_TITLE])
        assertEquals("Ejemplo ampliado tarjeta 9876", sample.fields[Notification.EXTRA_BIG_TEXT])
        assertFalse(sample.fields.containsKey("amount"))
        assertEquals(456L, sample.postedAt)
        assertEquals(123L, sample.notificationWhen)
        assertTrue(sample.screenLocked)
        assertFalse(sample.notificationKeyHash.contains("private-tag"))
        assertEquals(64, sample.notificationKeyHash.length)
    }
}
