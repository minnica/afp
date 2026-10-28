
import type { User } from '@supabase/supabase-js';
import { isRecord } from './financialJson';
import { apiFetch } from "@/lib/apiFetch";
const setupCache = new Set<string>();

export async function ensureUserSetup(user: Pick<User, "id" | "email"> | null | undefined, { errorMode = "dialog" }: { errorMode?: "dialog" | "inline" } = {}) {
  if (!user?.id || !user?.email) return;

  const cacheKey = `afp:user-setup:${user.id}`;

  if (setupCache.has(cacheKey)) return;

  if (typeof window !== "undefined") {
    const isSetupCached =
      window.sessionStorage.getItem(cacheKey) === "done" ||
      window.localStorage.getItem(cacheKey) === "done";

    if (isSetupCached) {
      setupCache.add(cacheKey);
      return;
    }

    if (navigator.onLine === false) return;
  }

  const response = await apiFetch("/api/setup-user", {
    errorMode,
    method: "POST",
    expectedUserId: user.id,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: user.id,
      email: user.email,
    }),
  });

  if (!response.ok) {
    const data: unknown = await response.json().catch(() => ({}));
    throw new Error((isRecord(data) && typeof data.error === "string" ? data.error : "") || "No se pudo preparar el usuario.");
  }

  setupCache.add(cacheKey);

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(cacheKey, "done");
    window.localStorage.setItem(cacheKey, "done");
  }
}
