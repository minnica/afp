import { interpretIncomeNotice } from './captureIncomeParsers';
import { captureFields } from './captureJson';
import type { CaptureInterpretation, CaptureParser, CaptureNotice } from '@/lib/captureTypes';
// Los formatos de arranque son SINTÉTICOS. verified acredita la gramática real
// anonimizada y sus regresiones; los campos ausentes nunca se inventan. Nu/CFE
// solo se completa mediante la regla expresa de tarjeta, moneda y suscripción.
import { interpretPaymentNotice } from "@/lib/capturePaymentParsers";
import { parsePaymentReceipt, paymentReceiptSource } from "@/lib/paymentReceipts";
import { reviewOnlyCapturePackages } from "@/lib/captureSourcePolicy";
import { bankCapturePackages, gmailCapturePackage } from './captureSourcePolicy';
import { parseGmailUberReceipt, uberReceiptParserKey } from './gmailUberReceipts';
import { interpretMoneyNotice, interpretBbvaAccountCharge } from "@/lib/captureMoneyParsers";
import { interpretRefundNotice } from "@/lib/captureRefundParsers";

export const captureParsers: CaptureParser[] = [
  { key: "bbva.payroll.es.v1", sourcePackage: "com.bancomer.mbanking", verified: true, evidence: "REAL_REVIEWED_PARTIAL", incomeOnly: true },
  { key: "bbva.account-deposit.es.v1", sourcePackage: "com.bancomer.mbanking", verified: false, evidence: "AWAITING_REAL_NOTICE", incomeOnly: true },
  { key: uberReceiptParserKey, sourcePackage: gmailCapturePackage, verified: true, evidence: 'REAL_REVIEWED',
    aliasSourcePackages: bankCapturePackages, aliasKinds: ['PHYSICAL', 'DIGITAL'], dateSource: 'RECEIPT_OPERATION' },
  { key: "nu.account-transfer.es.v1", sourcePackage: "com.nu.production", verified: true, evidence: "REAL_REVIEWED", moneyOnly: true },
  { key: "bbva.atm-withdrawal.es.v1", sourcePackage: "com.bancomer.mbanking", verified: false, evidence: "AWAITING_REAL_NOTICE", moneyOnly: true },
  { key: "mercadopago.refund.es.v1", sourcePackage: "com.mercadopago.wallet", verified: true, evidence: "REAL_REVIEWED", refundOnly: true },
  { key: "banamex.purchase-cancellation.es.v1", sourcePackage: "com.citibanamex.banamexmobile", verified: true, evidence: "REAL_REVIEWED", refundOnly: true,
    aliasKinds: ["PHYSICAL", "DIGITAL"], aliasSourcePackage: "com.citibanamex.banamexmobile" },
  { key: "bbva.purchase.es.v1", sourcePackage: "com.bancomer.mbanking", title: "Compra aprobada", verified: false },
  { key: "wallet.purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", title: "Pago realizado", verified: false },
  { key: "bbva.account-charge.es.v1", sourcePackage: "com.bancomer.mbanking", verified: false, evidence: "REAL_OUT_OF_SCOPE" },
  { key: "nu.card-payment.es.v1", sourcePackage: "com.nu.production", verified: false, evidence: "REAL_REVIEWED_PARTIAL", paymentOnly: true },
  { key: "banamex.card-payment.es.v1", sourcePackage: "com.citibanamex.banamexmobile", verified: true, evidence: "REAL_REVIEWED_POLICY_REQUIRED", paymentOnly: true,
    aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "BANK_OPERATION" },
  { key: "mercadopago.card-payment.es.v1", sourcePackage: "com.mercadopago.wallet", verified: true, evidence: "REAL_REVIEWED_POLICY_REQUIRED", paymentOnly: true,
    dateSource: "NOTIFICATION_POSTED_AT" },
  { key: "bbva.debit-card-charge.es.v1", sourcePackage: "com.bancomer.mbanking", verified: false, evidence: "REAL_OUT_OF_SCOPE", paymentOnly: true },
  { key: "bbva.transfer-receipt.es.v1", sourcePackage: paymentReceiptSource, verified: true, evidence: "REAL_REVIEWED", paymentOnly: true },
  { key: "nu.cfe-service-payment.es.v1", sourcePackage: "com.nu.production", verified: false, evidence: "REAL_REVIEWED_PARTIAL" },
  { key: "nu.cfe-service-payment.es.v2", sourcePackage: "com.nu.production", verified: true, evidence: "REAL_REVIEWED_POLICY_REQUIRED",
    completionPolicy: "NU_CFE_MXN", policyRequiresSubscription: true, dateSource: "NOTIFICATION_POSTED_AT" },
  { key: "mercadopago.card-purchase.es.v1", sourcePackage: "com.mercadopago.wallet", verified: true, evidence: "REAL_REVIEWED_POLICY_REQUIRED",
    completionPolicy: "MERCADOPAGO_CREDIT_MXN", dateSource: "NOTIFICATION_POSTED_AT" },
  { key: "wallet.nu-purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", verified: true, evidence: "REAL_REVIEWED",
    aliasSourcePackage: "com.nu.production", aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "NOTIFICATION_POSTED_AT" },
  { key: "wallet.bbva-purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", verified: true, evidence: "REAL_REVIEWED",
    aliasSourcePackage: "com.bancomer.mbanking", aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "NOTIFICATION_POSTED_AT", rejectCrossBankAliasCollision: true },
  { key: "nu.card-purchase.es.v1", sourcePackage: "com.nu.production", verified: false, evidence: "REAL_REVIEWED_PARTIAL",
    aliasKinds: ["PHYSICAL", "DIGITAL"], evidenceOnly: true },
  { key: "wallet.banamex-purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", verified: true, evidence: "REAL_REVIEWED",
    aliasSourcePackage: "com.citibanamex.banamexmobile", aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "NOTIFICATION_POSTED_AT" },
  { key: "banamex.card-charge.es.v1", sourcePackage: "com.citibanamex.banamexmobile", verified: false, evidence: "REAL_REVIEWED_PARTIAL",
    aliasSourcePackage: "com.citibanamex.banamexmobile", aliasKinds: ["PHYSICAL", "DIGITAL"], evidenceOnly: true },
  { key: "banamex.joy-card-charge.es.v1", sourcePackage: "com.citibanamex.banamexmobile", verified: false, evidence: "REAL_REVIEWED_PARTIAL",
    aliasSourcePackage: "com.citibanamex.banamexmobile", aliasKinds: ["PHYSICAL", "DIGITAL"], evidenceOnly: true },
  { key: "santander.card-purchase.es.v1", sourcePackage: "mx.bancosantander.supermovil", verified: true, evidence: "REAL_REVIEWED",
    aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "BANK_OPERATION" },
  { key: "wallet.santander-purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", verified: false, evidence: "REAL_REVIEWED_PARTIAL",
    aliasSourcePackage: "mx.bancosantander.supermovil", aliasKinds: ["PHYSICAL", "DIGITAL"], evidenceOnly: true },
  { key: "wallet.santander-purchase.es.v2", sourcePackage: "com.google.android.apps.walletnfcrel", verified: true, evidence: "REAL_REVIEWED",
    aliasSourcePackage: "mx.bancosantander.supermovil", aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "NOTIFICATION_POSTED_AT", nonBlockingInObservation: true },
  { key: "wallet.didi-purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", verified: true, evidence: "REAL_REVIEWED",
    aliasSourcePackage: "com.didiglobal.cashloan", aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "NOTIFICATION_POSTED_AT" },
];

