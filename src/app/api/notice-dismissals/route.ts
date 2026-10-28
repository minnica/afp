import { readFinancialInput } from "@/lib/financialContracts";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { isNoticeKey } from "@/lib/noticeDismissals";


function validMonth(month: unknown): month is string {
  return typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

async function handle(request: Request, action: "list" | "hide" | "restore") {
  try {
    const user = await requireApiUser(request);
    const input = action === "list" ? Object.fromEntries(new URL(request.url).searchParams) : readFinancialInput(await request.json().catch(() => null));
    if (!input || !validMonth(input.month) || (action !== "list" && !isNoticeKey(input.noticeKey))) {
      return NextResponse.json({ error: "El aviso o el mes no son válidos." }, { status: 400 });
    }
    const where = { userId: user.id, month: input.month };
    if (action === "hide") {
      const identity = { ...where, noticeKey: input.noticeKey! };
      await prisma.noticeDismissal.upsert({ where: { userId_month_noticeKey: identity }, create: identity, update: {} });
    } else if (action === "restore") {
      await prisma.noticeDismissal.deleteMany({ where: { ...where, noticeKey: input.noticeKey! } });
    }
    const dismissals = await prisma.noticeDismissal.findMany({ where, select: { month: true, noticeKey: true } });
    return NextResponse.json({ dismissals }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error gestionando avisos ocultos:", error);
    return NextResponse.json({ error: "No se pudo guardar o consultar los avisos ocultos. Tus avisos siguen disponibles." }, { status: 500 });
  }
}

export function GET(request: Request) { return handle(request, "list"); }
export function POST(request: Request) { return handle(request, "hide"); }
export function DELETE(request: Request) { return handle(request, "restore"); }
