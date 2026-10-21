package com.garatachia.afp

import org.junit.Assert.*
import org.junit.Test

class CapturePolicyTest {
    private val bbva = "com.bancomer.mbanking"
    private val wallet = "com.google.android.apps.walletnfcrel"

    @Test fun acceptsOnlyExplicitSources() {
        assertTrue(CapturePolicy.accepts(bbva, true, setOf(bbva), false))
        assertTrue(CapturePolicy.accepts(wallet, true, setOf(wallet), false))
        assertFalse(CapturePolicy.accepts("unrelated.app", true, setOf("unrelated.app"), false))
        assertFalse(CapturePolicy.accepts("com.bancomer.mbanking.fake", true, setOf(bbva), false))
    }

    @Test fun pausedDiagnosticNeverCaptures() {
        for (source in CapturePolicy.sources.keys) {
            assertFalse(CapturePolicy.accepts(source, false, CapturePolicy.sources.keys, false))
        }
    }

    @Test fun unselectedSourceNeverCaptures() {
        assertFalse(CapturePolicy.accepts(bbva, true, setOf(wallet), false))
        assertFalse(CapturePolicy.accepts(wallet, true, emptySet(), false))
    }

    @Test fun ignoresGroupSummaries() {
        assertFalse(CapturePolicy.accepts(bbva, true, setOf(bbva), true))
        assertFalse(CapturePolicy.accepts(wallet, true, setOf(wallet), true))
    }

    @Test fun everyVerifiedSourceRequiresItsOwnSelection() {
        assertEquals(8, CapturePolicy.sources.size)
        for (source in CapturePolicy.sources.keys) {
            assertTrue(CapturePolicy.accepts(source, true, setOf(source), false))
            assertFalse(CapturePolicy.accepts(source, true, CapturePolicy.sources.keys - source, false))
            assertFalse(CapturePolicy.accepts(source, true, setOf(source), true))
            assertFalse(CapturePolicy.accepts("$source.fake", true, setOf("$source.fake"), false))
        }
        assertFalse(CapturePolicy.accepts("com.didiglobal.passenger", true,
            setOf("com.didiglobal.passenger"), false))
    }

    @Test fun missingPreferenceKeepsOnlyLegacySourcesEnabled() {
        assertEquals(setOf(bbva, wallet), CapturePolicy.selection(null))
    }

    @Test fun updatePreservesExplicitSelectionsIncludingNone() {
        assertEquals(emptySet<String>(), CapturePolicy.selection(emptySet()))
        assertEquals(setOf(wallet), CapturePolicy.selection(setOf(wallet)))
        assertEquals(setOf("com.nu.production"), CapturePolicy.selection(setOf("com.nu.production")))
        assertEquals(setOf(bbva), CapturePolicy.selection(setOf(bbva, "unrelated.app")))
    }

    @Test fun exportMasksNamesAmountsCardReferencesAndUnicode() {
        val raw = "Compra de María por $1,234.50 en Tienda ÁRBOL tarjeta 9876 Ref ABCñ12 漢字 𝟡 🔐"
        val masked = CapturePolicy.anonymize(raw)
        for (privateValue in listOf("María", "1,234.50", "9876", "ABCñ12", "ÁRBOL", "漢字", "𝟡")) {
            assertFalse(masked.contains(privateValue))
        }
        assertTrue(masked.contains("$0,000.00"))
        assertFalse(masked.codePoints().anyMatch { Character.isLetter(it) && it != 'x'.code })
        assertFalse(masked.codePoints().anyMatch { Character.isDigit(it) && it != '0'.code })
    }

    @Test fun maskingHandlesEmptyAndMultilineContent() {
        assertEquals("", CapturePolicy.anonymize(""))
        assertEquals("xxx 000 xx", CapturePolicy.anonymize("Abc\n123\tñZ"))
    }
}
