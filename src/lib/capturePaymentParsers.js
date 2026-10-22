// Formatos contrastados con avisos reales. Los datos ausentes se revisan;
// el paquete de una app no demuestra tarjeta, moneda ni corte.
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function paymentStatementPeriod(concept) {
  const match = typeof concept === "string" && concept.trim().toLowerCase().match(/^estado de cuenta (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: (20\d{2}))?$/);
  return match ? { month: monthNames.indexOf(match[1]) + 1, year: match[2] ? Number(match[2]) : null } : null;
}

export function paymentCaptureKind(movement) {
  const type = movement.proposal?.movementType;
  return ["CARD_PAYMENT", "ACCOUNT_DEBIT"].includes(type) ? type : null;
}

export function interpretPaymentNotice(event, parseAmount, notificationDate) {
  const fields = event.fields || {};
  const body = fields["android.bigText"] || fields["android.text"] || "";
  const title = fields["android.title"] || "";
  if (event.sourcePackage !== "com.nu.production" || !/^Recibimos tu pago por \$/.test(title)) return null;
  const base = { parserKey: "nu.card-payment.es.v1", verified: false,
    proposal: { movementType: "CARD_PAYMENT", merchant: "Pago de tarjeta Nu" } };
  const match = title.match(/^Recibimos tu pago por \$([\d,.]+)$/);
  if ((fields["android.bigText"] && fields["android.text"] && fields["android.bigText"] !== fields["android.text"])
    || (fields["android.title.big"] && fields["android.title.big"] !== title)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const amount = match && parseAmount(match[1]);
  const date = notificationDate(event);
  if (!amount || !date || body !== "¡Muchas gracias! Con tu pago a tiempo mantienes un buen historial y evitas recargos. ¡Sigue así!") {
    return { ...base, reason: "INCOMPLETE_FORMAT" };
  }
  return { ...base, reason: "PAYMENT_REVIEW", proposal: { ...base.proposal, amount, ...date,
    paymentEvidence: "RECEIVER_ACKNOWLEDGEMENT", missingFields: ["card", "currency", "statementPeriod", "operationDate"] } };
}
