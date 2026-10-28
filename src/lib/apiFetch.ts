import { isRecord } from './financialJson';
import { RequestError } from './requestErrors';
export type ApiFetchOptions = RequestInit & { expectedUserId?: string | null; errorMode?: 'dialog' | 'inline'; timeoutMs?: number; mutationCompleted?: boolean; recoveryHint?: string; validateResponse?: (value: unknown) => unknown };
import { supabase } from "@/lib/supabase";
import { canRepeatRequest, requestError } from "@/lib/requestErrors";
import { getRecoveryScope, recoverRequest } from "@/lib/requestRecovery";

// Consultar la sesión en cada envío permite usar el token renovado por Supabase.
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  if (typeof url !== "string" || !url.startsWith("/api/")) throw new Error("Ruta de API no válida.");
  const {
    expectedUserId = new URL(url, "http://localhost").searchParams.get("userId"),
    errorMode = "dialog", timeoutMs = 20000, mutationCompleted = false, recoveryHint, validateResponse, ...init
  } = options;
  const method = (init.method || "GET").toUpperCase();
  const repeatable = canRepeatRequest(url, method, init.body);
  const requestScope = getRecoveryScope();
  let owner = expectedUserId;

  async function attempt() {
    const details = { url, method, repeatable };
    let sent = false;
    let response;
    const controller = new AbortController();
    const signal = controller.signal;
    const abort = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener("abort", abort, { once: true });
    if (init.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException("Tiempo agotado", "TimeoutError")), timeoutMs);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw requestError({ ...details, kind: "offline", sent: false });
      }
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.access_token) throw requestError({ ...details, kind: "session", sent: false });
      if (owner && session.user.id !== owner) throw requestError({ ...details, kind: "account", sent: false });
      owner = session.user.id;
      if (signal?.aborted) throw signal.reason;
      if (requestScope !== getRecoveryScope()) throw new DOMException("La sección cambió", "AbortError");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);
      sent = true;
      response = await fetch(url, { ...init, headers, signal, cache: "no-store" });
      // Validar sin consumir el cuerpo que espera la pantalla.
      const data: unknown = typeof response.clone === "function" ? await response.clone().json() : null;
      if (typeof response.clone === "function" && (!data || typeof data !== "object" || Array.isArray(data))) {
        throw new SyntaxError("Respuesta incompleta");
      }
      if (!response.ok) {
        const retryAfter = response.headers?.get("Retry-After");
        const seconds = Number(retryAfter);
        const retryAt = retryAfter ? (Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter)) : undefined;
        throw requestError({ ...details, status: response.status, message: isRecord(data) ? data.error : undefined, retryAt });
      }
      // Validación opcional del contrato dentro de la recuperación compartida.
      if (validateResponse) validateResponse(data);
      return response;
    } catch (error) {
      if (init.signal?.aborted) throw init.signal?.reason || error;
      if (error instanceof Error && error.name === "AbortError" && !signal.aborted) throw error;
      const failure = error instanceof RequestError ? error : requestError({ ...details, sent, status: response?.ok ? undefined : response?.status,
        kind: (isRecord(signal?.reason) ? signal.reason.name : undefined) === "TimeoutError" ? "timeout" : response ? "invalid" : "network" });
      failure.mutationCompleted = mutationCompleted;
      failure.hint = mutationCompleted
        ? "El cambio ya se guardó."
        : recoveryHint;
      throw failure;
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener("abort", abort);
    }
  }

  try {
    return await attempt();
  } catch (error) {
    // La validación continúa junto a los campos; la cola y las consultas de fondo
    // usan su aviso local sin interrumpir la captura.
    const formValidation = error instanceof RequestError && [400, 422].includes(error.status ?? 0) && ["POST", "PUT", "PATCH"].includes(method);
    if (errorMode === "inline" || error instanceof Error && error.name === "AbortError" || init.signal?.aborted || formValidation) throw error;
    return recoverRequest(error instanceof RequestError ? error : new RequestError(error instanceof Error ? error.message : String(error)), attempt, { signal: init.signal, requestScope });
  }
}
