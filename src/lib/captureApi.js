import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, requireApiUser, ApiAccessError } from "@/lib/apiAuth";
import { deviceCredential, readCaptureJson, validateCaptureEvent, deviceSelect } from "@/lib/captureProtocol";
import { limitCaptureAttempts, startCapturePairing, approveCapturePairing, lockedCaptureDevice, getCaptureDevice, changeCaptureDevice, receiveCaptureEvent } from "@/lib/captureService";

export async function captureRequest(request, action) {
  try {
    let result;
    if (action === "start") {
      // El límite global conserva un tope aunque el origen del tráfico no esté disponible.
      await limitCaptureAttempts(prisma, "start-global", "all", 120);
      const address = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
      await limitCaptureAttempts(prisma, "start-address", address, 10);
      result = await startCapturePairing(prisma, await readCaptureJson(request));
    } else if (["approve", "list", "change"].includes(action)) {
      const user = await requireApiUser(request);
      if (action === "approve") {
        await limitCaptureAttempts(prisma, "approve-user", user.id, 10);
        const input = await readCaptureJson(request);
        result = await approveCapturePairing(prisma, user.id, input?.code);
      } else if (action === "list") {
        result = { devices: await prisma.captureDevice.findMany({ where: { userId: user.id }, select: deviceSelect, orderBy: { createdAt: "desc" } }) };
      } else {
        const input = await readCaptureJson(request);
        if (!z.uuid().safeParse(input?.deviceId).success) throw new ApiAccessError("Dispositivo no encontrado.", 404);
        result = await changeCaptureDevice(prisma, user.id, input);
      }
    } else {
      const credential = deviceCredential(request);
      // Se autentica antes de leer texto financiero; recepción vuelve a comprobar dentro del commit.
      await prisma.$transaction(tx => lockedCaptureDevice(tx, credential, action === "event"));
      await limitCaptureAttempts(prisma, "device", credential.id, 600);
      if (action === "status") result = await getCaptureDevice(prisma, credential);
      else if (action === "device-change") {
        const input = await readCaptureJson(request);
        if (!["pause", "resume"].includes(input?.action)) throw new ApiAccessError("Acción no válida.", 400);
        result = await prisma.$transaction(async tx => {
          const device = await lockedCaptureDevice(tx, credential);
          if (!device.userId || device.revokedAt) throw new ApiAccessError("El teléfono no está autorizado.", 403);
          await tx.captureDevice.update({ where: { id: device.id }, data: { pausedAt: input.action === "pause" ? device.pausedAt || new Date() : null } });
          return { deviceId: device.id, ownerId: device.userId, state: input.action === "pause" ? "PAUSED" : "ACTIVE" };
        });
      } else if (action === "unlink") {
        result = await prisma.$transaction(async tx => {
          const device = await lockedCaptureDevice(tx, credential);
          await tx.captureDevice.update({ where: { id: device.id }, data: { revokedAt: device.revokedAt || new Date() } });
          return { state: "REVOKED", ownerId: device.userId, deviceId: device.id };
        });
      } else {
        const event = validateCaptureEvent(await readCaptureJson(request, 128 * 1024));
        result = await receiveCaptureEvent(prisma, credential, event);
      }
    }
    return apiResponse.json(result);
  } catch (error) {
    if (error instanceof ApiAccessError) return apiResponse.json({ error: error.message }, {
      status: error.status, headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {},
    });
    // Nunca registrar cuerpos, códigos ni credenciales; tampoco errores Prisma con parámetros.
    return apiResponse.json({ error: "No se pudo completar la operación de captura. Vuelve a intentarlo." }, { status: 500 });
  }
}
