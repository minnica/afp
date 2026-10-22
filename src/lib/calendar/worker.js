import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "@/lib/prisma";
import { syncGoogleCalendar } from "@/lib/calendar/sync";
import { calendarNeedsSync } from "@/lib/calendar/pending";

// Consume el trabajo disparado por un cambio, incluidos sus lotes y cambios concurrentes.
// No deja temporizadores periódicos: termina al quedar al día o ante un error de Google.
export async function runCalendarSync(userId, { db = prisma, sync = syncGoogleCalendar, wait = sleep,
  clock = Date.now, budgetMs = 210000, ...options } = {}) {
  const started = clock();
  for (let batch = 0; batch < 8; batch++) {
    const remaining = budgetMs - (clock() - started);
    if (remaining < 20000) return { status: "PENDING" };
    const result = await sync(userId, { db, ...options, budgetMs: remaining });
    if (!["SYNCED", "PENDING"].includes(result.status)) return result;
    // sync ya liberó el bloqueo: un guardado concurrente no se pierde por responder BUSY.
    const current = await db.googleCalendarConnection.findUnique({ where: { userId } });
    if (result.status === "SYNCED" && !calendarNeedsSync(current, new Date(clock()))) return result;
    const delay = Math.max(0, (current?.nextAttemptAt?.getTime() || 0) - clock());
    if (delay > budgetMs - (clock() - started) - 20000) return { status: "PENDING" };
    if (delay) await wait(delay);
  }
  return { status: "PENDING" };
}
