import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
export const CALENDAR_LIST_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const CALENDAR_SCOPES = ["openid", "email", CALENDAR_SCOPE, CALENDAR_LIST_SCOPE];
export const CALENDAR_TIME_ZONE = "America/Mexico_City";
export const CALENDAR_COOKIE = "afp_calendar_oauth";
export const EVENT_TYPES = ["cuts", "cardPayments", "subscriptions", "receivables", "payables"];
export const DEFAULT_PREFERENCES = { types: EVENT_TYPES, showAmounts: false, reminders: true };

export class CalendarError extends Error {
  constructor(code, status = 503, retryAfter = 0) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function calendarConfig() {
  const origin = process.env.AFP_APP_ORIGIN || "https://finanzas.garatachia.com";
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))) throw new CalendarError("CONFIGURATION");
  const key = Buffer.from(process.env.CALENDAR_ENCRYPTION_KEY || "", "base64");
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  return { origin, redirectUri: `${origin}/api/calendar/google/callback`, key, clientId, clientSecret,
    ready: Boolean(clientId && clientSecret && key.length === 32) };
}

export function requireCalendarConfig() {
  const config = calendarConfig();
  if (!config.ready) throw new CalendarError("CONFIGURATION");
  return config;
}

export function hash(value) { return createHash("sha256").update(value).digest("hex"); }
export function randomSecret() { return randomBytes(32).toString("base64url"); }
export function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function encryptSecret(value, userId) {
  const { key } = requireCalendarConfig();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`afp-calendar-v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(value, userId) {
  try {
    const { key } = requireCalendarConfig();
    const [version, iv, tag, data] = value.split(".");
    if (version !== "v1") throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    cipher.setAAD(Buffer.from(`afp-calendar-v1:${userId}`));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8");
  } catch { throw new CalendarError("CREDENTIALS_UNAVAILABLE"); }
}

export function preferences(value = {}) {
  return { types: Array.isArray(value.types) ? EVENT_TYPES.filter(type => value.types.includes(type)) : [...EVENT_TYPES],
    showAmounts: value.showAmounts === true, reminders: value.reminders !== false };
}

export function validatePreferences(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every(key => ["types", "showAmounts", "reminders"].includes(key))
    && Array.isArray(value.types) && value.types.every(type => EVENT_TYPES.includes(type))
    && typeof value.showAmounts === "boolean" && typeof value.reminders === "boolean";
}

export function calendarMessage(code) {
  return ({ CONFIGURATION: "La conexión con Google Calendar está pendiente de configuración.",
    LABEL_LIMIT: "El calendario alcanzó el límite de colores personalizados. Libera espacio entre sus etiquetas en Google Calendar y vuelve a sincronizar.",
    RECONNECT: "Google necesita que vuelvas a conectar tu cuenta.",
    ACCOUNT_MISMATCH: "Conecta la misma cuenta de Google que elegiste anteriormente.",
    BUSY: "Hay una sincronización en curso. Intenta de nuevo en un momento.",
    RATE_LIMIT: "Google pidió esperar. La sincronización se reintentará automáticamente.",
    CALENDAR_MISSING: "El calendario AFP ya no está disponible. Vuelve a conectar tu cuenta.",
    OAUTH_EXPIRED: "La conexión venció o se abrió desde otro navegador. Vuelve a iniciarla desde AFP.",
    DENIED: "La conexión con Google fue cancelada.",
    CREDENTIALS_UNAVAILABLE: "No se pudo recuperar la conexión. Revisa la configuración del servidor.",
    GOOGLE_UNAVAILABLE: "No se pudo sincronizar con Google. Se reintentará automáticamente.",
  })[code] || "No se pudo completar la conexión. Intenta de nuevo desde AFP.";
}
