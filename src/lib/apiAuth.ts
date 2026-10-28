import type { Prisma, PrismaClient } from '@prisma/client';
import { isRecord } from './financialJson';
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";

export class ApiAccessError extends Error {
  status: number;
  retryAfter?: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const apiResponse = {
  json<T>(body: T, options: ResponseInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Authorization");
    return NextResponse.json(body, { ...options, headers });
  },
};

export async function requireApiUser(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new ApiAccessError("Inicia sesión para continuar.", 401);
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let verification;
  try {
    verification = await auth.auth.getUser(token);
  } catch {
    throw new ApiAccessError("No se pudo verificar la sesión en este momento. Inténtalo de nuevo.", 503);
  }
  const { data, error } = verification;
  if (error && (error.name === "AuthRetryableFetchError" || error.status === 0 || error.status === 408 || error.status === 429 || (error.status ?? 0) >= 500)) {
    throw new ApiAccessError("No se pudo verificar la sesión en este momento. Inténtalo de nuevo.", 503);
  }
  if (error || !data?.user?.id) throw new ApiAccessError("La sesión venció. Vuelve a iniciar sesión.", 401);
  // Se ejecuta tras la respuesta/commit; los triggers deciden si cambió la agenda.
  // La revisión diaria recupera interrupciones y escrituras directas fuera de las API.
  if (["POST", "PATCH", "DELETE", "PUT"].includes(request.method) && !new URL(request.url).pathname.startsWith("/api/calendar/")) scheduleCalendarSync(data.user.id);
  return data.user;
}

export function apiAccessErrorResponse(error: unknown) {
  if (error instanceof ApiAccessError) return apiResponse.json({ error: error.message }, { status: error.status });
  // Un ID ajeno y uno inexistente producen la misma respuesta.
  if (isRecord(error) && error.code === "P2025") return apiResponse.json({ error: "Registro no encontrado." }, { status: 404 });
  if (String(isRecord(error) ? error.message : undefined).includes("El total no puede ser menor que los abonos identificados")) {
    return apiResponse.json({ error: "Este total incluye abonos identificados. Revierte primero el abono en Mi dinero o en Captura automática antes de reducir el total." }, { status: 409 });
  }
  return null;
}

const referenceModels = {
  debitAccountId: "moneyAccount", cardId: "card", categoryId: "category", personId: "person", incomeTypeId: "incomeType",
  receivableAccountId: "receivableAccount", payableAccountId: "payableAccount", subscriptionId: "subscription",
} as const;

export async function requireOwnedReferences(db: PrismaClient | Prisma.TransactionClient, userId: string, input: unknown, fields: readonly (keyof typeof referenceModels)[]) {
  if (!isRecord(input)) {
    throw new ApiAccessError("Datos no válidos.", 400);
  }
  if (input.id !== undefined && (typeof input.id !== "string" || !input.id)) {
    throw new ApiAccessError("ID no válido.", 400);
  }
  for (const field of fields) {
    const id = input[field];
    if (id === undefined || id === null || id === "") continue;
    if (typeof id !== "string") throw new ApiAccessError("Referencia no válida.", 400);
    const record = await findReference(db, referenceModels[field], id, userId);
    if (!record) throw new ApiAccessError("El registro vinculado no está disponible.", 404);
  }
}

// Delegates have different generic signatures; each branch retains Prisma inference.
async function findReference(db: PrismaClient | Prisma.TransactionClient, model: (typeof referenceModels)[keyof typeof referenceModels], id: string, userId: string) {
  const args = { where: { id, userId }, select: { id: true } } as const;
  switch (model) {
    case 'moneyAccount': return db.moneyAccount.findFirst(args);
    case 'card': return db.card.findFirst(args);
    case 'category': return db.category.findFirst(args);
    case 'person': return db.person.findFirst(args);
    case 'incomeType': return db.incomeType.findFirst(args);
    case 'receivableAccount': return db.receivableAccount.findFirst(args);
    case 'payableAccount': return db.payableAccount.findFirst(args);
    case 'subscription': return db.subscription.findFirst(args);
  }
}
