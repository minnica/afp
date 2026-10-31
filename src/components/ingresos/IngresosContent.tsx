"use client";
import type { CreateError, Income, NamedRecord, Receivable } from "@/lib/uiTypes";
import { errorMessage } from "@/lib/uiTypes";
import type { User } from "@supabase/supabase-js";
import type { ColumnDef } from "@tanstack/react-table";
type RowModel = Income;

import { uiFetch as apiFetch } from "@/lib/uiClient";

import { useCreationDraft } from "@/hooks/use-creation-draft";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIncomeHistory } from "@/hooks/use-income-history";

import CreateRecordSurface,{ useCreateDialogMode } from "@/components/ui/create-record-surface";

import { ResponsiveSelect } from "@/components/ui/responsive-select";

import { SearchableSelect } from "@/components/ui/searchable-select";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import {
AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,
AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { toast } from "@/components/ui/sonner";

import PageSkeleton from "@/components/layout/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle,
} from "@/components/ui/card";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { RecordActions, RecordCard, RecordField, RecordListCard, RecordNote } from "@/components/ui/record-card";
import { Textarea } from "@/components/ui/textarea";

import { TableCell, TableRow } from "@/components/ui/table";

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value: unknown) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatDate(dateString: string) {
  return format(new Date(dateString), "d MMM yyyy", { locale: es });
}

