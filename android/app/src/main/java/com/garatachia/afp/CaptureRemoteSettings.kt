package com.garatachia.afp

import android.content.SharedPreferences
import org.json.JSONObject

class CaptureRemoteSettings(private val preferences: SharedPreferences, private val currentDeviceId: () -> String?) {
    fun pausedPackages(): Set<String> {
        val device = currentDeviceId() ?: return emptySet()
        return if (device == preferences.getString("remote-device", null))
            preferences.getStringSet("remote-paused-sources", emptySet()).orEmpty().intersect(CapturePolicy.sources.keys) else emptySet()
    }
    fun apply(binding: CaptureBinding, configuration: JSONObject) {
        // Una consulta antigua nunca cambia las preferencias de una identidad nueva.
        if (binding.deviceId != currentDeviceId()) return
        val values = configuration.optJSONArray("pausedPackages") ?: return
        val paused = (0 until values.length()).map { values.getString(it) }.toSet().intersect(CapturePolicy.sources.keys)
        check(preferences.edit().putString("remote-device", binding.deviceId)
            .putStringSet("remote-paused-sources", paused).commit())
    }
}
