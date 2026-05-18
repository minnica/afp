"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";

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
  const [expectedChargeDay, setExpectedChargeDay] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingReceivableId, setEditingReceivableId] = useState("");
  const [editPersonId, setEditPersonId] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editOriginalAmount, setEditOriginalAmount] = useState("");
  const [editOriginDate, setEditOriginDate] = useState("");
  const [editExpectedMonthlyPayment, setEditExpectedMonthlyPayment] =
    useState("");
  const [editExpectedChargeDay, setEditExpectedChargeDay] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [expandedReceivableId, setExpandedReceivableId] = useState("");

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

        await fetch("/api/setup-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: session.user.id,
            email: session.user.email,
          }),
        });

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
          expectedChargeDay,
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
      setExpectedChargeDay("");
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
    setEditExpectedChargeDay(
      receivable.expectedChargeDay ? String(receivable.expectedChargeDay) : "",
    );
    setEditNotes(receivable.notes || "");
  }

  function cancelEditingReceivable() {
    setEditingReceivableId("");
    setEditPersonId("");
    setEditConcept("");
    setEditOriginalAmount("");
    setEditOriginDate("");
    setEditExpectedMonthlyPayment("");
    setEditExpectedChargeDay("");
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
          expectedChargeDay: editExpectedChargeDay,
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

  const activeReceivables = useMemo(() => {
    return receivables.filter((item) => item.status === "ACTIVE");
  }, [receivables]);

  const paidOffReceivables = useMemo(() => {
    return receivables.filter((item) => item.status === "PAID_OFF");
  }, [receivables]);

  const allReceivables = useMemo(() => {
    return receivables;
  }, [receivables]);

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <Spinner className="size-8" />
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 md:py-8">
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

        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
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
                <Label>Día de cobro opcional</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={expectedChargeDay}
                  placeholder="Ej. 15"
                  onChange={(event) => setExpectedChargeDay(event.target.value)}
                />
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

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold uppercase text-center">
                Cuentas por cobrar
              </CardTitle>
            </CardHeader>

            <CardContent>
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="active">
                    Activas ({activeReceivables.length})
                  </TabsTrigger>
                  <TabsTrigger value="paid">
                    Liquidadas ({paidOffReceivables.length})
                  </TabsTrigger>
                  <TabsTrigger value="all">
                    Todas ({allReceivables.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                  <ReceivablesList
                    items={activeReceivables}
                    emptyText="No tienes cuentas por cobrar activas."
                    onDelete={deleteReceivable}
                    onEdit={startEditingReceivable}
                    editingReceivableId={editingReceivableId}
                    people={people}
                    editPersonId={editPersonId}
                    setEditPersonId={setEditPersonId}
                    editConcept={editConcept}
                    setEditConcept={setEditConcept}
                    editOriginalAmount={editOriginalAmount}
                    setEditOriginalAmount={setEditOriginalAmount}
                    editOriginDate={editOriginDate}
                    setEditOriginDate={setEditOriginDate}
                    editExpectedMonthlyPayment={editExpectedMonthlyPayment}
                    setEditExpectedMonthlyPayment={
                      setEditExpectedMonthlyPayment
                    }
                    editExpectedChargeDay={editExpectedChargeDay}
                    setEditExpectedChargeDay={setEditExpectedChargeDay}
                    editNotes={editNotes}
                    setEditNotes={setEditNotes}
                    updateReceivable={updateReceivable}
                    cancelEditingReceivable={cancelEditingReceivable}
                    isUpdating={isUpdating}
                    expandedReceivableId={expandedReceivableId}
                    setExpandedReceivableId={setExpandedReceivableId}
                  />
                </TabsContent>

                <TabsContent value="paid">
                  <ReceivablesList
                    items={paidOffReceivables}
                    emptyText="No tienes cuentas por cobrar liquidadas."
                    onDelete={deleteReceivable}
                    onEdit={startEditingReceivable}
                    editingReceivableId={editingReceivableId}
                    people={people}
                    editPersonId={editPersonId}
                    setEditPersonId={setEditPersonId}
                    editConcept={editConcept}
                    setEditConcept={setEditConcept}
                    editOriginalAmount={editOriginalAmount}
                    setEditOriginalAmount={setEditOriginalAmount}
                    editOriginDate={editOriginDate}
                    setEditOriginDate={setEditOriginDate}
                    editExpectedMonthlyPayment={editExpectedMonthlyPayment}
                    setEditExpectedMonthlyPayment={
                      setEditExpectedMonthlyPayment
                    }
                    editExpectedChargeDay={editExpectedChargeDay}
                    setEditExpectedChargeDay={setEditExpectedChargeDay}
                    editNotes={editNotes}
                    setEditNotes={setEditNotes}
                    updateReceivable={updateReceivable}
                    cancelEditingReceivable={cancelEditingReceivable}
                    isUpdating={isUpdating}
                    expandedReceivableId={expandedReceivableId}
                    setExpandedReceivableId={setExpandedReceivableId}
                  />
                </TabsContent>

                <TabsContent value="all">
                  <ReceivablesList
                    items={allReceivables}
                    emptyText="Aún no tienes cuentas por cobrar registradas."
                    onDelete={deleteReceivable}
                    onEdit={startEditingReceivable}
                    editingReceivableId={editingReceivableId}
                    people={people}
                    editPersonId={editPersonId}
                    setEditPersonId={setEditPersonId}
                    editConcept={editConcept}
                    setEditConcept={setEditConcept}
                    editOriginalAmount={editOriginalAmount}
                    setEditOriginalAmount={setEditOriginalAmount}
                    editOriginDate={editOriginDate}
                    setEditOriginDate={setEditOriginDate}
                    editExpectedMonthlyPayment={editExpectedMonthlyPayment}
                    setEditExpectedMonthlyPayment={
                      setEditExpectedMonthlyPayment
                    }
                    editExpectedChargeDay={editExpectedChargeDay}
                    setEditExpectedChargeDay={setEditExpectedChargeDay}
                    editNotes={editNotes}
                    setEditNotes={setEditNotes}
                    updateReceivable={updateReceivable}
                    cancelEditingReceivable={cancelEditingReceivable}
                    isUpdating={isUpdating}
                    expandedReceivableId={expandedReceivableId}
                    setExpandedReceivableId={setExpandedReceivableId}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
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

function ReceivablesList({
  items,
  emptyText,
  onDelete,
  onEdit,
  editingReceivableId,
  people,
  editPersonId,
  setEditPersonId,
  editConcept,
  setEditConcept,
  editOriginalAmount,
  setEditOriginalAmount,
  editOriginDate,
  setEditOriginDate,
  editExpectedMonthlyPayment,
  setEditExpectedMonthlyPayment,
  editExpectedChargeDay,
  setEditExpectedChargeDay,
  editNotes,
  setEditNotes,
  updateReceivable,
  cancelEditingReceivable,
  isUpdating,
  expandedReceivableId,
  setExpandedReceivableId,
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-border bg-background/60 px-4 py-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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

              {item.expectedChargeDay ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Día de cobro: {item.expectedChargeDay}
                </p>
              ) : null}

              {item.notes ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.notes}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setExpandedReceivableId((current) =>
                    current === item.id ? "" : item.id,
                  )
                }
              >
                {expandedReceivableId === item.id
                  ? "Ocultar pagos"
                  : "Ver pagos"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onEdit(item)}
              >
                <Pencil className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Original</p>
              <p className="mt-1 font-medium">
                {formatMoney(item.originalAmount)}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="mt-1 font-medium">{formatMoney(item.paidAmount)}</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Pendiente</p>
              <p className="mt-1 font-medium">
                {formatMoney(item.pendingBalance)}
              </p>
            </div>
          </div>

          {expandedReceivableId === item.id ? (
            <ReceivablePaymentsBreakdown receivable={item} />
          ) : null}

          {editingReceivableId === item.id ? (
            <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <p className="text-sm font-medium">Editar cuenta por cobrar</p>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={cancelEditingReceivable}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

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
                  <Label>Día de cobro opcional</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={editExpectedChargeDay}
                    placeholder="Ej. 15"
                    onChange={(event) =>
                      setEditExpectedChargeDay(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Notas</Label>
                  <Textarea
                    value={editNotes}
                    onChange={(event) => setEditNotes(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={updateReceivable}
                  disabled={isUpdating}
                >
                  {isUpdating ? "Guardando..." : "Guardar cambios"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={cancelEditingReceivable}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReceivablePaymentsBreakdown({ receivable }) {
  const payments = [...(receivable.incomes || [])].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
      <h4 className="mb-4 text-sm font-medium">Desglose de pagos</h4>

      {payments.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          Todavía no hay pagos vinculados a esta cuenta por cobrar.
        </p>
      ) : (
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
      )}
    </div>
  );
}
