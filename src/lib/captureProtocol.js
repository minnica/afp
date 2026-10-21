import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { ApiAccessError } from "@/lib/apiAuth";

export const capturePackages = [
  "com.bancomer.mbanking", "com.google.android.apps.walletnfcrel", "mx.hsbc.hsbcmexico",
  "com.citibanamex.banamexmobile", "mx.bancosantander.supermovil", "com.nu.production",
  "com.didiglobal.cashloan", "com.mercadopago.wallet",
];
export const pairingLifetimeMs = 5 * 60 * 1000;
export const deviceSelect = { id: true, name: true, createdAt: true, approvedAt: true, pausedAt: true, revokedAt: true, lastSeenAt: true };
export function captureHash(value) { return createHash("sha256").update(value).digest("hex"); }
export function validSecret(secret) {
  return typeof secret === "string" && /^[A-Za-z0-9_-]{43}$/.test(secret)
    && Buffer.from(secret, "base64url").toString("base64url") === secret;
}
export function pairingCode(secret) { return captureHash(`afp-pairing-v1:${secret}`).slice(0, 12).toUpperCase(); }
export function normalizePairingCode(code) { return typeof code === "string" ? code.replace(/[\s-]/g, "").toUpperCase() : ""; }
export function deviceState(device, now = new Date()) {
  if (device.revokedAt) return "REVOKED";
  if (!device.userId) return device.pairing?.expiresAt > now ? "PENDING" : "EXPIRED";
  return device.pausedAt ? "PAUSED" : "ACTIVE";
}
export function deviceCredential(request) {
  const match = request.headers.get("authorization")?.match(/^Capture ([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i);
  if (!match || !z.uuid().safeParse(match[1]).success || !validSecret(match[2])) {
    throw new ApiAccessError("Credencial del teléfono no válida.", 401);
  }
  return { id: match[1].toLowerCase(), secretHash: captureHash(match[2]) };
}
export function sameHash(a, b) {
  return typeof a === "string" && typeof b === "string" && a.length === b.length
    && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const fieldNames = /^(android\.(title|text|bigText|subText|title\.big|summaryText)|android\.textLines\.(?:[0-9]|1[01]))$/;
const eventSchema = z.object({
  contractVersion: z.literal(1), eventId: z.uuid(), sourcePackage: z.enum(capturePackages),
  notificationKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
  postedAt: z.iso.datetime({ offset: true }), receivedAt: z.iso.datetime({ offset: true }),
  fields: z.record(z.string().regex(fieldNames), z.string().max(4096)).refine(value => Object.keys(value).length <= 18),
}).strict();

export function validateCaptureEvent(input) {
  const result = eventSchema.safeParse(input);
  if (!result.success) throw new ApiAccessError("El evento o su versión no son válidos.", 400);
  const event = result.data;
  // La misma representación semántica produce el mismo recibo, aunque cambie el orden JSON.
  return { ...event, eventId: event.eventId.toLowerCase(),
    postedAt: new Date(event.postedAt).toISOString(), receivedAt: new Date(event.receivedAt).toISOString(),
    fields: Object.fromEntries(Object.entries(event.fields).sort(([a], [b]) => a.localeCompare(b))) };
}

export async function readCaptureJson(request, limit = 4096) {
  if (!request.body) throw new ApiAccessError("Faltan los datos.", 400);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiAccessError("El contenido supera el límite permitido.", 413);
      }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiAccessError) throw error;
    throw new ApiAccessError("Los datos no son JSON válido.", 400);
  } finally { reader.releaseLock(); }
}
