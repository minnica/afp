import { captureFields, captureProposal } from './captureJson';
import type { CaptureInterpretation, CaptureNotice, ParseAmount, NotificationDate, OperationTime, CaptureKindInput } from '@/lib/captureTypes';
export const refundParserKeys = ["mercadopago.refund.es.v1", "banamex.purchase-cancellation.es.v1"];

export function refundCaptureKind(movement: CaptureKindInput) {
  return captureProposal(movement.proposal)?.movementType === "REFUND" || refundParserKeys.includes(movement.parserKey ?? "");
}

// Solo gramáticas observadas. $ no aporta tarjeta ni moneda; eso se resuelve
// con la regla aceptada de Mercado Pago o con el respaldo bancario de Banamex.
export function interpretRefundNotice(event: CaptureNotice, parseAmount: ParseAmount, notificationDate: NotificationDate, operationTime: OperationTime): CaptureInterpretation | null {
  const f = captureFields(event.fields ?? {}) || {}, title = f["android.title"] || "", body = f["android.bigText"] || f["android.text"] || "";
  const mercado = event.sourcePackage === "com.mercadopago.wallet" && / te devolvi[oó] /i.test(title);
  const banamex = event.sourcePackage === "com.citibanamex.banamexmobile" && body.startsWith("CANCELADA compra por ");
  if (!mercado && !banamex) return null;
  const parserKey = refundParserKeys[mercado ? 0 : 1]!;
  const base: Omit<CaptureInterpretation, 'reason'> = { parserKey, verified: true, proposal: { movementType: "REFUND", refundKind: mercado ? "REFUND" : "CANCELLATION" } };
  if ((f["android.bigText"] && f["android.text"] && f["android.bigText"] !== f["android.text"])
    || (f["android.title.big"] && f["android.title.big"] !== title)) return { ...base, reason: "CONFLICTING_FIELDS" };
  if (/\b(?:USD|EUR|d[oó]lares|euros)\b|US\$/i.test(Object.values(f).join("\n"))) return { ...base, reason: "FOREIGN_CURRENCY" };
  let amount, merchant, time, printedAlias;
  if (mercado) {
    const m = title.match(/^(.{1,200}) te devolvió \$([\d,.]+)$/);
    if (!m || body !== "Para más detalles, entra aquí.") return { ...base, reason: "INCOMPLETE_FORMAT" };
    merchant = m[1]!.trim(); amount = parseAmount(m[2]!.includes(".") ? m[2]! : `${m[2]!}.00`);
    time = notificationDate(event);
  } else {
    const m = body.match(/^CANCELADA compra por \$ ([\d,.]+) con su tarjeta JOY BANAMEX (\d{3}) en (.{1,200}) el (\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)$/);
    if (!m || title !== "Notificacion") return { ...base, reason: "INCOMPLETE_FORMAT" };
    amount = parseAmount(m[1]!); merchant = m[3]!.trim();
    const h = Number(m[5]!);
    time = h >= 1 && h <= 12 && operationTime(`${m[4]!} ${String(h % 12 + (m[8]! === "PM" ? 12 : 0)).padStart(2, "0")}:${m[6]!}:${m[7]!}`);
    if (time) time = { ...time, dateSource: "BANK_OPERATION" };
    printedAlias = { value: m[2]!, digits: 3 };
    if (time && new Date(time.operationAt).getTime() > new Date(event.receivedAt).getTime() + 300000) time = null;
  }
  if (!amount || !merchant || /[\r\n]/.test(merchant) || !time) return { ...base, reason: "INVALID_FIELDS" };
  return { ...base, reason: "REFUND_REVIEW", proposal: { ...base.proposal, ...time, amount, merchant,
    ...(printedAlias ? { printedAlias, aliasSourcePackage: "com.citibanamex.banamexmobile" } : {}),
    missingFields: ["currency", ...(mercado ? ["card"] : [])] } };
}
