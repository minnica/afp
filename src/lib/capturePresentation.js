export const captureReasons = {
  UNKNOWN_FORMAT: "Formato desconocido; necesita una muestra revisada.", INCOMPLETE_FORMAT: "El aviso no incluye todos los datos necesarios.",
  NON_CREDIT_ACCOUNT: "Aviso de cuenta de débito; fuera de la captura de tarjetas de crédito.",
  CONFLICTING_FIELDS: "El aviso contiene textos contradictorios.", INVALID_FIELDS: "Importe o fecha no válidos.", INVALID_CARD_KIND: "No coincide el tipo de tarjeta.",
  SPECIAL_MOVEMENT: "Movimiento especial o aviso sin compra aprobada; requiere revisión.", FOREIGN_CURRENCY: "Moneda distinta de MXN; requiere revisión.",
  FUTURE_OPERATION: "La fecha de operación es posterior a la recepción.", UNKNOWN_CARD: "Falta identificar la tarjeta.", AMBIGUOUS_CARD: "La terminación coincide con varias tarjetas.",
  UNVERIFIED_ALIAS: "La terminación aún no está verificada.", UNVERIFIED_FORMAT: "Formato de prueba; faltan muestras reales verificadas.",
  OBSERVATION: "Tarjeta y formato en observación; no se crea un gasto.", POSSIBLE_DUPLICATE: "Hay movimientos con tarjeta, importe y fechas próximos. Revisa si es la misma compra.",
  NOTIFICATION_REVISION: "Posible actualización de un aviso anterior.", REFERENCE_CONFLICT: "La referencia coincide, pero los datos son diferentes.",
  SUBSCRIPTION_CONFLICT: "La suscripción o su cobro mensual necesitan revisión.", SUBSCRIPTION_UNAVAILABLE: "La suscripción no está disponible.",
  RULE_UNAVAILABLE: "La categoría o suscripción de la regla ya no está disponible.", AUTOMATIC: "Gasto registrado por conciliar.",
  USER_DISTINCT: "Registrado como otra compra.", USER_LINKED: "Vinculado al gasto existente; conserva sus correcciones.",
  USER_DISCARDED: "Aviso descartado.", USER_INSTALLMENTS: "El gasto se sustituyó por una compra a meses.",
  USER_LINKED_INSTALLMENT: "Evidencia vinculada a la compra a meses existente; conserva sus correcciones.",
};
export const captureStatuses = { REVIEW: "Por revisar", OBSERVED: "Observación", REGISTERED: "Registrado", LINKED: "Vinculado", DISCARDED: "Descartado", CONVERTED: "A meses" };
export const captureInboxStatuses = { REVIEW: "Por revisar", REGISTERED: "Registrado", RECONCILED: "Conciliado", DISCARDED: "Descartado" };
export const captureSources = {
  "com.bancomer.mbanking": "BBVA", "com.google.android.apps.walletnfcrel": "Google Wallet", "mx.hsbc.hsbcmexico": "HSBC",
  "com.citibanamex.banamexmobile": "Banamex", "mx.bancosantander.supermovil": "Santander", "com.nu.production": "Nu",
  "com.didiglobal.cashloan": "DiDi Finanzas", "com.mercadopago.wallet": "Mercado Pago",
};
export function captureOrigin(record) {
  const sources = [...new Set((record.captureMovements || []).flatMap(movement => (movement.events || []).map(event => captureSources[event.sourcePackage] || "Aviso")))];
  return sources.length ? `Captura: ${sources.join(" / ")}` : "";
}
