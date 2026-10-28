"use client";

import { financialReadSchemas } from "@/lib/financialResponses";
import { uiFetch as apiFetch } from "@/lib/uiClient";

import { getNoticeKey, getNoticeMonth } from "@/lib/noticeDismissals";
import { useCallback, useEffect, useRef, useState } from "react";

export function useNoticeDismissals({ userId, month, enabled }: { userId?: string | null; month: string; enabled: boolean }) {
  const scope = enabled && userId ? `${userId}:${month}` : "";
  const [state, setState] = useState({ scope: "", entries: [] as { month: string; noticeKey: string }[], ready: false, error: "", saving: false });
  const scopeRef = useRef("");
  const revisionRef = useRef(0);
  const savingRef = useRef(false);

  const request = useCallback(async (method: "GET" | "POST" | "DELETE", noticeKey?: string) => {
    const response = await apiFetch(`/api/notice-dismissals${method === "GET" ? `?month=${month}` : ""}`, {
      method, expectedUserId: userId,
      errorMode: method === "GET" ? "inline" : "dialog",
      headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? { cache: "no-store" } : { body: JSON.stringify({ month, noticeKey }) }),
    });
    const result = financialReadSchemas["notice-dismissals"].parse(await response.json());
    if (!response.ok) throw new Error("No se pudo actualizar el aviso.");
    if (!Array.isArray(result.dismissals)) throw new Error("No se pudo consultar los avisos ocultos.");
    return result.dismissals;
  }, [userId, month]);

  const refresh = useCallback(async () => {
    if (!scope || savingRef.current) return;
    const revision = ++revisionRef.current;
    try {
      const entries = await request("GET");
      if (scopeRef.current === scope && revision === revisionRef.current) {
        setState({ scope, entries, ready: true, error: "", saving: false });
      }
    } catch {
      if (scopeRef.current === scope && revision === revisionRef.current) {
        // Ante un fallo de sincronización se muestran todos los avisos.
        setState({ scope, entries: [] as { month: string; noticeKey: string }[], ready: false, saving: false,
          error: "No se pudieron sincronizar los avisos ocultos. Se muestran todos por seguridad." });
      }
    }
  }, [scope, request]);

  useEffect(() => {
    scopeRef.current = scope;
    savingRef.current = false;
    const timer = window.setTimeout(refresh, 0);
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(timer);
      scopeRef.current = "";
      revisionRef.current += 1;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [scope, refresh]);

  const update = useCallback(async (notice: Parameters<typeof getNoticeKey>[0], hide: boolean, expectedMonth = month) => {
    const noticeKey = getNoticeKey(notice);
    if (!scope || scopeRef.current !== scope || !noticeKey || expectedMonth !== month || month !== getNoticeMonth()) {
      throw new Error("Cambió el mes o la sesión. Actualiza los avisos antes de continuar.");
    }
    if (savingRef.current) throw new Error("Espera a que termine la actualización del aviso.");
    savingRef.current = true;
    const revision = ++revisionRef.current;
    setState((previous) => ({ ...previous, saving: true }));
    try {
      const entries = await request(hide ? "POST" : "DELETE", noticeKey);
      if (scopeRef.current !== scope || revision !== revisionRef.current) {
        throw new Error("Cambió la sesión. Consulta de nuevo tus avisos.");
      }
      setState({ scope, entries, ready: true, error: "", saving: false });
    } finally {
      if (scopeRef.current === scope && revision === revisionRef.current) {
        savingRef.current = false;
        setState((previous) => ({ ...previous, saving: false }));
      }
    }
  }, [scope, month, request]);

  const current = state.scope === scope;
  return {
    month,
    entries: current ? state.entries : [],
    ready: current && state.ready,
    error: current ? state.error : "",
    saving: current && state.saving,
    refresh,
    update,
  };
}
