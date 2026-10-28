import { calendarErrorCode, calendarErrorStatus } from '@/lib/calendar/config';
import { apiResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";
import { requireCalendarConfig, calendarMessage } from "@/lib/calendar/config";

export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    requireCalendarConfig();
    const current = await prisma.googleCalendarConnection.findUnique({ where: { userId: user.id } });
    if (!current || !["CONNECTED", "DISCONNECTING"].includes(current.status)) return apiResponse.json({ error: "Conecta tu cuenta de Google para sincronizar." }, { status: 409 });
    if (current.lastError === "RATE_LIMIT" && current.nextAttemptAt > new Date()) return apiResponse.json({ error: calendarMessage("RATE_LIMIT") }, { status: 429,
      headers: { "Retry-After": String(Math.ceil((current.nextAttemptAt.getTime() - Date.now()) / 1000)) } });
    await prisma.googleCalendarConnection.update({ where: { userId: user.id }, data: { revision: { increment: 1 }, nextAttemptAt: new Date() } });
    scheduleCalendarSync(user.id);
    return apiResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    const access = apiAccessErrorResponse(error); if (access) return access;
    console.error("Google Calendar: no se pudo solicitar sincronización.");
    return apiResponse.json({ error: calendarMessage(calendarErrorCode(error)) }, { status: calendarErrorStatus(error) || 500 });
  }
}
