"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PageSkeleton from "@/components/layout/PageSkeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { TableCell, TableRow } from "@/components/ui/table";

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
  const router = useRouter();

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

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
    if (!user) return;

    setError("");
    setIsSaving(true);

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

      setPersonId("");
      setConcept("");
      setOriginalAmount("");
      setOriginDate(getTodayInputValue());
      setExpectedMonthlyPayment("");
      setExpectedChargeDays("");
      setNotes("");

      await loadReceivables(user.id);
    } catch (err) {
      setError(err.message || "No se pudo crear la cuenta por cobrar.");
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

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar esta cuenta por cobrar?",
    );

    if (!confirmed) return;

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

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startEditingReceivable(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => deleteReceivable(row.original.id)}
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
    <main>
      <section className="mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8">
        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="Monto original"
            value={formatMoney(summary.original)}
          />
          <SummaryCard title="Pagado" value={formatMoney(summary.paid)} />
          <SummaryCard title="Pendiente" value={formatMoney(summary.pending)} />
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_1fr]">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold uppercase text-center">
                Nueva cuenta por cobrar
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Persona</Label>
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {people.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Primero agrega personas en Configuración.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Concepto</Label>
                <Input
                  value={concept}
                  placeholder="Ej. Venta de moto"
                  onChange={(event) => setConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Monto original</Label>
                <Input
                  value={originalAmount}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setOriginalAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Fecha de origen</Label>
                <Input
                  type="date"
                  value={originDate}
                  onChange={(event) => setOriginDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Pago mensual esperado opcional</Label>
                <Input
                  value={expectedMonthlyPayment}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej. 1000"
                  onChange={(event) =>
                    setExpectedMonthlyPayment(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Días de cobro opcionales</Label>
                <Input
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
                <Label>Notas opcional</Label>
                <Textarea
                  value={notes}
                  placeholder="Detalles adicionales..."
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={createReceivable}
                disabled={isSaving}
              >
                <Plus className="mr-2 h-4 w-4" />
                {isSaving ? "Guardando..." : "Guardar cuenta"}
              </Button>
            </CardContent>
          </Card>

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
                      <Select
                        value={filterPersonId || "ALL"}
                        onValueChange={(value) =>
                          setFilterPersonId(value === "ALL" ? "" : value)
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Todas las personas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">
                            Todas las personas
                          </SelectItem>
                          {people.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={filterOriginType || "ALL"}
                        onValueChange={(value) =>
                          setFilterOriginType(value === "ALL" ? "" : value)
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Todos los orígenes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">
                            Todos los orígenes
                          </SelectItem>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                          <SelectItem value="DAILY_EXPENSE">
                            Gasto diario
                          </SelectItem>
                          <SelectItem value="INSTALLMENT_PURCHASE">
                            Compra a meses
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={filterStatus || "ALL"}
                        onValueChange={(value) =>
                          setFilterStatus(value === "ALL" ? "" : value)
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Todos los estados" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Todos los estados</SelectItem>
                          <SelectItem value="ACTIVE">Activa</SelectItem>
                          <SelectItem value="PAID_OFF">Liquidada</SelectItem>
                          <SelectItem value="CANCELLED">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>

                      <Input
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
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar cuenta por cobrar</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Persona</Label>
                <Select value={editPersonId} onValueChange={setEditPersonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fecha de origen</Label>
                <Input
                  type="date"
                  value={editOriginDate}
                  onChange={(event) => setEditOriginDate(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Concepto</Label>
                <Input
                  value={editConcept}
                  onChange={(event) => setEditConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Monto original</Label>
                <Input
                  value={editOriginalAmount}
                  type="number"
                  min="0"
                  step="0.01"
                  onChange={(event) =>
                    setEditOriginalAmount(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Pago mensual esperado opcional</Label>
                <Input
                  value={editExpectedMonthlyPayment}
                  type="number"
                  min="0"
                  step="0.01"
                  onChange={(event) =>
                    setEditExpectedMonthlyPayment(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Días de cobro opcionales</Label>
                <Input
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
                <Label>Notas</Label>
                <Textarea
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
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                Pagos vinculados
                {paymentsDialogReceivable
                  ? ` · ${paymentsDialogReceivable.concept}`
                  : ""}
              </DialogTitle>
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
      <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        Todavía no hay pagos vinculados a esta cuenta por cobrar.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-medium">{payment.concept}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(payment.date)}
              {payment.source ? ` · ${payment.source}` : ""}
            </p>
          </div>

          <p className="font-semibold">{formatMoney(payment.amount)}</p>
        </div>
      ))}
    </div>
  );
}
