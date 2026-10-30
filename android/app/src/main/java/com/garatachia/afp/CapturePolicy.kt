package com.garatachia.afp

object CapturePolicy {
    val sources = linkedMapOf(
        "com.bancomer.mbanking" to "BBVA México",
        "com.google.android.apps.walletnfcrel" to "Google Wallet",
        "mx.hsbc.hsbcmexico" to "HSBC México",
        "com.citibanamex.banamexmobile" to "Banamex",
        "mx.bancosantander.supermovil" to "Santander México",
        "com.nu.production" to "Nu",
        "com.didiglobal.cashloan" to "DiDi Finanzas",
        "com.mercadopago.wallet" to "Mercado Pago",
        "com.ubercab" to "Uber · revisión",
        "com.didiglobal.passenger" to "DiDi viajes · revisión",
        "com.ubercab.eats" to "Uber Eats · revisión",
        "com.google.android.gm" to "Gmail · recibos de Uber",
    )

    // No usar sources.keys como valor inicial: una actualización no debe activar fuentes nuevas.
    private val initialSources = setOf("com.bancomer.mbanking", "com.google.android.apps.walletnfcrel")
    fun selection(saved: Set<String>?): Set<String> = (saved ?: initialSources).intersect(sources.keys)

    fun accepts(packageName: String, active: Boolean, selected: Set<String>, groupSummary: Boolean) =
        active && !groupSummary && packageName in sources && packageName in selected

    // Conserva únicamente la forma del texto. No pretende producir ejemplos para un analizador.
    fun anonymize(value: String): String = buildString {
        value.codePoints().forEach { point ->
            when {
                Character.isDigit(point) -> append('0')
                Character.isLetter(point) -> append('x')
                Character.isWhitespace(point) -> append(' ')
                point in safePunctuation -> appendCodePoint(point)
                else -> append('·')
            }
        }
    }

    private val safePunctuation = setOf('$'.code, '€'.code, '.'.code, ','.code, ':'.code,
        ';'.code, '-'.code, '/'.code, '('.code, ')'.code, '*'.code, '#'.code, '%'.code)
}
