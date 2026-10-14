"use client";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Item, ItemHeader } from "@/components/ui/item";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { BreakdownDialogContent } from "@/components/ui/responsive-breakdown";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CycleBreakdown from "@/components/tarjetas/CycleBreakdown";

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputValue(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCompactDate(dateString) {
  const date = new Date(dateString);
  const dateText = format(new Date(toDateInputValue(dateString) + "T12:00:00"), "d MMMM", { locale: es });

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const targetUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diffDays = Math.round((targetUtc - todayUtc) / 86400000);

  let badge;
  if (diffDays === 0) badge = "Hoy";
  else if (diffDays > 0) badge = `+${diffDays}`;
  else badge = `${diffDays}`;

  return `${dateText} [${badge}]`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(value || 0)
  );
}

function getStatusLabel(status) {
  const labels = {
    OPEN: "Abierto",
    CUT: "Cortado",
    PAYMENT_PENDING: "Pendiente",
    PAID: "Pagado",
    OVERDUE: "Vencido",
  };
  return labels[status] || status;
}

function getStatusBadgeClass(status) {
  const classes = {
    PAID: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    OVERDUE: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    OPEN: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    CUT: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    PAYMENT_PENDING: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  };
  return classes[status] || "border-border bg-muted text-muted-foreground";
}

const MOBILE_SORT_OPTIONS = [
  { value: "dueDate:asc", label: "Límite: más próximo" },
  { value: "dueDate:desc", label: "Límite: más lejano" },
  { value: "cardName:asc", label: "Tarjeta: A a Z" },
  { value: "cardName:desc", label: "Tarjeta: Z a A" },
  { value: "cutDate:asc", label: "Corte: más próximo" },
  { value: "cutDate:desc", label: "Corte: más lejano" },
  { value: "calculatedAmount:desc", label: "Calculado: mayor primero" },
  { value: "calculatedAmount:asc", label: "Calculado: menor primero" },
  { value: "statementAmount:desc", label: "Estado de cuenta: mayor primero" },
  { value: "statementAmount:asc", label: "Estado de cuenta: menor primero" },
  { value: "difference:desc", label: "Diferencia: mayor primero" },
  { value: "difference:asc", label: "Diferencia: menor primero" },
  { value: "displayStatus:asc", label: "Estado: A a Z" },
  { value: "displayStatus:desc", label: "Estado: Z a A" },
];

function filterCycle(row, _columnId, filterValue) {
  const search = filterValue.trim().toLocaleLowerCase("es");
  return `${row.original.card.name} ${getStatusLabel(row.original.displayStatus)}`
    .toLocaleLowerCase("es")
    .includes(search);
}

function MobileCycleItem({ cycle, openDialog }) {
  const hasStatement = cycle.statementAmount != null;

  return (
    <Item role="listitem" variant="outline" className="block min-w-0 rounded-xl bg-card p-4" aria-label={`Ciclo de ${cycle.card.name}`}>
      <ItemHeader className="mb-3 items-start gap-3">
        <h4 className="min-w-0 break-words text-base font-semibold">{cycle.card.name}</h4>
        <Badge variant="outline" className={cn("shrink-0", getStatusBadgeClass(cycle.displayStatus))}>
          {getStatusLabel(cycle.displayStatus)}
        </Badge>
      </ItemHeader>
      <Separator className="mb-3" />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
        <div className="col-span-2 min-w-0">
          <dt className="text-xs text-muted-foreground">{hasStatement ? "Estado de cuenta" : "Calculado · estimado"}</dt>
          <dd className="break-words text-lg font-semibold tabular-nums">{formatMoney(hasStatement ? cycle.statementAmount : cycle.calculatedAmount)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Corte</dt>
          <dd className="text-sm font-medium">{formatCompactDate(cycle.cutDate)}</dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="text-xs text-muted-foreground">Límite de pago</dt>
          <dd className="text-sm font-medium">{formatCompactDate(cycle.dueDate)}</dd>
        </div>
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="h-11" onClick={() => openDialog("breakdown", cycle)} aria-label={`Ver desglose de ${cycle.card.name}`}>
          Desglose
        </Button>
        <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => openDialog("details", cycle)} aria-label={`Detalles de ${cycle.card.name}`} aria-haspopup="dialog">
          Detalles <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" data-icon="inline-end" />
        </Button>
      </div>
    </Item>
  );
}

