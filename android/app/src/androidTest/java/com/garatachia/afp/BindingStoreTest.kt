package com.garatachia.afp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class BindingStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "binding-test-${UUID.randomUUID()}"
    private val store = BindingStore(context, name)
    private val file get() = File(context.noBackupFilesDir, "$name.enc")
    @After fun cleanup() {
        file.delete()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry("afp.$name.v1") }
    }
    @Test fun identitySurvivesReopeningAndIsEncryptedOutsideBackups() {
        val binding = CaptureBinding.create().copy(deviceId = UUID.randomUUID().toString(), ownerId = "original-owner", state = "ACTIVE")
        store.save(binding, newIdentity = true)
        assertEquals(binding, BindingStore(context, name).read().single())
        val bytes = file.readBytes().toString(Charsets.ISO_8859_1)
        assertFalse(bytes.contains(binding.secret)); assertFalse(bytes.contains("original-owner"))
    }
    @Test fun relinkingArchivesOldIdentityWithoutMovingItsOwner() {
        val original = CaptureBinding.create().copy(deviceId = UUID.randomUUID().toString(), ownerId = "owner-a", state = "ACTIVE")
        store.save(original, newIdentity = true)
        assertTrue(runCatching { store.save(CaptureBinding.create(), newIdentity = true) }.isFailure)
        assertTrue(runCatching { store.save(original.copy(ownerId = "owner-b")) }.isFailure)
        store.save(original.copy(state = "REVOKED"))
        val next = CaptureBinding.create()
        store.save(next, newIdentity = true)
        val reopened = BindingStore(context, name).read()
        assertEquals("owner-a", reopened.first().ownerId)
        assertEquals("REVOKED", reopened.first().state)
        assertEquals(next, reopened.last()); assertNull(reopened.last().ownerId)
    }
    @Test fun tamperingFailsWithoutReplacingCredentials() {
        store.save(CaptureBinding.create(), newIdentity = true)
        val bytes = file.readBytes().apply { this[lastIndex] = (last().toInt() xor 1).toByte() }
        file.writeBytes(bytes)
        assertTrue(runCatching { store.read() }.isFailure)
        assertTrue(runCatching { store.save(CaptureBinding.create(), newIdentity = true) }.isFailure)
        assertArrayEquals(bytes, file.readBytes())
    }
}
