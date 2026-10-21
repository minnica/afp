package com.garatachia.afp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

// Dos invocaciones separadas por adb install -r de una versión superior.
// Solo usa la variante dev, con envíos pausados y una identidad ficticia.
@RunWith(AndroidJUnit4::class)
class QueueUpgradeProbeTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val app get() = context.applicationContext as CaptureApplication
    private val args get() = InstrumentationRegistry.getArguments()
    private val preferences get() = context.getSharedPreferences("upgrade-probe", 0)

    @Test fun seedBeforeApkUpdate() {
        assumeTrue(args.getString("upgradeProbe") == "seed")
        assertEquals("com.garatachia.afp.dev", context.packageName)
        assertEquals(6L, context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode)
        assertTrue(BindingStore(context).read().isEmpty())
        app.deliveryPaused = true
        assertTrue(context.getSharedPreferences("diagnostic-settings", 0).edit()
            .putBoolean("active", true).putStringSet("sources", CapturePolicy.sources.keys).commit())
        val identity = CaptureBinding.create().copy(deviceId = UUID.randomUUID().toString(), ownerId = "upgrade-owner", state = "ACTIVE")
        BindingStore(context).save(identity, newIdentity = true)
        app.applyRemoteConfiguration(identity, JSONObject().put("pausedPackages", JSONArray(listOf("com.bancomer.mbanking"))))
        val sample = DiagnosticSample(UUID.randomUUID().toString(), "com.bancomer.mbanking", "a".repeat(64),
            1792584000000, 1792584000100, 1792584000000, true, mapOf("android.text" to "Aviso ficticio pendiente de actualización"))
        val row = app.captureQueue.enqueue(sample, identity)
        val access = app.reportState().getBoolean("notificationAccess")
        assertTrue(preferences.edit().putString("event", row.eventId).putString("device", identity.deviceId)
            .putString("secret", identity.secret).putBoolean("access", access).commit())
        assertEquals(1, runBlocking { app.captureQueue.dao.totals().first() }.pending)
    }

    @Test fun verifyAfterApkUpdate() {
        assumeTrue(args.getString("upgradeProbe") == "verify")
        assertEquals("com.garatachia.afp.dev", context.packageName)
        assertEquals(7L, context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode)
        assertTrue(app.deliveryPaused); assertTrue(app.active)
        assertEquals(CapturePolicy.sources.keys, app.selected)
        assertEquals(setOf("com.bancomer.mbanking"), app.remotePausedPackages)
        assertEquals(preferences.getBoolean("access", false), app.reportState().getBoolean("notificationAccess"))
        val binding = BindingStore(context).read().single()
        assertEquals(preferences.getString("device", null), binding.deviceId)
        assertEquals(preferences.getString("secret", null), binding.secret)
        assertEquals("upgrade-owner", binding.ownerId)
        val row = requireNotNull(app.captureQueue.dao.byId(requireNotNull(preferences.getString("event", null))))
        assertEquals("PENDING", row.state); assertEquals(0, row.attempts)
        assertEquals(binding.deviceId, row.deviceId); assertEquals(binding.ownerId, row.ownerId)
        assertEquals("Aviso ficticio pendiente de actualización", app.captureQueue.payload(row).getJSONObject("fields").getString("android.text"))
        assertEquals(1, runBlocking { app.captureQueue.dao.totals().first() }.pending)
    }
}
