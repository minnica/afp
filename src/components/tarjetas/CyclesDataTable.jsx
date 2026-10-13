"use client";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
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
  const dateText = format(date, "d MMMM", { locale: es });

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
      setStatementAmount(cycle.statementAmount ? String(cycle.statementAmount) : "");
    } else if (type === "pay") {
      setPaidAt(getTodayInputValue());
      setPaidAmount(cycle.statementAmount ? String(cycle.statementAmount) : "");
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
          return v ? formatMoney(v) : <span className="text-muted-foreground">-</span>;
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
        filterColumn="cardName"
        filterPlaceholder="Filtrar por tarjeta o estado..."
        pageSize={10}
        pageSizeOptions={[10, 25, 50, 100]}
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
          <DialogContent onCloseAutoFocus={restoreFocus} className="flex max-h-[90svh] flex-col sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Desglose — {activeDialog.cycle.card.name}</DialogTitle>
              <DialogDescription>Detalle de los movimientos e importes de este período.</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto">
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
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
