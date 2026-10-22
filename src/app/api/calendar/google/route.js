import { apiResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { calendarStatus, updateCalendarPreferences } from "@/lib/calendar/service";
import { CalendarError, calendarMessage, validatePreferences } from "@/lib/calendar/config";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";

async function handle(request, write) {
  try {
    const user = await requireApiUser(request);
    if (write) {
      const body = await request.json().catch(() => null);
      if (!validatePreferences(body)) return apiResponse.json({ error: "Revisa los tipos de evento y las preferencias." }, { status: 400 });
      await updateCalendarPreferences(user.id, body);
      scheduleCalendarSync(user.id);
    }
    return apiResponse.json(await calendarStatus(user.id));
  } catch (error) {
    const access = apiAccessErrorResponse(error); if (access) return access;
    if (error instanceof CalendarError) return apiResponse.json({ error: calendarMessage(error.code) }, { status: error.status });
    console.error("Google Calendar: fallo al consultar configuración.");
    return apiResponse.json({ error: "No se pudo cargar la conexión con Google." }, { status: 500 });
  }
}
export function GET(request) { return handle(request, false); }
export function PATCH(request) { return handle(request, true); }
