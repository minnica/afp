import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, ApiAccessError } from "@/lib/apiAuth";
import { deviceCredential, readCaptureJson } from "@/lib/captureProtocol";
import { lockedCaptureDevice, receiveCaptureEvent, limitCaptureAttempts } from "@/lib/captureService";
import { paymentReceiptSource } from "@/lib/paymentReceipts";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";

const schema = z.object({ receiptVersion: z.literal(1), eventId: z.uuid(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  receivedAt: z.iso.datetime({ offset: true }), extractedText: z.string().min(1).max(20000),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
}).strict();

async function request(request: Request, readOnly: boolean) {
  try {
    const credential = deviceCredential(request);
    const device = await prisma.$transaction(tx => lockedCaptureDevice(tx, credential, true));
    await limitCaptureAttempts(prisma, "payment-receipt", credential.id, 120);
    let eventId;
    if (readOnly) {
      eventId = new URL(request.url).searchParams.get("eventId");
      if (!z.uuid().safeParse(eventId).success) throw new ApiAccessError("Comprobante no válido.", 400);
    } else {
      const parsed = schema.safeParse(await readCaptureJson(request, 100 * 1024));
      if (!parsed.success) throw new ApiAccessError("Comprobante no válido o demasiado extenso.", 400);
      const p = parsed.data;
      eventId = p.eventId.toLowerCase();
      const event = { contractVersion: 1 as const, eventId, sourcePackage: paymentReceiptSource, notificationKeyHash: p.contentHash,
        postedAt: new Date(p.receivedAt).toISOString(), receivedAt: new Date(p.receivedAt).toISOString(),
        fields: { "receipt.text": p.extractedText, "receipt.contentHash": p.contentHash, "receipt.mimeType": p.mimeType } };
      const receipt = await receiveCaptureEvent(prisma, credential, event);
      scheduleCalendarSync(device.userId);
      return apiResponse.json({ ...receipt, result: await receiptResult(device.id, device.userId!, eventId!) });
    }
    return apiResponse.json({ result: await receiptResult(device.id, device.userId!, eventId!) });
  } catch (error) {
    return apiResponse.json({ error: error instanceof ApiAccessError ? error.message : "No se pudo recibir el comprobante. Se conserva para reintentar." },
      { status: error instanceof ApiAccessError ? error.status : 500, headers: error instanceof ApiAccessError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {} });
  }
}
async function receiptResult(deviceId: string, userId: string, eventId: string) {
  const event = await prisma.captureEvent.findFirst({ where: { deviceId, userId, eventId, sourcePackage: paymentReceiptSource },
    include: { movement: { include: { cardPayment: { include: { cycle: { select: { month: true, year: true, card: { select: { name: true } } } } } } } } } });
  if (!event) throw new ApiAccessError("Comprobante no encontrado.", 404);
  const payment = event.movement?.cardPayment;
  return { status: payment && !payment.reversedAt ? "REGISTERED" : "REVIEW", reason: event.movement?.reason,
    ...(payment ? { card: payment.cycle.card.name, amount: String(payment.amount), month: payment.cycle.month, year: payment.cycle.year } : {}) };
}
export function POST(req: Request) { return request(req, false); }
export function GET(req: Request) { return request(req, true); }
