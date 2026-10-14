"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

// Análisis usa el contrato financiero existente y la sesión autenticada.
export function useAnalysis() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [today] = useState(() => new Date());
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (controller.signal.aborted) return;
        if (!session) {
          router.replace("/login");
          return;
        }
        await ensureUserSetup(session.user);
        if (controller.signal.aborted) return;
        const clientDate = today.toLocaleDateString("en-CA");
        const params = new URLSearchParams({ userId: session.user.id, clientDate });
        const response = await fetch(`/api/dashboard?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo cargar la información.");
        if (!controller.signal.aborted) setDashboard(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || "No se pudo cargar la información.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [router, attempt, today]);

  return { dashboard, isLoading, error, retry, today };
}
