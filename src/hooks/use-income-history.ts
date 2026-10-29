"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { uiFetch } from "@/lib/uiClient";
import type { UiResponse } from "@/lib/uiResponseSchemas";
import { errorMessage } from "@/lib/uiTypes";

interface HistoryQuery {
  pagination: PaginationState;
  sorting: SortingState;
  globalFilter: string;
  incomeTypeId: string;
  startDate: string;
  endDate: string;
}

const initialQuery: HistoryQuery = {
  pagination: { pageIndex: 0, pageSize: 10 },
  sorting: [{ id: "date", desc: true }],
  globalFilter: "",
  incomeTypeId: "",
  startDate: "",
  endDate: "",
};

export function useIncomeHistory(userId: string | undefined) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<UiResponse<"incomes"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const currentQuery = useRef(query);
  const activeRequest = useRef<AbortController | null>(null);

  const reload = useCallback(async (owner: string, { mutationCompleted = false } = {}) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const selected = currentQuery.current;
    const sort = selected.sorting[0];
    const params = new URLSearchParams({
      userId: owner,
      page: String(selected.pagination.pageIndex + 1),
      pageSize: String(selected.pagination.pageSize),
      q: selected.globalFilter,
      incomeTypeId: selected.incomeTypeId,
      startDate: selected.startDate,
      endDate: selected.endDate,
      sortBy: sort?.id || "date",
      sortDirection: sort?.desc === false ? "asc" : "desc",
    });
    setIsLoading(true);
    setError("");
    try {
      const response = await uiFetch(`/api/incomes?${params}`, {
        signal: controller.signal, expectedUserId: owner, mutationCompleted, errorMode: "inline",
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar ingresos.");
      setResult(data);
      if (data.page !== selected.pagination.pageIndex + 1) {
        setQuery(previous => previous === selected
          ? { ...previous, pagination: { ...previous.pagination, pageIndex: data.page - 1 } }
          : previous);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setResult(null);
      setError(errorMessage(cause) || "No se pudieron cargar ingresos.");
      throw cause;
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    currentQuery.current = query;
    let cancelled = false;
    // Coalesce StrictMode setup/cleanup before starting a request.
    void Promise.resolve().then(() => {
      if (!cancelled && userId) return reload(userId);
    }).catch(() => {}); // Error visible en el historial.
    return () => { cancelled = true; activeRequest.current?.abort(); };
  }, [query, userId, reload]);

  return { query, setQuery, result, isLoading, error, reload };
}