export function normalizeMerchant(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function captureAmount(value: unknown) {
  if (typeof value !== "string" || !/^(?:\d{1,10}|\d{1,3}(?:,\d{3}){1,3})\.\d{2}$/.test(value)) return null;
  const digits = value.replaceAll(",", "").replace(".", "");
  const cents = BigInt(digits);
  if (cents <= 0n || cents > 999999999999n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

const mexicoClock = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export function captureOperationTime(value: string | undefined) {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match as [string, string, string, string, string, string, string];
  if (Number(year) < 2000 || Number(year) > 2100) return null;
  const local = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  const base = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  // México ha tenido horario de verano: rechazar horas inexistentes o repetidas.
  const matches = [-360, -300].map(offset => new Date(base - offset * 60000))
    .filter(date => mexicoClock.format(date) === local);
  return matches.length === 1 ? { operationAt: matches[0]!.toISOString(), date: local.slice(0, 10), timeZone: "America/Mexico_City" } : null;
}

function conflictingBodies(fields: Record<string, string>) {
  return Boolean((fields["android.bigText"] && fields["android.text"] && fields["android.bigText"] !== fields["android.text"])
    || (fields["android.title.big"] && fields["android.title"] && fields["android.title.big"] !== fields["android.title"]));
}

export function captureNotificationDate(event: CaptureNotice) {
  const posted = new Date(event.postedAt), received = new Date(event.receivedAt);
  if (!Number.isFinite(posted.getTime()) || !Number.isFinite(received.getTime())
    || posted.getUTCFullYear() < 2000 || posted.getUTCFullYear() > 2100
    || posted.getTime() > received.getTime() + 5 * 60000) return null;
  return { date: mexicoClock.format(posted).slice(0, 10), notificationAt: posted.toISOString(),
    dateSource: "NOTIFICATION_POSTED_AT", timeZone: "America/Mexico_City" };
}

function realWalletPurchase(event: CaptureNotice): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {}, body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^(MXN|USD|EUR)([\d,.]+) con (Joy Banamex|DIDI Credit Card|Nu Mastercard Gold|TDC Platinum) ••(\d{4})$/);
  if (!match) return null;
  const [parserKey, aliasSourcePackage] = {
    "DIDI Credit Card": ["wallet.didi-purchase.es.v1", "com.didiglobal.cashloan"],
    "Joy Banamex": ["wallet.banamex-purchase.es.v1", "com.citibanamex.banamexmobile"],
    "Nu Mastercard Gold": ["wallet.nu-purchase.es.v1", "com.nu.production"],
    "TDC Platinum": ["wallet.bbva-purchase.es.v1", "com.bancomer.mbanking"],
  }[match[3]! as "DIDI Credit Card" | "Joy Banamex" | "Nu Mastercard Gold" | "TDC Platinum"]!;
  if (conflictingBodies(fields)) return { parserKey, verified: true, reason: "CONFLICTING_FIELDS", proposal: {} };
  const merchant = fields["android.title"];
  const amount = captureAmount(match[2]!), date = captureNotificationDate(event);
  if (!amount || !date || typeof merchant !== "string" || !merchant.trim() || merchant.length > 200 || /[\r\n]/.test(merchant)) {
    return { parserKey, verified: true, reason: "INVALID_FIELDS", proposal: {} };
  }
  return { parserKey, verified: true, reason: match[1]! === "MXN" ? "PURCHASE" : "FOREIGN_CURRENCY", proposal: {
    ...date, amount, currency: match[1]!, merchant: merchant.trim(),
    // Wallet muestra la terminación del título, no el token de pagos NFC.
    printedAlias: { value: match[4]!, digits: 4 }, aliasSourcePackage, reference: null,
  } };
}

function realBanamexCharge(event: CaptureNotice): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {}, body = fields["android.bigText"] || fields["android.text"] || "";
  const additional = body.match(/^Retiro\/Compra (.{1,200}) -\s+ADICIONAL (\d{3}) monto \$\s*([\d,.]+) el (\d{2}\/\d{2}\/\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)\. Auto\. (\d{6})$/);
  const match = additional || body.match(/^Retiro\/Compra (.{1,200}) JOY BANAMEX(\d{3}) monto \$([\d,.]+) el (\d{2}\/\d{2}\/\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)\. Auto\. (\d{6})$/);
  if (!match) return null;
  const parserKey = additional ? "banamex.card-charge.es.v1" : "banamex.joy-card-charge.es.v1";
  if (conflictingBodies(fields)) return { parserKey, verified: false, reason: "CONFLICTING_FIELDS", proposal: {} };
  const [, merchant, suffix, rawAmount, printedDay, rawHour, minute, second, meridiem, authorization] = match as [string, string, string, string, string, string, string, string, string, string];
  const [day, month, year] = printedDay.split("/");
  const hour = Number(rawHour);
  const time = hour >= 1 && hour <= 12 && captureOperationTime(`${day}/${month}/20${year} ${String(hour % 12 + (meridiem === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}:${second}`);
  const amount = captureAmount(rawAmount);
  if (!time || !amount || !merchant.trim() || /[\r\n]/.test(merchant)) return { parserKey, verified: false, reason: "INVALID_FIELDS", proposal: {} };
  if (new Date(time.operationAt).getTime() > new Date(event.receivedAt).getTime() + 5 * 60000) {
    return { parserKey, verified: false, reason: "FUTURE_OPERATION", proposal: {} };
  }
  // «Retiro/Compra» no distingue por sí solo un retiro de una compra; $ tampoco
  // fija MXN. La autorización abreviada no se usa como referencia global única.
  return { parserKey, verified: false, reason: "INCOMPLETE_FORMAT", proposal: {
    ...time, dateSource: "BANK_OPERATION", amount, merchant: merchant.trim(), movementType: "CARD_CHARGE",
    printedAlias: { value: suffix, digits: 3 }, aliasSourcePackage: "com.citibanamex.banamexmobile",
    bankAuthorization: authorization, missingFields: ["currency", "purchaseType"], evidenceOnly: true,
  } };
}

