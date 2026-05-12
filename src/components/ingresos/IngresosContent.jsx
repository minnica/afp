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
  const [error, setError] = useState("");

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

    setReceivables(activeReceivables);
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

  async function deleteIncome(id) {
    if (!user) return;

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar este ingreso?",
    );

    if (!confirmed) return;

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

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Cargando ingresos...</p>
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">AFP</p>
          <h1 className="text-3xl font-semibold tracking-tight">Ingresos</h1>
          <p className="mt-2 text-muted-foreground">
            Registra nómina, ingresos extra y pagos recibidos.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
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

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Nuevo ingreso</CardTitle>
              <CardDescription>
                Vincula una cuenta por cobrar si el ingreso corresponde a un
                pago recibido.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de ingreso</Label>
                <Select value={incomeTypeId} onValueChange={setIncomeTypeId}>
                  <SelectTrigger>
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
                <Label>Fuente</Label>
                <Input
                  value={source}
                  placeholder="Ej. Empresa, Luis, Cuñado..."
                  onChange={(event) => setSource(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Concepto</Label>
                <Input
                  value={concept}
                  placeholder="Ej. Nómina quincenal, pago celular..."
                  onChange={(event) => setConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  value={amount}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Cuenta por cobrar relacionada</Label>
                <Select
                  value={receivableAccountId}
                  onValueChange={setReceivableAccountId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin cuenta por cobrar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sin cuenta por cobrar</SelectItem>
                    {receivables.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.person?.name} · {item.concept} · pendiente{" "}
                        {formatMoney(item.pendingBalance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                onClick={createIncome}
                disabled={isSaving}
              >
                <Plus className="mr-2 h-4 w-4" />
                {isSaving ? "Guardando..." : "Guardar ingreso"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Ingresos registrados</CardTitle>
              <CardDescription>
                Últimos 100 ingresos capturados.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {incomes.length === 0 ? (
                <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                  Aún no hay ingresos registrados.
                </p>
              ) : (
                <div className="grid gap-3">
                  {incomes.map((income) => (
                    <div
                      key={income.id}
                      className="rounded-xl border border-border bg-background/60 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{income.concept}</p>
                            <Badge variant="secondary">
                              {income.incomeType?.name}
                            </Badge>
                          </div>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatDate(income.date)} · Fuente: {income.source}
                          </p>

                          {income.receivableAccount ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Cuenta por cobrar:{" "}
                              {income.receivableAccount.person?.name} ·{" "}
                              {income.receivableAccount.concept}
                            </p>
                          ) : null}

                          {income.notes ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {income.notes}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <p className="font-semibold">
                            {formatMoney(income.amount)}
                          </p>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteIncome(income.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-6" />

              <p className="text-sm text-muted-foreground">
                Los ingresos vinculados a cuentas por cobrar reducen
                automáticamente el saldo pendiente.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
