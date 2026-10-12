"use client";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  return format(new Date(dateString), "d MMM yyyy", { locale: es });
}

export default function IngresosContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [incomeTypes, setIncomeTypes] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [incomes, setIncomes] = useState([]);

  const [date, setDate] = useState(getTodayInputValue());
  const [incomeTypeId, setIncomeTypeId] = useState("");
  const [source, setSource] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [receivableAccountId, setReceivableAccountId] = useState("NONE");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [incomeToDelete, setIncomeToDelete] = useState(null);
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

  async function loadSettings(userId) {
    const response = await fetch(`/api/settings?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar configuración.");
    }

    setIncomeTypes(data.incomeTypes || []);
  }

  async function loadReceivables(userId) {
    const response = await fetch(`/api/receivables?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "No se pudieron cargar cuentas por cobrar.",
      );
    }

    const activeReceivables = (data.receivables || []).filter(
      (item) => item.status === "ACTIVE",
    );

    setReceivables(data.receivables || []);
  }

  async function loadIncomes(userId) {
    const response = await fetch(`/api/incomes?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar ingresos.");
    }

    setIncomes(data.incomes || []);
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
          loadIncomes(session.user.id),
        ]);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createIncome() {
    if (!user) return;

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/incomes", {
        method: "POST",
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

      setDate(getTodayInputValue());
      setIncomeTypeId("");
      setSource("");
      setConcept("");
      setAmount("");
      setReceivableAccountId("NONE");
      setNotes("");

      await Promise.all([loadIncomes(user.id), loadReceivables(user.id)]);
    } catch (err) {
      setError(err.message || "No se pudo guardar el ingreso.");
    } finally {
      setIsSaving(false);
    }
  }

  function toDateInputValue(dateString) {
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function startEditingIncome(income) {
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
      const response = await fetch("/api/incomes", {
        method: "PATCH",
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

      await Promise.all([loadIncomes(user.id), loadReceivables(user.id)]);
    } catch (err) {
      setError(err.message || "No se pudo actualizar el ingreso.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteIncome(id) {
    if (!user) return;


    setError("");

    try {
      const response = await fetch(`/api/incomes?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      await Promise.all([loadIncomes(user.id), loadReceivables(user.id)]);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el ingreso.");
    }
  }

  const totalIncome = useMemo(() => {
    return incomes.reduce((sum, income) => {
      return sum + Number(income.amount || 0);
    }, 0);
  }, [incomes]);

  const incomeColumns = useMemo(
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
            <p className="font-medium">{row.original.concept}</p>
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
    return <PageSkeleton variant="form-table" />;
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
            <AlertDialogAction variant="destructive" onClick={() => deleteIncome(incomeToDelete.id)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className="mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8">
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Total mostrado</CardDescription>
              <CardTitle className="text-2xl">
                {formatMoney(totalIncome)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Ingresos registrados</CardDescription>
              <CardTitle className="text-2xl">{incomes.length}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Cuentas activas por cobrar</CardDescription>
              <CardTitle className="text-2xl">{receivables.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_1fr]">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold uppercase text-center">
                Nuevo ingreso
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
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
                <Select value={incomeTypeId} onValueChange={setIncomeTypeId}>
                  <SelectTrigger id="ingresos-field-1">
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-5">Cuenta por cobrar relacionada</Label>
                <Select
                  value={receivableAccountId}
                  onValueChange={setReceivableAccountId}
                >
                  <SelectTrigger id="ingresos-field-5">
                    <SelectValue placeholder="Sin cuenta por cobrar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sin cuenta por cobrar</SelectItem>
                    {selectableReceivables.map((item) => {
                      const pendingBalance = Number(item.pendingBalance || 0);
                      const isPaidOff =
                        item.status === "PAID_OFF" || pendingBalance <= 0;

                      return (
                        <SelectItem key={item.id} value={item.id}>
                          {item.person?.name} · {item.concept} ·{" "}
                          {isPaidOff ? "liquidada" : "pendiente"}{" "}
                          {formatMoney(pendingBalance)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-6">Notas opcional</Label>
                <Textarea id="ingresos-field-6"
                  value={notes}
                  placeholder="Detalles adicionales..."
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={createIncome}
                disabled={isSaving}
              >
                <Plus className="mr-2 h-4 w-4" />
                {isSaving ? "Guardando..." : "Guardar ingreso"}
              </Button>
            </CardContent>
          </Card>

          <div className="min-w-0">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Ingresos registrados
                </CardTitle>
              </CardHeader>

              <CardContent>
                <DataTable
                  columns={incomeColumns}
                  data={incomes}
                  filterGlobal
                  filterPlaceholder="Buscar ingreso..."
                  pageSize={10}
                  pageSizeOptions={[5, 10, 25, 50]}
                  footerRow={(table) => {
                    const rows = table.getFilteredRowModel().rows;
                    const total = rows.reduce(
                      (sum, row) => sum + Number(row.original.amount || 0),
                      0,
                    );

                    return (
                      <TableRow>
                        <TableCell colSpan={4}>Total filtrado</TableCell>
                        <TableCell className="font-semibold tabular-nums">
                          {formatMoney(total)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    );
                  }}
                />
              </CardContent>
            </Card>
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
              <DialogDescription>Actualiza los datos y guarda los cambios.</DialogDescription>
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
                <Select
                  value={editIncomeTypeId}
                  onValueChange={setEditIncomeTypeId}
                >
                  <SelectTrigger id="ingresos-field-7">
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  min="0"
                  step="0.01"
                  onChange={(event) => setEditAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ingresos-field-11">Cuenta por cobrar relacionada</Label>
                <Select
                  value={editReceivableAccountId}
                  onValueChange={setEditReceivableAccountId}
                >
                  <SelectTrigger id="ingresos-field-11">
                    <SelectValue placeholder="Sin cuenta por cobrar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sin cuenta por cobrar</SelectItem>
                    {receivables.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.person?.name} · {item.concept} · pendiente{" "}
                        {formatMoney(item.pendingBalance)} ·{" "}
                        {item.status === "PAID_OFF" ? "Liquidada" : "Activa"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
