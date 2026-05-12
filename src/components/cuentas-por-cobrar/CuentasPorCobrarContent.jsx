"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";

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
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

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
          expectedDate,
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
      setExpectedDate("");
      setNotes("");

      await loadReceivables(user.id);
    } catch (err) {
      setError(err.message || "No se pudo crear la cuenta por cobrar.");
    } finally {
      setIsSaving(false);
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
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          Cargando cuentas por cobrar...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">AFP</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Cuentas por cobrar
          </h1>
          <p className="mt-2 text-muted-foreground">
            Controla dinero que otras personas te deben.
          </p>
        </div>

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

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Nueva cuenta por cobrar</CardTitle>
              <CardDescription>
                Registra una deuda inicial manual, como venta de moto o préstamo
                a una persona.
              </CardDescription>
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
                <Label>Fecha esperada opcional</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(event) => setExpectedDate(event.target.value)}
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
              <CardTitle>Cuentas por cobrar</CardTitle>
              <CardDescription>
                Consulta cuentas activas, liquidadas o todo el historial.
              </CardDescription>
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
                  />
                </TabsContent>

                <TabsContent value="paid">
                  <ReceivablesList
                    items={paidOffReceivables}
                    emptyText="Aún no tienes cuentas liquidadas."
                    onDelete={deleteReceivable}
                  />
                </TabsContent>

                <TabsContent value="all">
                  <ReceivablesList
                    items={allReceivables}
                    emptyText="Aún no tienes cuentas por cobrar registradas."
                    onDelete={deleteReceivable}
                  />
                </TabsContent>
              </Tabs>

              <Separator className="my-6" />

              <p className="text-sm text-muted-foreground">
                Los pagos recibidos se registran desde Ingresos y reducen
                automáticamente el saldo pendiente.
              </p>
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

function ReceivablesList({ items, emptyText, onDelete }) {
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
          <div className="flex items-start justify-between gap-4">
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

              {item.notes ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.notes}
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Original</p>
              <p className="font-medium">{formatMoney(item.originalAmount)}</p>
            </div>

            <div>
              <p className="text-muted-foreground">Pagado</p>
              <p className="font-medium">{formatMoney(item.paidAmount)}</p>
            </div>

            <div>
              <p className="text-muted-foreground">Pendiente</p>
              <p className="font-medium">{formatMoney(item.pendingBalance)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
