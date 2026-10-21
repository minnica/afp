package com.garatachia.afp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class CaptureRemoteSettingsTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "remote-test-${UUID.randomUUID()}"
    private val preferences = context.getSharedPreferences(name, 0)
    private var currentId: String? = "device-a"
    private val settings = CaptureRemoteSettings(preferences) { currentId }
    private val binding = CaptureBinding.create().copy(deviceId = "device-a", ownerId = "owner-a", state = "ACTIVE")
    private val source = "com.bancomer.mbanking"
    @After fun cleanup() { context.deleteSharedPreferences(name) }

    @Test fun remotePausePersistsWithoutChangingLocalSelectionOrOtherSources() {
        val local = setOf(source, "com.google.android.apps.walletnfcrel")
        settings.apply(binding, JSONObject().put("pausedPackages", JSONArray(listOf(source, "unknown.package"))))
        assertEquals(setOf(source), settings.pausedPackages())
        val reopened = CaptureRemoteSettings(preferences) { currentId }
        assertEquals(setOf(source), reopened.pausedPackages())
        assertEquals(setOf("com.google.android.apps.walletnfcrel"), local - reopened.pausedPackages())
        assertEquals(2, local.size)
    }
    @Test fun relinkingDoesNotInheritPausesAndLateOldConfigurationIsIgnored() {
        settings.apply(binding, JSONObject().put("pausedPackages", JSONArray(listOf(source))))
        currentId = "device-b"
        assertTrue(settings.pausedPackages().isEmpty())
        settings.apply(binding, JSONObject().put("pausedPackages", JSONArray()))
        assertEquals("device-a", preferences.getString("remote-device", null))
        assertEquals(setOf(source), preferences.getStringSet("remote-paused-sources", emptySet()))
    }
    @Test fun explicitResumePreservesUnselectedSourcesAndOldServerResponseDoesNotErasePause() {
        settings.apply(binding, JSONObject().put("pausedPackages", JSONArray(listOf(source))))
        settings.apply(binding, JSONObject())
        assertEquals(setOf(source), settings.pausedPackages())
        settings.apply(binding, JSONObject().put("pausedPackages", JSONArray()))
        assertTrue(settings.pausedPackages().isEmpty())
        assertTrue(emptySet<String>().minus(settings.pausedPackages()).isEmpty())
    }
}
