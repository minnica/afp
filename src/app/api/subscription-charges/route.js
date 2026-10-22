import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { validChargeDay, validChargeMonth } from "@/lib/subscriptionCharges";
import { applySubscriptionCharge, loadSubscriptionCharges, SubscriptionChargeError } from "@/lib/subscriptionChargeService";

async function handle(request, write) {
  try {
    const user = await requireApiUser(request);
    const input = write ? await request.json().catch(() => null) : Object.fromEntries(new URL(request.url).searchParams);
    // Acepta el día local solo dentro del margen de las zonas horarias del mundo.
    const utcToday = new Date().toISOString().slice(0, 10);
    const today = input?.today || utcToday;
    if (!input || !validChargeMonth(input.month) || !validChargeDay(today)
      || Math.abs(Date.parse(today) - Date.parse(utcToday)) > 86400000) {
      return NextResponse.json({ error: "El mes o la fecha local no son válidos. Actualiza la página." }, { status: 400 });
    }
    if (write) {
      const { subscriptionId, month, action, amount, date, paymentMethod, cardId } = input;
      const result = await prisma.$transaction(tx => applySubscriptionCharge(tx, user.id, {
        subscriptionId, month, action, amount, date, paymentMethod, cardId, today,
      }));
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    const charges = await loadSubscriptionCharges(prisma, user.id, input.month, today);
    return NextResponse.json({ charges }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SubscriptionChargeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error gestionando cobros de suscripciones:", error);
    return NextResponse.json({ error: "No se pudo consultar o actualizar el cobro. Intenta de nuevo." }, { status: 500 });
  }
}

export function GET(request) { return handle(request, false); }
export function POST(request) { return handle(request, true); }
