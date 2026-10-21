package com.garatachia.afp

import android.content.Intent
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TwaNavigationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    private fun findButton(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.text?.toString() == "Abrir AFP") return node
        for (index in 0 until node.childCount) findButton(node.getChild(index))?.let { return it }
        return null
    }

    private fun awaitCondition(message: String, condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + 15_000
        while (SystemClock.uptimeMillis() < deadline) {
            if (condition()) return
            SystemClock.sleep(100)
        }
        assertTrue(message, condition())
    }

    @Test fun openAfpWorksAfterReturningToDiagnosticWithAnExistingTwa() {
        repeat(2) { attempt ->
            // Traer el diagnóstico al frente conserva la TWA anterior; no vaciar la pila.
            context.startActivity(Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
            awaitCondition("El diagnóstico debe quedar visible (intento ${attempt + 1})") {
                instrumentation.uiAutomation.rootInActiveWindow?.packageName == context.packageName
            }
            var button: AccessibilityNodeInfo? = null
            awaitCondition("Debe existir el botón Abrir AFP") {
                button = findButton(instrumentation.uiAutomation.rootInActiveWindow)
                button != null
            }
            var clickable = button
            while (clickable != null && !clickable.isClickable) clickable = clickable.parent
            assertTrue("Abrir AFP debe responder al toque", clickable?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true)
            awaitCondition("Abrir AFP debe mostrar el navegador (intento ${attempt + 1})") {
                val root = instrumentation.uiAutomation.rootInActiveWindow
                // El proveedor predeterminado del S24 es Chrome. Debug usa Custom Tab sin confianza de producción.
                root?.packageName == "com.android.chrome"
            }
        }
    }
}
