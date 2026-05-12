"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { supabase } from "@/lib/supabase";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatCompactDate(dateString) {
  if (!dateString) return "-";

  const date = new Date(dateString);
  const dateText = format(date, "d MMMM", { locale: es });

  const today = new Date();

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const targetUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );

  const diffDays = Math.round((targetUtc - todayUtc) / 86400000);

  if (diffDays === 0) return `${dateText} [Hoy]`;
  if (diffDays > 0) return `${dateText} [+${diffDays}]`;

  return `${dateText} [${diffDays}]`;
}

function getStatusLabel(status) {
  const labels = {
    OPEN: "Abierto",
    CUT: "Cortado",
    PAYMENT_PENDING: "Pendiente",
    PAID: "Pagado",
    OVERDUE: "Vencido",
  };

  return labels[status] || status || "-";
}

function getStatusVariant(status) {
  if (status === "PAID") return "secondary";
  if (status === "OVERDUE") return "destructive";
  return "outline";
}

export default function DashboardContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard(userId) {
    const response = await fetch(`/api/dashboard?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el dashboard.");
    }

    setDashboard(data);
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

        await loadDashboard(session.user.id);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  const payments = dashboard?.payments || [];
  const monthlySummary = dashboard?.monthlySummary || {};
  const categoryBreakdown = dashboard?.categoryBreakdown || [];
  const activeReceivables = dashboard?.activeReceivables || [];

  const currentPayments = useMemo(() => {
    return payments
      .map((item) => ({
        card: item.card,
        cycle: item.currentPayment,
      }))
      .filter((item) => item.cycle);
  }, [payments]);

  const nextPayments = useMemo(() => {
    return payments
      .map((item) => ({
        card: item.card,
        cycle: item.nextPayment,
      }))
      .filter((item) => item.cycle);
  }, [payments]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Cargando dashboard...</p>
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">AFP</p>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Revisión de pagos de tarjetas, gastos mensuales y cuentas por
            cobrar.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="space-y-6">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Pagos de tarjetas</CardTitle>
              <CardDescription>
                Primero lo urgente: este pago y el siguiente pago por ciclo
                real.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Tabs defaultValue="current">
                <TabsList className="mb-6">
                  <TabsTrigger value="current">
                    Este pago ({currentPayments.length})
                  </TabsTrigger>
                  <TabsTrigger value="next">
                    Siguiente pago ({nextPayments.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="current">
                  <PaymentsTable items={currentPayments} />
                </TabsContent>

                <TabsContent value="next">
                  <PaymentsTable items={nextPayments} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              title="Ingresos del mes"
              value={formatMoney(monthlySummary.incomeTotal)}
            />
            <SummaryCard
              title="Gastos del mes"
              value={formatMoney(monthlySummary.monthlyExpenseTotal)}
            />
            <SummaryCard
              title="Diferencia"
              value={formatMoney(monthlySummary.monthlyDifference)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle>Gasto por categoría</CardTitle>
                <CardDescription>
                  Incluye gastos diarios, mensualidades activas y suscripciones.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {categoryBreakdown.length === 0 ? (
                  <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                    Aún no hay gastos para este mes.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {categoryBreakdown.map((category) => (
                      <div
                        key={category.id}
                        className="rounded-xl border border-border bg-background/60 px-4 py-4"
                      >
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <p className="font-medium">{category.name}</p>
                          <p className="font-semibold">
                            {formatMoney(category.total)}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-foreground"
                              style={{
                                width: `${Math.min(category.percentage, 100)}%`,
                              }}
                            />
                          </div>

                          <p className="w-14 text-right text-sm text-muted-foreground">
                            {category.percentage.toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle>Cuentas por cobrar</CardTitle>
                <CardDescription>
                  Cuentas activas pendientes de pago.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {activeReceivables.length === 0 ? (
                  <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                    No tienes cuentas por cobrar activas.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {activeReceivables.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border bg-background/60 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium">{item.concept}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.person?.name}
                            </p>
                          </div>

                          <p className="font-semibold">
                            {formatMoney(item.pendingBalance)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Separator className="my-6" />

                <p className="text-sm text-muted-foreground">
                  Para registrar pagos recibidos, usa la pantalla Ingresos.
                </p>
              </CardContent>
            </Card>
          </div>
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

function PaymentsTable({ items }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        No hay ciclos para mostrar. Genera ciclos desde Tarjetas.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:grid">
        <div>Tarjeta</div>
        <div>Corte</div>
        <div>Límite pago</div>
        <div>Pago calculado</div>
        <div>Estado</div>
      </div>

      <div className="divide-y divide-border">
        {items.map((item) => (
          <div
            key={item.cycle.id}
            className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[1fr_1fr_1fr_1fr_1fr] md:gap-4"
          >
            <div className="font-medium">{item.card.name}</div>
            <div>{formatCompactDate(item.cycle.cutDate)}</div>
            <div>{formatCompactDate(item.cycle.dueDate)}</div>
            <div className="font-semibold">
              {formatMoney(item.cycle.calculatedAmount)}
            </div>
            <div>
              <Badge variant={getStatusVariant(item.cycle.displayStatus)}>
                {getStatusLabel(item.cycle.displayStatus)}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
