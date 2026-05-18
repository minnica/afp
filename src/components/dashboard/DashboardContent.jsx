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
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, Bell, CalendarClock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function getLastDayOfMonthUtc(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function createUtcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

function adjustPayrollDateIfWeekend(date) {
  const adjustedDate = new Date(date);
  const dayOfWeek = adjustedDate.getUTCDay();

  // Domingo → viernes anterior
  if (dayOfWeek === 0) {
    adjustedDate.setUTCDate(adjustedDate.getUTCDate() - 2);
  }

  // Sábado → viernes anterior
  if (dayOfWeek === 6) {
    adjustedDate.setUTCDate(adjustedDate.getUTCDate() - 1);
  }

  return adjustedDate;
}

function getPayrollCandidatesAroundDueDate(dueDate) {
  const year = dueDate.getUTCFullYear();
  const monthIndex = dueDate.getUTCMonth();

  const monthsToCheck = [
    new Date(Date.UTC(year, monthIndex - 1, 1, 12)),
    new Date(Date.UTC(year, monthIndex, 1, 12)),
  ];

  return monthsToCheck.flatMap((monthDate) => {
    const candidateYear = monthDate.getUTCFullYear();
    const candidateMonthIndex = monthDate.getUTCMonth();

    const lastDay = getLastDayOfMonthUtc(candidateYear, candidateMonthIndex);

    const payroll15 = adjustPayrollDateIfWeekend(
      createUtcDate(candidateYear, candidateMonthIndex, 15),
    );

    const payroll30 = adjustPayrollDateIfWeekend(
      createUtcDate(candidateYear, candidateMonthIndex, Math.min(30, lastDay)),
    );

    return [
      {
        group: "Q15",
        payrollDate: payroll15,
      },
      {
        group: "Q30",
        payrollDate: payroll30,
      },
    ];
  });
}

function getPayrollGroupForDueDate(dueDateString) {
  const dueDate = new Date(dueDateString);

  const candidates = getPayrollCandidatesAroundDueDate(dueDate)
    .filter((candidate) => {
      return candidate.payrollDate.getTime() <= dueDate.getTime();
    })
    .sort((a, b) => {
      return b.payrollDate.getTime() - a.payrollDate.getTime();
    });

  return (
    candidates[0] || {
      group: "Q30",
      payrollDate: dueDate,
    }
  );
}

function getPayrollAccentClass(dueDateString) {
  const { group } = getPayrollGroupForDueDate(dueDateString);

  if (group === "Q15") {
    return "border-l-4 border-l-cyan-400/70";
  }

  return "border-l-4 border-l-pink-400/70";
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

function getStatusBadgeClass(status) {
  const classes = {
    PAID: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    OVERDUE: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    OPEN: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    CUT: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    PAYMENT_PENDING:
      "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  };

  return classes[status] || "border-border bg-muted text-muted-foreground";
}

function getNoticeAlertClass(group) {
  const classes = {
    overdue: "border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400",
    today:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    upcoming: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  };

  return classes[group] || "border-border bg-muted/30";
}

function getNoticeIcon(group) {
  if (group === "overdue") return AlertTriangle;
  if (group === "today") return CalendarClock;
  return Bell;
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

  const payments = useMemo(
    () => dashboard?.payments || [],
    [dashboard?.payments],
  );
  const monthlySummary = dashboard?.monthlySummary || {};
  const categoryBreakdown = dashboard?.categoryBreakdown || [];
  const activeReceivables = dashboard?.activeReceivables || [];
  const importantNotices = dashboard?.importantNotices || [];

  const previousPayments = useMemo(() => {
    return payments
      .map((item) => ({
        card: item.card,
        cycle: item.previousPayment,
      }))
      .filter((item) => item.cycle)
      .sort((a, b) => {
        return (
          new Date(a.cycle.dueDate).getTime() -
          new Date(b.cycle.dueDate).getTime()
        );
      });
  }, [payments]);

  const currentPayments = useMemo(() => {
    return payments
      .map((item) => ({
        card: item.card,
        cycle: item.currentPayment,
      }))
      .filter((item) => item.cycle)
      .sort((a, b) => {
        return (
          new Date(a.cycle.dueDate).getTime() -
          new Date(b.cycle.dueDate).getTime()
        );
      });
  }, [payments]);

  const nextPayments = useMemo(() => {
    return payments
      .map((item) => ({
        card: item.card,
        cycle: item.nextPayment,
      }))
      .filter((item) => item.cycle)
      .sort((a, b) => {
        return (
          new Date(a.cycle.dueDate).getTime() -
          new Date(b.cycle.dueDate).getTime()
        );
      });
  }, [payments]);

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <Spinner className="size-8" />
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8">
        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="space-y-6">
          <ImportantNoticesCard notices={importantNotices} />

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold uppercase text-center">
                Pagos de tarjetas
              </CardTitle>
            </CardHeader>

            <CardContent>
              <Tabs defaultValue="current">
                <TabsList className="mb-6">
                  <TabsTrigger value="previous">Pago anterior</TabsTrigger>
                  <TabsTrigger value="current">Este pago</TabsTrigger>
                  <TabsTrigger value="next">Siguiente pago</TabsTrigger>
                </TabsList>

                <TabsContent value="previous">
                  <PaymentsTable items={previousPayments} />
                </TabsContent>

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
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Gasto por categoría
                </CardTitle>
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
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Cuentas por cobrar
                </CardTitle>
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

function ImportantNoticesCard({ notices }) {
  if (notices.length === 0) {
    return (
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold uppercase text-center">
            Avisos importantes
          </CardTitle>
        </CardHeader>

        <CardContent>
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            No tienes avisos importantes por ahora.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold uppercase text-center">
          Avisos importantes
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3">
          {notices.map((notice) => {
            const Icon = getNoticeIcon(notice.group);

            return (
              <Alert
                key={notice.id}
                className={getNoticeAlertClass(notice.group)}
              >
                <Icon className="h-4 w-4" />
                <AlertTitle>{notice.title}</AlertTitle>
                <AlertDescription>{notice.description}</AlertDescription>
              </Alert>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentsTable({ items }) {
  const totalCalculatedAmount = items.reduce((total, item) => {
    return total + Number(item.cycle.calculatedAmount || 0);
  }, 0);

  const totalStatementAmount = items.reduce((total, item) => {
    return total + Number(item.cycle.statementAmount || 0);
  }, 0);

  const payrollTotals = items.reduce(
    (totals, item) => {
      const { group } = getPayrollGroupForDueDate(item.cycle.dueDate);
      const amount = Number(
        item.cycle.statementAmount ?? item.cycle.calculatedAmount ?? 0,
      );

      totals[group] += amount;

      return totals;
    },
    {
      Q15: 0,
      Q30: 0,
    },
  );

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        No hay ciclos para mostrar. Genera ciclos desde Tarjetas.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">Total pago calculado</p>
          <p className="mt-1 text-xl font-semibold">
            {formatMoney(totalCalculatedAmount)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Total estado de cuenta
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatMoney(totalStatementAmount)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">Carga por nómina</p>

          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400/70" />
                <p className="text-xs text-muted-foreground">Q15</p>
              </div>
              <p className="mt-1 text-sm font-semibold">
                {formatMoney(payrollTotals.Q15)}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-pink-400/70" />
                <p className="text-xs text-muted-foreground">Q30</p>
              </div>
              <p className="mt-1 text-sm font-semibold">
                {formatMoney(payrollTotals.Q30)}
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Vista móvil */}
      <div className="grid gap-3 md:hidden">
        {items.map((item) => (
          <div
            key={item.cycle.id}
            className={`rounded-xl border border-border bg-background/60 px-4 py-4 ${getPayrollAccentClass(
              item.cycle.dueDate,
            )}`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.card.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Corte: {formatCompactDate(item.cycle.cutDate)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Límite: {formatCompactDate(item.cycle.dueDate)}
                </p>
              </div>

              <Badge
                variant="outline"
                className={getStatusBadgeClass(item.cycle.displayStatus)}
              >
                {getStatusLabel(item.cycle.displayStatus)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <p className="text-xs text-muted-foreground">Pago calculado</p>
                <p className="text-lg font-semibold">
                  {formatMoney(item.cycle.calculatedAmount)}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                <p className="text-xs text-muted-foreground">Estado cuenta</p>
                <p className="text-lg font-semibold">
                  {item.cycle.statementAmount
                    ? formatMoney(item.cycle.statementAmount)
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Vista escritorio */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:block">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <div>Tarjeta</div>
          <div>Corte</div>
          <div>Límite pago</div>
          <div>Pago calculado</div>
          <div>Estado cuenta</div>
          <div>Estado</div>
        </div>

        <div className="divide-y divide-border">
          {items.map((item) => (
            <div
              key={item.cycle.id}
              className={`grid gap-4 px-4 py-4 text-sm md:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] ${getPayrollAccentClass(
                item.cycle.dueDate,
              )}`}
            >
              <div className="font-medium">{item.card.name}</div>

              <div>{formatCompactDate(item.cycle.cutDate)}</div>

              <div>{formatCompactDate(item.cycle.dueDate)}</div>

              <div className="font-semibold">
                {formatMoney(item.cycle.calculatedAmount)}
              </div>

              <div className="font-semibold">
                {item.cycle.statementAmount
                  ? formatMoney(item.cycle.statementAmount)
                  : "-"}
              </div>

              <div>
                <Badge
                  variant="outline"
                  className={getStatusBadgeClass(item.cycle.displayStatus)}
                >
                  {getStatusLabel(item.cycle.displayStatus)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
