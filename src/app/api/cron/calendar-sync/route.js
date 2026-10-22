import { apiResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { equalSecret, calendarConfig } from "@/lib/calendar/config";
import { runCalendarSync } from "@/lib/calendar/worker";
import { calendarPendingWhere } from "@/lib/calendar/pending";

export const maxDuration = 240;
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !equalSecret(request.headers.get("authorization"), `Bearer ${secret}`)) return apiResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!calendarConfig().ready) return apiResponse.json({ configured: false });
  try {
    await prisma.calendarOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const connections = await prisma.googleCalendarConnection.findMany({ where: calendarPendingWhere(prisma),
      orderBy: { nextAttemptAt: "asc" }, take: 10, select: { userId: true } });
    const started = Date.now(); const results = [];
    for (const connection of connections) {
      const budgetMs = 210000 - (Date.now() - started);
      if (budgetMs < 20000) break;
      results.push((await runCalendarSync(connection.userId, { budgetMs })).status);
    }
    return apiResponse.json({ processed: results.length, results });
  } catch {
    console.error("Google Calendar: revisión periódica fallida.");
    return apiResponse.json({ error: "No se pudo completar la revisión." }, { status: 503 });
  }
}
