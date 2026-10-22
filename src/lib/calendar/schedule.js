import { after } from "next/server";
import { calendarConfig } from "@/lib/calendar/config";

export function scheduleCalendarSync(userId) {
  if (!calendarConfig().ready) return;
  after(async () => {
    try {
      const { runCalendarSync } = await import("./worker");
      await runCalendarSync(userId);
    } catch { console.error("Google Calendar: no se pudo ejecutar la sincronización; se recuperará con el siguiente cambio o en la revisión diaria."); }
  });
}