function CycleDetails({ cycle }) {
  return (
    <div className="flex flex-col gap-4">
      <Badge variant="outline" className={getStatusBadgeClass(cycle.displayStatus)}>{getStatusLabel(cycle.displayStatus)}</Badge>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Calculado</dt><dd className="break-words font-semibold tabular-nums">{formatMoney(cycle.calculatedAmount)}</dd></div>
        <div className="min-w-0 text-right"><dt className="text-xs text-muted-foreground">Estado de cuenta</dt><dd className="break-words font-semibold tabular-nums">{cycle.statementAmount != null ? formatMoney(cycle.statementAmount) : "Sin capturar"}</dd></div>
        <div className="col-span-2 min-w-0"><dt className="text-xs text-muted-foreground">Diferencia (estado − calculado)</dt><dd className={cn("break-words font-medium tabular-nums", cycle.difference == null ? "text-muted-foreground" : Math.abs(Number(cycle.difference)) > 35 ? "text-destructive" : "text-foreground")}>{cycle.difference != null ? formatMoney(cycle.difference) : "Sin estado de cuenta"}</dd></div>
        <Separator className="col-span-2" />
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Inicio</dt><dd>{format(new Date(toDateInputValue(cycle.startDate) + "T12:00:00"), "d MMM yyyy", { locale: es })}</dd></div>
        <div className="min-w-0 text-right"><dt className="text-xs text-muted-foreground">Corte</dt><dd>{formatCompactDate(cycle.cutDate)}</dd></div>
        <div className="col-span-2 min-w-0"><dt className="text-xs text-muted-foreground">Límite de pago</dt><dd>{formatCompactDate(cycle.dueDate)}</dd></div>
        {cycle.paidAt && <div className="min-w-0"><dt className="text-xs text-muted-foreground">Fecha de pago</dt><dd>{format(new Date(toDateInputValue(cycle.paidAt) + "T12:00:00"), "d MMM yyyy", { locale: es })}</dd></div>}
        {cycle.paidAmount != null && <div className="min-w-0 text-right"><dt className="text-xs text-muted-foreground">Monto pagado</dt><dd className="break-words font-medium tabular-nums">{formatMoney(cycle.paidAmount)}</dd></div>}
      </dl>
    </div>
  );
}

