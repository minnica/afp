import { apiResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { equalSecret } from "@/lib/calendar/config";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";
import { runBankFallbacks } from "@/lib/captureBankFallbackWorker";

export const maxDuration = 60;
export async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !equalSecret(request.headers.get("authorization"), `Bearer ${secret}`)) return apiResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    const { users, ...results } = await runBankFallbacks(prisma);
    for (const userId of users) scheduleCalendarSync(userId);
    return apiResponse.json(results, { status: results.failed ? 503 : 200 });
  } catch {
    console.error("Captura: no se pudo procesar el respaldo bancario pendiente.");
    return apiResponse.json({ error: "No se pudo completar el respaldo bancario." }, { status: 503 });
  }
}
