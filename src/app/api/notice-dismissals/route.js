import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { isNoticeKey } from "@/lib/noticeDismissals";

async function getUser(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : data.user;
}

function validMonth(month) {
  return typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

async function handle(request, action) {
  try {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Inicia sesión para gestionar tus avisos." }, { status: 401 });
    const input = action === "list" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json().catch(() => null);
    if (!input || !validMonth(input.month) || (action !== "list" && !isNoticeKey(input.noticeKey))) {
      return NextResponse.json({ error: "El aviso o el mes no son válidos." }, { status: 400 });
    }
    const where = { userId: user.id, month: input.month };
    if (action === "hide") {
      const identity = { ...where, noticeKey: input.noticeKey };
      await prisma.noticeDismissal.upsert({ where: { userId_month_noticeKey: identity }, create: identity, update: {} });
    } else if (action === "restore") {
      await prisma.noticeDismissal.deleteMany({ where: { ...where, noticeKey: input.noticeKey } });
    }
    const dismissals = await prisma.noticeDismissal.findMany({ where, select: { month: true, noticeKey: true } });
    return NextResponse.json({ dismissals }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error gestionando avisos ocultos:", error);
    return NextResponse.json({ error: "No se pudo guardar o consultar los avisos ocultos. Tus avisos siguen disponibles." }, { status: 500 });
  }
}

export function GET(request) { return handle(request, "list"); }
export function POST(request) { return handle(request, "hide"); }
export function DELETE(request) { return handle(request, "restore"); }