export default function CyclesDataTable({
  cycles,
  updateCycleDates,
  updateStatementAmount,
  markCycleAsPaid,
  unmarkCycleAsPaid,
  loadCycleBreakdown,
}) {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const [activeDialog, setActiveDialog] = useState(null);
  const dialogTitleRef = useRef(null);
  const dialogRequestRef = useRef(0);
  const dialogType = activeDialog?.type;
  const currentCycle = activeDialog ? cycles.find((cycle) => cycle.id === activeDialog.cycle.id) || activeDialog.cycle : null;

  useEffect(() => {
    if (dialogType && dialogType !== "breakdown") {
      dialogTitleRef.current?.focus({ preventScroll: true });
    }
  }, [dialogType]);

  const [editCycleStartDate, setEditCycleStartDate] = useState("");
  const [editCycleCutDate, setEditCycleCutDate] = useState("");
  const [editCycleDueDate, setEditCycleDueDate] = useState("");
  const [statementAmount, setStatementAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paidAmount, setPaidAmount] = useState("");

  const openDialog = useCallback(async (type, cycle) => {
    const requestId = ++dialogRequestRef.current;
    if (type === "dates") {
      setEditCycleStartDate(toDateInputValue(cycle.startDate));
      setEditCycleCutDate(toDateInputValue(cycle.cutDate));
      setEditCycleDueDate(toDateInputValue(cycle.dueDate));
    } else if (type === "statement") {
      setStatementAmount(cycle.statementAmount != null ? String(cycle.statementAmount) : "");
    } else if (type === "pay") {
      setPaidAt(getTodayInputValue());
      setPaidAmount(cycle.statementAmount != null ? String(cycle.statementAmount) : "");
    }

    if (type !== "breakdown") {
      setActiveDialog((previous) => ({ type, cycle, returnToDetails: type !== "details" && (previous?.type === "details" || previous?.returnToDetails) }));
      return;
    }

    setActiveDialog({ type, cycle, isLoading: true, error: "" });

    try {
      const detailedCycle = loadCycleBreakdown
        ? await loadCycleBreakdown(cycle.id)
        : cycle;

      if (requestId !== dialogRequestRef.current) return;
      setActiveDialog({
        type,
        cycle: detailedCycle || cycle,
        isLoading: false,
        error: "",
      });
    } catch (error) {
      if (requestId !== dialogRequestRef.current) return;
      setActiveDialog({
        type,
        cycle,
        isLoading: false,
        error: error.message || "No se pudo cargar el desglose.",
      });
    }
  }, [loadCycleBreakdown]);

  function closeDialog() {
    dialogRequestRef.current += 1;
    setActiveDialog(null);
  }

  async function handleUpdateDates() {
    await updateCycleDates(activeDialog.cycle.id, {
      startDate: editCycleStartDate,
      cutDate: editCycleCutDate,
      dueDate: editCycleDueDate,
    });
    closeDialog();
  }

  async function handleUpdateStatement() {
    await updateStatementAmount(activeDialog.cycle.id, statementAmount);
    closeDialog();
  }

  async function handleMarkAsPaid() {
    await markCycleAsPaid(activeDialog.cycle.id, { paidAt, paidAmount });
    closeDialog();
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: "cardName",
        header: "Tarjeta",
        accessorFn: (row) => row.card.name,
        cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
      },
      {
        accessorKey: "cutDate",
        header: "Corte",
        cell: ({ getValue }) => formatCompactDate(getValue()),
        sortingFn: "datetime",
      },
      {
        accessorKey: "dueDate",
        header: "Límite",
        cell: ({ getValue }) => formatCompactDate(getValue()),
        sortingFn: "datetime",
      },
      {
        accessorKey: "calculatedAmount",
        header: "Calculado",
        cell: ({ getValue }) => (
          <span className="font-medium">{formatMoney(getValue())}</span>
        ),
        sortingFn: "basic",
      },
      {
        accessorKey: "statementAmount",
        header: "Estado cuenta",
        cell: ({ getValue }) => {
          const v = getValue();
          return v != null ? formatMoney(v) : <span className="text-muted-foreground">-</span>;
        },
        sortingFn: "basic",
      },
      {
        accessorKey: "difference",
        header: "Diferencia",
        cell: ({ getValue }) => {
          const v = getValue();
          if (v === null || v === undefined)
            return <span className="text-muted-foreground">-</span>;
          const abs = Math.abs(Number(v || 0));
          return (
            <span className={abs > 35 ? "text-red-400" : "text-emerald-400"}>
              {formatMoney(v)}
            </span>
          );
        },
        sortingFn: "basic",
      },
      {
        accessorKey: "displayStatus",
        header: "Estado",
        sortingFn: (rowA, rowB) => getStatusLabel(rowA.original.displayStatus).localeCompare(getStatusLabel(rowB.original.displayStatus), "es"),
        cell: ({ getValue }) => {
          const status = getValue();
          return (
            <Badge variant="outline" className={getStatusBadgeClass(status)}>
              {getStatusLabel(status)}
            </Badge>
          );
        },
        filterFn: (row, columnId, filterValue) =>
          getStatusLabel(row.getValue(columnId))
            .toLowerCase()
            .includes(filterValue.toLowerCase()),
      },
      {
        id: "actions",
        header: () => <span className="mt-5 block text-center">Acciones</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const cycle = row.original;
          return (
            <div className="flex flex-wrap justify-center gap-0.5 md:flex-nowrap">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openDialog("dates", cycle)}
              >
                Fechas
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openDialog("statement", cycle)}
              >
                Cuenta
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openDialog("pay", cycle)}
              >
                Pagar
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openDialog("breakdown", cycle)}
              >
                Desglose
              </Button>
            </div>
          );
        },
      },
    ],
    [openDialog]
  );

  return (
    <div onClickCapture={captureFocus}>
      <DataTable
        columns={columns}
        data={cycles}
        filterGlobal
        globalFilterFn={filterCycle}
        filterPlaceholder="Filtrar por tarjeta o estado..."
        pageSize={10}
        pageSizeOptions={[10, 25, 50, 100]}
        mobileListLabel="Ciclos mensuales"
        mobileRowSeparator={false}
        renderMobileRow={(row) => <MobileCycleItem key={row.original.id} cycle={row.original} openDialog={openDialog} />}
        mobileToolbar={(table) => (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ordenar</span>
            <ResponsiveSelect
              aria-label="Ordenar ciclos"
              title="Ordenar ciclos"
              className="h-11 min-w-0 flex-1 text-sm"
              value={table.getState().sorting[0] ? `${table.getState().sorting[0].id}:${table.getState().sorting[0].desc ? "desc" : "asc"}` : "dueDate:asc"}
              options={MOBILE_SORT_OPTIONS}
              onValueChange={(value) => {
                const [id, direction] = value.split(":");
                table.setSorting([{ id, desc: direction === "desc" }]);
              }}
            />
          </div>
        )}
      />

      <Dialog open={!!activeDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        {activeDialog && activeDialog.type !== "breakdown" && (
          <DialogContent onCloseAutoFocus={restoreFocus} showCloseButton={false} data-cycle-action={activeDialog.type} className="flex max-h-[90svh] max-w-[calc(100%-1rem)] flex-col md:max-w-md" onOpenAutoFocus={(event) => { event.preventDefault(); dialogTitleRef.current?.focus({ preventScroll: true }); }}>
            <DialogHeader className="shrink-0 pr-12">
              <DialogTitle ref={dialogTitleRef} tabIndex={-1} className="break-words outline-none">
                {activeDialog.type === "details" ? "Detalles" : activeDialog.type === "dates" ? "Editar fechas reales" : activeDialog.type === "statement" ? "Estado de cuenta" : "Registrar pago"} — {currentCycle.card.name}
              </DialogTitle>
              <DialogDescription className="sr-only">Fechas, importes y acciones del ciclo de esta tarjeta.</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-11" aria-label={activeDialog.type === "details" ? "Cerrar detalles" : "Cerrar edición"}><HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" /></Button>
            </DialogClose>
            <div className="min-h-0 overflow-y-auto overscroll-contain pr-1 [color-scheme:dark] [scrollbar-gutter:stable]" role="region" aria-label="Información del ciclo" tabIndex={0}>
              {activeDialog.type === "details" && <CycleDetails cycle={currentCycle} />}
              {activeDialog.type === "dates" && (
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="cycle-start-date">Inicio</FieldLabel>
                    <DatePicker
                      id="cycle-start-date"
                      aria-label="Fecha de inicio"
                      value={editCycleStartDate}
                      onChange={setEditCycleStartDate}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cycle-cut-date">Corte</FieldLabel>
                    <DatePicker
                      id="cycle-cut-date"
                      aria-label="Fecha de corte"
                      value={editCycleCutDate}
                      onChange={setEditCycleCutDate}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cycle-due-date">Límite pago</FieldLabel>
                    <DatePicker
                      id="cycle-due-date"
                      aria-label="Fecha límite de pago"
                      value={editCycleDueDate}
                      onChange={setEditCycleDueDate}
                    />
                  </Field>
                </FieldGroup>
              )}
              {activeDialog.type === "statement" && (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="cycles-data-table-field-1">Monto estado de cuenta</FieldLabel>
                    <Input
                      id="cycles-data-table-field-1"
                      type="number"
                      formatNumber
                      min="0"
                      step="0.01"
                      value={statementAmount}
                      placeholder="0.00"
                      onChange={(e) => setStatementAmount(e.target.value)}
                    />
                  </Field>
                </FieldGroup>
              )}
              {activeDialog.type === "pay" && (
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="cycle-paid-at">Fecha de pago</FieldLabel>
                    <DatePicker
                      id="cycle-paid-at"
                      aria-label="Fecha de pago"
                      value={paidAt}
                      onChange={setPaidAt}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cycles-data-table-field-2">Monto pagado</FieldLabel>
                    <Input
                      id="cycles-data-table-field-2"
                      type="number"
                      formatNumber
                      min="0"
                      step="0.01"
                      value={paidAmount}
                      placeholder="0.00"
                      onChange={(e) => setPaidAmount(e.target.value)}
                    />
                  </Field>
                </FieldGroup>
              )}
            </div>
            <DialogFooter className="grid shrink-0 grid-cols-2 gap-2 pt-1 sm:grid sm:grid-cols-2">
              <Separator className="col-span-2 mb-1" />
              {activeDialog.type === "details" ? (
                <>
                  <Button type="button" variant="secondary" className="h-11" onClick={() => openDialog("dates", currentCycle)}>Fechas</Button>
                  <Button type="button" variant="secondary" className="h-11" onClick={() => openDialog("statement", currentCycle)}>Cuenta</Button>
                  <Button type="button" className="col-span-2 h-11" onClick={() => openDialog("pay", currentCycle)}>{currentCycle.displayStatus === "PAID" ? "Ver pago" : "Pagar"}</Button>
                </>
              ) : (
                <>
                  <Button type="button" className="col-span-2 h-11" onClick={activeDialog.type === "dates" ? handleUpdateDates : activeDialog.type === "statement" ? handleUpdateStatement : handleMarkAsPaid}>
                    {activeDialog.type === "dates" ? "Guardar fechas" : activeDialog.type === "statement" ? "Guardar" : "Confirmar pago"}
                  </Button>
                  {activeDialog.type === "pay" && currentCycle.displayStatus === "PAID" && (
                    <Button type="button" variant="destructive" className="col-span-2 h-11" onClick={() => { unmarkCycleAsPaid(currentCycle.id); closeDialog(); }}>Deshacer pago</Button>
                  )}
                  {activeDialog.returnToDetails && <Button type="button" variant="ghost" className="col-span-2 h-11" onClick={() => openDialog("details", currentCycle)}>Volver a detalles</Button>}
                </>
              )}
            </DialogFooter>
          </DialogContent>
        )}

        {activeDialog?.type === "breakdown" && (
          <BreakdownDialogContent onCloseAutoFocus={restoreFocus} data-cycle-breakdown-dialog title={`Desglose — ${activeDialog.cycle.card.name}`}>
              {activeDialog.isLoading ? (
                <div className="grid gap-4 sm:grid-cols-3" role="status" aria-label="Cargando desglose">
                  <Skeleton className="h-40" />
                  <Skeleton className="h-40" />
                  <Skeleton className="h-40" />
                </div>
              ) : activeDialog.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{activeDialog.error}</AlertDescription>
                </Alert>
              ) : (
                <CycleBreakdown cycle={activeDialog.cycle} />
              )}
          </BreakdownDialogContent>
        )}
      </Dialog>
    </div>
  );
}