function realSantanderPurchase(event: CaptureNotice): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {};
  if (fields["android.title"] !== "Compra con tarjeta") return null;
  const body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^En (.{1,200}) por \$\$([\d,.]+) (MXN|USD|EUR) con tarjeta de credito \*\*(\d{4}), el (\d{2}\/\d{2}\/\d{4}) a las (\d{2}:\d{2}:\d{2}) hrs\.$/);
  if (!match) return null;
  const parserKey = "santander.card-purchase.es.v1";
  if (conflictingBodies(fields)) return { parserKey, verified: true, reason: "CONFLICTING_FIELDS", proposal: {} };
  const [, merchant, rawAmount, currency, suffix, day, clock] = match as [string, string, string, string, string, string, string];
  const amount = captureAmount(rawAmount), time = captureOperationTime(`${day} ${clock}`);
  const received = new Date(event.receivedAt).getTime();
  if (!amount || !time || !merchant.trim() || /[\r\n]/.test(merchant) || !Number.isFinite(received)) {
    return { parserKey, verified: true, reason: "INVALID_FIELDS", proposal: {} };
  }
  if (new Date(time.operationAt).getTime() > received + 5 * 60000) return { parserKey, verified: true, reason: "FUTURE_OPERATION", proposal: {} };
  return { parserKey, verified: true, reason: currency === "MXN" ? "PURCHASE" : "FOREIGN_CURRENCY", proposal: {
    ...time, dateSource: "BANK_OPERATION", amount, currency, merchant: merchant.trim(),
    printedAlias: { value: suffix, digits: 4 }, aliasSourcePackage: "mx.bancosantander.supermovil", reference: null,
  } };
}

