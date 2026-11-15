"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { uiFetch } from '@/lib/uiClient';
import { buildReceivableIncomeDraft, type IncomeDraft } from '@/lib/receivableIncomePrefill';
import { errorMessage, type NamedRecord, type Receivable } from '@/lib/uiTypes';

export function useReceivableIncomePrefill(userId: string | undefined, incomeTypes: NamedRecord[], ready: boolean, onReceivablesLoaded: (accounts: Receivable[]) => void) {
  const params = useSearchParams();
  const router = useRouter();
  const accountId = params.get('receivableAccountId');
  const chargeDate = params.get('chargeDate') || '';
  const [draft, setDraft] = useState<IncomeDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !userId || !accountId) return;
    const controller = new AbortController();
    const requestedAccountId = accountId;
    async function prepare() {
      setLoading(true);
      setError('');
      try {
        const response = await uiFetch('/api/receivables', { expectedUserId: userId, signal: controller.signal, errorMode: 'inline' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo preparar el cobro. Intenta de nuevo.');
        const prepared = buildReceivableIncomeDraft(data.receivables, incomeTypes, requestedAccountId, chargeDate);
        if (controller.signal.aborted) return;
        onReceivablesLoaded(data.receivables);
        setDraft(prepared);
        // Consume this explicit action so refresh/back never reopens or resets the form.
        const url = new URL(window.location.href);
        url.searchParams.delete('receivableAccountId');
        url.searchParams.delete('chargeDate');
        router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause) || 'No se pudo preparar el cobro. Intenta de nuevo.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void prepare();
    return () => controller.abort();
  }, [ready, userId, accountId, chargeDate, incomeTypes, router, attempt, onReceivablesLoaded]);

  return { draft, setDraft, loading: Boolean(accountId) && loading, error: accountId ? error : '', retry: () => setAttempt(value => value + 1) };
}
