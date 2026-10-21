// Los formatos de compra de arranque son SINTÉTICOS. Los avisos reales de
// débito y pago CFE no aportan una compra de crédito completa automatizable.
// verified solo cambia tras incorporar evidencia real anonimizada y sus regresiones.
export const captureParsers = [
  { key: "bbva.purchase.es.v1", sourcePackage: "com.bancomer.mbanking", title: "Compra aprobada", verified: false },
  { key: "wallet.purchase.es.v1", sourcePackage: "com.google.android.apps.walletnfcrel", title: "Pago realizado", verified: false },
  { key: "bbva.account-charge.es.v1", sourcePackage: "com.bancomer.mbanking", verified: false, evidence: "REAL_OUT_OF_SCOPE" },
  { key: "nu.cfe-service-payment.es.v1", sourcePackage: "com.nu.production", verified: false, evidence: "REAL_REVIEWED_PARTIAL" },
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

export function interpretCapture(event) {
  const texts = Object.values(event.fields || {}).join("\n");
  if (/\b(MSI|meses sin intereses|preautorizaci[oó]n|retenci[oó]n|devoluci[oó]n|reembolso|cancelaci[oó]n|abono|rechazad[ao]|promoci[oó]n|c[oó]digo de (?:acceso|verificaci[oó]n)|env[ií]o|pedido recibido)\b/i.test(texts)) {
    return { reason: "SPECIAL_MOVEMENT", proposal: {} };
  }
  // Prefijo observado y confirmado por el propietario como transferencia de
  // débito. No vincular su terminación con los alias de tarjetas de crédito.
  if (event.sourcePackage === "com.bancomer.mbanking") {
    const body = event.fields?.["android.bigText"] || event.fields?.["android.text"] || "";
    const account = body.match(/^Tienes un cargo a tu cuenta \*(\d{4}) de \$([\d,.]+)\. /);
    if (account) {
      const conflicting = event.fields["android.bigText"] && event.fields["android.text"] && !body.startsWith(event.fields["android.text"]);
      return { parserKey: "bbva.account-charge.es.v1", verified: false,
        reason: conflicting ? "CONFLICTING_FIELDS" : "NON_CREDIT_ACCOUNT", proposal: {} };
    }
  }
  // Muestra real confirmada como pago CFE desde Nu. El símbolo $ no fija la
  // moneda; publicación/recepción no sustituyen la fecha de operación y el
  // paquete Nu no identifica una tarjeta. Conservar lo disponible para revisión.
  if (event.sourcePackage === "com.nu.production" && event.fields?.["android.title"] === "Tu pago a CFE fue exitoso") {
    const parserKey = "nu.cfe-service-payment.es.v1";
    const body = event.fields["android.bigText"] || event.fields["android.text"] || "";
    if (event.fields["android.bigText"] && event.fields["android.text"] && !body.startsWith(event.fields["android.text"])) {
      return { parserKey, verified: false, reason: "CONFLICTING_FIELDS", proposal: {} };
    }
    const match = body.match(/^El pago de \$([\d,.]+) a CFE fue exitoso\.$/);
    if (!match) return { parserKey, verified: false, reason: "INCOMPLETE_FORMAT", proposal: {} };
    const amount = captureAmount(match[1]);
    if (!amount) return { parserKey, verified: false, reason: "INVALID_FIELDS", proposal: {} };
    return { parserKey, verified: false, reason: "INCOMPLETE_FORMAT", proposal: {
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
