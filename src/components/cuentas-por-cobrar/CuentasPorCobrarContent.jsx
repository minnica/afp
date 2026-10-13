"use client";

import { useCreationDraft } from "@/hooks/use-creation-draft";
import { useIsMobile } from "@/hooks/use-mobile";

import CreateRecordSurface, { useCreateDialogMode } from "@/components/ui/create-record-surface";

import { ResponsiveSelect } from "@/components/ui/responsive-select";

import { SearchableSelect } from "@/components/ui/searchable-select";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Empty, EmptyDescription } from "@/components/ui/empty";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

import { toast } from "@/components/ui/sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PageSkeleton from "@/components/layout/PageSkeleton";
import {
  Dialog,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatDate(dateString) {
  if (!dateString) return "-";
  return format(new Date(dateString), "d MMM yyyy", { locale: es });
}

function getStatusLabel(status) {
  const labels = {
    ACTIVE: "Activa",
    PAID_OFF: "Liquidada",
    CANCELLED: "Cancelada",
  };

  return labels[status] || status;
}

function getOriginLabel(originType) {
  const labels = {
    MANUAL: "Manual",
    DAILY_EXPENSE: "Gasto diario",
    INSTALLMENT_PURCHASE: "Compra a meses",
  };

  return labels[originType] || originType;
}

function formatChargeDaysInput(days) {
  if (!Array.isArray(days) || days.length === 0) return "";

  return days.join(", ");
}

export default function CuentasPorCobrarContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const mobileNavigation = useIsMobile();
  const compactEntry = useCreateDialogMode();
  const [createError, setCreateError] = useState(null);

  const [user, setUser] = useState(null);
  const [people, setPeople] = useState([]);
  const [receivables, setReceivables] = useState([]);

  const [personId, setPersonId] = useState("");
  const [concept, setConcept] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [originDate, setOriginDate] = useState(getTodayInputValue());
  const [expectedMonthlyPayment, setExpectedMonthlyPayment] = useState("");
  const [expectedChargeDays, setExpectedChargeDays] = useState("");
  const [notes, setNotes] = useState("");

  useCreationDraft({
    name: "cuentas-por-cobrar",
    userId: user?.id,
    enabled: mobileNavigation,
    values: { personId, concept, originalAmount, originDate, expectedMonthlyPayment, expectedChargeDays, notes },
    setters: { personId: setPersonId, concept: setConcept, originalAmount: setOriginalAmount, originDate: setOriginDate, expectedMonthlyPayment: setExpectedMonthlyPayment, expectedChargeDays: setExpectedChargeDays, notes: setNotes },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [receivableToDelete, setReceivableToDelete] = useState(null);
  const [error, setError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReceivableId, setEditingReceivableId] = useState("");
  const [editPersonId, setEditPersonId] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editOriginalAmount, setEditOriginalAmount] = useState("");
  const [editOriginDate, setEditOriginDate] = useState("");
  const [editExpectedMonthlyPayment, setEditExpectedMonthlyPayment] =
    useState("");
  const [editExpectedChargeDays, setEditExpectedChargeDays] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [paymentsDialogReceivable, setPaymentsDialogReceivable] =
    useState(null);

  const [filterPersonId, setFilterPersonId] = useState("");
  const [filterOriginType, setFilterOriginType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterConcept, setFilterConcept] = useState("");

  async function loadSettings(userId) {
    const response = await fetch(`/api/settings?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar configuración.");
    }

    setPeople(data.people || []);
  }

  async function loadReceivables(userId) {
    const response = await fetch(`/api/receivables?userId=${userId}`);
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

        setUser(session.user);

        await ensureUserSetup(session.user);

        await Promise.all([
          loadSettings(session.user.id),
          loadReceivables(session.user.id),
        ]);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createReceivable() {
    if (!user || isSaving) return false;

    setCreateError(null);
    setError("");
    setIsSaving(true);

    let saved = false;
    const toastOptions = compactEntry ? { position: "top-center" } : undefined;
    try {
      const response = await fetch("/api/receivables", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          personId,
          concept,
          originalAmount,
          originDate,
          expectedMonthlyPayment,
          expectedChargeDays,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la cuenta por cobrar.");
      }

      saved = true;
      setConcept("");
      setOriginalAmount("");
      setExpectedMonthlyPayment("");
      setExpectedChargeDays("");
      setNotes("");

      await loadReceivables(user.id);
      toast.success("Cuenta por cobrar guardada exitosamente.", toastOptions);
      return true;
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        toast.success("Cuenta por cobrar guardada exitosamente.", toastOptions);
        return true;
      }
      setCreateError({ message: err.message || "No se pudo crear la cuenta por cobrar." });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function toDateInputValue(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function startEditingReceivable(receivable) {
    setEditingReceivableId(receivable.id);
    setEditPersonId(receivable.personId || "");
    setEditConcept(receivable.concept || "");
    setEditOriginalAmount(String(receivable.originalAmount || ""));
    setEditOriginDate(toDateInputValue(receivable.originDate));
    setEditExpectedMonthlyPayment(
      receivable.expectedMonthlyPayment
        ? String(receivable.expectedMonthlyPayment)
        : "",
    );
    setEditExpectedChargeDays(
      formatChargeDaysInput(receivable.expectedChargeDays),
    );
    setEditNotes(receivable.notes || "");
    setEditDialogOpen(true);
  }

  function cancelEditingReceivable() {
    setEditDialogOpen(false);
    setEditingReceivableId("");
    setEditPersonId("");
    setEditConcept("");
    setEditOriginalAmount("");
    setEditOriginDate("");
    setEditExpectedMonthlyPayment("");
    setEditExpectedChargeDays("");
    setEditNotes("");
  }

  async function updateReceivable() {
    if (!user || !editingReceivableId) return;

    setError("");
    setIsUpdating(true);

    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingReceivableId,
          personId: editPersonId,
          concept: editConcept,
          originalAmount: editOriginalAmount,
          originDate: editOriginDate,
          expectedMonthlyPayment: editExpectedMonthlyPayment,
          expectedChargeDays: editExpectedChargeDays,
          notes: editNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo actualizar la cuenta por cobrar.",
        );
      }

      cancelEditingReceivable();
      await loadReceivables(user.id);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la cuenta por cobrar.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteReceivable(id) {
    if (!user) return;


    setError("");

    try {
      const response = await fetch(`/api/receivables?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      await loadReceivables(user.id);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la cuenta por cobrar.");
    }
  }

  function openPaymentsDialog(receivable) {
    setPaymentsDialogReceivable(receivable);
  }

  const summary = useMemo(() => {
    return receivables.reduce(
      (acc, item) => {
        acc.original += Number(item.originalAmount || 0);
        acc.paid += Number(item.paidAmount || 0);
        acc.pending += Number(item.pendingBalance || 0);

        return acc;
      },
      {
        original: 0,
        paid: 0,
        pending: 0,
      },
    );
  }, [receivables]);

  const filteredReceivables = useMemo(() => {
    return receivables.filter((item) => {
      if (filterPersonId && item.personId !== filterPersonId) return false;
      if (filterOriginType && item.originType !== filterOriginType)
        return false;
      if (filterStatus && item.status !== filterStatus) return false;

      if (filterConcept) {
        const search = filterConcept.toLowerCase();

        if (!item.concept?.toLowerCase().includes(search)) return false;
      }

      return true;
    });
  }, [
    receivables,
    filterPersonId,
    filterOriginType,
    filterStatus,
    filterConcept,
  ]);

  const receivableColumns = useMemo(
    () => [
      {
        id: "concept",
        accessorFn: (row) => row.concept,
        header: "Concepto",
        cell: ({ row }) => {
          const item = row.original;

          return (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{item.concept}</p>
                <Badge variant="secondary">{getStatusLabel(item.status)}</Badge>
                <Badge variant="outline">
                  {getOriginLabel(item.originType)}
                </Badge>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                Persona: {item.person?.name} · Origen:{" "}
                {formatDate(item.originDate)}
              </p>

              {item.expectedMonthlyPayment ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Pago esperado: {formatMoney(item.expectedMonthlyPayment)}
                </p>
              ) : null}

              {item.expectedChargeDays?.length > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Días de cobro: {item.expectedChargeDays.join(", ")}
                </p>
              ) : null}

              {item.notes ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.notes}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "originalAmount",
        accessorFn: (row) => Number(row.originalAmount || 0),
        header: "Original",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-medium tabular-nums">
            {formatMoney(row.original.originalAmount)}
          </span>
        ),
      },
      {
        id: "paidAmount",
        accessorFn: (row) => Number(row.paidAmount || 0),
        header: "Pagado",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-medium tabular-nums">
            {formatMoney(row.original.paidAmount)}
          </span>
        ),
      },
      {
        id: "pendingBalance",
        accessorFn: (row) => Number(row.pendingBalance || 0),
        header: "Pendiente",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-semibold tabular-nums">
            {formatMoney(row.original.pendingBalance)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => openPaymentsDialog(row.original)}
            >
              Ver pagos
            </Button>

            <Button aria-label="Editar"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startEditingReceivable(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button aria-label="Eliminar"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setReceivableToDelete(row.original)}
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

  function renderReceivablesTotalsFooter(table) {
    const rows = table.getFilteredRowModel().rows;
    const totals = rows.reduce(
      (acc, row) => {
        acc.original += Number(row.original.originalAmount || 0);
        acc.paid += Number(row.original.paidAmount || 0);
        acc.pending += Number(row.original.pendingBalance || 0);

        return acc;
      },
      { original: 0, paid: 0, pending: 0 },
    );

    return (
      <TableRow>
        <TableCell>Total filtrado</TableCell>
        <TableCell className="font-medium tabular-nums">
          {formatMoney(totals.original)}
        </TableCell>
        <TableCell className="font-medium tabular-nums">
          {formatMoney(totals.paid)}
        </TableCell>
        <TableCell className="font-semibold tabular-nums">
          {formatMoney(totals.pending)}
        </TableCell>
        <TableCell />
      </TableRow>
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="form-table" />;
  }

  return (
    <main onClickCapture={captureFocus}>
      <AlertDialog
        open={Boolean(receivableToDelete)}
        onOpenChange={(open) => { if (!open) setReceivableToDelete(null); }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta cuenta por cobrar?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará la cuenta por cobrar seleccionada. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteReceivable(receivableToDelete.id)}>
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
          <SummaryCard
            title="Monto original"
            value={formatMoney(summary.original)}
          />
          <SummaryCard title="Pagado" value={formatMoney(summary.paid)} />
          <SummaryCard title="Pendiente" value={formatMoney(summary.pending)} />
        </div>

        <div className={`grid min-w-0 gap-5 ${compactEntry ? "" : "xl:grid-cols-[360px_1fr]"}`}>
          <CreateRecordSurface
              compact={compactEntry}
              title="Nueva cuenta por cobrar"
              saveLabel="Guardar cuenta"
              error={createError}
              isSaving={isSaving}
              onSubmit={createReceivable}
            >
              <div className="space-y-2">
              <Label htmlFor="cuentas-por-cobrar-field-1">Persona</Label>
              <SearchableSelect
                value={personId}
                onValueChange={setPersonId}
                id="cuentas-por-cobrar-field-1"
                title="Seleccionar persona"
                placeholder="Selecciona persona"
                searchPlaceholder="Buscar persona…"
                options={people.map(item => ({
                  value: item.id,
                  label: item.name
                }))}
              />

              {people.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Primero agrega personas en Configuración.
                </p>
              ) : null}
              </div>

              <div className="space-y-2">
              <Label htmlFor="cuentas-por-cobrar-field-2">Concepto</Label>
              <Input
                id="cuentas-por-cobrar-field-2"
                value={concept}
                placeholder="Ej. Venta de moto"
                onChange={(event) => setConcept(event.target.value)}
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="cuentas-por-cobrar-field-3">Monto original</Label>
              <Input
                id="cuentas-por-cobrar-field-3"
                value={originalAmount}
                type="number"
                formatNumber
                min="0"
                step="0.01"
                placeholder="0.00"
                onChange={(event) => setOriginalAmount(event.target.value)}
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="receivable-origin-date">Fecha de origen</Label>
              <DatePicker
                id="receivable-origin-date"
                aria-label="Fecha de origen"
                value={originDate}
                onChange={setOriginDate}
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="cuentas-por-cobrar-field-4">Pago mensual esperado opcional</Label>
              <Input
                id="cuentas-por-cobrar-field-4"
                value={expectedMonthlyPayment}
                type="number"
                formatNumber
                min="0"
                step="0.01"
                placeholder="Ej. 1000"
                onChange={(event) =>
                  setExpectedMonthlyPayment(event.target.value)
                }
              />
              </div>

              <div className="space-y-2">
              <Label htmlFor="cuentas-por-cobrar-field-5">Días de cobro opcionales</Label>
              <Input
                id="cuentas-por-cobrar-field-5"
                value={expectedChargeDays}
                placeholder="Ej. 15, 30"
                onChange={(event) =>
                  setExpectedChargeDays(event.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                Puedes capturar uno o varios días separados por coma.
              </p>
              </div>

              <div className="space-y-2">
              <Label htmlFor="cuentas-por-cobrar-field-6">Notas opcional</Label>
              <Textarea id="cuentas-por-cobrar-field-6"
                value={notes}
                placeholder="Detalles adicionales..."
                onChange={(event) => setNotes(event.target.value)}
              />
              </div>
            </CreateRecordSurface>

          <div className="min-w-0">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Cuentas por cobrar
                </CardTitle>
              </CardHeader>

              <CardContent>
                <DataTable
                  columns={receivableColumns}
                  data={filteredReceivables}
                  pageSize={10}
                  pageSizeOptions={[5, 10, 25, 50]}
                  footerRow={renderReceivablesTotalsFooter}
                  toolbarStart={
                    <>
                      <SearchableSelect
                        value={filterPersonId || "ALL"}
                        onValueChange={value => setFilterPersonId(value === "ALL" ? "" : value)}
                        aria-label="Filtrar por persona"
                        className="w-[180px]"
                        title="Seleccionar persona"
                        placeholder="Todas las personas"
                        searchPlaceholder="Buscar persona…"
                        options={[{
                          value: "ALL",
                          label: "Todas las personas",
                          pinned: true
                        }, ...people.map(item => ({
                          value: item.id,
                          label: item.name
                        }))]}
                      />

                      <ResponsiveSelect
                        value={filterOriginType || "ALL"}
                        onValueChange={value => setFilterOriginType(value === "ALL" ? "" : value)}
                        aria-label="Filtrar por origen"
                        className="w-[180px]"
                        title="Filtrar por origen"
                        placeholder="Todos los orígenes"
                        options={[{
                          value: "ALL",
                          label: "Todos los or\xEDgenes"
                        }, {
                          value: "MANUAL",
                          label: "Manual"
                        }, {
                          value: "DAILY_EXPENSE",
                          label: "Gasto diario"
                        }, {
                          value: "INSTALLMENT_PURCHASE",
                          label: "Compra a meses"
                        }]}
                      />

                      <ResponsiveSelect
                        value={filterStatus || "ALL"}
                        onValueChange={value => setFilterStatus(value === "ALL" ? "" : value)}
                        aria-label="Filtrar por estado"
                        className="w-[180px]"
                        title="Filtrar por estado"
                        placeholder="Todos los estados"
                        options={[{
                          value: "ALL",
                          label: "Todos los estados"
                        }, {
                          value: "ACTIVE",
                          label: "Activa"
                        }, {
                          value: "PAID_OFF",
                          label: "Liquidada"
                        }, {
                          value: "CANCELLED",
                          label: "Cancelada"
                        }]}
                      />

                      <Input
                        aria-label="Buscar por concepto"
                        placeholder="Buscar concepto..."
                        value={filterConcept}
                        onChange={(event) =>
                          setFilterConcept(event.target.value)
                        }
                        className="w-[200px]"
                      />
                    </>
                  }
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            if (!open) cancelEditingReceivable();
          }}
        >
          <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar cuenta por cobrar</DialogTitle>
              <DialogDescription className="sr-only">Actualiza los datos y guarda los cambios.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cuentas-por-cobrar-field-7">Persona</Label>
                <SearchableSelect
                  value={editPersonId}
                  onValueChange={setEditPersonId}
                  id="cuentas-por-cobrar-field-7"
                  title="Seleccionar persona"
                  placeholder="Selecciona persona"
                  searchPlaceholder="Buscar persona…"
                  options={people.map(item => ({
                    value: item.id,
                    label: item.name
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-receivable-origin-date">Fecha de origen</Label>
                <DatePicker
                  id="edit-receivable-origin-date"
                  aria-label="Fecha de origen"
                  value={editOriginDate}
                  onChange={setEditOriginDate}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="cuentas-por-cobrar-field-8">Concepto</Label>
                <Input
                  id="cuentas-por-cobrar-field-8"
                  value={editConcept}
                  onChange={(event) => setEditConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-cobrar-field-9">Monto original</Label>
                <Input
                  id="cuentas-por-cobrar-field-9"
                  value={editOriginalAmount}
                  type="number"
                  formatNumber
                  min="0"
                  step="0.01"
                  onChange={(event) =>
                    setEditOriginalAmount(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-cobrar-field-10">Pago mensual esperado opcional</Label>
                <Input
                  id="cuentas-por-cobrar-field-10"
                  value={editExpectedMonthlyPayment}
                  type="number"
                  formatNumber
                  min="0"
                  step="0.01"
                  onChange={(event) =>
                    setEditExpectedMonthlyPayment(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-cobrar-field-11">Días de cobro opcionales</Label>
                <Input
                  id="cuentas-por-cobrar-field-11"
                  value={editExpectedChargeDays}
                  placeholder="Ej. 15, 30"
                  onChange={(event) =>
                    setEditExpectedChargeDays(event.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Puedes capturar uno o varios días separados por coma.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="cuentas-por-cobrar-field-12">Notas</Label>
                <Textarea id="cuentas-por-cobrar-field-12"
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancelEditingReceivable}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={updateReceivable}
                disabled={isUpdating}
              >
                {isUpdating ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(paymentsDialogReceivable)}
          onOpenChange={(open) => {
            if (!open) setPaymentsDialogReceivable(null);
          }}
        >
          <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                Pagos vinculados
                {paymentsDialogReceivable
                  ? ` · ${paymentsDialogReceivable.concept}`
                  : ""}
              </DialogTitle>
              <DialogDescription>Ingresos aplicados a esta cuenta por cobrar.</DialogDescription>
            </DialogHeader>

            {paymentsDialogReceivable ? (
              <ReceivablePaymentsBreakdown
                receivable={paymentsDialogReceivable}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </section>
    </main>
  );
}

function SummaryCard({ title, value }) {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ReceivablePaymentsBreakdown({ receivable }) {
  const payments = [...(receivable.incomes || [])].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  if (payments.length === 0) {
    return (
      <Empty>
        <EmptyDescription>
          Todavía no hay pagos vinculados a esta cuenta por cobrar.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <ItemGroup>
      {payments.map((payment) => (
        <Item
          key={payment.id}
          variant="muted"
          role="listitem"
        >
          <ItemContent className="min-w-0">
            <ItemTitle>{payment.concept}</ItemTitle>
            <ItemDescription>
              {formatDate(payment.date)}
              {payment.source ? ` · ${payment.source}` : ""}
            </ItemDescription>
          </ItemContent>

          <p className="font-semibold">{formatMoney(payment.amount)}</p>
        </Item>
      ))}
    </ItemGroup>
  );
}
