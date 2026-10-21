"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export function useCaptureResource(url, userId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const region = useRef(null);
  const request = useRef(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (!url || !mounted.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    try {
      const response = await apiFetch(url, { expectedUserId: userId, errorMode: "inline", signal: controller.signal });
      const next = await response.json();
      if (!controller.signal.aborted) { setData({ url, value: next }); setError(""); }
    } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [url, userId]);
  useEffect(() => {
    mounted.current = true;
    let visible = true;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => { visible = entries[0].isIntersecting; });
    if (region.current) observer?.observe(region.current);
    const update = () => { if (visible && document.visibilityState === "visible") void refresh(); };
    const initial = window.setTimeout(refresh, 0);
    const interval = window.setInterval(update, 30000);
    window.addEventListener("focus", update); window.addEventListener("online", update); document.addEventListener("visibilitychange", update);
    return () => { mounted.current = false; request.current?.abort(); observer?.disconnect(); clearTimeout(initial); clearInterval(interval);
      window.removeEventListener("focus", update); window.removeEventListener("online", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);
  return { data: data?.url === url ? data.value : null, error, loading, refresh, region };
}
