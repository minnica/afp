"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import CardBalances from "./CardBalances";

function BalancesSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Cargando saldos" aria-busy="true">
      <Card>
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
      <Skeleton className="h-6 w-40" />
      {[0, 1, 2].map(index => <Skeleton key={index} className="aspect-[1.586] w-full rounded-xl md:aspect-auto md:h-44" />)}
    </div>
  );
}

export default function CreditBalancesContent() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [cards, setCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestRef = useRef(null);
  const savingRef = useRef(false);

  const loadCards = useCallback(async (userId, { errorMode } = {}) => {
    if (savingRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await apiFetch("/api/cards", { expectedUserId: userId, errorMode, signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los saldos.");
      setCards(data.cards || []);
      setLoadError(false);
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(true);
      throw error;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) { router.replace("/login"); return; }
        setUser(session.user);
        await ensureUserSetup(session.user);
        if (!cancelled) await loadCards(session.user.id);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void init();
    return () => { cancelled = true; requestRef.current?.abort(); };
  }, [router, loadCards]);

  useEffect(() => {
    if (!user?.id || isLoading) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadCards(user.id, { errorMode: "inline" }).catch(() => {});
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user?.id, isLoading, loadCards]);

  async function saveCreditBalance(cardId, values) {
    if (!user) throw new Error("Inicia sesión para continuar.");
    savingRef.current = true;
    requestRef.current?.abort();
    try {
      const response = await apiFetch("/api/cards", {
        method: "PATCH", expectedUserId: user.id,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cardId, action: "UPDATE_CREDIT_BALANCE", ...values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el saldo.");
      setCards(previous => previous.map(card => card.id === cardId ? data.card : card));
      setLoadError(false);
    } catch (failure) {
      if (failure.status === 409) {
        savingRef.current = false;
        await loadCards(user.id, { errorMode: "inline" }).catch(() => {});
      }
      throw failure;
    } finally { savingRef.current = false; }
  }

  async function retry() {
    if (!user) { router.replace("/login"); return; }
    try {
      await ensureUserSetup(user);
      await loadCards(user.id);
    } catch { /* La sección conserva el error y permite reintentar. */ }
  }

  return (
    <main>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:py-8">
        {isLoading ? <BalancesSkeleton /> : <CardBalances cards={cards} onSave={saveCreditBalance} loadError={loadError} onRetry={retry} />}
      </div>
    </main>
  );
}
