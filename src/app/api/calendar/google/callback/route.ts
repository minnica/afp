import type { NextRequest } from 'next/server';
import { NextResponse } from "next/server";
import { completeCalendarOAuth } from "@/lib/calendar/service";
import { CalendarError, calendarConfig, CALENDAR_COOKIE } from "@/lib/calendar/config";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";

export const maxDuration = 240;
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  let result = "connected";
  try {
    const userId = await completeCalendarOAuth({ state: url.searchParams.get("state"), code: url.searchParams.get("code"),
      denied: url.searchParams.has("error"), browser: request.cookies.get(CALENDAR_COOKIE)?.value });
    scheduleCalendarSync(userId);
  } catch (error) {
    result = error instanceof CalendarError ? error.code : "FAILED";
    console.error("Google Calendar OAuth:", result);
  }
  const response = NextResponse.redirect(`${calendarConfig().origin}/configuracion?tab=calendar&calendar=${result}`, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(CALENDAR_COOKIE, "", { httpOnly: true, secure: calendarConfig().origin.startsWith("https:"), sameSite: "lax", path: "/api/calendar/google/callback", maxAge: 0 });
  return response;
}
