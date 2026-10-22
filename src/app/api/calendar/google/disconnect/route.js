import { apiResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { disconnectCalendar, calendarStatus } from "@/lib/calendar/service";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";
import { calendarMessage } from "@/lib/calendar/config";

export const maxDuration = 240;
export async function POST(request) {
  try {
    const user = await requireApiUser(request);
    await disconnectCalendar(user.id);
    scheduleCalendarSync(user.id);
    return apiResponse.json(await calendarStatus(user.id), { status: 202 });
  } catch (error) {
    const access = apiAccessErrorResponse(error); if (access) return access;
    console.error("Google Calendar: no se pudo desconectar.");
    return apiResponse.json({ error: calendarMessage(error.code) }, { status: error.status || 500 });
  }
}
