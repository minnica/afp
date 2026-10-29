"use client";
import { isLocalDataClosed, localDataGeneration, writeFinancialBootstrap } from "@/lib/localFinancialData";
import AutomaticRecordingLink from "@/components/configuracion/AutomaticRecordingLink";
import CaptureStatus from "@/components/gastos/CaptureStatus";
import OfflineExpenseRestore from "./OfflineExpenseRestore";
import OfflineCaptureConflicts from "@/components/gastos/OfflineCaptureConflicts";
import type { ExpenseFilter } from "@/lib/expenseFilters";
import type { OfflineExpense } from "@/lib/offlineExpenseContracts";
import { observeOfflineExpenses } from "@/lib/offlineExpenseObserver";
import { uiResponseSchemas, type UiResponse } from "@/lib/uiResponseSchemas";
import type { CreateError, Expense, ExpenseRow, Card as FinancialCard, NamedRecord } from "@/lib/uiTypes";
import { errorMessage } from "@/lib/uiTypes";
import type { User } from "@supabase/supabase-js";
import type { ColumnDef } from "@tanstack/react-table";
import type * as React from "react";

import { RequestError } from "@/lib/requestErrors";
import { getRecoveryScope, recoverRequest } from "@/lib/requestRecovery";
import { uiFetch as apiFetch } from "@/lib/uiClient";

import { useCreationDraft } from "@/hooks/use-creation-draft";
import { useIsMobile } from "@/hooks/use-mobile";

import DailyExpenseCards,{ DailyExpenseCardsSkeleton } from "@/components/gastos/DailyExpenseCards";
import ExpenseCreateSurface,{ useExpenseDialogMode } from "@/components/gastos/ExpenseCreateSurface";
import SharedExpenseFields from "@/components/gastos/SharedExpenseFields";
import SubscriptionCharges from "@/components/gastos/SubscriptionCharges";
import { getCashContributionError, getPersonalExpenseAmount, sumPersonalExpenses } from "@/lib/sharedExpenses";

import { PaymentMethodSelector } from "@/components/ui/payment-method-selector";
import { ResponsiveSelect } from "@/components/ui/responsive-select";

import { ExpenseFilterCombobox } from "@/components/ui/expense-filter-combobox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { matchesExpenseFilters } from "@/lib/expenseFilters";
import { createExpenseReader, type ExpensesUrl } from "@/lib/expenseReader";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
addOfflineExpense,
readOfflineExpenses,
syncOfflineExpenses,
} from "@/lib/offlineExpenses";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

import {
AlertDialog,
AlertDialogAction,
AlertDialogCancel,
AlertDialogContent,
AlertDialogDescription,
AlertDialogFooter,
AlertDialogHeader,
AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Card,
CardAction,
CardContent,
CardHeader,
CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataTable } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import {
Dialog,
DialogContent,
DialogDescription,
DialogFooter,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const GASTOS_BOOTSTRAP_CACHE_PREFIX = "afp:gastos-bootstrap:";

function getBootstrapCacheKey(userId: string) {
  return `${GASTOS_BOOTSTRAP_CACHE_PREFIX}${userId}`;
}

function readCachedBootstrap(userId: string) {
  if (typeof window === "undefined" || !userId) return null;

  try {
    if (isLocalDataClosed(userId)) return null;
    const rawValue = window.localStorage.getItem(getBootstrapCacheKey(userId));
    return rawValue ? uiResponseSchemas["gastos/bootstrap"].parse(JSON.parse(rawValue)) : null;
  } catch {
    return null;
  }
}

function writeCachedBootstrap(userId: string, data: UiResponse<"gastos/bootstrap">, generation: string) {
  if (typeof window === "undefined" || !userId) return;

  writeFinancialBootstrap(userId, {
      ...data,
      cachedAt: new Date().toISOString(),
    }, generation);
}

function getExpenseMonth(expense: { payload?: { date?: unknown }; date?: unknown }) {
  const dateValue = expense?.payload?.date || expense?.date;

  if (!dateValue) return "";

  return String(dateValue).slice(0, 7);
}

function formatMoney(value: unknown) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatMonthLabel(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year!, month! - 1, 1);

  if (!Number.isInteger(year) || !Number.isInteger(month) || Number.isNaN(date.getTime())) {
    return yearMonth;
  }

  const label = format(date, "MMMM yyyy", { locale: es });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isValidYearMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;

  const [, month] = value.split("-").map(Number);
  return month! >= 1 && month! <= 12;
}

function formatExpenseDate(dateString: string) {
  const datePart = String(dateString).split("T")[0]!;
  const [year, month, day] = datePart.split("-").map(Number);
  return format(new Date(year!, month! - 1, day), "d MMM yyyy", { locale: es });
}

function getPaymentMethodLabel(paymentMethod: string) {
  if (paymentMethod === "DEBIT") return "Débito";
  if (paymentMethod === "CARD") return "Tarjeta";
  return "Efectivo";
}

