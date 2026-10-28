import { captureFields } from './captureJson';
import type { CaptureInterpretation, CaptureNotice } from '@/lib/captureTypes';
import { captureHash } from "@/lib/captureProtocol";
import { paymentStatementPeriod } from "@/lib/capturePaymentParsers";

export const paymentReceiptSource = "com.garatachia.afp.paymentreceipts";
const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const normalized = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
  // Variante OCR observada en la etiqueta; no modifica cuentas ni referencias.
  .replace(/\bclave de rastre0\b/g, "clave de rastreo");
export function validClabe(value: string | undefined): value is string {
  if (typeof value !== "string" || !/^\d{18}$/.test(value)) return false;
  return (10 - [...value.slice(0, 17)].reduce((sum, digit, i) => sum + Number(digit) * [3, 7, 1][i % 3]! % 10, 0) % 10) % 10 === Number(value[17]);
}
// Se conservan las etiquetas y el texto original; jamás se corrigen dígitos OCR.
export function parsePaymentReceipt(event: CaptureNotice): CaptureInterpretation {
  const original = captureFields(event.fields ?? {})?.["receipt.text"] || "";
  const text = normalized(original);
  const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: "bbva.transfer-receipt.es.v1", verified: true, proposal: { movementType: "CARD_PAYMENT", merchant: "Comprobante de transferencia BBVA" } };
  const fail = (reason: string) => ({ ...base, reason });
  if (!/\bbbva\b/.test(text) || !text.includes("comprobante de la operacion") || !text.includes("transferencia a otros bancos")) return fail("RECEIPT_UNKNOWN_FORMAT");
  const extract = (a: string, b: string) => text.match(new RegExp(`${a}\\s+(.+?)\\s+${b}`))?.[1]?.trim();
  const source = extract("cuenta origen", "nombre del beneficiario")?.replace(/\s/g, "");
  const destination = extract("cuenta destino", "banco destino")?.replace(/\s/g, "");
  const concept = extract("concepto", "fecha de operacion");
  const rawDate = extract("fecha de operacion", "fecha de aplicacion");
  const tracking = extract("clave de rastreo", "referencia")?.replace(/\s/g, "").toUpperCase();
  const rawAmount = extract("importe", "nombre del ordenante")?.match(/^\$\s*-\s*(\d{1,10}(?:,\d{3})*\.\d{2})$/)?.[1];
  const application = extract("fecha de aplicacion", "clave de rastreo");
  const date = rawDate?.match(/^(\d{1,2}) (?:de )?([a-z]+) (?:de )?(20\d{2}),? (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!validClabe(source) || !validClabe(destination) || !tracking || !/^[A-Z0-9]{15,40}$/.test(tracking)
    || !rawAmount || !date || !/^(20\d{2}-\d{2}-\d{2})t\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?[+-]\d{2}:\d{2}$/.test(application || "")) return fail("RECEIPT_INCOMPLETE");
  const month = months.indexOf(date[2]!) + 1;
  const day = `${date[3]!}-${String(month).padStart(2, "0")}-${date[1]!.padStart(2, "0")}`;
  const parsedDay = new Date(`${day}T12:00:00Z`);
  const appliedAt = new Date(application!.replace("t", "T"));
  const appliedDay = Number.isFinite(appliedAt.getTime()) && new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City" }).format(appliedAt);
  if (!month || !Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day || appliedDay !== day
    || Number(date[4]!) > 23 || Number(date[5]!) > 59 || Number(date[6]! || 0) > 59 || Number(rawAmount.replaceAll(",", "")) <= 0) return fail("RECEIPT_INCOMPLETE");
  const statement = paymentStatementPeriod(concept);
  return { ...base, reason: statement ? "PAYMENT_RECEIPT" : "RECEIPT_PERIOD_REQUIRED", proposal: { ...base.proposal,
    amount: rawAmount.replaceAll(",", ""), date: day, dateSource: "BANK_OPERATION", appliedAt: appliedAt.toISOString(),
    statementConcept: concept, statementMonth: statement?.month || null, statementYear: statement?.year || null,
    destinationLast4: destination.slice(-4), destinationHash: captureHash(destination), sourceAccountHash: captureHash(source),
    transferReference: tracking, paymentEvidence: "SHARED_BANK_RECEIPT", currencySource: "OWNER_PAYMENT_POLICY",
  } };
}
