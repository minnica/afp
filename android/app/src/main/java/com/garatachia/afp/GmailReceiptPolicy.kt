package com.garatachia.afp

object GmailReceiptPolicy {
    const val source = "com.google.android.gm"
    private val subject = Regex("(?m)^Tu viaje del [^\\n]{1,120} con Uber(?:\\n|$)")

    // Filter before Room and diagnostics. Gmail's account name is not receipt evidence.
    fun fields(packageName: String, fields: Map<String, String>): Map<String, String>? {
        if (packageName != source) return fields
        if (listOf(fields["android.title"], fields["android.title.big"]).none { it == "Recibos de Uber" }) return null
        if (fields.values.none { subject.containsMatchIn(it.replace('\r', '\n').replace('\u00a0', ' ').replace('\u202f', ' ')) }) return null
        return fields.filterKeys { it in setOf("android.title", "android.title.big", "android.text", "android.bigText") }
    }
}
