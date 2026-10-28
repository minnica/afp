import { captureFields, captureProposal } from './captureJson';
import type { CaptureInterpretation, CaptureNotice, ParseAmount, NotificationDate, OperationTime, CaptureKindInput } from '@/lib/captureTypes';
// Formatos contrastados con avisos reales. Los datos ausentes se revisan;
// el paquete de una app no demuestra tarjeta, moneda ni corte.
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function paymentStatementPeriod(concept: unknown) {
  const match = typeof concept === "string" && concept.trim().toLowerCase().match(/^estado de cuenta (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: (20\d{2}))?$/);
  return match ? { month: monthNames.indexOf(match[1]!) + 1, year: match[2]! ? Number(match[2]!) : null } : null;
}

export function paymentCaptureKind(movement: CaptureKindInput) {
  const type = captureProposal(movement.proposal)?.movementType;
  return ["CARD_PAYMENT", "ACCOUNT_DEBIT"].includes(type ?? "") ? type : null;
}

function conflictingPaymentFields(fields: Record<string, string>) {
  return Boolean((fields["android.bigText"] && fields["android.text"] && fields["android.bigText"] !== fields["android.text"])
    || (fields["android.title.big"] && fields["android.title.big"] !== fields["android.title"]));
}

function banamexPayment(event: CaptureNotice, parseAmount: ParseAmount, notificationDate: NotificationDate, operationTime: OperationTime): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {};
  const body = fields["android.bigText"] || fields["android.text"] || "";
  if (fields["android.title"] !== "Notificacion" || ![body, fields["android.text"] || ""].some(text => text.startsWith("Deposito SPEI "))) return null;
  const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: "banamex.card-payment.es.v1", verified: true,
    proposal: { movementType: "CARD_PAYMENT", merchant: "Pago de tarjeta Banamex" } };
  if (conflictingPaymentFields(fields)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const match = body.match(/^Deposito SPEI (\d{6}) JOY BANAMEX (\d{3}) monto \$([\d,.]+) el (\d{2}\/\d{2}\/\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)\. Auto\. (\d{6})$/);
  if (!match) return { ...base, reason: "INCOMPLETE_FORMAT" };
  const [, bankReference, suffix, rawAmount, printedDay, rawHour, minute, second, meridiem, bankAuthorization] = match as [string, string, string, string, string, string, string, string, string, string];
  const [day, month, year] = printedDay.split("/");
  const hour = Number(rawHour);
  // La muestra bancaria imprime medianoche como 00:xx AM. No aceptar 00 PM
  // ni reinterpretar otras horas contradictorias como un reloj de 24 horas.
  const validHour = (hour === 0 && meridiem === "AM") || (hour >= 1 && hour <= 12);
  const bankHour = String(hour % 12 + (meridiem === "PM" ? 12 : 0)).padStart(2, "0");
  const time = validHour && operationTime(`${day}/${month}/20${year} ${bankHour}:${minute}:${second}`);
  const amount = parseAmount(rawAmount), notification = notificationDate(event);
  if (!time || !amount || !notification) return { ...base, reason: "INVALID_FIELDS" };
  if (new Date(time.operationAt).getTime() > new Date(event.receivedAt).getTime() + 5 * 60000) return { ...base, reason: "FUTURE_OPERATION" };
  return { ...base, reason: "PAYMENT_REVIEW", proposal: { ...base.proposal, ...time, amount,
    dateSource: "BANK_OPERATION", printedAlias: { value: suffix, digits: 3 },
    aliasSourcePackage: "com.citibanamex.banamexmobile", bankReference, bankAuthorization,
    paymentEvidence: "RECEIVER_ACKNOWLEDGEMENT", missingFields: ["currency", "statementPeriod"],
  } };
}

function mercadoPagoPayment(event: CaptureNotice, parseAmount: ParseAmount, notificationDate: NotificationDate): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {}, title = fields["android.title"] || "";
  if (!title.startsWith("Pagaste $ ")) return null;
  const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: "mercadopago.card-payment.es.v1", verified: true,
    proposal: { movementType: "CARD_PAYMENT", merchant: "Pago de tarjeta Mercado Pago" } };
  if (conflictingPaymentFields(fields)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const match = title.match(/^Pagaste \$ ([\d,.]+) a tu tarjeta de crédito$/);
  const body = fields["android.bigText"] || fields["android.text"] || "";
  const amount = match && parseAmount(match[1]!), date = notificationDate(event);
  if (!amount || !date || body !== "¡Cubriste el total y liberaste límite!") return { ...base, reason: "INCOMPLETE_FORMAT" };
  return { ...base, reason: "PAYMENT_REVIEW", proposal: { ...base.proposal, amount, ...date,
    paymentEvidence: "RECEIVER_ACKNOWLEDGEMENT", paymentCoverage: "FULL",
    missingFields: ["card", "currency", "statementPeriod", "operationDate"],
  } };
}

export function interpretPaymentNotice(event: CaptureNotice, parseAmount: ParseAmount, notificationDate: NotificationDate, operationTime: OperationTime): CaptureInterpretation | null {
  if (event.sourcePackage === "com.citibanamex.banamexmobile") return banamexPayment(event, parseAmount, notificationDate, operationTime);
  if (event.sourcePackage === "com.mercadopago.wallet") return mercadoPagoPayment(event, parseAmount, notificationDate);
  const fields = captureFields(event.fields ?? {}) || {};
  const body = fields["android.bigText"] || fields["android.text"] || "";
  const title = fields["android.title"] || "";
  if (event.sourcePackage !== "com.nu.production" || !/^Recibimos tu pago por \$/.test(title)) return null;
  const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: "nu.card-payment.es.v1", verified: false,
    proposal: { movementType: "CARD_PAYMENT", merchant: "Pago de tarjeta Nu" } };
  const match = title.match(/^Recibimos tu pago por \$([\d,.]+)$/);
  if ((fields["android.bigText"] && fields["android.text"] && fields["android.bigText"] !== fields["android.text"])
    || (fields["android.title.big"] && fields["android.title.big"] !== title)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const amount = match && parseAmount(match[1]!);
  const date = notificationDate(event);
  if (!amount || !date || body !== "¡Muchas gracias! Con tu pago a tiempo mantienes un buen historial y evitas recargos. ¡Sigue así!") {
    return { ...base, reason: "INCOMPLETE_FORMAT" };
  }
  return { ...base, reason: "PAYMENT_REVIEW", proposal: { ...base.proposal, amount, ...date,
    paymentEvidence: "RECEIVER_ACKNOWLEDGEMENT", missingFields: ["card", "currency", "statementPeriod", "operationDate"] } };
}
