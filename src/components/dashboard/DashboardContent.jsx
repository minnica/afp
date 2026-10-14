"use client";

import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CardUsageWaiverProgress, ImportantNoticesCard } from "@/components/dashboard/DashboardPanels";
import { MONTH_NAMES, formatMoney, formatCompactDate } from "@/lib/dashboardPresentation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import PageSkeleton from "@/components/layout/PageSkeleton";
import CyclePeriodHelp from "@/components/dashboard/CyclePeriodHelp";

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


export default function DashboardContent() {
  const { dashboard, isLoading, error, today: now, usageHistoryPeriod, setUsageHistoryPeriod } = useDashboard();
  const mobile = useIsMobile();

  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0-11

  const [activeMonthTab, setActiveMonthTab] = useState(String(currentMonthIndex));

  const cycles = useMemo(() => dashboard?.cycles || [], [dashboard?.cycles]);

  const activeMonthIndex = Number(activeMonthTab);

  const importantNotices = dashboard?.importantNotices || [];

  const hasCardUsageWaivers = Boolean(dashboard?.cardUsageWaiversCurrent?.length || dashboard?.cardUsageWaiverHistory?.length);

  const paymentsByMonth = useMemo(() => {
    const map = {};

    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      map[monthIndex] = cycles
        .filter((cycle) => {
          return cycle.year === currentYear && cycle.month - 1 === monthIndex;
        })
        .map((cycle) => ({ card: cycle.card, cycle }))
        .sort((a, b) => {
          return (
            new Date(a.cycle.dueDate).getTime() -
            new Date(b.cycle.dueDate).getTime()
          );
        });
    }

    return map;
  }, [cycles, currentYear]);

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-full flex-col px-4 py-8">
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-6">
          {!mobile ? (
            hasCardUsageWaivers ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <ImportantNoticesCard notices={importantNotices} />
                <CardUsageWaiverProgress
                  currentItems={dashboard.cardUsageWaiversCurrent || []}
                  historyItems={dashboard.cardUsageWaiverHistory || []}
                  today={now}
                  historyPeriod={usageHistoryPeriod}
                  onHistoryPeriodChange={setUsageHistoryPeriod}
                />
              </div>
            ) : (
              <ImportantNoticesCard notices={importantNotices} />
            )
          ) : null}

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-center gap-1">
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Pagos de tarjetas
                </CardTitle>
                <CyclePeriodHelp
                  key={activeMonthTab}
                  cycles={cycles}
                  month={activeMonthIndex + 1}
                  year={currentYear}
                />
              </div>
            </CardHeader>

            <CardContent>
              <Tabs value={activeMonthTab} onValueChange={setActiveMonthTab}>
                <TabsList className="mb-6 h-auto w-full flex-nowrap justify-start overflow-x-auto md:w-fit md:flex-wrap md:justify-center md:overflow-x-visible">
                  {MONTH_NAMES.map((name, monthIndex) => (
                    <TabsTrigger key={monthIndex} value={String(monthIndex)} className="flex-none">
                      {name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {MONTH_NAMES.map((name, monthIndex) => (
                  <TabsContent key={monthIndex} value={String(monthIndex)}>
                    <PaymentsTable items={paymentsByMonth[monthIndex] || []} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

        </div>
      </section>
    </main>
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
      <Empty>
        <EmptyDescription>
          No hay ciclos para mostrar. Genera ciclos desde Tarjetas.
        </EmptyDescription>
      </Empty>
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
                  {item.cycle.statementAmount != null
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
                {item.cycle.statementAmount != null
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
