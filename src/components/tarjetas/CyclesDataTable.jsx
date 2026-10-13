"use client";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Item } from "@/components/ui/item";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { BreakdownDialogContent } from "@/components/ui/responsive-breakdown";
import {
  Dialog,
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
    <Item role="listitem" className="block min-w-0 rounded-none border-0 px-0 py-4 text-sm">
      <Collapsible>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h4 className="min-w-0 break-words text-base font-semibold">{cycle.card.name}</h4>
          <Badge variant="outline" className={`shrink-0 ${getStatusBadgeClass(cycle.displayStatus)}`}>
            {getStatusLabel(cycle.displayStatus)}
          </Badge>
        </div>

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

        <div className="mt-2 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="h-11 px-2 text-sm" onClick={() => openDialog("breakdown", cycle)} aria-label={`Ver desglose de ${cycle.card.name}`}>
            Desglose
          </Button>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="group h-11 px-2 text-sm" aria-label={`Detalles de ${cycle.card.name}`}>
              Detalles
              <ChevronDown className="transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
            <div className="col-span-2 min-w-0">
              <dt className="text-xs text-muted-foreground">Inicio</dt>
              <dd>{format(new Date(toDateInputValue(cycle.startDate) + "T12:00:00"), "d MMM yyyy", { locale: es })}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Calculado</dt>
              <dd className="break-words font-medium tabular-nums">{formatMoney(cycle.calculatedAmount)}</dd>
            </div>
            <div className="min-w-0 text-right">
              <dt className="text-xs text-muted-foreground">Diferencia</dt>
              <dd className={`break-words tabular-nums ${cycle.difference == null ? "text-muted-foreground" : Math.abs(Number(cycle.difference)) > 35 ? "text-red-400" : "text-emerald-400"}`}>
                {cycle.difference != null ? formatMoney(cycle.difference) : "Sin estado de cuenta"}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-11 px-3 text-sm" onClick={() => openDialog("dates", cycle)}>Fechas</Button>
            <Button type="button" variant="secondary" className="h-11 px-3 text-sm" onClick={() => openDialog("statement", cycle)}>Cuenta</Button>
            <Button type="button" className="h-11 px-3 text-sm" onClick={() => openDialog("pay", cycle)}>{cycle.displayStatus === "PAID" ? "Ver pago" : "Pagar"}</Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Item>
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

  const [editCycleStartDate, setEditCycleStartDate] = useState("");
  const [editCycleCutDate, setEditCycleCutDate] = useState("");
  const [editCycleDueDate, setEditCycleDueDate] = useState("");
  const [statementAmount, setStatementAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paidAmount, setPaidAmount] = useState("");

  const openDialog = useCallback(async (type, cycle) => {
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
      setActiveDialog({ type, cycle });
      return;
    }

    setActiveDialog({ type, cycle, isLoading: true, error: "" });

    try {
      const detailedCycle = loadCycleBreakdown
        ? await loadCycleBreakdown(cycle.id)
        : cycle;

      setActiveDialog({
        type,
        cycle: detailedCycle || cycle,
        isLoading: false,
        error: "",
      });
    } catch (error) {
      setActiveDialog({
        type,
        cycle,
        isLoading: false,
        error: error.message || "No se pudo cargar el desglose.",
      });
    }
  }, [loadCycleBreakdown]);

  function closeDialog() {
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
        renderMobileRow={(row) => <MobileCycleItem key={row.original.id} cycle={row.original} openDialog={openDialog} />}
        mobileToolbar={(table) => (
          <div className="mb-1 flex items-center gap-2">
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
        {activeDialog?.type === "dates" && (
          <DialogContent onCloseAutoFocus={restoreFocus}>
            <DialogHeader>
              <DialogTitle>Editar fechas reales</DialogTitle>
              <DialogDescription className="sr-only">Actualiza las fechas de inicio, corte y vencimiento del ciclo.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="cycle-start-date">Inicio</Label>
                <DatePicker
                  id="cycle-start-date"
                  aria-label="Fecha de inicio"
                  value={editCycleStartDate}
                  onChange={setEditCycleStartDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle-cut-date">Corte</Label>
                <DatePicker
                  id="cycle-cut-date"
                  aria-label="Fecha de corte"
                  value={editCycleCutDate}
                  onChange={setEditCycleCutDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycle-due-date">Límite pago</Label>
                <DatePicker
                  id="cycle-due-date"
                  aria-label="Fecha límite de pago"
                  value={editCycleDueDate}
                  onChange={setEditCycleDueDate}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleUpdateDates}>
                Guardar fechas
              </Button>
            </DialogFooter>
          </DialogContent>
        )}

        {activeDialog?.type === "statement" && (
          <DialogContent onCloseAutoFocus={restoreFocus}>
            <DialogHeader>
              <DialogTitle>Estado de cuenta</DialogTitle>
              <DialogDescription className="sr-only">Captura el importe indicado en el estado de cuenta bancario.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="cycles-data-table-field-1">Monto estado de cuenta</Label>
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
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleUpdateStatement}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}

        {activeDialog?.type === "pay" && (
          <DialogContent onCloseAutoFocus={restoreFocus}>
            <DialogHeader>
              <DialogTitle>Registrar pago</DialogTitle>
              <DialogDescription className="sr-only">Registra la fecha y el importe pagado de este ciclo.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="cycle-paid-at">Fecha de pago</Label>
                <DatePicker
                  id="cycle-paid-at"
                  aria-label="Fecha de pago"
                  value={paidAt}
                  onChange={setPaidAt}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cycles-data-table-field-2">Monto pagado</Label>
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
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row">
              <Button type="button" onClick={handleMarkAsPaid}>
                Confirmar pago
              </Button>
              {activeDialog.cycle.displayStatus === "PAID" && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    unmarkCycleAsPaid(activeDialog.cycle.id);
                    closeDialog();
                  }}
                >
                  Deshacer pago
                </Button>
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
