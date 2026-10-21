package com.garatachia.afp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkManager
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID
import java.util.concurrent.TimeUnit

// Prueba física en dos ejecuciones independientes: seed, reinicio Android, verify.
// Exclusiva de desarrollo, sin credencial real; la pausa impide peticiones al dominio personal.
@RunWith(AndroidJUnit4::class)
class QueueRecoveryProbeTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val app get() = context.applicationContext as CaptureApplication
    private val args get() = InstrumentationRegistry.getArguments()
    @Test fun seedOfflineQueue() {
        assumeTrue(args.getString("recoveryProbe") == "seed")
        assertEquals("com.garatachia.afp.dev", context.packageName)
        app.deliveryPaused = true
        val identity = CaptureBinding("synthetic-never-send", UUID.randomUUID().toString(), "recovery-owner", "ACTIVE")
        val sample = DiagnosticSample(UUID.randomUUID().toString(), "com.bancomer.mbanking", "b".repeat(64),
            1792584000000, 1792584000100, 1792584000000, true, mapOf("android.text" to "Compra sintética persistente"))
        val row = app.captureQueue.enqueue(sample, identity)
        assertTrue(context.getSharedPreferences("recovery-test", 0).edit().putString("event", row.eventId).commit())
        CaptureSyncScheduler.enqueue(context, manual = true)
        val work = WorkManager.getInstance(context).getWorkInfosForUniqueWork(CaptureSyncScheduler.WORK_NAME).get(10, TimeUnit.SECONDS)
        assertTrue(work.isNotEmpty())
        assertTrue(work.last().constraints.requiredNetworkType == androidx.work.NetworkType.CONNECTED)
        assertTrue(work.last().runAttemptCount == 0)
        assertEquals(1, runBlocking { app.captureQueue.dao.totals().first() }.pending)
    }
    @Test fun verifyQueueAfterPhysicalReboot() {
        assumeTrue(args.getString("recoveryProbe") == "verify")
        val id = requireNotNull(context.getSharedPreferences("recovery-test", 0).getString("event", null))
        assertTrue(app.deliveryPaused)
        val row = requireNotNull(app.captureQueue.dao.byId(id))
        assertEquals("PENDING", row.state); assertEquals(0, row.attempts)
        assertEquals("recovery-owner", row.ownerId)
        assertEquals("Compra sintética persistente", app.captureQueue.payload(row).getJSONObject("fields").getString("android.text"))
        val periodic = WorkManager.getInstance(context).getWorkInfosForUniqueWork("capture-delivery-recovery").get(10, TimeUnit.SECONDS)
        assertTrue(periodic.isNotEmpty())
    }
}