function getMonthRange(yearMonth: string) {
  if (!yearMonth) return { startDate: "", endDate: "" };

  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year!, month!, 0).getDate();

  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default function GastosContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const mobileNavigation = useIsMobile();
  const compactEntry = useExpenseDialogMode();

  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<NamedRecord[]>([]);
  const [cards, setCards] = useState<FinancialCard[]>([]);
  const [moneyAccounts, setMoneyAccounts] = useState<NamedRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [initialExpenses, setInitialExpenses] = useState<({ url: ExpensesUrl } & Pick<UiResponse<"gastos/bootstrap">, "expenses" | "availableMonths">) | null>(null);

  const [date, setDate] = useState(getTodayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [cardId, setCardId] = useState("");
  const [debitAccountId, setDebitAccountId] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [isSharedExpense, setIsSharedExpense] = useState(false);
  const [cashContributionAmount, setCashContributionAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isExpensesLoading, setIsExpensesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncingOfflineExpenses, setIsSyncingOfflineExpenses] =
    useState(false);
  const [pendingOfflineExpenses, setPendingOfflineExpenses] = useState<OfflineExpense[]>([]);
  const [error, setError] = useState("");
  const [expensesError, setExpensesError] = useState("");
  const [createError, setCreateError] = useState<CreateError | null>(null);

  const [people, setPeople] = useState<NamedRecord[]>([]);
  const [receivables, setReceivables] = useState<UiResponse<"gastos/bootstrap">["receivables"]>([]);
  const [payables, setPayables] = useState<UiResponse<"gastos/bootstrap">["payables"]>([]);
  const [subscriptions, setSubscriptions] = useState<UiResponse<"gastos/bootstrap">["subscriptions"]>([]);

  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [personId, setPersonId] = useState("");
  const [receivableMode, setReceivableMode] = useState("CREATE");
  const [receivableAccountId, setReceivableAccountId] = useState("");
  const [payableAccountId, setPayableAccountId] = useState("NONE");
  const [subscriptionId, setSubscriptionId] = useState("NONE");

  useCreationDraft({
    name: "gastos",
    userId: user?.id,
    enabled: mobileNavigation,
    values: { date, paymentMethod, cardId, debitAccountId, concept, amount, isSharedExpense, cashContributionAmount, categoryId, notes, showMoreOptions, personId, receivableMode, receivableAccountId, payableAccountId, subscriptionId },
    setters: { date: setDate, paymentMethod: setPaymentMethod, cardId: setCardId, debitAccountId: setDebitAccountId, concept: setConcept, amount: setAmount, isSharedExpense: setIsSharedExpense, cashContributionAmount: setCashContributionAmount, categoryId: setCategoryId, notes: setNotes, showMoreOptions: setShowMoreOptions, personId: setPersonId, receivableMode: setReceivableMode, receivableAccountId: setReceivableAccountId, payableAccountId: setPayableAccountId, subscriptionId: setSubscriptionId },
  });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("CASH");
  const [editCardId, setEditCardId] = useState("");
  const [editDebitAccountId, setEditDebitAccountId] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editIsSharedExpense, setEditIsSharedExpense] = useState(false);
  const [editCashContributionAmount, setEditCashContributionAmount] = useState("");
  const [editLinkedAccount, setEditLinkedAccount] = useState(false);
  const [editRefunded, setEditRefunded] = useState(false);
  const [editError, setEditError] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSubscriptionId, setEditSubscriptionId] = useState("NONE");

  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseRow | null>(null);

  const [filterMonth, setFilterMonth] = useState("");
  const [filterDate, setFilterDate] = useState(getTodayInputValue());
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterConcept, setFilterConcept] = useState("");
  const [filterCardId, setFilterCardId] = useState("");
  const [filterAmount, setFilterAmount] = useState("");
  const [mobileFilters, setMobileFilters] = useState<ExpenseFilter[]>([]);
  const [mobileFilterResetKey, setMobileFilterResetKey] = useState(0);
  const didLoadInitialExpensesRef = useRef(false);
  const [expenseReader] = useState(() => createExpenseReader({
    onData: data => { setExpenses(data.expenses || []); setAvailableMonths(data.availableMonths || []); },
    onInvalidate: () => setExpenses([]),
    onLoading: setIsExpensesLoading,
    onError: setExpensesError,
  }));
  const expensesUrl = user ? buildExpensesUrl(user.id) : null;

  useEffect(() => {
    expenseReader.select(expensesUrl);
    return () => expenseReader.select(null);
  }, [expenseReader, expensesUrl]);

  useEffect(() => {
    // También si Auth y el respaldo offline resuelven dentro del mismo lote de React:
    // seleccionar primero la URL y después aplicar el snapshot de esa selección.
    if (initialExpenses) expenseReader.prime(initialExpenses.url, initialExpenses);
  }, [expenseReader, initialExpenses]);

  async function loadInitialData(userId: string, signal: AbortSignal) {
    const generation = localDataGeneration(userId);
    const today = getTodayInputValue();
    const params = new URLSearchParams({
      userId,
      startDate: today,
      endDate: today,
    });

    try {
      const response = await apiFetch(`/api/gastos/bootstrap?${params.toString()}`, {
        signal, expectedUserId: userId,
        errorMode: readCachedBootstrap(userId) ? "inline" : "dialog",
      });
      const data = await response.json();
      if (signal.aborted) return;

      if (!response.ok) {
        throw new Error(data.error || "No se pudieron cargar datos iniciales.");
      }

      writeCachedBootstrap(userId, data, generation);

      setCategories(data.categories || []);
      setPeople(data.people || []);
      setCards(data.cards || []);
      setMoneyAccounts(data.moneyAccounts || []);
      setInitialExpenses({ url: `/api/expenses?${params.toString()}`, expenses: data.expenses, availableMonths: data.availableMonths });
      setReceivables(data.receivables || []);
      setPayables(data.payables || []);
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      if (signal.aborted) return;
      const cachedData = readCachedBootstrap(userId);

      if (!cachedData) {
        throw err;
      }

      setCategories(cachedData.categories || []);
      setPeople(cachedData.people || []);
      setCards(cachedData.cards || []);
      setMoneyAccounts(cachedData.moneyAccounts || []);
      setInitialExpenses({ url: `/api/expenses?${params.toString()}`, expenses: cachedData.expenses, availableMonths: cachedData.availableMonths });
      setReceivables(cachedData.receivables || []);
      setPayables(cachedData.payables || []);
      setSubscriptions(cachedData.subscriptions || []);
      toast.warning("Sin conexión. Usando datos guardados en este dispositivo.");
    }

    didLoadInitialExpensesRef.current = true;
  }

  function buildExpensesUrl(userId: string): `/api/expenses?${string}` {
    const params = new URLSearchParams({ userId });

    if (filterDate) {
      params.set("startDate", filterDate);
      params.set("endDate", filterDate);
    } else if (filterMonth) {
      const range = getMonthRange(filterMonth);
      params.set("startDate", range.startDate);
      params.set("endDate", range.endDate);
    }

    // En móvil se consulta el período completo para combinar alternativas por campo.
    if (mobileNavigation) return `/api/expenses?${params.toString()}`;

    if (filterCategoryId) params.set("categoryId", filterCategoryId);

    if (filterConcept.trim()) {
      params.set("concept", filterConcept.trim());
    }

    if (filterCardId === "DEBIT" || filterCardId.startsWith("DEBIT:")) { params.set("paymentMethod", "DEBIT"); if (filterCardId.startsWith("DEBIT:")) params.set("debitAccountId", filterCardId.slice(6)); }
    else if (filterCardId === "CASH") {
      params.set("paymentMethod", "CASH");
    } else if (filterCardId) {
      params.set("paymentMethod", "CARD");
      params.set("cardId", filterCardId);
    }

    if (filterAmount.trim()) {
      params.set("amount", filterAmount.trim());
    }

    return `/api/expenses?${params.toString()}`;
  }

  const loadExpenses = expenseReader.load;

  async function loadReceivables(userId: string, { mutationCompleted = false, errorMode = "dialog" }: { errorMode?: "dialog" | "inline"; mutationCompleted?: boolean } = {}) {
    const response = await apiFetch(`/api/receivables?userId=${userId}`, { mutationCompleted, errorMode });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "No se pudieron cargar cuentas por cobrar.",
      );
    }

    setReceivables(data.receivables || []);
  }

  async function loadPayables(userId: string, { mutationCompleted = false, errorMode = "dialog" }: { mutationCompleted?: boolean; errorMode?: "inline" | "dialog" } = {}) {
    const response = await apiFetch(`/api/payables?userId=${userId}`, { mutationCompleted, errorMode });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar cuentas por pagar.");
    }

    setPayables(data.payables || []);
  }

  async function loadSubscriptions(userId: string) {
    const response = await apiFetch(`/api/subscriptions?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar suscripciones.");
    }

    setSubscriptions(data.subscriptions || []);
  }

  function getCreateExpensePayload() {
    return {
      userId: user!.id,
      date,
      paymentMethod,
      cardId,
      debitAccountId: paymentMethod === "DEBIT" ? debitAccountId : null,
      concept,
      amount,
      cashContributionAmount: isSharedExpense ? cashContributionAmount : 0,
      categoryId,
      notes,
      personId,
      receivableAccountId:
        payableAccountId === "NONE" && receivableMode === "EXISTING"
          ? receivableAccountId
          : null,
      payableAccountId: payableAccountId === "NONE" ? null : payableAccountId,
      subscriptionId: subscriptionId === "NONE" ? null : subscriptionId,
      createReceivable: Boolean(
        personId && receivableMode === "CREATE" && payableAccountId === "NONE",
      ),
    };
  }

  function resetCreateExpenseForm() {
    setConcept("");
    setAmount("");
    setIsSharedExpense(false);
    setCashContributionAmount("");
    setNotes("");
    setShowMoreOptions(false);
    setPersonId("");
    setReceivableMode("CREATE");
    setReceivableAccountId("");
    setPayableAccountId("NONE");
    setSubscriptionId("NONE");
  }

  async function refreshPendingOfflineExpenses(userId: string) {
    const pending = await readOfflineExpenses(userId);
    setPendingOfflineExpenses(pending);
    return pending;
  }

  async function syncPendingExpenses({ silent = false } = {}) {
    if (!user || isSyncingOfflineExpenses) return;

    setIsSyncingOfflineExpenses(true);

    try {
      const { failedExpenses, syncedExpenses } = await syncOfflineExpenses(
        user.id, { errorMode: silent ? "inline" : "dialog" },
      );

      await refreshPendingOfflineExpenses(user!.id);

      if (syncedExpenses.length > 0) {
        await loadExpenses(user.id, { force: true, mutationCompleted: true, errorMode: silent ? "inline" : "dialog" });
        await loadReceivables(user.id, { mutationCompleted: true, errorMode: silent ? "inline" : "dialog" });
        await loadPayables(user.id, { mutationCompleted: true, errorMode: silent ? "inline" : "dialog" });

        toast.success(
          syncedExpenses.length === 1
            ? "Gasto pendiente sincronizado."
            : `${syncedExpenses.length} gastos pendientes sincronizados.`,
        );
      }

      if (!silent && failedExpenses.length > 0) {
        toast.warning("Quedaron gastos pendientes por sincronizar.");
      }
    } catch (err) {
      setError(errorMessage(err) || "No se pudieron sincronizar pendientes.");
      if (!silent) toast.error(errorMessage(err) || "No se pudieron sincronizar pendientes.");
    } finally {
      setIsSyncingOfflineExpenses(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (controller.signal.aborted) return;

        if (!session) {
          router.replace("/login");
          return;
        }

        setUser(session.user);

        await ensureUserSetup(session.user);
        if (controller.signal.aborted) return;

        await loadInitialData(session.user.id, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(errorMessage(err) || "Ocurrió un error.");
      } finally {
        if (!controller.signal.aborted) setIsCheckingSession(false);
      }
    }

    checkSession();
    return () => controller.abort();
  }, [router]);

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
    }

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    return observeOfflineExpenses({
      userId: user!.id,
      onPending: setPendingOfflineExpenses,
      onConfirmed: () => Promise.all([
        loadExpenses(user.id, { force: true, mutationCompleted: true, errorMode: "inline" }),
        loadReceivables(user.id, { mutationCompleted: true, errorMode: "inline" }),
        loadPayables(user.id, { mutationCompleted: true, errorMode: "inline" }),
      ]),
      onError: setError,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filterDate, filterMonth, filterCategoryId, filterConcept, filterCardId, filterAmount, mobileNavigation]);

  useEffect(() => {
    if (!user || !isOnline || isSaving || pendingOfflineExpenses.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      syncPendingExpenses({ silent: true });
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isOnline, isSaving, pendingOfflineExpenses.length]);

  useEffect(() => {
    if (!user || isCheckingSession || !didLoadInitialExpensesRef.current) return;

    const timeoutId = window.setTimeout(() => {
      // El lector publica únicamente el error de la selección vigente.
      void loadExpenses(user.id).catch(() => {});
    }, 250);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    isCheckingSession,
    filterMonth,
    filterDate,
    filterCategoryId,
    filterConcept,
    filterCardId,
    filterAmount,
    mobileNavigation,
  ]);

  async function createExpense() {
    if (!user || isSaving) return false;

    if (!concept.trim()) {
      setCreateError({ field: "concept", message: "El concepto es requerido." });
      return false;
    }
    if (!amount || Number(amount) <= 0) {
      setCreateError({ field: "amount", message: "El monto debe ser mayor a 0." });
      return false;
    }
    if (!categoryId) {
      setCreateError({ field: "categoryId", message: "La categoría es requerida." });
      return false;
    }
    if (paymentMethod === "DEBIT" && !debitAccountId) { setCreateError({ field: "debit-account", message: "Selecciona la cuenta de débito." }); return; }
    if (paymentMethod === "CARD" && !cardId) {
      setCreateError({ field: "cardId", message: "Debes seleccionar una tarjeta." });
      return false;
    }

    const contributionError = isSharedExpense && !(Number(cashContributionAmount) > 0)
      ? "Ingresa lo que recibiste en efectivo."
      : getCashContributionError(getCreateExpensePayload());
    if (contributionError) {
      setCreateError({ field: "cashContributionAmount", message: contributionError });
      return false;
    }

    setCreateError(null);
    setError("");
    setIsSaving(true);

    // Existing field checks establish the selected payment variant; retain its original body.
    const payload = getCreateExpensePayload() as import("@/lib/offlineExpenseContracts").OfflineExpenseDraft;
    // En el diálogo, la confirmación vive junto a las acciones, sin superponerlas.
    function confirmSave(message: string, type: "success" | "info" = "success") {
      if (!compactEntry) toast[type](message);
      return { message, type };
    }
    const shouldQueueOffline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    let queuedExpense: OfflineExpense | undefined;
    let saved = false;
    const requestScope = getRecoveryScope();

    try {
      // También online: persistir antes del primer POST permite recuperar un cierre de pestaña.
      const persist = async () => {
        try {
          return await addOfflineExpense(user.id, payload);
        } catch {
          throw new RequestError("Tus datos siguen en el formulario. Libera espacio o permite guardar datos en este navegador.", {
            title: "No se pudo guardar el gasto", retryable: true,
          });
        }
      };
      try {
        queuedExpense = await persist();
      } catch (error) {
        queuedExpense = await recoverRequest(error instanceof RequestError ? error : new RequestError(errorMessage(error)), persist, { requestScope });
      }
      resetCreateExpenseForm();
      await refreshPendingOfflineExpenses(user!.id);
      if (shouldQueueOffline) {
        return confirmSave("Sin conexión. Gasto guardado como pendiente.", "info");
      }

      const { failedExpenses, confirmations } = await syncOfflineExpenses(user.id, {
        onlyClientId: queuedExpense!.clientId, errorMode: "dialog",
      });
      const pending = failedExpenses.find(entry => entry.clientId === queuedExpense!.clientId);
      await refreshPendingOfflineExpenses(user!.id);
      if (pending) {
        return confirmSave(`Gasto guardado como pendiente. ${pending.lastError || "Se reintentará al recuperar conexión."}`, "info");
      }

      saved = true;
      await loadExpenses(user.id, { force: true, mutationCompleted: true });
      await loadReceivables(user.id, { mutationCompleted: true });
      await loadPayables(user.id, { mutationCompleted: true });
      return confirmSave(confirmations.some(result => result.alreadyConfirmed)
        ? "Este cobro ya estaba registrado."
        : "Gasto guardado exitosamente.");
    } catch (err) {
      if (saved) {
        setError("El gasto se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        return confirmSave("Gasto guardado; recarga la lista para verlo.");
      }
      if (queuedExpense) {
        setError(errorMessage(err) || "No se pudo sincronizar el pendiente.");
        return confirmSave("Gasto guardado en el dispositivo. Reintenta la sincronización desde Pendientes.", "info");
      }
      setCreateError({ message: errorMessage(err) || "No se pudo guardar el gasto en este dispositivo. Conserva el formulario." });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function toDateInputValue(dateString: string) {
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function startEditingExpense(expense: ExpenseRow) {
    setEditingExpenseId(expense.id);
    setEditDate(toDateInputValue(expense.date));
    setEditPaymentMethod(expense.paymentMethod);
    setEditDebitAccountId(expense.debitAccountId || "");
    setEditCardId(expense.cardId || "");
    setEditConcept(expense.concept || "");
    setEditAmount(String(expense.amount ?? ""));
    setEditRefunded(expense.refundOriginalAmount != null);
    setEditIsSharedExpense(Number(expense.cashContributionAmount) > 0);
    setEditCashContributionAmount(Number(expense.cashContributionAmount) > 0 ? String(expense.cashContributionAmount) : "");
    setEditLinkedAccount(Boolean(expense.receivableAccountId || expense.payableAccountId));
    setEditError("");
    setEditCategoryId(expense.categoryId || "");
    setEditNotes(expense.notes || "");
    setEditSubscriptionId(expense.subscriptionId || "NONE");
    setEditDialogOpen(true);
  }

  function cancelEditingExpense() {
    setEditDialogOpen(false);
    setEditingExpenseId("");
    setEditRefunded(false);
    setEditDate("");
    setEditPaymentMethod("CASH");
    setEditCardId("");
    setEditConcept("");
    setEditAmount("");
    setEditCategoryId("");
    setEditNotes("");
    setEditSubscriptionId("NONE");
  }

  async function updateExpense() {
    if (!user || !editingExpenseId || isUpdating) return;

    const contributionError = editIsSharedExpense && !(Number(editCashContributionAmount) > 0)
      ? "Ingresa lo que recibiste en efectivo."
      : getCashContributionError({ amount: editAmount, cashContributionAmount: editIsSharedExpense ? editCashContributionAmount : 0 });
    if (contributionError) { setEditError(contributionError); return; }

    setError("");
    setEditError("");
    setIsUpdating(true);
    let saved = false;

    try {
      const response = await apiFetch("/api/expenses", {
        method: "PATCH", expectedUserId: user?.id,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingExpenseId,
          date: editDate,
          paymentMethod: editPaymentMethod,
          cardId: editCardId,
          debitAccountId: editPaymentMethod === "DEBIT" ? editDebitAccountId : null,
          concept: editConcept,
          amount: editAmount,
          cashContributionAmount: editIsSharedExpense ? editCashContributionAmount : 0,
          categoryId: editCategoryId,
          notes: editNotes,
          subscriptionId:
            editSubscriptionId === "NONE" ? null : editSubscriptionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el gasto.");
      }

      saved = true;
      cancelEditingExpense();
      await loadExpenses(user.id, { force: true, mutationCompleted: true });
      toast.success("Cambios guardados exitosamente.");
    } catch (err) {
      if (saved) setError("Los cambios se guardaron, pero no se pudo actualizar la lista. Recarga para verlos.");
      else setEditError(errorMessage(err) || "No se pudo actualizar el gasto.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteExpense(expenseId: string) {
    if (!user) return;

    setError("");
    setIsDeleting(true);

    try {
      const response = await apiFetch(`/api/expenses?id=${expenseId}`, {
        method: "DELETE", expectedUserId: user?.id,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar el gasto.");
      }

      setExpenseToDelete(null);
      await loadExpenses(user.id, { force: true, mutationCompleted: true });

      toast.success("Gasto eliminado exitosamente.");
    } catch (err) {
      setError(errorMessage(err) || "No se pudo eliminar el gasto.");
    } finally {
      setIsDeleting(false);
    }
  }

  function buildOfflineExpenseRow(offlineExpense: OfflineExpense): ExpenseRow {
    // Presentation only: historical partial drafts remain untouched in IndexedDB.
    const raw = offlineExpense.payload;
    const text = (key: string) => typeof raw[key] === "string" ? raw[key] : "";
    const payload = { amount: raw.amount, cashContributionAmount: raw.cashContributionAmount, createReceivable: raw.createReceivable, ...raw, userId: offlineExpense.userId, date: text("date"), paymentMethod: text("paymentMethod"), cardId: text("cardId"), debitAccountId: text("debitAccountId"), concept: text("concept"), categoryId: text("categoryId"), notes: text("notes"), personId: text("personId"), receivableAccountId: text("receivableAccountId"), payableAccountId: text("payableAccountId"), subscriptionId: text("subscriptionId") };
    const relatedCategory = categories.find(
      (category) => category.id === payload.categoryId,
    );
    const relatedCard = cards.find((card) => card.id === payload.cardId);
    const relatedPerson = people.find((person) => person.id === payload.personId);
    const relatedReceivable = receivables.find(
      (receivable) => receivable.id === payload.receivableAccountId,
    );
    const relatedPayable = payables.find(
      (payable) => payable.id === payload.payableAccountId,
    );
    const relatedSubscription = subscriptions.find(
      (subscription) => subscription.id === payload.subscriptionId,
    );

    return {
      id: offlineExpense.clientId,
      userId: payload.userId,
      date: `${payload.date}T12:00:00.000Z`,
      paymentMethod: payload.paymentMethod,
      cardId: payload.paymentMethod === "CARD" ? payload.cardId : null,
      debitAccountId: payload.paymentMethod === "DEBIT" ? payload.debitAccountId : null,
      debitAccount: moneyAccounts.find(a => a.id === payload.debitAccountId) || null,
      concept: payload.concept,
      amount: Number(payload.amount || 0),
      cashContributionAmount: Number(payload.cashContributionAmount || 0),
      categoryId: payload.categoryId,
      notes: payload.notes,
      personId: payload.personId || null,
      receivableAccountId: payload.receivableAccountId || null,
      payableAccountId: payload.payableAccountId || null,
      subscriptionId: payload.subscriptionId || null,
      createdAt: offlineExpense.createdAt,
      updatedAt: offlineExpense.createdAt,
      card: relatedCard || null,
      category: relatedCategory || null,
      person: relatedPerson || null,
      receivableAccount:
        relatedReceivable ||
        (payload.createReceivable
          ? { id: offlineExpense.clientId, concept: payload.concept }
          : null),
      payableAccount: relatedPayable || null,
      subscription: relatedSubscription || null,
      _offlineStatus: "pending",
      _offlineError: offlineExpense.lastError || "",
    };
  }

  const doesExpenseMatchFilters = useCallback((expense: ExpenseRow) => {
    const datePart = String(expense.date).split("T")[0]!;

    if (filterDate && datePart !== filterDate) return false;

    if (!filterDate && filterMonth && datePart.slice(0, 7) !== filterMonth) {
      return false;
    }

    if (mobileNavigation) return matchesExpenseFilters(expense, mobileFilters);

    if (filterCategoryId && expense.categoryId !== filterCategoryId) {
      return false;
    }

    if (
      filterConcept.trim() &&
      !String(expense.concept || "")
        .toLowerCase()
        .includes(filterConcept.trim().toLowerCase())
    ) {
      return false;
    }

    if (filterCardId === "DEBIT" && expense.paymentMethod !== "DEBIT") return false;
    if (filterCardId.startsWith("DEBIT:") && (expense.paymentMethod !== "DEBIT" || expense.debitAccountId !== filterCardId.slice(6))) return false;
    if (filterCardId === "CASH" && expense.paymentMethod !== "CASH") {
      return false;
    }

    if (
      filterCardId &&
      filterCardId !== "CASH" &&
      filterCardId !== "DEBIT" && !filterCardId.startsWith("DEBIT:") &&
      (expense.paymentMethod !== "CARD" || expense.cardId !== filterCardId)
    ) {
      return false;
    }

    if (filterAmount.trim()) {
      const numericAmount = Number(filterAmount);

      if (Number.isFinite(numericAmount) && Number(expense.amount) !== numericAmount) {
        return false;
      }
    }

    return true;
  }, [filterDate, filterMonth, filterCategoryId, filterConcept, filterCardId, filterAmount, mobileNavigation, mobileFilters]);

  const expenseRows = useMemo(() => {
    const offlineRows = pendingOfflineExpenses
      .map((offlineExpense) => buildOfflineExpenseRow(offlineExpense));

    return [...offlineRows, ...expenses];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expenses,
    pendingOfflineExpenses,
    categories,
    cards,
    people,
    receivables,
    payables,
    subscriptions,
  ]);

  const filteredExpenses = useMemo(() => expenseRows.filter(doesExpenseMatchFilters), [expenseRows, doesExpenseMatchFilters]);

  const availableMonthsWithPending = useMemo(() => {
    const months = new Set(availableMonths);

    pendingOfflineExpenses.forEach((expense) => {
      const month = getExpenseMonth(expense);

      if (isValidYearMonth(month)) months.add(month);
    });

    return Array.from(months).sort().reverse();
  }, [availableMonths, pendingOfflineExpenses]);

  const expenseColumns = useMemo<ColumnDef<ExpenseRow>[]>(
    () => [
      {
        id: "date",
        accessorFn: (row) => formatExpenseDate(row.date),
        sortingFn: (rowA, rowB) =>
          new Date(rowA.original.date).getTime() - new Date(rowB.original.date).getTime(),
        header: "Fecha",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {formatExpenseDate(row.original.date)}
          </span>
        ),
      },
      {
        accessorKey: "concept",
        header: "Concepto",
        cell: ({ row }) => {
          const expense = row.original;
          return (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{expense.concept}</p>
                <CaptureStatus record={expense} />
                {expense._offlineStatus === "pending" ? (
                  <Badge
                    variant="outline"
                    title={expense._offlineError || "Pendiente de sincronizar"}
                  >
                    Pendiente
                  </Badge>
                ) : null}
              </div>
              {expense.notes ? (
                <p className="text-xs text-muted-foreground">{expense.notes}</p>
              ) : null}
              {expense.person ? (
                <p className="text-xs text-muted-foreground">
                  {expense.person.name}
                  {expense.receivableAccount
                    ? ` · ${expense.receivableAccount.concept}`
                    : ""}
                </p>
              ) : null}
              {expense.payableAccount ? (
                <p className="text-xs text-muted-foreground">
                  Pagar: {expense.payableAccount.concept}
                </p>
              ) : null}
              {expense.subscription ? (
                <p className="text-xs text-muted-foreground">
                  {expense.subscription.name}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "category",
        accessorFn: (row) => row.category?.name ?? "",
        header: "Categoría",
        cell: ({ row }) =>
          row.original.category?.name ? (
            <Badge variant="secondary">{row.original.category.name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "paymentMethod",
        accessorFn: (row) =>
          getPaymentMethodLabel(row.paymentMethod) + (row.paymentMethod === "DEBIT" ? ` ${row.debitAccount?.name || ""}` : "") +
          (row.card ? ` · ${row.card.name}` : ""),
        header: "Método",
        cell: ({ row }) => (
          <span className="text-sm">
            {getPaymentMethodLabel(row.original.paymentMethod)}{row.original.paymentMethod === "DEBIT" && row.original.debitAccount?.name ? ` · ${row.original.debitAccount.name}` : ""}
            {row.original.card ? (
              <span className="text-muted-foreground">
                {" "}· {row.original.card.name}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ table }) => table.getRowModel().rows.some(row => row.original.refundOriginalAmount != null) ? "Monto neto" : "Total pagado",
        cell: ({ row }) => (
          <div className="flex flex-col gap-1 tabular-nums">
            <span className="whitespace-nowrap font-semibold">{formatMoney(row.original.amount)}</span>
            {Number(row.original.cashContributionAmount) > 0 ? <>
              <Badge variant="success">Efectivo {formatMoney(row.original.cashContributionAmount)}</Badge>
              <span className="text-xs">Tu parte <strong>{formatMoney(getPersonalExpenseAmount(row.original))}</strong></span>
            </> : null}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original._offlineStatus === "pending") {
            return (
              <Badge variant="outline" className="whitespace-nowrap">
                En cola
              </Badge>
            );
          }

          return (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Editar gasto"
                disabled={!isOnline}
                onClick={() => startEditingExpense(row.original)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Eliminar gasto"
                disabled={!isOnline}
                onClick={() => setExpenseToDelete(row.original)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnline],
  );

  if (isCheckingSession) {
    return <GastosPageSkeleton />;
  }

  function advanceCreateField(event: React.KeyboardEvent<HTMLInputElement>, nextId: string, openSelector = false) {
    if (!compactEntry || event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const next = event.currentTarget.form?.querySelector<HTMLElement>(`#${nextId}`);
    next?.focus();
    if (openSelector) next?.click();
  }

  function openCreateDatePicker() {
    const field = document.getElementById("date");
    field?.focus();
    if (field instanceof HTMLInputElement && field.type === "date") {
      try {
        field.showPicker?.();
      } catch {
        // Si el navegador restringe la apertura, la fecha queda enfocada.
      }
    } else {
      field?.click();
    }
  }

  const createPaymentFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="date">Fecha</Label>
        <DatePicker
          id="date"
          value={date}
          onChange={setDate}
        />
      </div>

      <div className="space-y-2">
        <Label id="paymentMethod-label">Método de pago</Label>
        <PaymentMethodSelector
          includeDebit
          value={paymentMethod}
          onValueChange={value => {
            setPaymentMethod(value);
            if (value === "CASH") {
              setCardId("");
    setDebitAccountId("");
            }
          }}
          id="paymentMethod"
        />
      </div>

      {paymentMethod === "DEBIT" && <div className="flex flex-col gap-2"><Label htmlFor="debit-account">Cuenta de débito</Label><ResponsiveSelect className="min-h-11" id="debit-account" value={debitAccountId} onValueChange={setDebitAccountId} options={moneyAccounts.map(a => ({ value: a.id, label: a.name }))} />{!moneyAccounts.length && <p className="text-sm text-muted-foreground">Agrega la cuenta en Mi dinero antes de registrar un gasto con débito.</p>}</div>}
      {paymentMethod === "CARD" ? (
        <div className="space-y-2">
          <Label htmlFor="cardId">Tarjeta</Label>
          <ResponsiveSelect
            value={cardId}
            onValueChange={setCardId}
            id="cardId"
            aria-invalid={createError?.field === "cardId"}
            aria-describedby={createError?.field === "cardId" ? "create-expense-error" : undefined}
            title="Seleccionar tarjeta"
            placeholder="Selecciona tarjeta"
            options={cards.map(card => ({
              value: String(card.id),
              label: String(card.name)
            }))}
            searchable="auto"
            searchPlaceholder="Buscar tarjeta…"
          />

          {cards.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aún no tienes tarjetas. Agrégalas en la pantalla
              Tarjetas.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const createPrimaryFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="concept">Concepto</Label>
        <Input
          id="concept"
          enterKeyHint={compactEntry ? "next" : undefined}
          onKeyDown={(event) => advanceCreateField(event, "amount")}
          aria-invalid={createError?.field === "concept"}
          aria-describedby={createError?.field === "concept" ? "create-expense-error" : undefined}
          value={concept}
          placeholder="Ej. Tacos, Uber, Cine..."
          onChange={(event) => setConcept(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Monto</Label>
        <Input
          id="amount"
          enterKeyHint={compactEntry ? "next" : undefined}
          onKeyDown={(event) => advanceCreateField(event, "categoryId", true)}
          inputMode="decimal"
          aria-invalid={createError?.field === "amount"}
          aria-describedby={createError?.field === "amount" ? "create-expense-error" : undefined}
          value={amount}
          type="number"
          formatNumber
          min="0"
          step="0.01"
          placeholder="0.00"
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="categoryId">Categoría</Label>
        <SearchableSelect
          value={categoryId}
          onValueChange={setCategoryId}
          id="categoryId"
          onSelectionComplete={compactEntry ? openCreateDatePicker : undefined}
          aria-invalid={createError?.field === "categoryId"}
          aria-describedby={createError?.field === "categoryId" ? "create-expense-error" : undefined}
          title="Seleccionar categoría"
          placeholder="Selecciona categoría"
          searchPlaceholder="Buscar categoría…"
          options={categories.map(item => ({
            value: item.id,
            label: item.name
          }))}
        />
      </div>
    </>
  );

  const createOptionalFields = (
    <>
      <SharedExpenseFields
        id="cashContributionAmount" enabled={isSharedExpense} amount={amount}
        contribution={cashContributionAmount} onContributionChange={(value) => {
          setCashContributionAmount(value);
          if (createError?.field === "cashContributionAmount") setCreateError(null);
        }}
        onEnabledChange={(enabled) => {
          setIsSharedExpense(enabled);
          setCreateError(null);
          if (enabled) { setReceivableMode("NONE"); setReceivableAccountId(""); setPayableAccountId("NONE"); }
        }}
        disabled={isSaving}
        error={createError?.field === "cashContributionAmount" ? createError.message : null}
      />
      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          value={notes}
          placeholder="Algún detalle adicional..."
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <Collapsible open={showMoreOptions} onOpenChange={setShowMoreOptions} className="rounded-xl border border-border bg-background/50 p-4">
        <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between text-left"
        >
          <span>Más opciones</span>
          <span className="text-muted-foreground">
            {showMoreOptions ? "Ocultar" : "Mostrar"}
          </span>
        </Button>
        </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="personId">Persona relacionada</Label>
              <SearchableSelect
                value={personId || "NONE"}
                onValueChange={value => {
                  const nextValue = value === "NONE" ? "" : value;
                  setPersonId(nextValue);
                  if (!nextValue) {
                    setReceivableMode(isSharedExpense ? "NONE" : "CREATE");
                    setReceivableAccountId("");
                  }
                }}
                id="personId"
                title="Seleccionar persona"
                placeholder="Selecciona persona"
                searchPlaceholder="Buscar persona…"
                options={[{
                  value: "NONE",
                  label: "Sin persona",
                  pinned: true
                }, ...people.map(item => ({
                  value: item.id,
                  label: item.name
                }))]}
              />

              {people.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Puedes agregar personas en Configuración.
                </p>
              ) : null}
            </div>

            {personId ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="receivableMode">Cuenta por cobrar</Label>
                  <ResponsiveSelect
                    value={receivableMode}
                    disabled={isSharedExpense}
                    onValueChange={value => {
                      setReceivableMode(value);
                      if (value === "CREATE") {
                        setReceivableAccountId("");
                      }
                    }}
                    id="receivableMode"
                    title="Seleccionar opción"
                    placeholder="Selecciona opción"
                    options={[{
                      value: "NONE",
                      label: "Solo referencia, sin cuenta"
                    }, {
                      value: "CREATE",
                      label: "Crear nueva autom\xE1ticamente"
                    }, {
                      value: "EXISTING",
                      label: "Vincular a existente"
                    }]}
                  />
                </div>

                {receivableMode === "EXISTING" ? (
                  <div className="space-y-2">
                    <Label htmlFor="receivableAccountId">Cuenta existente</Label>
                    <SearchableSelect
                      value={receivableAccountId}
                      onValueChange={setReceivableAccountId}
                      id="receivableAccountId"
                      title="Seleccionar cuenta por cobrar"
                      placeholder="Selecciona cuenta por cobrar"
                      searchPlaceholder="Buscar cuenta por cobrar…"
                      options={receivables.filter(item => item.personId === personId).map(item => ({
                        value: item.id,
                        label: `${item.concept} · pendiente ${formatMoney(item.pendingBalance)}`
                      }))}
                    />

                    {receivables.filter(
                      (item) => item.personId === personId,
                    ).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Esta persona no tiene cuentas por cobrar
                        activas.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="payableAccountId">Cuenta por pagar relacionada</Label>
                  <SearchableSelect
                    value={payableAccountId}
                    disabled={isSharedExpense}
                    onValueChange={setPayableAccountId}
                    id="payableAccountId"
                    title="Seleccionar cuenta por pagar"
                    placeholder="Selecciona cuenta por pagar"
                    searchPlaceholder="Buscar persona o concepto…"
                    options={[{
                      value: "NONE",
                      label: "Sin cuenta por pagar",
                      pinned: true
                    }, ...payables.filter(item => item.status === "ACTIVE" && Number(item.pendingBalance || 0) > 0).map(item => ({
                      value: item.id,
                      label: `${item.person?.name || ""} · ${item.concept} · pendiente ${formatMoney(item.pendingBalance)}`
                    }))]}
                  />
                </div>
              </>
            ) : null}

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="subscriptionId">Suscripción relacionada</Label>
              <SearchableSelect
                value={subscriptionId}
                onValueChange={setSubscriptionId}
                id="subscriptionId"
                title="Seleccionar suscripción"
                placeholder="Selecciona suscripción"
                searchPlaceholder="Buscar suscripción…"
                options={[{
                  value: "NONE",
                  label: "Sin suscripción",
                  pinned: true
                }, ...subscriptions.map(item => ({
                  value: item.id,
                  label: `${item.name} · ${formatMoney(item.amount)}`
                }))]}
              />
            </div>
          </CollapsibleContent>
      </Collapsible>
    </>
  );

  return (
    <>
      <AlertDialog
        open={Boolean(expenseToDelete)}
        onOpenChange={(open) => {
          if (!open) setExpenseToDelete(null);
        }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el gasto{" "}
              {expenseToDelete?.concept
                ? `"${expenseToDelete.concept}"`
                : "seleccionado"}{" "}
              por {formatMoney(expenseToDelete?.amount || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={() => deleteExpense(expenseToDelete!.id)}
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open && !isUpdating) cancelEditingExpense(); }}>
        <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar gasto</DialogTitle>
            <DialogDescription className="sr-only">Actualiza los datos y guarda los cambios.</DialogDescription>
          </DialogHeader>

          <fieldset disabled={isUpdating} className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Fecha</Label>
              <DatePicker
                id="edit-date"
                value={editDate}
                onChange={setEditDate}
              />
            </div>

            <div className="space-y-2">
              <Label id="edit-paymentMethod-label">Método</Label>
              <PaymentMethodSelector
          includeDebit
                value={editPaymentMethod}
                disabled={editRefunded}
                onValueChange={value => {
                  setEditPaymentMethod(value);
                  if (value !== "CARD") setEditCardId("");
                  if (value !== "DEBIT") setEditDebitAccountId("");
                }}
                id="edit-paymentMethod"
              />
            </div>

            {editPaymentMethod === "DEBIT" && <div className="flex flex-col gap-2"><Label htmlFor="edit-debit-account">Cuenta de débito</Label><ResponsiveSelect className="min-h-11" id="edit-debit-account" value={editDebitAccountId} onValueChange={setEditDebitAccountId} options={moneyAccounts.map(a => ({ value: a.id, label: a.name }))} /></div>}
            {editPaymentMethod === "CARD" ? (
              <div className="space-y-2">
                <Label htmlFor="edit-cardId">Tarjeta</Label>
                <ResponsiveSelect
                  value={editCardId}
                  onValueChange={setEditCardId}
                  id="edit-cardId"
                  disabled={editRefunded}
                  title="Seleccionar tarjeta"
                  placeholder="Selecciona tarjeta"
                  options={cards.map(card => ({
                    value: String(card.id),
                    label: String(card.name)
                  }))}
                  searchable="auto"
                  searchPlaceholder="Buscar tarjeta…"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="edit-concept">Concepto</Label>
              <Input
                id="edit-concept"
                value={editConcept}
                onChange={(event) => setEditConcept(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-amount">Monto</Label>
              <Input
                id="edit-amount"
                disabled={editRefunded}
                type="number"
                formatNumber
                min="0"
                step="0.01"
                value={editAmount}
                onChange={(event) => setEditAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-categoryId">Categoría</Label>
              <SearchableSelect
                value={editCategoryId}
                onValueChange={setEditCategoryId}
                id="edit-categoryId"
                title="Seleccionar categoría"
                placeholder="Selecciona categoría"
                searchPlaceholder="Buscar categoría…"
                options={categories.map(item => ({
                  value: item.id,
                  label: item.name
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-subscriptionId">Suscripción relacionada</Label>
              <SearchableSelect
                value={editSubscriptionId}
                onValueChange={setEditSubscriptionId}
                id="edit-subscriptionId"
                disabled={editRefunded}
                title="Seleccionar suscripción"
                placeholder="Selecciona suscripción"
                searchPlaceholder="Buscar suscripción…"
                options={[{
                  value: "NONE",
                  label: "Sin suscripción",
                  pinned: true
                }, ...subscriptions.map(item => ({
                  value: item.id,
                  label: `${item.name} · ${formatMoney(item.amount)}`
                }))]}
              />
            </div>

            <div className="md:col-span-2">
              <SharedExpenseFields id="edit-cashContributionAmount" enabled={editIsSharedExpense} onEnabledChange={(enabled) => { setEditIsSharedExpense(enabled); setEditError(""); }} amount={editAmount} contribution={editCashContributionAmount} onContributionChange={(value) => { setEditCashContributionAmount(value); setEditError(""); }} disabled={isUpdating || editRefunded} linkedAccount={editLinkedAccount} />
              {editRefunded && <p className="text-sm text-muted-foreground">El monto es el neto después de las devoluciones. Puedes deshacer una devolución desde Capturas para cambiar monto, tarjeta o vínculos financieros.</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </div>
          </fieldset>

          {editError ? <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert> : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelEditingExpense}
              disabled={isUpdating}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={updateExpense}
              disabled={isUpdating}
            >
              {isUpdating ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div onClickCapture={captureFocus}>
        <section className={`mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8 ${compactEntry ? "pb-28!" : ""}`}>
          <AutomaticRecordingLink />
          {error || expensesError ? (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error || expensesError}</AlertDescription>
            </Alert>
          ) : null}

          {!isOnline ? (
            <Alert role="status" className="mb-6 border-amber-500/40 bg-amber-500/10 text-amber-200">
              <WifiOff className="h-4 w-4 shrink-0" />
              <AlertDescription className="text-amber-200">
                Sin conexión. Los gastos nuevos se guardarán en este dispositivo
                y se sincronizarán cuando vuelva internet.
              </AlertDescription>
            </Alert>
          ) : null}

          {pendingOfflineExpenses.length > 0 ? (
            <Alert role="status" className="mb-6">
                <AlertTitle>
                  {pendingOfflineExpenses.length === 1
                    ? "1 gasto pendiente por sincronizar"
                    : `${pendingOfflineExpenses.length} gastos pendientes por sincronizar`}
                </AlertTitle>
                <AlertDescription>
                  Se enviarán automáticamente al recuperar conexión.
                </AlertDescription>

              <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isOnline || isSyncingOfflineExpenses}
                onClick={() => syncPendingExpenses()}
              >
                {isSyncingOfflineExpenses ? <Spinner /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {isSyncingOfflineExpenses ? "Sincronizando..." : "Reintentar"}
              </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {user && <OfflineExpenseRestore userId={user.id} onRestored={() => refreshPendingOfflineExpenses(user.id)} />}
          {user && <OfflineCaptureConflicts userId={user!.id} pending={pendingOfflineExpenses} disabled={!isOnline || isSyncingOfflineExpenses} onResolved={async () => { await refreshPendingOfflineExpenses(user!.id); await syncPendingExpenses({ silent: true }); }} />}
          <div className={`grid min-w-0 gap-5 ${compactEntry ? "" : "xl:grid-cols-[360px_1fr]"}`}>
            <ExpenseCreateSurface compact={compactEntry} error={createError} isSaving={isSaving} isOnline={isOnline} onSubmit={createExpense}>
              {({ compact }) => (
                <>
                  {compact ? createPrimaryFields : createPaymentFields}
                  {compact ? createPaymentFields : createPrimaryFields}
                  {createOptionalFields}
                </>
              )}
            </ExpenseCreateSurface>

            <div className="flex min-w-0 flex-col gap-6">
              <Card className="expense-results rounded-2xl border-border bg-card">
                <CardHeader className="expense-results-header items-center">
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    <h2>Gastos filtrados</h2>
                  </CardTitle>
                  <CardAction className="row-span-1 flex items-center gap-2 self-center">
                    {mobileNavigation ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="expense-clear-filters relative h-7 px-0"
                        onClick={() => {
                          setFilterDate("");
                          setFilterMonth("");
                          setMobileFilters([]);
                          setMobileFilterResetKey((current) => current + 1);
                        }}
                      >
                        Quitar filtros
                      </Button>
                    ) : null}
                    <SubscriptionCharges userId={user?.id} cards={cards} isOnline={isOnline} refreshKey={expenses}
                      onChanged={() => loadExpenses(user!.id, { force: true, mutationCompleted: true })} />
                  </CardAction>
                </CardHeader>

                <CardContent className="flex flex-col gap-3 md:gap-4">
                  <div className="grid grid-cols-1 gap-3 md:flex md:flex-wrap">
                    <ResponsiveSelect
                      value={filterMonth || "ALL"}
                      onValueChange={value => {
                        setFilterMonth(value === "ALL" ? "" : value);
                        setFilterDate("");
                      }}
                      aria-label="Filtrar por mes"
                      className="w-full md:w-[180px]"
                      title="Filtrar por mes"
                      placeholder="Todos los meses"
                      options={[{
                        value: "ALL",
                        label: "Todos los meses"
                      }, ...availableMonthsWithPending.filter(isValidYearMonth).map(m => ({
                        value: String(m),
                        label: String(formatMonthLabel(m))
                      }))]}
                    />

                    <div className="min-w-0">
                      <Label htmlFor="filterDate" className="sr-only">Filtrar por día</Label>
                      <DatePicker
                        id="filterDate"
                        value={filterDate}
                        onChange={(nextDate) => {
                          setFilterDate(nextDate);
                          setFilterMonth("");
                        }}
                        aria-label="Filtrar por día"
                        className="w-full md:w-[160px]"
                      />
                    </div>

                    {filterDate && !mobileNavigation ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilterDate("")}
                        className="text-muted-foreground"
                      >
                        Limpiar día
                      </Button>
                    ) : null}

                    {!mobileNavigation ? <>
                    <SearchableSelect
                      value={filterCategoryId || "ALL"}
                      onValueChange={value => setFilterCategoryId(value === "ALL" ? "" : value)}
                      aria-label="Filtrar por categoría"
                      className="w-full sm:w-[180px]"
                      title="Seleccionar categoría"
                      placeholder="Todas las categorías"
                      searchPlaceholder="Buscar categoría…"
                      options={[{
                        value: "ALL",
                        label: "Todas las categorías",
                        pinned: true
                      }, ...categories.map(item => ({
                        value: item.id,
                        label: item.name
                      }))]}
                    />

                    <div className="space-y-1">
                      <Label htmlFor="filterConcept" className="sr-only">Buscar por concepto</Label>
                      <Input
                        id="filterConcept"
                        placeholder="Buscar concepto..."
                        value={filterConcept}
                        onChange={(e) => setFilterConcept(e.target.value)}
                        className="w-full sm:w-[200px]"
                      />
                    </div>

                    <ResponsiveSelect
                      value={filterCardId || "ALL"}
                      onValueChange={value => setFilterCardId(value === "ALL" ? "" : value)}
                      aria-label="Filtrar por método de pago"
                      className="w-full sm:w-[180px]"
                      title="Filtrar por método de pago"
                      placeholder="Todos los métodos"
                      options={[{
                        value: "ALL",
                        label: "Todos los métodos"
                      }, {
                        value: "CASH",
                        label: "Efectivo"
                      }, { value: "DEBIT", label: "Débito" }, ...moneyAccounts.map(a => ({ value: `DEBIT:${a.id}`, label: `Débito · ${a.name}` })), ...cards.map(card => ({
                        value: String(card.id),
                        label: String(card.name)
                      }))]}
                      searchable="auto"
                      searchPlaceholder="Buscar tarjeta…"
                    />

                    <div className="space-y-1">
                      <Label htmlFor="filterAmount" className="sr-only">Filtrar por monto</Label>
                      <Input
                        id="filterAmount"
                        type="number"
                        formatNumber
                        min="0"
                        step="0.01"
                        placeholder="Monto exacto..."
                        value={filterAmount}
                        onChange={(e) => setFilterAmount(e.target.value)}
                        className="w-full sm:w-[150px]"
                      />
                    </div>
                    </> : null}
                  </div>

                  {mobileNavigation ? (
                    <ExpenseFilterCombobox
                      key={mobileFilterResetKey}
                      categories={categories}
                      cards={cards}
                      moneyAccounts={moneyAccounts}
                      expenses={expenseRows.filter((expense) => {
                        const day = String(expense.date).split("T")[0]!;
                        return filterDate ? day === filterDate : !filterMonth || day.startsWith(filterMonth);
                      })}
                      value={mobileFilters}
                      onValueChange={setMobileFilters}
                    />
                  ) : null}

                  {isExpensesLoading ? (
                    <ExpensesResultsSkeleton />
                  ) : mobileNavigation ? (
                    <DailyExpenseCards
                      key={JSON.stringify([filterDate, filterMonth, mobileFilters])}
                      expenses={filteredExpenses}
                      isOnline={isOnline}
                      onEdit={startEditingExpense}
                      onDelete={setExpenseToDelete}
                    />
                  ) : (
                    <DataTable
                      columns={expenseColumns}
                      data={filteredExpenses}
                      pageSize={15}
                      pageSizeOptions={[15, 25, 50, 100]}
                      footerRow={(table) => {
                        const total = table.getFilteredRowModel().rows.reduce(
                          (sum, row) => sum + Number(row.original.amount || 0),
                          0,
                        );
                        return (
                          <TableRow>
                            <TableCell colSpan={4} className="text-right text-sm font-medium text-muted-foreground">
                              {table.getFilteredRowModel().rows.some(row => row.original.refundOriginalAmount != null) ? "Gasto neto" : "Total pagado"}
                            </TableCell>
                            <TableCell className="font-semibold tabular-nums">
                              {formatMoney(total)}
                              {table.getFilteredRowModel().rows.some(row => Number(row.original.cashContributionAmount) > 0) ? <p className="text-xs font-normal">Tu parte {formatMoney(sumPersonalExpenses(table.getFilteredRowModel().rows.map(row => row.original)))}</p> : null}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        );
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function GastosPageSkeleton() {
  return (
    <div>
      <section className="mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8">
        <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_1fr]">
          <Card className="hidden rounded-2xl border-border bg-card md:flex">
            <CardHeader>
              <Skeleton className="mx-auto h-5 w-32" />
            </CardHeader>

            <CardContent className="space-y-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}

              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-6">
            <Card className="expense-results rounded-2xl border-border bg-card">
              <CardHeader>
                <Skeleton className="mx-auto h-5 w-40" />
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
                  <Skeleton className="h-10 w-full sm:w-[180px]" />
                  <Skeleton className="h-10 w-full sm:w-[160px]" />
                  <Skeleton className="hidden h-10 w-full sm:w-[180px] md:block" />
                  <Skeleton className="hidden h-10 w-full sm:w-[200px] md:block" />
                  <Skeleton className="hidden h-10 w-full sm:w-[180px] md:block" />
                  <Skeleton className="hidden h-10 w-full sm:w-[150px] md:block" />
                  <Skeleton className="h-7 w-full md:hidden" />
                </div>

                <ExpensesResultsSkeleton />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

function ExpensesResultsSkeleton() {
  return (
    <>
      <div className="md:hidden"><DailyExpenseCardsSkeleton /></div>
      <div className="hidden md:block"><ExpensesTableSkeleton /></div>
    </>
  );
}

function ExpensesTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="grid gap-4 border-b border-border bg-muted/30 px-4 py-3 md:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_72px]">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>

      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_72px]"
          >
            <Skeleton className="h-4 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
