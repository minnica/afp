package com.garatachia.afp

import android.content.Intent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Selección local, sin vincular la APK dev ni enviar avisos a producción. */
@RunWith(AndroidJUnit4::class)
class ServiceSourcesScreenTest {
    @get:Rule val screen = createEmptyComposeRule()

    @Test fun serviceSourcesAreIndependentAndSelectionSurvivesReopening() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        require(context.packageName.endsWith(".dev"))
        assertTrue(BindingStore(context).read().isEmpty())
        val app = context.applicationContext as CaptureApplication
        val services = setOf("com.ubercab", "com.didiglobal.passenger", "com.ubercab.eats", GmailReceiptPolicy.source)
        val previous = app.selected
        val activeBefore = app.active
        val expected = (CapturePolicy.sources.keys - services).toMutableSet()
        app.active = false
        app.selected = expected
        var activity: android.app.Activity? = null
        fun open() = instrumentation.startActivitySync(Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        try {
            activity = open()
            for (source in services) {
                val label = "Capturar ${CapturePolicy.sources[source]}"
                screen.onNode(hasScrollAction()).performScrollToNode(hasContentDescription(label))
                val toggle = screen.onNodeWithContentDescription(label).assertIsDisplayed().assertIsOff()
                val installed = runCatching { context.packageManager.getPackageInfo(source, 0) }.isSuccess
                if (installed) {
                    toggle.assertIsEnabled().performClick().assertIsOn()
                    expected.add(source)
                } else toggle.assertIsNotEnabled()
                screen.waitForIdle()
                assertEquals(expected, app.selected)
                assertFalse(app.active)
            }
            instrumentation.runOnMainSync { activity?.finish() }
            activity = open()
            val report = app.reportState().getJSONArray("selectedPackages")
            assertEquals(expected, (0 until report.length()).map { report.getString(it) }.toSet())
            for (source in services.intersect(expected)) {
                val label = "Capturar ${CapturePolicy.sources[source]}"
                screen.onNode(hasScrollAction()).performScrollToNode(hasContentDescription(label))
                screen.onNodeWithContentDescription(label).assertIsOn()
            }
        } finally {
            instrumentation.runOnMainSync { activity?.finish() }
            app.selected = previous
            app.active = activeBefore
        }
    }
}
