package com.garatachia.afp

import org.junit.Assert.*
import org.junit.Test

class CaptureBindingTest {
    @Test fun generatesIndependent256BitSecretsWithoutLoggingThem() {
        val a = CaptureBinding.create()
        val b = CaptureBinding.create()
        assertTrue(a.secret.matches(Regex("[A-Za-z0-9_-]{43}")))
        assertNotEquals(a.secret, b.secret)
        assertFalse(a.toString().contains(a.secret))
    }
    @Test fun authorizationBindsOwnerAndDiscardsTemporaryCode() {
        val initial = CaptureBinding.create().copy(deviceId = "device", state = "PENDING", code = "ABCD-1234-5678")
        val active = initial.withStatus("device", "owner-a", "ACTIVE")
        assertEquals("owner-a", active.ownerId)
        assertNull(active.code)
        assertEquals(initial.secret, active.secret)
        assertFalse(active.replaceable)
    }
    @Test fun rejectsOwnerOrDeviceChangesAndInvalidStates() {
        val active = CaptureBinding.create().copy(deviceId = "device", ownerId = "owner-a", state = "ACTIVE")
        for (change in listOf<() -> Unit>(
            { active.withStatus("device", "owner-b", "ACTIVE") },
            { active.withStatus("other-device", "owner-a", "ACTIVE") },
            { active.withStatus("device", null, "ACTIVE") },
            { active.withStatus("device", "owner-a", "UNKNOWN") },
        )) assertTrue(runCatching { change() }.isFailure)
    }
    @Test fun revokeAndPauseAreExplicitAndPreserveOriginalOwner() {
        val active = CaptureBinding.create().copy(deviceId = "device", ownerId = "owner-a", state = "ACTIVE")
        val paused = active.withStatus("device", "owner-a", "PAUSED")
        assertEquals("owner-a", paused.ownerId)
        assertFalse(paused.replaceable)
        val revoked = paused.withStatus("device", "owner-a", "REVOKED")
        assertTrue(revoked.replaceable)
        assertEquals("owner-a", revoked.ownerId)
        assertTrue(runCatching { revoked.withStatus("device", "owner-a", "ACTIVE") }.isFailure)
        assertTrue(CaptureBinding.create().copy(state = "EXPIRED").replaceable)
    }
}