function realWalletSantanderPurchase(event: CaptureNotice): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {}, body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^(MXN|USD|EUR)([\d,.]+) con Santander LikeU ••(\d{4})$/);
  if (!match) return null;
  const parserKey = "wallet.santander-purchase.es.v2";
  if (conflictingBodies(fields)) return { parserKey, verified: true, reason: "CONFLICTING_FIELDS", proposal: {} };
  const merchant = fields["android.title"], amount = captureAmount(match[2]!), notification = captureNotificationDate(event);
  if (!amount || !notification || typeof merchant !== "string" || !merchant.trim() || merchant.length > 200 || /[\r\n]/.test(merchant)) {
    return { parserKey, verified: true, reason: "INVALID_FIELDS", proposal: {} };
  }
  // La fecha del aviso es una política explícita por tarjeta/formato; nunca se
  // presenta como fecha bancaria. La v1 histórica conserva su evidencia parcial.
  return { parserKey, verified: true, reason: match[1]! === "MXN" ? "PURCHASE" : "FOREIGN_CURRENCY", proposal: {
    ...notification,
    amount, currency: match[1]!, merchant: merchant.trim(), printedAlias: { value: match[3]!, digits: 4 },
    aliasSourcePackage: "mx.bancosantander.supermovil", reference: null,
  } };
}

