import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scheduleCalendarSync } from "@/lib/calendar/schedule";

export class ApiAccessError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const apiResponse = {
  json(body, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Authorization");
    return NextResponse.json(body, { ...options, headers });
  },
};

export async function requireApiUser(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new ApiAccessError("Inicia sesión para continuar.", 401);
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let verification;
  try {
    verification = await auth.auth.getUser(token);
  } catch {
    throw new ApiAccessError("No se pudo verificar la sesión en este momento. Inténtalo de nuevo.", 503);
  }
  const { data, error } = verification;
  if (error && (error.name === "AuthRetryableFetchError" || error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)) {
    throw new ApiAccessError("No se pudo verificar la sesión en este momento. Inténtalo de nuevo.", 503);
  }
  if (error || !data?.user?.id) throw new ApiAccessError("La sesión venció. Vuelve a iniciar sesión.", 401);
  // Se ejecuta tras la respuesta/commit; los triggers deciden si cambió la agenda.
  // La revisión diaria recupera interrupciones y escrituras directas fuera de las API.
  if (["POST", "PATCH", "DELETE", "PUT"].includes(request.method) && !new URL(request.url).pathname.startsWith("/api/calendar/")) scheduleCalendarSync(data.user.id);
  return data.user;
}

export function apiAccessErrorResponse(error) {
  if (error instanceof ApiAccessError) return apiResponse.json({ error: error.message }, { status: error.status });
  // Un ID ajeno y uno inexistente producen la misma respuesta.
  if (error.code === "P2025") return apiResponse.json({ error: "Registro no encontrado." }, { status: 404 });
  if (String(error.message).includes("El total no puede ser menor que los abonos identificados")) {
    return apiResponse.json({ error: "Este total incluye abonos identificados. Revierte primero el abono en Mi dinero o en Captura automática antes de reducir el total." }, { status: 409 });
  }
  return null;
}

const referenceModels = {
  debitAccountId: "moneyAccount", cardId: "card", categoryId: "category", personId: "person", incomeTypeId: "incomeType",
  receivableAccountId: "receivableAccount", payableAccountId: "payableAccount", subscriptionId: "subscription",
};

export async function requireOwnedReferences(db, userId, input, fields) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiAccessError("Datos no válidos.", 400);
  }
  if (input.id !== undefined && (typeof input.id !== "string" || !input.id)) {
    throw new ApiAccessError("ID no válido.", 400);
  }
  for (const field of fields) {
    const id = input[field];
    if (id === undefined || id === null || id === "") continue;
    if (typeof id !== "string") throw new ApiAccessError("Referencia no válida.", 400);
    const record = await db[referenceModels[field]].findFirst({ where: { id, userId }, select: { id: true } });
    if (!record) throw new ApiAccessError("El registro vinculado no está disponible.", 404);
  }
}
