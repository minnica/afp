import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { validChargeDay, validChargeMonth } from "@/lib/subscriptionCharges";
import { applySubscriptionCharge, loadSubscriptionCharges, SubscriptionChargeError } from "@/lib/subscriptionChargeService";

async function handle(request, write) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Inicia sesión para gestionar tus cobros." }, { status: 401 });
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: { user }, error } = await auth.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: "La sesión venció. Vuelve a iniciar sesión." }, { status: 401 });
    const input = write ? await request.json().catch(() => null) : Object.fromEntries(new URL(request.url).searchParams);
    // Acepta el día local solo dentro del margen de las zonas horarias del mundo.
    const utcToday = new Date().toISOString().slice(0, 10);
    const today = input?.today || utcToday;
    if (!input || !validChargeMonth(input.month) || !validChargeDay(today)
      || Math.abs(Date.parse(today) - Date.parse(utcToday)) > 86400000) {
      return NextResponse.json({ error: "El mes o la fecha local no son válidos. Actualiza la página." }, { status: 400 });
    }
    if (write) {
      const result = await prisma.$transaction(tx => applySubscriptionCharge(tx, user.id, { ...input, today, expenseData: undefined }));
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    const charges = await loadSubscriptionCharges(prisma, user.id, input.month, today);
    return NextResponse.json({ charges }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SubscriptionChargeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error gestionando cobros de suscripciones:", error);
    return NextResponse.json({ error: "No se pudo consultar o actualizar el cobro. Intenta de nuevo." }, { status: 500 });
  }
}

export function GET(request) { return handle(request, false); }
export function POST(request) { return handle(request, true); }
