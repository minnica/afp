"use client";
import { uiFetch as apiFetch, type Result } from "@/lib/uiClient";
import { errorMessage } from "@/lib/uiTypes";
import { useCallback, useEffect, useRef, useState } from "react";

export type CaptureResourceState<T> =
  | { status: "idle"; data: null; error: ""; loading: false }
  | { status: "loading"; data: T | null; error: string; loading: true }
  | { status: "ready"; data: T; error: ""; loading: false }
  | { status: "error"; data: T | null; error: string; loading: false };

export function useCaptureResource<const U extends string>(url: U | null, userId: string) {
  const [data, setData] = useState<{ url: U; value: Result<U, import("@/lib/apiFetch").ApiFetchOptions> } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const region = useRef<HTMLElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (!url || !mounted.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    try {
      const response = await apiFetch<U>(url, { expectedUserId: userId, errorMode: "inline", signal: controller.signal });
      const next = await response.json();
      if (!controller.signal.aborted) { setData({ url, value: next }); setError(""); }
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [url, userId]);
  useEffect(() => {
    mounted.current = true;
    let visible = true;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; });
    if (region.current) observer?.observe(region.current);
    const update = () => { if (visible && document.visibilityState === "visible") void refresh(); };
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(update, 30000);
    window.addEventListener("focus", update); window.addEventListener("online", update); document.addEventListener("visibilitychange", update);
    return () => { mounted.current = false; request.current?.abort(); observer?.disconnect(); clearTimeout(initial); clearInterval(interval);
      window.removeEventListener("focus", update); window.removeEventListener("online", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);
  const current = data?.url === url ? data.value : null;
  let state: CaptureResourceState<Result<U, import("@/lib/apiFetch").ApiFetchOptions>>;
  if (loading) state = { status: "loading", data: current, error, loading: true };
  else if (error) state = { status: "error", data: current, error, loading: false };
  else if (current !== null) state = { status: "ready", data: current, error: "", loading: false };
  else state = { status: "idle", data: null, error: "", loading: false };
  return { ...state, refresh, region };
}
