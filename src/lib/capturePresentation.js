export const captureReasons = {
  REFUND_REVIEW: "Devolución o cancelación recibida. Confirma el gasto original antes de descontarla.",
  REFUND_POLICY_REQUIRED: "Falta una regla aceptada para identificar la tarjeta y moneda de esta devolución.",
  REFUND_APPLIED: "Devolución aplicada al gasto. Se conservan el cargo original y el historial.",
  REFUND_REVERSED: "Devolución deshecha por ti; el importe fue restituido al gasto.",
  SERVICE_NOTICE_REVIEW: "Aviso de viaje o pedido guardado para revisar su formato. No genera un gasto automáticamente. Si confirma un cobro final, revisa importe, moneda, fecha y tarjeta o vincúlalo al gasto existente.",
  BANK_FALLBACK_WAIT: "Esperando Wallet: el respaldo bancario podrá registrar después de 15 minutos desde la recepción en AFP.",
  BANK_FALLBACK_REGISTERED: "Registrado desde el banco después de esperar Wallet; pendiente de conciliar.",
  BANK_FALLBACK_PAUSED: "Respaldo detenido. Revisa la regla, Wallet y los permisos de captura antes de resolver este aviso.",
  BANK_FALLBACK_REVIEW: "El aviso o la identificación ya no cumplen la regla de respaldo; revisa sus datos.",
  BANK_FALLBACK_MANUAL_REVIEW: "La revisión personal detuvo la espera automática de este aviso.",
  PAYMENT_AUTOMATIC: "Pago registrado automáticamente con tu regla de pagos.",
  PAYMENT_POLICY_REQUIRED: "Falta una regla de pagos para ese destino o formato.",
  PAYMENT_CYCLE_REQUIRED: "No se pudo identificar un único corte con estado de cuenta; selecciona el período.",
  PAYMENT_MANUAL_TOTAL: "El corte ya tiene pagos manuales; revisa si este abono está incluido.",
  PAYMENT_POSSIBLE_DUPLICATE: "Ya hay un pago de ese importe en fechas cercanas; revisa su evidencia.",
  PAYMENT_EXCESS_REVIEW: "El importe supera el saldo pendiente del corte; requiere revisión.",
  PAYMENT_TOTAL_MISMATCH: "El banco indica pago total, pero el importe no coincide con el saldo pendiente del corte en AFP.",
  PAYMENT_FUTURE: "La fecha de pago es futura; requiere revisión.",
  RECEIPT_UNKNOWN_FORMAT: "Comprobante con formato no reconocido; revisa su contenido.",
  RECEIPT_INCOMPLETE: "No se pudieron leer con certeza los campos del comprobante.",
  RECEIPT_PERIOD_REQUIRED: "Revisa el concepto y el mes del estado de cuenta.",
  PAYMENT_REVIEW: "Pago recibido: confirma tarjeta, moneda, fecha y corte.",
  ACCOUNT_DEBIT_REVIEW: "Salida de dinero de BBVA sin destinatario. Confirma si corresponde a un pago de tarjeta.",
  PAYMENT_REGISTERED: "Abono registrado en el total pagado del corte.",
  PAYMENT_LINKED: "Evidencia de un pago ya incluido en el total; no se sumó otra vez.",
  PAYMENT_REVERSED: "Abono deshecho o evidencia desvinculada; el aviso no se volverá a aplicar.",
  UNKNOWN_FORMAT: "Formato desconocido; necesita una muestra revisada.", INCOMPLETE_FORMAT: "El aviso no incluye todos los datos necesarios.",
  NON_CREDIT_ACCOUNT: "Aviso de cuenta de débito; fuera de la captura de tarjetas de crédito.",
  CONFLICTING_FIELDS: "El aviso contiene textos contradictorios.", INVALID_FIELDS: "Importe o fecha no válidos.", INVALID_CARD_KIND: "No coincide el tipo de tarjeta.",
  SPECIAL_MOVEMENT: "Movimiento especial o aviso sin compra aprobada; requiere revisión.", FOREIGN_CURRENCY: "Moneda distinta de MXN; requiere revisión.",
  FUTURE_OPERATION: "La fecha de operación es posterior a la recepción.", UNKNOWN_CARD: "Falta identificar la tarjeta.", AMBIGUOUS_CARD: "La terminación coincide con varias tarjetas.",
  DATE_POLICY_REQUIRED: "Confirma el uso de la fecha del aviso para habilitar este registro automático.",
  FORMAT_POLICY_REQUIRED: "Falta una regla vigente para asignar tarjeta, moneda y fecha a este formato; Nu/CFE requiere además una suscripción.",
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
  "com.garatachia.afp.paymentreceipts": "Comprobante compartido",
  "com.bancomer.mbanking": "BBVA", "com.google.android.apps.walletnfcrel": "Google Wallet", "mx.hsbc.hsbcmexico": "HSBC",
  "com.citibanamex.banamexmobile": "Banamex", "mx.bancosantander.supermovil": "Santander", "com.nu.production": "Nu",
  "com.didiglobal.cashloan": "DiDi Finanzas", "com.mercadopago.wallet": "Mercado Pago",
  "com.ubercab": "Uber · revisión",
  "com.didiglobal.passenger": "DiDi viajes · revisión",
  "com.ubercab.eats": "Uber Eats · revisión",
};
export const capturePaymentSources = {
  BBVA_RECEIPT: "Comprobante compartido de BBVA",
  NU_NOTICE: "Aviso de pago recibido de Nu",
  BANAMEX_NOTICE: "Depósito SPEI de Banamex",
  MERCADOPAGO_NOTICE: "Pago recibido de Mercado Pago",
};
export function capturePaymentPolicyDescription(policy) {
  if (policy.source === "BBVA_RECEIPT") return `Destino •${policy.destinationLast4}. Comparte el comprobante con AFP después de transferir.`;
  if (policy.source === "BANAMEX_NOTICE") return "MXN y fecha bancaria. Tarjeta por terminación verificada; exige un único corte pendiente.";
  if (policy.source === "MERCADOPAGO_NOTICE") return "MXN y fecha del aviso en México. Asigna el pago total al único corte pendiente de esta tarjeta.";
  return "Se registra al recibir un aviso de pago con un único corte pendiente identificado.";
}
export function captureOrigin(record) {
  const sources = [...new Set((record.captureMovements || []).flatMap(movement => (movement.events || []).map(event => captureSources[event.sourcePackage] || "Aviso")))];
  return sources.length ? `Captura: ${sources.join(" / ")}` : "";
}
