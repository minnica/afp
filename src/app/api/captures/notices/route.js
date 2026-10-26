import { prisma } from "@/lib/prisma";
import { apiResponse, ApiAccessError } from "@/lib/apiAuth";
import { deviceCredential } from "@/lib/captureProtocol";
import { lockedCaptureDevice, limitCaptureAttempts } from "@/lib/captureService";
import { loadAndroidNotices, noticeLocalDate } from "@/lib/androidNotices";

export async function GET(request) {
  try {
    const credential = deviceCredential(request);
    // Autenticar antes de consultar datos; el bloqueo serializa pausa/revocación.
    const result = await prisma.$transaction(async tx => {
      const device = await lockedCaptureDevice(tx, credential, true);
      await limitCaptureAttempts(tx, "notices", device.id, 30);
      const now = noticeLocalDate(new URL(request.url).searchParams.get("timeZone") || undefined);
      const notices = await loadAndroidNotices(tx, device.userId, now);
      return { version: 1, deviceId: device.id, ownerId: device.userId, notices };
    }, { timeout: 20_000 });
    return apiResponse.json(result);
  } catch (error) {
    if (error instanceof ApiAccessError) return apiResponse.json({ error: error.message }, {
      status: error.status, headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {},
    });
    return apiResponse.json({ error: "No se pudieron consultar los avisos. Se volverá a intentar." }, { status: 500 });
  }
}