function realNuPurchase(event: CaptureNotice): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {}, title = fields["android.title"]?.match(/^Compra aprobada por \$([\d,.]+)$/);
  if (!title) return null;
  const parserKey = "nu.card-purchase.es.v1", base: Omit<CaptureInterpretation, 'reason'> = { parserKey, verified: false, proposal: {} };
  if (conflictingBodies(fields)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^Compraste en (.{1,200}) con tu tarjeta con terminación (\d{4}) por \$([\d,.]+)\.$/);
  if (!match) return { ...base, reason: "INCOMPLETE_FORMAT" };
  const amount = captureAmount(match[3]!), notification = captureNotificationDate(event);
  if (!amount || !captureAmount(title[1]!) || !notification || !match[1]!.trim()) return { ...base, reason: "INVALID_FIELDS" };
  if (amount !== captureAmount(title[1]!)) return { ...base, reason: "CONFLICTING_FIELDS" };
  return { ...base, reason: "INCOMPLETE_FORMAT", proposal: { amount, merchant: match[1]!.trim(),
    printedAlias: { value: match[2]!, digits: 4 }, aliasSourcePackage: "com.nu.production",
    notificationAt: notification.notificationAt, timeZone: notification.timeZone,
    evidenceOnly: true, missingFields: ["currency", "operationDate"],
  } };
}

