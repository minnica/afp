import { readFinancialInput } from "@/lib/financialContracts";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { validChargeDay, validChargeMonth } from "@/lib/subscriptionCharges";
import { applySubscriptionCharge, loadSubscriptionCharges, previewSubscriptionCharge, SubscriptionChargeError } from "@/lib/subscriptionChargeService";

async function handle(request: Request, write: boolean) {
  try {
    const user = await requireApiUser(request);
    const input = readFinancialInput(write ? await request.json().catch(() => null) : Object.fromEntries(new URL(request.url).searchParams));
    // Acepta el día local solo dentro del margen de las zonas horarias del mundo.
    const utcToday = new Date().toISOString().slice(0, 10);
    const today = input?.today || utcToday;
    if (!input || !validChargeMonth(input.month) || !validChargeDay(today)
      || Math.abs(Date.parse(today) - Date.parse(utcToday)) > 86400000) {
      return NextResponse.json({ error: "El mes o la fecha local no son válidos. Actualiza la página." }, { status: 400 });
    }
    if (write) {
      const { subscriptionId, month, action, amount, date, paymentMethod, cardId, expenseId, rememberMerchant, confirmDistinctCapture, expectedCandidates } = input;
      const result = await prisma.$transaction(tx => applySubscriptionCharge(tx, user.id, {
        subscriptionId, month, action, amount, date, paymentMethod, cardId, today, expenseId, rememberMerchant, confirmDistinctCapture, expectedCandidates,
      }), { isolationLevel: 'ReadCommitted' });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (input.subscriptionId) {
      const preview = await prisma.$transaction(tx => previewSubscriptionCharge(tx, user.id, { ...input, today }), { isolationLevel: 'RepeatableRead' });
      return NextResponse.json(preview);
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

export function GET(request: Request) { return handle(request, false); }
export function POST(request: Request) { return handle(request, true); }
