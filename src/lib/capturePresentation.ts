export const captureReasons: Record<string, string> = {
  BBVA_PAYMENT_MATCHED: "Pago de tarjeta registrado por coincidencia de saldo pendiente y vencimiento, con hasta $1 de diferencia y un día de margen. Revisa el destino si no corresponde.",
  BBVA_PAYMENT_MATCH_AMBIGUOUS: "El cargo coincide con varias tarjetas. Selecciona a cuál corresponde; todavía no se registró un gasto ni un pago.",
  MONEY_POLICY_REQUIRED: "Configura qué cuentas corresponden a esta transferencia.",
  MONEY_ACCOUNT_REQUIRED: "La cuenta de la regla ya no está disponible. Revisa el movimiento.",
  MONEY_BEFORE_REFERENCE: "El aviso es anterior al saldo de referencia. Comprueba si ya está incluido.",
  MONEY_FUTURE: "La fecha del aviso es futura. Revisa el movimiento.",
  MONEY_OBSERVATION: "Movimiento por revisar. Todavía no cambia tus saldos.",
  MONEY_POSSIBLE_DUPLICATE: "Hay un movimiento cercano con el mismo importe y cuentas. Comprueba si es el mismo.",
  MONEY_REPEATED_NOTICE: "Aviso repetido. Su movimiento ya está registrado.",
  MONEY_TRANSFER_REGISTERED: "Transferencia registrada entre tus cuentas, sin crear ingreso ni gasto.",
  MONEY_WITHDRAWAL_REGISTERED: "Retiro descontado de la cuenta de salida.",
  BBVA_DEBIT_AUTOMATIC: "Cargo BBVA registrado como gasto con débito según tu regla. Puedes cambiar el tipo de movimiento.",
  DEBIT_TYPE_CORRECTED: "Tipo de movimiento corregido. El gasto anterior se sustituyó sin descontar dos veces de tu cuenta.",
  DEBIT_EXPENSE_REGISTERED: "Gasto con débito registrado y descontado de su cuenta.",
  WITHDRAWAL_SAMPLE_REQUIRED: "Primero comprueba este aviso de retiro. Los siguientes podrán usar una regla verificada.",
  REFUND_REVIEW: "Confirma a qué gasto corresponde esta devolución.",
  REFUND_POLICY_REQUIRED: "Falta identificar la tarjeta y la moneda de la devolución.",
  REFUND_APPLIED: "Devolución descontada del gasto original.",
  REFUND_REVERSED: "Devolución deshecha. El importe volvió al gasto.",
  SERVICE_NOTICE_REVIEW: "Aviso de viaje o pedido. Comprueba si confirma un cobro final antes de registrar un gasto.",
  BANK_FALLBACK_WAIT: "Esperando Google Wallet. El banco podrá registrar la compra después de 15 minutos.",
  BANK_FALLBACK_REGISTERED: "Registrado desde el banco al terminar la espera de Wallet.",
  BANK_FALLBACK_PAUSED: "Respaldo bancario pausado. Revisa los datos para registrar esta compra.",
  BANK_FALLBACK_REVIEW: "El aviso necesita revisión antes de usar el respaldo bancario.",
  BANK_FALLBACK_MANUAL_REVIEW: "Revisaste este aviso y se detuvo su registro automático.",
  PAYMENT_AUTOMATIC: "Pago registrado automáticamente.",
  PAYMENT_POLICY_REQUIRED: "Confirma la tarjeta y el estado de cuenta de este pago.",
  PAYMENT_CYCLE_REQUIRED: "Selecciona el estado de cuenta al que corresponde el pago.",
  PAYMENT_MANUAL_TOTAL: "Este estado de cuenta ya tiene pagos. Comprueba si este ya está incluido.",
  PAYMENT_POSSIBLE_DUPLICATE: "Hay un pago cercano del mismo importe. Comprueba si es el mismo.",
  PAYMENT_EXCESS_REVIEW: "El pago supera el saldo pendiente. Comprueba el importe.",
  PAYMENT_TOTAL_MISMATCH: "El banco informa un pago total que no coincide con el saldo de AFP.",
  PAYMENT_FUTURE: "La fecha de pago es futura; requiere revisión.",
  RECEIPT_UNKNOWN_FORMAT: "Comprobante con formato no reconocido; revisa su contenido.",
  RECEIPT_INCOMPLETE: "No se pudieron leer con certeza los campos del comprobante.",
  RECEIPT_PERIOD_REQUIRED: "Revisa el concepto y el mes del estado de cuenta.",
  PAYMENT_REVIEW: "Confirma tarjeta, importe, fecha y estado de cuenta.",
  ACCOUNT_DEBIT_REVIEW: "BBVA informa una salida de dinero. Identifica si fue gasto, retiro o pago de tarjeta.",
  PAYMENT_REGISTERED: "Pago sumado al estado de cuenta.",
  PAYMENT_LINKED: "Aviso vinculado a un pago que ya registraste.",
  PAYMENT_REVERSED: "Pago deshecho o aviso desvinculado.",
  UNKNOWN_FORMAT: "AFP no pudo identificar un movimiento de dinero.", INCOMPLETE_FORMAT: "El aviso no incluye todos los datos necesarios.",
  NON_CREDIT_ACCOUNT: "Aviso de cuenta de débito; fuera de la captura de tarjetas de crédito.",
  CONFLICTING_FIELDS: "El aviso contiene textos contradictorios.", INVALID_FIELDS: "Importe o fecha no válidos.", INVALID_CARD_KIND: "No coincide el tipo de tarjeta.",
  SPECIAL_MOVEMENT: "Movimiento especial o aviso sin compra aprobada; requiere revisión.", FOREIGN_CURRENCY: "Moneda distinta de MXN; requiere revisión.",
  FUTURE_OPERATION: "La fecha de operación es posterior a la recepción.", UNKNOWN_CARD: "Falta identificar la tarjeta.", AMBIGUOUS_CARD: "La terminación coincide con varias tarjetas.",
  DATE_POLICY_REQUIRED: "Activa el uso de la fecha del aviso en Ajustes.",
  FORMAT_POLICY_REQUIRED: "Falta configurar la tarjeta y moneda de este aviso en Ajustes.",
  UNVERIFIED_ALIAS: "La terminación aún no está verificada.", UNVERIFIED_FORMAT: "Falta comprobar este tipo de aviso con una compra real.",
  OBSERVATION: "Registro automático pausado para este tipo de aviso.", POSSIBLE_DUPLICATE: "Hay movimientos con tarjeta, importe y fechas próximos. Revisa si es la misma compra.",
  NOTIFICATION_REVISION: "Posible actualización de un aviso anterior.", REFERENCE_CONFLICT: "La referencia coincide, pero los datos son diferentes.",
  SUBSCRIPTION_CONFLICT: "La suscripción o su cobro mensual necesitan revisión.", SUBSCRIPTION_UNAVAILABLE: "La suscripción no está disponible.",
  RULE_UNAVAILABLE: "La categoría o suscripción de la regla ya no está disponible.", AUTOMATIC: "Gasto registrado. Falta comprobarlo en el estado de cuenta.",
  USER_DISTINCT: "Registrado como otra compra.", USER_LINKED: "Aviso vinculado a un gasto existente.",
  USER_DISCARDED: "Aviso descartado.", USER_INSTALLMENTS: "El gasto se sustituyó por una compra a meses.",
  USER_LINKED_INSTALLMENT: "Aviso vinculado a una compra a meses.",
};
export const captureStatuses: Record<string, string> = { REVIEW: "Por revisar", OBSERVED: "Observación", REGISTERED: "Registrado", LINKED: "Vinculado", DISCARDED: "Descartado", CONVERTED: "A meses" };
export const captureInboxStatuses: Record<string, string> = { REVIEW: "Por revisar", REGISTERED: "Registrado", RECONCILED: "Conciliado", DISCARDED: "Descartado" };
export const captureSources: Record<string, string> = {
  "com.garatachia.afp.paymentreceipts": "Comprobante compartido",
  "com.bancomer.mbanking": "BBVA", "com.google.android.apps.walletnfcrel": "Google Wallet", "mx.hsbc.hsbcmexico": "HSBC",
  "com.citibanamex.banamexmobile": "Banamex", "mx.bancosantander.supermovil": "Santander", "com.nu.production": "Nu",
  "com.didiglobal.cashloan": "DiDi Finanzas", "com.mercadopago.wallet": "Mercado Pago",
  "com.ubercab": "Uber",
  "com.didiglobal.passenger": "DiDi viajes",
  "com.ubercab.eats": "Uber Eats",
};
export const capturePaymentSources: Record<string, string> = {
  BBVA_RECEIPT: "Comprobante compartido de BBVA",
  NU_NOTICE: "Aviso de pago recibido de Nu",
  BANAMEX_NOTICE: "Depósito SPEI de Banamex",
  MERCADOPAGO_NOTICE: "Pago recibido de Mercado Pago",
};
export function capturePaymentPolicyDescription(policy: { source: string; destinationLast4?: string | null }) {
  if (policy.source === "BBVA_RECEIPT") return `Cuenta de destino •${policy.destinationLast4}. Comparte el comprobante con AFP después de pagar.`;
  if (policy.source === "BANAMEX_NOTICE") return "Usa la terminación de la tarjeta, MXN y la fecha bancaria. Requiere un único estado de cuenta pendiente.";
  if (policy.source === "MERCADOPAGO_NOTICE") return "Asigna el pago total al único estado de cuenta pendiente, en MXN y con la fecha del aviso.";
  return "Registra el pago si hay un único estado de cuenta pendiente.";
}
export function captureOrigin(record: { captureMovements?: { events?: { sourcePackage: string }[] }[] }) {
  const sources = [...new Set((record.captureMovements || []).flatMap(movement => (movement.events || []).map(event => captureSources[event.sourcePackage] || "Aviso")))];
  return sources.length ? `Detectado por ${sources.join(" / ")}` : "";
}
