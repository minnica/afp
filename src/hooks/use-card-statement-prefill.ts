"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { uiFetch } from '@/lib/uiClient';
import { errorMessage, type Cycle } from '@/lib/uiTypes';

export function useCardStatementPrefill(userId: string | undefined, ready: boolean) {
  const params = useSearchParams();
  const cycleId = params.get('statementCycleId');
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !userId || !cycleId) return;
    const controller = new AbortController();
    const requestedId = cycleId;
    async function prepare() {
      setLoading(true);
      setError('');
      try {
        // This authenticated lookup also covers cycles outside the visible year/page.
        const response = await uiFetch(`/api/card-cycles?cycleId=${encodeURIComponent(requestedId)}`, {
          expectedUserId: userId, signal: controller.signal, errorMode: 'inline',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo preparar el estado de cuenta. Intenta de nuevo.');
        if (!data.cycle) throw new Error('Este corte ya no está disponible. Revisa los ciclos de tus tarjetas.');
        if (controller.signal.aborted) return;
        setCycle(data.cycle);
        const url = new URL(window.location.href);
        url.searchParams.delete('statementCycleId');
        router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause) || 'No se pudo preparar el estado de cuenta. Intenta de nuevo.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void prepare();
    return () => controller.abort();
  }, [ready, userId, cycleId, router, attempt]);

  return { cycle, setCycle, loading: Boolean(cycleId) && loading, error: cycleId ? error : '', retry: () => setAttempt(value => value + 1) };
}
