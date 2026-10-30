package com.garatachia.afp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** Synthetic receipt in the isolated dev app; never connects a personal account. */
@RunWith(AndroidJUnit4::class)
class GmailReceiptCaptureTest {
    @Test fun onlyUberReceiptsReachEncryptedDiagnosticsWithoutTheMailboxAddress() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        require(context.packageName.endsWith(".dev"))
        require(BindingStore(context).read().isEmpty())
        val app = context.applicationContext as CaptureApplication
        app.scope.launch {}.join()
        require(app.samples.value.isEmpty())
        val activeBefore = app.active
        val selectedBefore = app.selected
        fun sample(fields: Map<String, String>) = DiagnosticSample(UUID.randomUUID().toString(), GmailReceiptPolicy.source,
            "a".repeat(64), System.currentTimeMillis(), System.currentTimeMillis(), System.currentTimeMillis(), false, fields)
        try {
            app.active = true
            app.selected = setOf(GmailReceiptPolicy.source)
            app.append(sample(mapOf("android.title" to "Personal", "android.text" to "Unrelated private email")))
            app.scope.launch {}.join()
            assertTrue(app.samples.value.isEmpty())
            app.append(sample(mapOf("android.title" to "Recibos de Uber", "android.text" to "Tu viaje del miércoles por la noche con Uber",
                "android.bigText" to "14/10/2026, 6:21 p.m.\nTotal\nMXN 160.25", "android.subText" to "private@example.test")))
            app.scope.launch {}.join()
            assertEquals(1, app.samples.value.size)
            val stored = DiagnosticStore(context).read().single()
            assertFalse(stored.fields.containsKey("android.subText"))
            assertFalse(stored.fields.values.any { it.contains("private@example.test") })
            assertEquals("14/10/2026, 6:21 p.m.\nTotal\nMXN 160.25", stored.fields["android.bigText"])
        } finally {
            app.clear()
            app.scope.launch {}.join()
            app.active = activeBefore
            app.selected = selectedBefore
        }
    }
}
