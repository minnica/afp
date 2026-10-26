package com.garatachia.afp

import org.json.JSONObject

data class ImportantNotice(val key: String, val title: String, val body: String, val path: String)

object ImportantNoticePolicy {
    private val paths = setOf("/dashboard", "/tarjetas", "/gastos", "/ingresos")

    fun parse(response: JSONObject, binding: CaptureBinding): List<ImportantNotice> {
        require(response.getInt("version") == 1)
        require(binding.ownerId != null && response.getString("ownerId") == binding.ownerId)
        require(binding.deviceId != null && response.getString("deviceId") == binding.deviceId)
        val rows = response.getJSONArray("notices")
        return (0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index)
            ImportantNotice(row.getString("key"), row.getString("title"), row.getString("body"), row.getString("path")).also {
                require(it.key.matches(Regex("[a-f0-9]{64}")))
                require(it.title.isNotBlank() && it.title.length <= 500 && it.body.length <= 2000)
                require(it.path in paths)
            }
        }.also { notices -> require(notices.map { it.key }.toSet().size == notices.size) }
    }

    fun pending(notices: List<ImportantNotice>, delivered: Set<String>, displayed: Set<String> = emptySet()) =
        notices.filter { it.key !in delivered || it.key in displayed }
}
