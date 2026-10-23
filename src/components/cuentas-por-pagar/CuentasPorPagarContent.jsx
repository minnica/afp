"use client";

import { apiFetch } from "@/lib/apiFetch";

import { useCreationDraft } from "@/hooks/use-creation-draft";
import { useIsMobile } from "@/hooks/use-mobile";

import CreateRecordSurface, { useCreateDialogMode } from "@/components/ui/create-record-surface";

import { SearchableSelect } from "@/components/ui/searchable-select";

import { useDialogFocus } from "@/hooks/use-dialog-focus";


import { Alert, AlertDescription } from "@/components/ui/alert";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

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
import { DataTable } from "@/components/ui/data-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PayableDetails, { LoanReimbursementSummary } from "@/components/cuentas-por-pagar/PayableDetails";
import PayablesSummary from "@/components/cuentas-por-pagar/PayablesSummary";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import PageSkeleton from "@/components/layout/PageSkeleton";
import { RecordActions, RecordCard, RecordField, RecordListCard, RecordListToolbar, RecordNote } from "@/components/ui/record-card";
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
  };

  return labels[originType] || originType;
}

function toDateInputValue(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function CuentasPorPagarContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const mobileNavigation = useIsMobile();
  const compactEntry = useCreateDialogMode();
  const [createError, setCreateError] = useState(null);

  const [user, setUser] = useState(null);
  const [people, setPeople] = useState([]);
  const [payables, setPayables] = useState([]);
  const [hasLoadedPayables, setHasLoadedPayables] = useState(false);

  const [personId, setPersonId] = useState("");
  const [concept, setConcept] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [originDate, setOriginDate] = useState(getTodayInputValue());
  const [expectedMonthlyPayment, setExpectedMonthlyPayment] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  useCreationDraft({
    name: "cuentas-por-pagar",
    userId: user?.id,
    enabled: mobileNavigation,
    values: { personId, concept, originalAmount, originDate, expectedMonthlyPayment, expectedDate, notes },
    setters: { personId: setPersonId, concept: setConcept, originalAmount: setOriginalAmount, originDate: setOriginDate, expectedMonthlyPayment: setExpectedMonthlyPayment, expectedDate: setExpectedDate, notes: setNotes },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingPayableId, setEditingPayableId] = useState("");
  const [editPersonId, setEditPersonId] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editOriginalAmount, setEditOriginalAmount] = useState("");
  const [editOriginDate, setEditOriginDate] = useState("");
  const [editExpectedMonthlyPayment, setEditExpectedMonthlyPayment] =
    useState("");
  const [editExpectedDate, setEditExpectedDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [payableToDelete, setPayableToDelete] = useState(null);
  const [detailsPayable, setDetailsPayable] = useState(null);
  const [editError, setEditError] = useState("");
  const [filterPersonId, setFilterPersonId] = useState("");
  const [filterOriginType, setFilterOriginType] = useState("");
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [filterConcept, setFilterConcept] = useState("");

  async function loadSettings(userId) {
    const response = await apiFetch(`/api/settings?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar configuración.");
    }

    setPeople(data.people || []);
  }

  async function loadPayables(userId, { mutationCompleted = false } = {}) {
    const response = await apiFetch(`/api/payables?userId=${userId}`, { mutationCompleted });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar cuentas por pagar.");
    }

    setPayables(data.payables || []);
    setHasLoadedPayables(true);
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
          loadPayables(session.user.id),
        ]);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createPayable() {
    if (!user || isSaving) return false;

    setCreateError(null);
    setError("");
    setIsSaving(true);

    let saved = false;
    try {
      const response = await apiFetch("/api/payables", {
        method: "POST", expectedUserId: user?.id,
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
          expectedDate,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la cuenta por pagar.");
      }

      saved = true;
      setConcept("");
      setOriginalAmount("");
      setExpectedMonthlyPayment("");
      setExpectedDate("");
      setNotes("");

      await loadPayables(user.id, { mutationCompleted: true });
      if (!compactEntry) toast.success("Cuenta por pagar guardada exitosamente.");
      return { message: "Cuenta por pagar guardada exitosamente.", type: "success" };
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        if (!compactEntry) toast.success("El registro se guardó; recarga la lista para verlo.");
        return { message: "El registro se guardó; recarga la lista para verlo.", type: "success" };
      }
      setCreateError({ message: err.message || "No se pudo crear la cuenta por pagar." });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const startEditingPayable = useCallback((payable) => {
    setEditError("");
    setEditingPayableId(payable.id);
    setEditPersonId(payable.personId || "");
    setEditConcept(payable.concept || "");
    setEditOriginalAmount(String(payable.originalAmount || ""));
    setEditOriginDate(toDateInputValue(payable.originDate));
    setEditExpectedMonthlyPayment(
      payable.expectedMonthlyPayment
        ? String(payable.expectedMonthlyPayment)
        : "",
    );
    setEditExpectedDate(toDateInputValue(payable.expectedDate));
    setEditNotes(payable.notes || "");
  }, []);

  function cancelEditingPayable() {
    setEditingPayableId("");
    setEditPersonId("");
    setEditConcept("");
    setEditOriginalAmount("");
    setEditOriginDate("");
    setEditExpectedMonthlyPayment("");
    setEditExpectedDate("");
    setEditNotes("");
  }

  async function updatePayable() {
    if (!user || !editingPayableId || isUpdating) return;

    setError("");
    setIsUpdating(true);
    setEditError("");

    try {
      const response = await apiFetch("/api/payables", {
        method: "PATCH", expectedUserId: user?.id,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingPayableId,
          personId: editPersonId,
          concept: editConcept,
          originalAmount: editOriginalAmount,
          originDate: editOriginDate,
          expectedMonthlyPayment: editExpectedMonthlyPayment,
          expectedDate: editExpectedDate,
          notes: editNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo actualizar la cuenta por pagar.",
        );
      }

      cancelEditingPayable();
      await loadPayables(user.id, { mutationCompleted: true });
      toast.success("Cambios guardados exitosamente.");
    } catch (err) {
      setEditError(err.message || "No se pudo actualizar la cuenta por pagar.");
      toast.error(err.message || "No se pudo actualizar la cuenta por pagar.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deletePayable(id) {
    if (!user) return;

    setError("");

    try {
      const response = await apiFetch(`/api/payables?id=${id}`, {
        method: "DELETE", expectedUserId: user?.id,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      setPayableToDelete(null);
      await loadPayables(user.id, { mutationCompleted: true });
      toast.success("Cuenta por pagar eliminada exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar la cuenta por pagar.");
      toast.error(err.message || "No se pudo eliminar la cuenta por pagar.");
    }
  }

  const filteredPayables = useMemo(() => {
    const search = filterConcept.trim().toLocaleLowerCase("es-MX");
    return payables.filter((item) => {
      if (filterPersonId && item.personId !== filterPersonId) return false;
      if (filterOriginType && item.originType !== filterOriginType) return false;
      if (filterStatus && item.status !== filterStatus) return false;
      return !search || item.concept?.toLocaleLowerCase("es-MX").includes(search);
    });
  }, [payables, filterPersonId, filterOriginType, filterStatus, filterConcept]);

  const payableColumns = useMemo(() => [
    {
      id: "concept",
      accessorFn: (row) => row.concept,
      header: "Concepto",
      cell: ({ row: { original: item } }) => (
        <div className="flex min-w-56 max-w-sm flex-col gap-1 whitespace-normal break-words">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{item.concept}</p>
            <Badge variant="secondary">{getStatusLabel(item.status)}</Badge>
            <Badge variant="outline">{getOriginLabel(item.originType)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {item.person?.name} · {formatDate(item.originDate)}
          </p>
          {item.accountType === "LOAN" ? (
            <p className="text-sm text-muted-foreground">
              {item.reimbursementReceivable
                ? `Reembolso de ${item.reimbursementReceivable.person?.name} · ${getReimbursementBalanceLabel(item.reimbursementReceivable)}: ${formatMoney(Math.abs(item.reimbursementReceivable.pendingBalance))}`
                : "Préstamo a cargo propio"}
            </p>
          ) : null}
        </div>
      ),
    },
    ...[
      { id: "originalAmount", header: "Original" },
      { id: "paidAmount", header: "Capital abonado" },
      { id: "pendingBalance", header: "Pendiente" },
    ].map(({ id, header }) => ({
      id,
      header,
      accessorFn: (row) => Number(row[id] || 0),
      cell: ({ row }) => <span className={id === "pendingBalance" ? "font-semibold tabular-nums" : "font-medium tabular-nums"}>{formatMoney(row.original[id])}</span>,
    })),
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      enableSorting: false,
      cell: ({ row: { original: item } }) => (
        <div className="flex items-center justify-end gap-1">
          <Button type="button" variant="secondary" size="sm" aria-label={`Ver ${item.accountType === "LOAN" ? "detalles" : "pagos"} de ${item.concept}`} onClick={() => setDetailsPayable(item)}>
            {item.accountType === "LOAN" ? "Ver detalles" : "Ver pagos"}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Editar cuenta por pagar: ${item.concept}`} onClick={() => startEditingPayable(item)}><Pencil /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Eliminar cuenta por pagar: ${item.concept}`} onClick={() => setPayableToDelete(item)}><Trash2 /></Button>
        </div>
      ),
    },
  ], [startEditingPayable]);

  const payableMobileView = {
    mobileListLabel: "Cuentas por pagar",
    mobileRowSeparator: false,
    renderMobileRow: ({ original: item }) => (
      <RecordCard
        title={item.person?.name || item.concept}
        subtitle={item.person?.name ? item.concept : null}
        badges={<Badge variant="secondary">{getStatusLabel(item.status)}</Badge>}
        amount={formatMoney(item.pendingBalance)}
        amountLabel={item.accountType === "LOAN" ? "Saldo bancario pendiente" : "Pendiente de pago"}
        aria-label={`Cuenta por pagar: ${item.concept}`}
        actions={
          <RecordActions label={`cuenta por pagar: ${item.concept}`} onEdit={() => startEditingPayable(item)} onDelete={() => setPayableToDelete(item)}>
            <Button type="button" variant="outline" className="h-11" aria-label={`Ver ${item.accountType === "LOAN" ? "detalle" : "pagos"} de ${item.concept}`} onClick={() => setDetailsPayable(item)}>{item.accountType === "LOAN" ? "Ver detalle" : "Ver pagos"}</Button>
          </RecordActions>
        }
      >
        {item.accountType === "LOAN" ? (
          <>
            <dl className="grid grid-cols-2 gap-3">
              {item.paymentAmount != null ? <RecordField label="Descuento quincenal">{formatMoney(item.paymentAmount)}</RecordField> : null}
              <RecordField label="Capital pagado">{formatMoney(item.paidAmount)}</RecordField>
            </dl>
            {item.reimbursementReceivable ? <LoanReimbursementSummary payable={item} compact /> : <p className="text-sm text-muted-foreground">Todo el préstamo está a tu cargo.</p>}
          </>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <RecordField label="Monto original">{formatMoney(item.originalAmount)}</RecordField>
              <RecordField label="Pagado">{formatMoney(item.paidAmount)}</RecordField>
              {item.expectedMonthlyPayment ? <RecordField label="Pago esperado">{formatMoney(item.expectedMonthlyPayment)}</RecordField> : null}
              {item.expectedDate ? <RecordField label="Fecha esperada">{formatDate(item.expectedDate)}</RecordField> : null}
              <RecordField label="Fecha de origen">{formatDate(item.originDate)}</RecordField>
              <RecordField label="Origen">{getOriginLabel(item.originType)}</RecordField>
            </dl>
            <RecordNote>{item.notes}</RecordNote>
          </>
        )}
      </RecordCard>
    ),
    mobileToolbar: (table) => <RecordListToolbar table={table} label="cuentas por pagar" totals={[{ key: "originalAmount", label: "Monto original" }, { key: "paidAmount", label: "Capital abonado" }, { key: "pendingBalance", label: "Pendiente" }]} />,
  };

  if (isLoading) {
    return <PageSkeleton variant="form-table" mobileCards />;
  }

  return (
    <>
      <AlertDialog
        open={Boolean(payableToDelete)}
        onOpenChange={(open) => {
          if (!open) setPayableToDelete(null);
        }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar esta cuenta por pagar?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la cuenta{" "}
              {payableToDelete?.concept
                ? `"${payableToDelete.concept}"`
                : "seleccionada"}{" "}
              por {formatMoney(payableToDelete?.originalAmount || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deletePayable(payableToDelete.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div onClickCapture={captureFocus}>
        <section className={`mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8 ${compactEntry ? "pb-28!" : ""}`}>
          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {hasLoadedPayables ? <PayablesSummary payables={payables} /> : null}

          <div className={`grid min-w-0 gap-5 ${compactEntry ? "" : "xl:grid-cols-[360px_1fr]"}`}>
            <CreateRecordSurface
              showSaveFeedback
              compact={compactEntry}
              title="Nueva cuenta por pagar"
              saveLabel="Guardar cuenta"
              error={createError}
              isSaving={isSaving}
              onSubmit={createPayable}
            >
              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-1">Persona / proveedor</Label>
                <SearchableSelect
                  value={personId}
                  onValueChange={setPersonId}
                  id="cuentas-por-pagar-field-1"
                  title="Seleccionar persona"
                  placeholder="Selecciona persona o proveedor"
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
                <Label htmlFor="cuentas-por-pagar-field-2">Concepto</Label>
                <Input
                  id="cuentas-por-pagar-field-2"
                  value={concept}
                  placeholder="Ej. Préstamo pendiente, compra por pagar..."
                  onChange={(event) => setConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-3">Monto original</Label>
                <Input
                  id="cuentas-por-pagar-field-3"
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
                <Label htmlFor="payable-origin-date">Fecha de origen</Label>
                <DatePicker
                  id="payable-origin-date"
                  aria-label="Fecha de origen"
                  value={originDate}
                  onChange={setOriginDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-4">Pago mensual esperado opcional</Label>
                <Input
                  id="cuentas-por-pagar-field-4"
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
                <Label htmlFor="payable-expected-date">Fecha esperada opcional</Label>
                <DatePicker
                  id="payable-expected-date"
                  aria-label="Fecha esperada"
                  clearable
                  value={expectedDate}
                  onChange={setExpectedDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-5">Notas opcional</Label>
                <Textarea id="cuentas-por-pagar-field-5"
                  value={notes}
                  placeholder="Detalles adicionales..."
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </CreateRecordSurface>

            <RecordListCard className="min-w-0">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  <h2>Cuentas por pagar</h2>
                </CardTitle>
              </CardHeader>

              <CardContent>
                <DataTable
                  {...payableMobileView}
                  columns={payableColumns}
                  data={filteredPayables}
                  pageSize={10}
                  pageSizeOptions={[5, 10, 25, 50]}
                  footerRow={renderPayablesTotalsFooter}
                  toolbarStart={
                    <>
                      <SearchableSelect
                        value={filterPersonId || "ALL"}
                        onValueChange={(value) => setFilterPersonId(value === "ALL" ? "" : value)}
                        aria-label="Filtrar por persona"
                        className="w-full md:w-[180px]"
                        title="Seleccionar persona"
                        placeholder="Todas las personas"
                        searchPlaceholder="Buscar persona…"
                        options={[{ value: "ALL", label: "Todas las personas", pinned: true }, ...people.map((item) => ({ value: item.id, label: item.name }))]}
                      />
                      <ResponsiveSelect
                        value={filterOriginType || "ALL"}
                        onValueChange={(value) => setFilterOriginType(value === "ALL" ? "" : value)}
                        aria-label="Filtrar por origen"
                        className="w-full md:w-[180px]"
                        title="Filtrar por origen"
                        options={[{ value: "ALL", label: "Todos los orígenes" }, { value: "MANUAL", label: "Manual" }, { value: "DAILY_EXPENSE", label: "Gasto diario" }]}
                      />
                      <ResponsiveSelect
                        value={filterStatus || "ALL"}
                        onValueChange={(value) => setFilterStatus(value === "ALL" ? "" : value)}
                        aria-label="Filtrar por estado"
                        className="w-full md:w-[180px]"
                        title="Filtrar por estado"
                        options={[{ value: "ALL", label: "Todos los estados" }, { value: "ACTIVE", label: "Activa" }, { value: "PAID_OFF", label: "Liquidada" }, { value: "CANCELLED", label: "Cancelada" }]}
                      />
                      <Input
                        aria-label="Buscar por concepto"
                        placeholder="Buscar concepto..."
                        value={filterConcept}
                        onChange={(event) => setFilterConcept(event.target.value)}
                        className="h-11 w-full text-base md:h-7 md:w-[200px] md:text-xs"
                      />
                    </>
                  }
                />
              </CardContent>
            </RecordListCard>
          </div>

          <Dialog open={Boolean(editingPayableId)} onOpenChange={(open) => { if (!open) cancelEditingPayable(); }}>
            <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar cuenta por pagar</DialogTitle>
                <DialogDescription>Actualiza los datos y guarda los cambios.</DialogDescription>
              </DialogHeader>
              {editError ? <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert> : null}
              <FieldGroup className="grid md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="cuentas-por-pagar-field-6">Persona / proveedor</FieldLabel>
                  <SearchableSelect
                    value={editPersonId}
                    onValueChange={setEditPersonId}
                    id="cuentas-por-pagar-field-6"
                    title="Seleccionar persona"
                    placeholder="Selecciona persona o proveedor"
                    searchPlaceholder="Buscar persona…"
                    options={people.map(item => ({
                      value: item.id,
                      label: item.name
                    }))}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-payable-origin-date">Fecha de origen</FieldLabel>
                  <DatePicker
                    id="edit-payable-origin-date"
                    aria-label="Fecha de origen"
                    value={editOriginDate}
                    onChange={setEditOriginDate}
                  />
                </Field>

                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="cuentas-por-pagar-field-7">Concepto</FieldLabel>
                  <Input
                    id="cuentas-por-pagar-field-7"
                    value={editConcept}
                    onChange={(event) => setEditConcept(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="cuentas-por-pagar-field-8">Monto original</FieldLabel>
                  <Input
                    id="cuentas-por-pagar-field-8"
                    value={editOriginalAmount}
                    type="number"
                    formatNumber
                    min="0"
                    step="0.01"
                    onChange={(event) =>
                      setEditOriginalAmount(event.target.value)
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="cuentas-por-pagar-field-9">Pago mensual esperado opcional</FieldLabel>
                  <Input
                    id="cuentas-por-pagar-field-9"
                    value={editExpectedMonthlyPayment}
                    type="number"
                    formatNumber
                    min="0"
                    step="0.01"
                    onChange={(event) =>
                      setEditExpectedMonthlyPayment(event.target.value)
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-payable-expected-date">Fecha esperada opcional</FieldLabel>
                  <DatePicker
                    id="edit-payable-expected-date"
                    aria-label="Fecha esperada"
                    clearable
                    value={editExpectedDate}
                    onChange={setEditExpectedDate}
                  />
                </Field>

                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="cuentas-por-pagar-field-10">Notas</FieldLabel>
                  <Textarea id="cuentas-por-pagar-field-10"
                    value={editNotes}
                    onChange={(event) => setEditNotes(event.target.value)}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter className="gap-2">
                <Button type="button" variant="secondary" onClick={cancelEditingPayable}>Cancelar</Button>
                <Button type="button" onClick={updatePayable} disabled={isUpdating}>{isUpdating ? "Guardando..." : "Guardar cambios"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(detailsPayable)} onOpenChange={(open) => { if (!open) setDetailsPayable(null); }}>
            {detailsPayable ? <PayableDetails payable={detailsPayable} restoreFocus={restoreFocus} /> : null}
          </Dialog>
        </section>
      </div>
    </>
  );
}

function renderPayablesTotalsFooter(table) {
  const totals = table.getFilteredRowModel().rows.reduce((acc, { original }) => {
    for (const key of Object.keys(acc)) acc[key] += Math.round(Number(original[key] || 0) * 100);
    return acc;
  }, { originalAmount: 0, paidAmount: 0, pendingBalance: 0 });
  return (
    <TableRow>
      <TableCell>Total filtrado</TableCell>
      <TableCell className="font-medium tabular-nums">{formatMoney(totals.originalAmount / 100)}</TableCell>
      <TableCell className="font-medium tabular-nums">{formatMoney(totals.paidAmount / 100)}</TableCell>
      <TableCell className="font-semibold tabular-nums">{formatMoney(totals.pendingBalance / 100)}</TableCell>
      <TableCell />
    </TableRow>
  );
}

function getReimbursementBalanceLabel(receivable) {
  if (receivable.pendingBalance < 0) return "Cobro excedente";
  if (receivable.status === "CANCELLED") return "Saldo de cuenta cancelada";
  return "Pendiente por cobrar";
}
