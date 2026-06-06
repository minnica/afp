"use client";

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
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
}) {
  const [activeDialog, setActiveDialog] = useState(null);

  const [editCycleStartDate, setEditCycleStartDate] = useState("");
  const [editCycleCutDate, setEditCycleCutDate] = useState("");
  const [editCycleDueDate, setEditCycleDueDate] = useState("");
  const [statementAmount, setStatementAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paidAmount, setPaidAmount] = useState("");

  const openDialog = useCallback((type, cycle) => {
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
    setActiveDialog({ type, cycle });
  }, []);

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
    <>
      <DataTable
        columns={columns}
        data={cycles}
        filterColumn="cardName"
        filterPlaceholder="Filtrar por tarjeta o estado..."
        pageSize={10}
      />

      <Dialog open={!!activeDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        {activeDialog?.type === "dates" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar fechas reales</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input
                  type="date"
                  value={editCycleStartDate}
                  onChange={(e) => setEditCycleStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Corte</Label>
                <Input
                  type="date"
                  value={editCycleCutDate}
                  onChange={(e) => setEditCycleCutDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Límite pago</Label>
                <Input
                  type="date"
                  value={editCycleDueDate}
                  onChange={(e) => setEditCycleDueDate(e.target.value)}
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Estado de cuenta</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Monto estado de cuenta</Label>
              <Input
                type="number"
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar pago</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label>Fecha de pago</Label>
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Monto pagado</Label>
                <Input
                  type="number"
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
          <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Desglose — {activeDialog.cycle.card.name}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto">
              <CycleBreakdown cycle={activeDialog.cycle} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
