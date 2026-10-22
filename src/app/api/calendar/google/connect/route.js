import { apiResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { beginCalendarOAuth } from "@/lib/calendar/service";
import { CalendarError, calendarMessage, calendarConfig, CALENDAR_COOKIE } from "@/lib/calendar/config";

export async function POST(request) {
  try {
    const user = await requireApiUser(request);
    const { url, browser } = await beginCalendarOAuth(user.id);
    const response = apiResponse.json({ url });
    response.cookies.set(CALENDAR_COOKIE, browser, { httpOnly: true, secure: calendarConfig().origin.startsWith("https:"),
      sameSite: "lax", path: "/api/calendar/google/callback", maxAge: 600 });
    return response;
  } catch (error) {
    const access = apiAccessErrorResponse(error); if (access) return access;
    console.error("Google Calendar: no se pudo iniciar OAuth.");
    return apiResponse.json({ error: calendarMessage(error.code) }, { status: error instanceof CalendarError ? error.status : 500 });
  }
}