function realMercadoPagoPurchase(event: CaptureNotice): CaptureInterpretation | null {
  const fields = captureFields(event.fields ?? {}) || {}, title = fields["android.title"]?.match(/^Compra por \$ ([\d,.]+) fue aprobada$/);
  if (!title) return null;
  const parserKey = "mercadopago.card-purchase.es.v1", base: Omit<CaptureInterpretation, 'reason'> = { parserKey, verified: false, proposal: {} };
  if (conflictingBodies(fields)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const match = (fields["android.bigText"] || fields["android.text"] || "").match(/^Ve los detalles de tu compra en (.{1,200}) aquí\.$/);
  if (!match) return { ...base, reason: "INCOMPLETE_FORMAT" };
  // La muestra admite pesos enteros. Los centavos, cuando estén impresos,
  // deben tener dos cifras; no redondear ni interpretar separadores ambiguos.
  const amount = captureAmount(title[1]!.includes(".") ? title[1]! : `${title[1]!}.00`);
  if (!amount || !match[1]!.trim()) return { ...base, reason: "INVALID_FIELDS" };
  if (/\b(?:USD|EUR|d[oó]lares|euros)\b|US\$/i.test(Object.values(fields).join("\n"))) return { ...base, reason: "FOREIGN_CURRENCY" };
  return { ...base, reason: "FORMAT_POLICY_REQUIRED", proposal: { amount, merchant: match[1]!.trim(),
    missingFields: ["currency", "card", "operationDate"],
  } };
}

export function interpretCapture(event: CaptureNotice): CaptureInterpretation {
  if (event.sourcePackage === gmailCapturePackage) return parseGmailUberReceipt(event, captureAmount, captureOperationTime);
  if (event.sourcePackage === paymentReceiptSource) return parsePaymentReceipt(event);
  // Fuente habilitada para reunir evidencia real. Un aviso de viaje no acredita
  // un cobro final ni su tarjeta; no aplicar gramáticas bancarias a este paquete.
  if (reviewOnlyCapturePackages.includes(event.sourcePackage)) return { reason: "SERVICE_NOTICE_REVIEW", proposal: {} };
  const income = interpretIncomeNotice(event, captureAmount, captureNotificationDate);
  if (income) return income;
  const money = interpretMoneyNotice(event, captureAmount, captureNotificationDate);
  if (money) return money;
  const refund = interpretRefundNotice(event, captureAmount, captureNotificationDate, captureOperationTime);
  if (refund) return refund;
  const texts = Object.values(captureFields(event.fields ?? {}) || {}).join("\n");
  if (/\b(MSI|meses sin intereses|preautorizaci[oó]n|retenci[oó]n|devoluci[oó]n|reembolso|cancelaci[oó]n|abono|rechazad[ao]|promoci[oó]n|c[oó]digo de (?:acceso|verificaci[oó]n)|env[ií]o|pedido recibido)\b/i.test(texts)) {
    return { reason: "SPECIAL_MOVEMENT", proposal: {} };
  }
  const payment = interpretPaymentNotice(event, captureAmount, captureNotificationDate, captureOperationTime);
  if (payment) return payment;
  if (event.sourcePackage === "com.nu.production") {
    const real = realNuPurchase(event);
    if (real) return real;
  }
  if (event.sourcePackage === "com.mercadopago.wallet") {
    const real = realMercadoPagoPurchase(event);
    if (real) return real;
  }
  if (event.sourcePackage === "com.google.android.apps.walletnfcrel") {
    const real = realWalletPurchase(event) || realWalletSantanderPurchase(event);
    if (real) return real;
  }
  if (event.sourcePackage === "mx.bancosantander.supermovil") {
    const real = realSantanderPurchase(event);
    if (real) return real;
  }
  if (event.sourcePackage === "com.citibanamex.banamexmobile") {
    const real = realBanamexCharge(event);
    if (real) return real;
  }
  // Prefijo observado y confirmado por el propietario como transferencia de
  // débito. No vincular su terminación con los alias de tarjetas de crédito.
  if (event.sourcePackage === "com.bancomer.mbanking") {
    const body = captureFields(event.fields ?? {})?.["android.bigText"] || captureFields(event.fields ?? {})?.["android.text"] || "";
    // Evidencia de salida con débito: el descriptor comercial no identifica una
    // tarjeta de crédito receptora ni confirma que el abono haya sido aplicado.
    if (captureFields(event.fields ?? {})?.["android.title"] === "Compra con TDD" && [body, captureFields(event.fields ?? {})["android.text"] || ""].some(text => text.startsWith("Compra con TDD "))) {
      const base: Omit<CaptureInterpretation, 'reason'> = { parserKey: "bbva.debit-card-charge.es.v1", verified: false, proposal: {} };
      if (conflictingBodies(captureFields(event.fields ?? {}))) return { ...base, reason: "CONFLICTING_FIELDS" };
      const debit = body.match(/^Compra con TDD (\d{4}) en MERPAGO\*TARJETADE \$([\d,.]+) (\d{1,2}) ([a-z]+) (\d{2}):(\d{2})h$/);
      const amount = debit && captureAmount(debit[2]!), date = captureNotificationDate(event);
      if (!amount || !date) return { ...base, reason: "INCOMPLETE_FORMAT" };
      return { ...base, reason: "ACCOUNT_DEBIT_REVIEW", proposal: { movementType: "ACCOUNT_DEBIT",
        merchant: "Cargo con débito BBVA", amount, ...date, sourceMerchant: "MERPAGO*TARJETADE",
        paymentEvidence: "SOURCE_DEBIT_ONLY", missingFields: ["destination", "card", "currency", "statementPeriod", "operationDate"],
      } };
    }
    const accountCharge = interpretBbvaAccountCharge(event, captureAmount, captureNotificationDate);
    if (accountCharge) return accountCharge;
  }
  // Muestra real confirmada como pago CFE desde Nu. El símbolo $ no fija la
  // moneda; publicación/recepción no sustituyen la fecha de operación y el
  // paquete Nu no identifica una tarjeta. Conservar lo disponible para revisión.
  if (event.sourcePackage === "com.nu.production" && captureFields(event.fields ?? {})?.["android.title"] === "Tu pago a CFE fue exitoso") {
    const parserKey = "nu.cfe-service-payment.es.v2";
    const body = captureFields(event.fields ?? {})["android.bigText"] || captureFields(event.fields ?? {})["android.text"] || "";
    if (conflictingBodies(captureFields(event.fields ?? {}))) {
      return { parserKey, verified: false, reason: "CONFLICTING_FIELDS", proposal: {} };
    }
    const match = body.match(/^El pago de \$([\d,.]+) a CFE fue exitoso\.$/);
    if (!match) return { parserKey, verified: false, reason: "INCOMPLETE_FORMAT", proposal: {} };
    const amount = captureAmount(match[1]!);
    if (!amount) return { parserKey, verified: false, reason: "INVALID_FIELDS", proposal: {} };
    if (/\b(?:USD|EUR)\b/.test(texts)) return { parserKey, verified: false, reason: "FOREIGN_CURRENCY", proposal: {} };
    return { parserKey, verified: false, reason: "FORMAT_POLICY_REQUIRED", proposal: {
      amount, merchant: "CFE", movementType: "SERVICE_PAYMENT", missingFields: ["currency", "card", "operationDate"],
    } };
  }
  const parsers = captureParsers.filter(parser => typeof parser.title === "string" && parser.sourcePackage === event.sourcePackage && parser.title === captureFields(event.fields ?? {})?.["android.title"]);
  if (parsers.length !== 1) return { reason: "UNKNOWN_FORMAT", proposal: {} };
  const parser = parsers[0]!;
  const fields = captureFields(event.fields ?? {});
  const full = fields["android.bigText"] || fields["android.text"] || "";
  // Si Android entrega dos cuerpos contradictorios no se elige uno arbitrariamente.
  if (captureFields(event.fields ?? {})["android.bigText"] && captureFields(event.fields ?? {})["android.text"] && !full.startsWith(captureFields(event.fields ?? {})["android.text"]!)) {
    return { parserKey: parser.key, reason: "CONFLICTING_FIELDS", proposal: {} };
  }
  const match = full.match(/^Importe: (MXN|USD|EUR) ([\d,.]+)\nComercio: ([^\n]{1,200})\nTarjeta (física|digital|Wallet): \*(\d{4})\nFecha: (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})(?:\nReferencia bancaria: ([A-Z0-9-]{8,80}))?$/);
  if (!match) return { parserKey: parser.key, reason: "INCOMPLETE_FORMAT", proposal: {} };
  const [, currency, rawAmount, merchant, rawKind, value, date, reference] = match as [string, string, string, string, string, string, string, string];
  const amount = captureAmount(rawAmount), time = captureOperationTime(date);
  if (!amount || !time || !merchant.trim()) return { parserKey: parser.key, reason: "INVALID_FIELDS", proposal: {} };
  const kind = { física: "PHYSICAL", digital: "DIGITAL", Wallet: "WALLET" }[rawKind as "física" | "digital" | "Wallet"]!;
  if ((parser.sourcePackage === "com.google.android.apps.walletnfcrel") !== (kind === "WALLET")) {
    return { parserKey: parser.key, reason: "INVALID_CARD_KIND", proposal: {} };
  }
  if (new Date(time.operationAt).getTime() > new Date(event.receivedAt).getTime() + 5 * 60000) {
    return { parserKey: parser.key, reason: "FUTURE_OPERATION", proposal: {} };
  }
  const proposal = { ...time, amount, currency, merchant: merchant.trim(), alias: { kind, value }, reference: reference || null };
  return { parserKey: parser.key, verified: parser.verified, reason: currency === "MXN" ? "PURCHASE" : "FOREIGN_CURRENCY", proposal };
}