export default function IngresosContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const mobileNavigation = useIsMobile();
  const compactEntry = useCreateDialogMode();
  const [createError, setCreateError] = useState<CreateError | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const history = useIncomeHistory(user?.id);
  const { reload: loadIncomes, query: historyQuery, setQuery: setHistoryQuery } = history;
  const [incomeTypes, setIncomeTypes] = useState<NamedRecord[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const incomes = history.result?.incomes || [];

  const [date, setDate] = useState(getTodayInputValue());
  const [incomeTypeId, setIncomeTypeId] = useState("");
  const [source, setSource] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [receivableAccountId, setReceivableAccountId] = useState("NONE");
  const [notes, setNotes] = useState("");

  useCreationDraft({
    name: "ingresos",
    userId: user?.id,
    enabled: mobileNavigation,
    values: { date, incomeTypeId, source, concept, amount, receivableAccountId, notes },
    setters: { date: setDate, incomeTypeId: setIncomeTypeId, source: setSource, concept: setConcept, amount: setAmount, receivableAccountId: setReceivableAccountId, notes: setNotes },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [incomeToDelete, setIncomeToDelete] = useState<Income | null>(null);
  const [error, setError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editIncomeTypeId, setEditIncomeTypeId] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editReceivableAccountId, setEditReceivableAccountId] =
    useState("NONE");
  const [editNotes, setEditNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const selectableReceivables = receivables.filter((item) => {
    const pendingBalance = Number(item.pendingBalance || 0);

    if (pendingBalance > 0 && item.status === "ACTIVE") {
      return true;
    }

    return item.id === editReceivableAccountId;
  });

  async function loadSettings(userId: string) {
    const response = await apiFetch(`/api/settings?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar configuración.");
    }

    setIncomeTypes(data.incomeTypes || []);
  }

  async function loadReceivables(userId: string, { mutationCompleted = false } = {}) {
    const response = await apiFetch(`/api/receivables?userId=${userId}`, { mutationCompleted });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "No se pudieron cargar cuentas por cobrar.",
      );
    }

    setReceivables(data.receivables || []);
  }

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        await ensureUserSetup(session.user);
        setUser(session.user);

        await Promise.all([
          loadSettings(session.user.id),
          loadReceivables(session.user.id),
        ]);
      } catch (err) {
        setError(errorMessage(err) || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createIncome() {
    if (!user || isSaving) return false;

    setCreateError(null);
    setError("");
    setIsSaving(true);

    let saved = false;
    try {
      const response = await apiFetch("/api/incomes", {
        method: "POST", expectedUserId: user?.id,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          date,
          incomeTypeId,
          source,
          concept,
          amount,
          receivableAccountId:
            receivableAccountId === "NONE" ? null : receivableAccountId,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el ingreso.");
      }

      saved = true;
      setSource("");
      setConcept("");
      setAmount("");
      setReceivableAccountId("NONE");
      setNotes("");

      await Promise.all([loadIncomes(user.id, { mutationCompleted: true }), loadReceivables(user.id, { mutationCompleted: true })]);
      if (!compactEntry) toast.success("Ingreso guardado exitosamente.");
      return { message: "Ingreso guardado exitosamente.", type: "success" };
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        if (!compactEntry) toast.success("El registro se guardó; recarga la lista para verlo.");
        return { message: "El registro se guardó; recarga la lista para verlo.", type: "success" };
      }
      setCreateError({ message: errorMessage(err) || "No se pudo guardar el ingreso." });
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

  function startEditingIncome(income: Income) {
    setEditingIncomeId(income.id);
    setEditDate(toDateInputValue(income.date));
    setEditIncomeTypeId(income.incomeTypeId || "");
    setEditSource(income.source || "");
    setEditConcept(income.concept || "");
    setEditAmount(String(income.amount || ""));
    setEditReceivableAccountId(income.receivableAccountId || "NONE");
    setEditNotes(income.notes || "");
    setEditDialogOpen(true);
  }

  function cancelEditingIncome() {
    setEditDialogOpen(false);
    setEditingIncomeId("");
    setEditDate("");
    setEditIncomeTypeId("");
    setEditSource("");
    setEditConcept("");
    setEditAmount("");
    setEditReceivableAccountId("NONE");
    setEditNotes("");
  }

  async function updateIncome() {
    if (!user || !editingIncomeId) return;

    setError("");
    setIsUpdating(true);

    try {
      const response = await apiFetch("/api/incomes", {
        method: "PATCH", expectedUserId: user?.id,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingIncomeId,
          date: editDate,
          incomeTypeId: editIncomeTypeId,
          source: editSource,
          concept: editConcept,
          amount: editAmount,
          receivableAccountId:
            editReceivableAccountId === "NONE" ? null : editReceivableAccountId,
          notes: editNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el ingreso.");
      }

      cancelEditingIncome();

      await Promise.all([loadIncomes(user.id, { mutationCompleted: true }), loadReceivables(user.id, { mutationCompleted: true })]);
    } catch (err) {
      setError(errorMessage(err) || "No se pudo actualizar el ingreso.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteIncome(id: string) {
    if (!user) return;


    setError("");

    try {
      const response = await apiFetch(`/api/incomes?id=${id}`, {
        method: "DELETE", expectedUserId: user?.id,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      await Promise.all([loadIncomes(user.id, { mutationCompleted: true }), loadReceivables(user.id, { mutationCompleted: true })]);
    } catch (err) {
      setError(errorMessage(err) || "No se pudo eliminar el ingreso.");
    }
  }

  const historySummary = history.isLoading ? null : history.result;
  const totalIncome = historySummary ? formatMoney(historySummary.total) : "—";
  const changeHistoryFilter = (key: "incomeTypeId" | "startDate" | "endDate", value: string) => {
    setHistoryQuery(previous => ({ ...previous, [key]: value, pagination: { ...previous.pagination, pageIndex: 0 } }));
  };

  const incomeMobileView: Pick<import("@/components/ui/data-table").DataTableProps<RowModel>, "mobileListLabel" | "mobileRowSeparator" | "renderMobileRow" | "mobileToolbar"> = {
    mobileListLabel: "Ingresos registrados",
    mobileRowSeparator: false,
    renderMobileRow: ({ original: income }) => (
      <RecordCard
        title={income.concept}
        subtitle={formatDate(income.date)}
        amount={formatMoney(income.amount)}
        amountLabel={income.isEstimated ? "Ingreso estimado · confirma el importe" : "Ingreso registrado"}
        actions={<RecordActions label={`ingreso: ${income.concept}`} onEdit={() => startEditingIncome(income)} onDelete={() => setIncomeToDelete(income)} />}
      >
        {income.incomeType?.name ? <Badge variant="secondary" className="h-auto max-w-full whitespace-normal break-words">{income.incomeType.name}</Badge> : null}
        {income.source || income.receivableAccount ? (
          <dl className="grid gap-3">
            {income.source ? <RecordField label="Fuente">{income.source}</RecordField> : null}
            {income.receivableAccount ? <RecordField label="Cuenta por cobrar">{income.receivableAccount.person?.name} · {income.receivableAccount.concept}</RecordField> : null}
          </dl>
        ) : null}
        <RecordNote>{income.notes}</RecordNote>
      </RecordCard>
    ),
    mobileToolbar: () => <p className="mb-3 text-sm text-muted-foreground">Total filtrado: <strong className="tabular-nums">{totalIncome}</strong></p>,
  };

  const incomeColumns = useMemo<ColumnDef<RowModel>[]>(
    () => [
      {
        id: "date",
        accessorFn: (row) => row.date,
        header: "Fecha",
        cell: ({ row }) => (
          <span className="text-sm">{formatDate(row.original.date)}</span>
        ),
      },
      {
        id: "incomeType",
        accessorFn: (row) => row.incomeType?.name ?? "",
        header: "Tipo",
        cell: ({ row }) =>
          row.original.incomeType?.name ? (
            <Badge variant="secondary">{row.original.incomeType.name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "concept",
        header: "Concepto",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.concept}{row.original.isEstimated && <span className="ml-2 text-xs text-warning">Estimado · confirma el importe</span>}</p>
            <p className="text-sm text-muted-foreground">
              Fuente: {row.original.source}
            </p>
            {row.original.notes ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {row.original.notes}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "receivableAccount",
        accessorFn: (row) =>
          row.receivableAccount
            ? `${row.receivableAccount.person?.name ?? ""} ${row.receivableAccount.concept ?? ""}`
            : "",
        header: "Cuenta por cobrar",
        cell: ({ row }) =>
          row.original.receivableAccount ? (
            <span className="text-sm">
              {row.original.receivableAccount.person?.name} ·{" "}
              {row.original.receivableAccount.concept}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-semibold tabular-nums">
            {formatMoney(row.original.amount)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button aria-label="Editar"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startEditingIncome(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button aria-label="Eliminar"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIncomeToDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (isLoading) {
    return <PageSkeleton variant="form-table" mobileCards />;
  }

  return (
    <main onClickCapture={captureFocus}>
      <AlertDialog
        open={Boolean(incomeToDelete)}
        onOpenChange={(open) => { if (!open) setIncomeToDelete(null); }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este ingreso?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará el ingreso seleccionado. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteIncome(incomeToDelete!.id)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className={`mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8 ${compactEntry ? "pb-28!" : ""}`}>
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Total filtrado</CardDescription>
              <CardTitle className="text-2xl">
                {totalIncome}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Ingresos registrados</CardDescription>
              <CardTitle className="text-2xl">{historySummary?.totalCount ?? "—"}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Cuentas activas por cobrar</CardDescription>
              <CardTitle className="text-2xl">{receivables.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className={`grid min-w-0 gap-5 ${compactEntry ? "" : "xl:grid-cols-[360px_1fr]"}`}>
          <CreateRecordSurface
              showSaveFeedback
              compact={compactEntry}
              title="Nuevo ingreso"
              saveLabel="Guardar ingreso"
              error={createError}
              isSaving={isSaving}
              onSubmit={createIncome}
            >
              <div className="space-y-2">
              <Label htmlFor="income-date">Fecha</Label>
              <DatePicker
                id="income-date"
                value={date}
                onChange={setDate}
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="ingresos-field-1">Tipo de ingreso</Label>
              <ResponsiveSelect
                value={incomeTypeId}
                onValueChange={setIncomeTypeId}
                id="ingresos-field-1"
                title="Seleccionar tipo de ingreso"
                placeholder="Selecciona tipo"
                options={incomeTypes.map(type => ({
                  value: String(type.id),
                  label: String(type.name)
                }))}
                searchable="auto"
                searchPlaceholder="Buscar tipo de ingreso…"
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="ingresos-field-2">Fuente</Label>
              <Input
                id="ingresos-field-2"
                value={source}
                placeholder="Ej. Empresa, Luis, Cuñado..."
                onChange={(event) => setSource(event.target.value)}
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="ingresos-field-3">Concepto</Label>
              <Input
                id="ingresos-field-3"
                value={concept}
                placeholder="Ej. Nómina quincenal, pago celular..."
                onChange={(event) => setConcept(event.target.value)}
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="ingresos-field-4">Monto</Label>
              <Input
                id="ingresos-field-4"
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
              <Label htmlFor="ingresos-field-5">Cuenta por cobrar relacionada</Label>
              <SearchableSelect
                value={receivableAccountId}
                onValueChange={setReceivableAccountId}
                id="ingresos-field-5"
                title="Seleccionar cuenta por cobrar"
                placeholder="Sin cuenta por cobrar"
                searchPlaceholder="Buscar persona o concepto…"
                options={[
                  { value: "NONE", label: "Sin cuenta por cobrar", pinned: true },
                  ...selectableReceivables.map((item) => {
                    const pendingBalance = Number(item.pendingBalance || 0);
                    const isPaidOff =
                      item.status === "PAID_OFF" || pendingBalance <= 0;
                    return {
                      value: item.id,
                      label: `${item.person?.name || ""} · ${item.concept} · ${isPaidOff ? "liquidada" : "pendiente"} ${formatMoney(pendingBalance)}`,
                    };
                  }),
                ]}
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="ingresos-field-6">Notas opcional</Label>
              <Textarea id="ingresos-field-6"
                value={notes}
                placeholder="Detalles adicionales..."
                onChange={(event) => setNotes(event.target.value)}
              />
              </div>
            </CreateRecordSurface>

          <div className="min-w-0">
            <RecordListCard>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Ingresos registrados
                </CardTitle>
              </CardHeader>

              <CardContent>
                <FieldGroup className="mb-4 md:flex-row md:items-end">
                  <Field>
                    <FieldLabel htmlFor="income-history-type">Tipo de ingreso</FieldLabel>
                    <ResponsiveSelect
                      id="income-history-type" title="Filtrar por tipo de ingreso" aria-label="Filtrar por tipo de ingreso"
                      className="h-11 md:h-7"
                      value={historyQuery.incomeTypeId || "ALL"}
                      onValueChange={value => changeHistoryFilter("incomeTypeId", value === "ALL" ? "" : value)}
                      options={[{ value: "ALL", label: "Todos los tipos" }, ...incomeTypes.map(type => ({ value: type.id, label: type.name }))]}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="income-history-start">Desde</FieldLabel>
                    <DatePicker id="income-history-start" aria-label="Ingresos desde" clearable className="h-11 text-base md:h-7 md:text-xs" value={historyQuery.startDate} onChange={value => changeHistoryFilter("startDate", value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="income-history-end">Hasta</FieldLabel>
                    <DatePicker id="income-history-end" aria-label="Ingresos hasta" clearable className="h-11 text-base md:h-7 md:text-xs" value={historyQuery.endDate} onChange={value => changeHistoryFilter("endDate", value)} />
                  </Field>
                </FieldGroup>
                {historyQuery.globalFilter || historyQuery.incomeTypeId || historyQuery.startDate || historyQuery.endDate ? (
                  <Button type="button" variant="outline" className="mb-4" onClick={() => setHistoryQuery(previous => ({ ...previous, globalFilter: "", incomeTypeId: "", startDate: "", endDate: "", pagination: { ...previous.pagination, pageIndex: 0 } }))}>Limpiar filtros</Button>
                ) : null}
                {history.error ? (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>
                      {history.error}
                      <Button type="button" variant="outline" onClick={() => { if (user) void loadIncomes(user.id).catch(() => {}); }}>Reintentar</Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <DataTable
                  {...incomeMobileView}
                  columns={incomeColumns}
                  data={incomes}
                  filterGlobal
                  filterPlaceholder="Buscar ingreso..."
                  pageSize={10}
                  pageSizeOptions={[5, 10, 25, 50]}
                  serverState={{
                    ...historyQuery,
                    rowCount: history.result?.totalCount || 0,
                    isLoading: history.isLoading,
                    onPaginationChange: updater => setHistoryQuery(previous => {
                      const next = typeof updater === "function" ? updater(previous.pagination) : updater;
                      return { ...previous, pagination: { ...next, pageIndex: next.pageSize !== previous.pagination.pageSize ? 0 : next.pageIndex } };
                    }),
                    onSortingChange: updater => setHistoryQuery(previous => ({ ...previous, sorting: typeof updater === "function" ? updater(previous.sorting) : updater, pagination: { ...previous.pagination, pageIndex: 0 } })),
                    onGlobalFilterChange: value => setHistoryQuery(previous => ({ ...previous, globalFilter: value, pagination: { ...previous.pagination, pageIndex: 0 } })),
                  }}
                  footerRow={() => {
                    return (
                      <TableRow>
                        <TableCell colSpan={4}>Total filtrado</TableCell>
                        <TableCell className="font-semibold tabular-nums">
                          {totalIncome}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    );
                  }}
                />
              </CardContent>
            </RecordListCard>
          </div>
        </div>

        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            if (!open) cancelEditingIncome();
          }}
        >
          <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar ingreso</DialogTitle>
              <DialogDescription>Actualiza los datos y confirma el importe recibido. Guardar una nómina estimada la marca como confirmada.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-income-date">Fecha</Label>
                <DatePicker
                  id="edit-income-date"
                  value={editDate}
                  onChange={setEditDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-7">Tipo de ingreso</Label>
                <ResponsiveSelect
                  value={editIncomeTypeId}
                  onValueChange={setEditIncomeTypeId}
                  id="ingresos-field-7"
                  title="Seleccionar tipo de ingreso"
                  placeholder="Selecciona tipo"
                  options={incomeTypes.map(type => ({
                    value: String(type.id),
                    label: String(type.name)
                  }))}
                  searchable="auto"
                  searchPlaceholder="Buscar tipo de ingreso…"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-8">Fuente</Label>
                <Input
                  id="ingresos-field-8"
                  value={editSource}
                  onChange={(event) => setEditSource(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-9">Concepto</Label>
                <Input
                  id="ingresos-field-9"
                  value={editConcept}
                  onChange={(event) => setEditConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-10">Monto</Label>
                <Input
                  id="ingresos-field-10"
                  value={editAmount}
                  type="number"
                  formatNumber
                  min="0"
                  step="0.01"
                  onChange={(event) => setEditAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-11">Cuenta por cobrar relacionada</Label>
                <SearchableSelect
                  value={editReceivableAccountId}
                  onValueChange={setEditReceivableAccountId}
                  id="ingresos-field-11"
                  title="Seleccionar cuenta por cobrar"
                  placeholder="Sin cuenta por cobrar"
                  searchPlaceholder="Buscar cuenta por cobrar…"
                  options={[{
                    value: "NONE",
                    label: "Sin cuenta por cobrar",
                    pinned: true
                  }, ...receivables.map(item => ({
                    value: item.id,
                    label: `${item.person?.name || ""} · ${item.concept} · pendiente ${formatMoney(item.pendingBalance)} · ${item.status === "PAID_OFF" ? "Liquidada" : "Activa"}`
                  }))]}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ingresos-field-12">Notas</Label>
                <Textarea id="ingresos-field-12"
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEditingIncome}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={updateIncome}
                disabled={isUpdating}
              >
                {isUpdating ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </main>
  );
}
