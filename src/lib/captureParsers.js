// Los formatos de arranque son SINTÉTICOS. verified acredita la gramática real
// anonimizada y sus regresiones; los campos ausentes nunca se inventan. Nu/CFE
// solo se completa mediante la regla expresa de tarjeta, moneda y suscripción.
import { interpretPaymentNotice } from "@/lib/capturePaymentParsers";
import { parsePaymentReceipt, paymentReceiptSource } from "@/lib/paymentReceipts";

export const captureParsers = [
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
  { key: "wallet.didi-purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", verified: true, evidence: "REAL_REVIEWED",
    aliasSourcePackage: "com.didiglobal.cashloan", aliasKinds: ["PHYSICAL", "DIGITAL"], dateSource: "NOTIFICATION_POSTED_AT" },
];

export function normalizeMerchant(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function captureAmount(value) {
  if (typeof value !== "string" || !/^(?:\d{1,10}|\d{1,3}(?:,\d{3}){1,3})\.\d{2}$/.test(value)) return null;
  const digits = value.replaceAll(",", "").replace(".", "");
  const cents = BigInt(digits);
  if (cents <= 0n || cents > 999999999999n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

const mexicoClock = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export function captureOperationTime(value) {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  if (Number(year) < 2000 || Number(year) > 2100) return null;
  const local = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  const base = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  // México ha tenido horario de verano: rechazar horas inexistentes o repetidas.
  const matches = [-360, -300].map(offset => new Date(base - offset * 60000))
    .filter(date => mexicoClock.format(date) === local);
  return matches.length === 1 ? { operationAt: matches[0].toISOString(), date: local.slice(0, 10), timeZone: "America/Mexico_City" } : null;
}

function conflictingBodies(fields) {
  return Boolean((fields["android.bigText"] && fields["android.text"] && fields["android.bigText"] !== fields["android.text"])
    || (fields["android.title.big"] && fields["android.title"] && fields["android.title.big"] !== fields["android.title"]));
}

export function captureNotificationDate(event) {
  const posted = new Date(event.postedAt), received = new Date(event.receivedAt);
  if (!Number.isFinite(posted.getTime()) || !Number.isFinite(received.getTime())
    || posted.getUTCFullYear() < 2000 || posted.getUTCFullYear() > 2100
    || posted.getTime() > received.getTime() + 5 * 60000) return null;
  return { date: mexicoClock.format(posted).slice(0, 10), notificationAt: posted.toISOString(),
    dateSource: "NOTIFICATION_POSTED_AT", timeZone: "America/Mexico_City" };
}

function realWalletPurchase(event) {
  const fields = event.fields || {}, body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^(MXN|USD|EUR)([\d,.]+) con (Joy Banamex|DIDI Credit Card|Nu Mastercard Gold) ••(\d{4})$/);
  if (!match) return null;
  const [parserKey, aliasSourcePackage] = {
    "DIDI Credit Card": ["wallet.didi-purchase.es.v1", "com.didiglobal.cashloan"],
    "Joy Banamex": ["wallet.banamex-purchase.es.v1", "com.citibanamex.banamexmobile"],
    "Nu Mastercard Gold": ["wallet.nu-purchase.es.v1", "com.nu.production"],
  }[match[3]];
  if (conflictingBodies(fields)) return { parserKey, verified: true, reason: "CONFLICTING_FIELDS", proposal: {} };
  const merchant = fields["android.title"];
  const amount = captureAmount(match[2]), date = captureNotificationDate(event);
  if (!amount || !date || typeof merchant !== "string" || !merchant.trim() || merchant.length > 200 || /[\r\n]/.test(merchant)) {
    return { parserKey, verified: true, reason: "INVALID_FIELDS", proposal: {} };
  }
  return { parserKey, verified: true, reason: match[1] === "MXN" ? "PURCHASE" : "FOREIGN_CURRENCY", proposal: {
    ...date, amount, currency: match[1], merchant: merchant.trim(),
    // Wallet muestra la terminación del título, no el token de pagos NFC.
    printedAlias: { value: match[4], digits: 4 }, aliasSourcePackage, reference: null,
  } };
}

function realBanamexCharge(event) {
  const fields = event.fields || {}, body = fields["android.bigText"] || fields["android.text"] || "";
  const additional = body.match(/^Retiro\/Compra (.{1,200}) -\s+ADICIONAL (\d{3}) monto \$\s*([\d,.]+) el (\d{2}\/\d{2}\/\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)\. Auto\. (\d{6})$/);
  const match = additional || body.match(/^Retiro\/Compra (.{1,200}) JOY BANAMEX(\d{3}) monto \$([\d,.]+) el (\d{2}\/\d{2}\/\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)\. Auto\. (\d{6})$/);
  if (!match) return null;
  const parserKey = additional ? "banamex.card-charge.es.v1" : "banamex.joy-card-charge.es.v1";
  if (conflictingBodies(fields)) return { parserKey, verified: false, reason: "CONFLICTING_FIELDS", proposal: {} };
  const [, merchant, suffix, rawAmount, printedDay, rawHour, minute, second, meridiem, authorization] = match;
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

function realSantanderPurchase(event) {
  const fields = event.fields || {};
  if (fields["android.title"] !== "Compra con tarjeta") return null;
  const body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^En (.{1,200}) por \$\$([\d,.]+) (MXN|USD|EUR) con tarjeta de credito \*\*(\d{4}), el (\d{2}\/\d{2}\/\d{4}) a las (\d{2}:\d{2}:\d{2}) hrs\.$/);
  if (!match) return null;
  const parserKey = "santander.card-purchase.es.v1";
  if (conflictingBodies(fields)) return { parserKey, verified: true, reason: "CONFLICTING_FIELDS", proposal: {} };
  const [, merchant, rawAmount, currency, suffix, day, clock] = match;
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

function realWalletSantanderPurchase(event) {
  const fields = event.fields || {}, body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^(MXN|USD|EUR)([\d,.]+) con Santander LikeU ••(\d{4})$/);
  if (!match) return null;
  const parserKey = "wallet.santander-purchase.es.v1";
  if (conflictingBodies(fields)) return { parserKey, verified: false, reason: "CONFLICTING_FIELDS", proposal: {} };
  const merchant = fields["android.title"], amount = captureAmount(match[2]), notification = captureNotificationDate(event);
  if (!amount || !notification || typeof merchant !== "string" || !merchant.trim() || merchant.length > 200 || /[\r\n]/.test(merchant)) {
    return { parserKey, verified: false, reason: "INVALID_FIELDS", proposal: {} };
  }
  // El título muestra la terminación bancaria, no el token NFC. La publicación
  // se conserva como evidencia: no completa la fecha bancaria ni crea un gasto.
  return { parserKey, verified: false, reason: match[1] === "MXN" ? "INCOMPLETE_FORMAT" : "FOREIGN_CURRENCY", proposal: {
    amount, currency: match[1], merchant: merchant.trim(), printedAlias: { value: match[3], digits: 4 },
    aliasSourcePackage: "mx.bancosantander.supermovil", notificationAt: notification.notificationAt, timeZone: notification.timeZone,
    evidenceOnly: true, missingFields: ["operationDate"],
  } };
}

function realNuPurchase(event) {
  const fields = event.fields || {}, title = fields["android.title"]?.match(/^Compra aprobada por \$([\d,.]+)$/);
  if (!title) return null;
  const parserKey = "nu.card-purchase.es.v1", base = { parserKey, verified: false, proposal: {} };
  if (conflictingBodies(fields)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const body = fields["android.bigText"] || fields["android.text"] || "";
  const match = body.match(/^Compraste en (.{1,200}) con tu tarjeta con terminación (\d{4}) por \$([\d,.]+)\.$/);
  if (!match) return { ...base, reason: "INCOMPLETE_FORMAT" };
  const amount = captureAmount(match[3]), notification = captureNotificationDate(event);
  if (!amount || !captureAmount(title[1]) || !notification || !match[1].trim()) return { ...base, reason: "INVALID_FIELDS" };
  if (amount !== captureAmount(title[1])) return { ...base, reason: "CONFLICTING_FIELDS" };
  return { ...base, reason: "INCOMPLETE_FORMAT", proposal: { amount, merchant: match[1].trim(),
    printedAlias: { value: match[2], digits: 4 }, aliasSourcePackage: "com.nu.production",
    notificationAt: notification.notificationAt, timeZone: notification.timeZone,
    evidenceOnly: true, missingFields: ["currency", "operationDate"],
  } };
}

function realMercadoPagoPurchase(event) {
  const fields = event.fields || {}, title = fields["android.title"]?.match(/^Compra por \$ ([\d,.]+) fue aprobada$/);
  if (!title) return null;
  const parserKey = "mercadopago.card-purchase.es.v1", base = { parserKey, verified: false, proposal: {} };
  if (conflictingBodies(fields)) return { ...base, reason: "CONFLICTING_FIELDS" };
  const match = (fields["android.bigText"] || fields["android.text"] || "").match(/^Ve los detalles de tu compra en (.{1,200}) aquí\.$/);
  if (!match) return { ...base, reason: "INCOMPLETE_FORMAT" };
  // La muestra admite pesos enteros. Los centavos, cuando estén impresos,
  // deben tener dos cifras; no redondear ni interpretar separadores ambiguos.
  const amount = captureAmount(title[1].includes(".") ? title[1] : `${title[1]}.00`);
  if (!amount || !match[1].trim()) return { ...base, reason: "INVALID_FIELDS" };
  if (/\b(?:USD|EUR|d[oó]lares|euros)\b|US\$/i.test(Object.values(fields).join("\n"))) return { ...base, reason: "FOREIGN_CURRENCY" };
  return { ...base, reason: "FORMAT_POLICY_REQUIRED", proposal: { amount, merchant: match[1].trim(),
    missingFields: ["currency", "card", "operationDate"],
  } };
}

export function interpretCapture(event) {
  if (event.sourcePackage === paymentReceiptSource) return parsePaymentReceipt(event);
  const texts = Object.values(event.fields || {}).join("\n");
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
    const body = event.fields?.["android.bigText"] || event.fields?.["android.text"] || "";
    // Evidencia de salida con débito: el descriptor comercial no identifica una
    // tarjeta de crédito receptora ni confirma que el abono haya sido aplicado.
    if (event.fields?.["android.title"] === "Compra con TDD" && [body, event.fields["android.text"] || ""].some(text => text.startsWith("Compra con TDD "))) {
      const base = { parserKey: "bbva.debit-card-charge.es.v1", verified: false, proposal: {} };
      if (conflictingBodies(event.fields)) return { ...base, reason: "CONFLICTING_FIELDS" };
      const debit = body.match(/^Compra con TDD (\d{4}) en MERPAGO\*TARJETADE \$([\d,.]+) (\d{1,2}) ([a-z]+) (\d{2}):(\d{2})h$/);
      const amount = debit && captureAmount(debit[2]), date = captureNotificationDate(event);
      if (!amount || !date) return { ...base, reason: "INCOMPLETE_FORMAT" };
      return { ...base, reason: "ACCOUNT_DEBIT_REVIEW", proposal: { movementType: "ACCOUNT_DEBIT",
        merchant: "Cargo con débito BBVA", amount, ...date, sourceMerchant: "MERPAGO*TARJETADE",
        paymentEvidence: "SOURCE_DEBIT_ONLY", missingFields: ["destination", "card", "currency", "statementPeriod", "operationDate"],
      } };
    }
    const account = body.match(/^Tienes un cargo a tu cuenta \*(\d{4}) de \$([\d,.]+)\. /);
    if (account) {
      const conflicting = event.fields["android.bigText"] && event.fields["android.text"] && !body.startsWith(event.fields["android.text"]);
      if (conflicting || !captureAmount(account[2])) return { parserKey: "bbva.account-charge.es.v1", verified: false,
        reason: conflicting ? "CONFLICTING_FIELDS" : "INVALID_FIELDS", proposal: {} };
      return { parserKey: "bbva.account-charge.es.v1", verified: false,
        reason: conflicting ? "CONFLICTING_FIELDS" : "ACCOUNT_DEBIT_REVIEW", proposal: {
          movementType: "ACCOUNT_DEBIT", merchant: "Cargo a cuenta BBVA", amount: captureAmount(account[2]),
          ...captureNotificationDate(event), paymentEvidence: "SOURCE_DEBIT_ONLY",
          missingFields: ["destination", "card", "currency", "statementPeriod", "operationDate"],
        } };
    }
  }
  // Muestra real confirmada como pago CFE desde Nu. El símbolo $ no fija la
  // moneda; publicación/recepción no sustituyen la fecha de operación y el
  // paquete Nu no identifica una tarjeta. Conservar lo disponible para revisión.
  if (event.sourcePackage === "com.nu.production" && event.fields?.["android.title"] === "Tu pago a CFE fue exitoso") {
    const parserKey = "nu.cfe-service-payment.es.v2";
    const body = event.fields["android.bigText"] || event.fields["android.text"] || "";
    if (conflictingBodies(event.fields)) {
      return { parserKey, verified: false, reason: "CONFLICTING_FIELDS", proposal: {} };
    }
    const match = body.match(/^El pago de \$([\d,.]+) a CFE fue exitoso\.$/);
    if (!match) return { parserKey, verified: false, reason: "INCOMPLETE_FORMAT", proposal: {} };
    const amount = captureAmount(match[1]);
    if (!amount) return { parserKey, verified: false, reason: "INVALID_FIELDS", proposal: {} };
    if (/\b(?:USD|EUR)\b/.test(texts)) return { parserKey, verified: false, reason: "FOREIGN_CURRENCY", proposal: {} };
    return { parserKey, verified: false, reason: "FORMAT_POLICY_REQUIRED", proposal: {
      amount, merchant: "CFE", movementType: "SERVICE_PAYMENT", missingFields: ["currency", "card", "operationDate"],
    } };
  }
  const parsers = captureParsers.filter(parser => typeof parser.title === "string" && parser.sourcePackage === event.sourcePackage && parser.title === event.fields?.["android.title"]);
  if (parsers.length !== 1) return { reason: "UNKNOWN_FORMAT", proposal: {} };
  const parser = parsers[0];
  const full = event.fields["android.bigText"] || event.fields["android.text"] || "";
  // Si Android entrega dos cuerpos contradictorios no se elige uno arbitrariamente.
  if (event.fields["android.bigText"] && event.fields["android.text"] && !full.startsWith(event.fields["android.text"])) {
    return { parserKey: parser.key, reason: "CONFLICTING_FIELDS", proposal: {} };
  }
  const match = full.match(/^Importe: (MXN|USD|EUR) ([\d,.]+)\nComercio: ([^\n]{1,200})\nTarjeta (física|digital|Wallet): \*(\d{4})\nFecha: (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})(?:\nReferencia bancaria: ([A-Z0-9-]{8,80}))?$/);
  if (!match) return { parserKey: parser.key, reason: "INCOMPLETE_FORMAT", proposal: {} };
  const [, currency, rawAmount, merchant, rawKind, value, date, reference] = match;
  const amount = captureAmount(rawAmount), time = captureOperationTime(date);
  if (!amount || !time || !merchant.trim()) return { parserKey: parser.key, reason: "INVALID_FIELDS", proposal: {} };
  const kind = { física: "PHYSICAL", digital: "DIGITAL", Wallet: "WALLET" }[rawKind];
  if ((parser.sourcePackage === "com.google.android.apps.walletnfcrel") !== (kind === "WALLET")) {
    return { parserKey: parser.key, reason: "INVALID_CARD_KIND", proposal: {} };
  }
  if (new Date(time.operationAt).getTime() > new Date(event.receivedAt).getTime() + 5 * 60000) {
    return { parserKey: parser.key, reason: "FUTURE_OPERATION", proposal: {} };
  }
  const proposal = { ...time, amount, currency, merchant: merchant.trim(), alias: { kind, value }, reference: reference || null };
  return { parserKey: parser.key, verified: parser.verified, reason: currency === "MXN" ? "PURCHASE" : "FOREIGN_CURRENCY", proposal };
}
