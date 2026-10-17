"use client";

import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CardUsageWaiverProgress } from "@/components/dashboard/DashboardPanels";
import ImportantNotices from "@/components/dashboard/ImportantNotices";
import { MONTH_NAMES, formatMoney, formatCompactDate } from "@/lib/dashboardPresentation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Item, ItemContent } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPaymentDeadline, getDashboardPayment } from "@/lib/cardPaymentPresentation";
import { cn } from "@/lib/utils";
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
    PARTIALLY_PAID: "Pago parcial",
    NO_PAYMENT_DUE: "Sin importe por pagar",
    OVERDUE: "Vencido",
  };

  return labels[status] || status || "-";
}

function getStatusBadgeClass(status) {
  const classes = {
    PARTIALLY_PAID: "border-warning/30 bg-warning/10 text-warning",
    NO_PAYMENT_DUE: "border-border bg-muted text-muted-foreground",
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
                <ImportantNotices />
                <CardUsageWaiverProgress
                  currentItems={dashboard.cardUsageWaiversCurrent || []}
                  historyItems={dashboard.cardUsageWaiverHistory || []}
                  today={now}
                  historyPeriod={usageHistoryPeriod}
                  onHistoryPeriodChange={setUsageHistoryPeriod}
                />
              </div>
            ) : (
              <ImportantNotices />
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
              {mobile ? (
                <div className="flex flex-col gap-6">
                  <ResponsiveSelect
                    value={activeMonthTab}
                    onValueChange={setActiveMonthTab}
                    aria-label={`Mes de pagos de tarjetas: ${MONTH_NAMES[activeMonthIndex]} ${currentYear}`}
                    title="Mes de pagos de tarjetas"
                    className="h-11"
                    options={MONTH_NAMES.map((name, monthIndex) => ({
                      value: String(monthIndex),
                      label: `${name} ${currentYear}`,
                    }))}
                  />
                  <PaymentsTable items={paymentsByMonth[activeMonthIndex] || []} today={now} />
                </div>
              ) : (
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
                      <PaymentsTable items={paymentsByMonth[monthIndex] || []} today={now} />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
          </Card>

        </div>
      </section>
    </main>
  );
}


function PaymentsTable({ items, today }) {
  const payments = items.map((item) => ({
    ...item,
    payment: getDashboardPayment(item.cycle, today),
  }));
  const totalCents = payments.reduce((total, { payment }) => total + Math.round(payment.amount * 100), 0);
  const payrollCents = payments.reduce((totals, { cycle, payment }) => {
    totals[getPayrollGroupForDueDate(cycle.dueDate).group] += Math.round(payment.amount * 100);
    return totals;
  }, { Q15: 0, Q30: 0 });

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyDescription>
          No hay ciclos para mostrar. Revisa los períodos en Tarjetas.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div>
      <Item variant="muted" size="sm" role="region" aria-label="Resumen de pagos del mes" className="mb-4">
        <ItemContent className="min-w-0">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-3">
            <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
              <dt className="text-xs text-muted-foreground">Total del mes</dt>
              <dd className="break-words text-lg font-semibold tabular-nums">{formatMoney(totalCents / 100)}</dd>
            </div>
            <Separator className="col-span-2 my-1 md:hidden" />
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2.5 shrink-0 rounded-full bg-cyan-400/70" aria-hidden="true" />
                Nómina Q15
              </dt>
              <dd className="break-words text-sm font-medium tabular-nums">{formatMoney(payrollCents.Q15 / 100)}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2.5 shrink-0 rounded-full bg-pink-400/70" aria-hidden="true" />
                Nómina Q30
              </dt>
              <dd className="break-words text-sm font-medium tabular-nums">{formatMoney(payrollCents.Q30 / 100)}</dd>
            </div>
          </dl>
        </ItemContent>
      </Item>

      <div className="grid gap-3 md:hidden" role="list" aria-label="Pagos de tarjetas del mes">
        {payments.map(({ card, cycle, payment }) => (
          <div
            key={cycle.id}
            role="listitem"
            aria-label={`Pago de ${card.name}`}
            className={cn("rounded-xl border border-border bg-background/60 px-4 py-4", getPayrollAccentClass(cycle.dueDate))}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{card.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Corte: {formatCompactDate(cycle.cutDate)}</p>
              </div>
              <Badge variant="outline" className={getStatusBadgeClass(cycle.displayStatus)}>
                {getStatusLabel(cycle.displayStatus)}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Pago del período</dt>
                <dd className="mt-1">
                  <p className="break-words text-xl font-semibold tabular-nums">{formatMoney(payment.amount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{payment.isStatement ? "Estado de cuenta" : "Estimado"}</p>
                  {cycle.paymentStatus === "PARTIALLY_PAID" && <p className="mt-1 text-xs text-warning">Pago parcial · Pendiente: {formatMoney(cycle.pendingAmount)}</p>}
                </dd>
              </div>
              <div className="min-w-0 text-right">
                <dt className="text-xs text-muted-foreground">Límite de pago</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {formatPaymentDeadline(cycle.dueDate, today).split(/ (?=\[)/).map((part, index) => (
                    <span key={part} className={cn("block", index > 0 && "whitespace-nowrap text-xs font-normal text-muted-foreground")}>{part}</span>
                  ))}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <Table aria-label="Pagos de tarjetas del mes">
          <TableHeader>
            <TableRow>
              <TableHead>Tarjeta</TableHead>
              <TableHead>Pago del período</TableHead>
              <TableHead>Límite de pago</TableHead>
              <TableHead>Corte</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map(({ card, cycle, payment }) => (
              <TableRow key={cycle.id} className={getPayrollAccentClass(cycle.dueDate)}>
                <TableCell className="font-medium">{card.name}</TableCell>
                <TableCell>
                  <p className="text-base font-semibold tabular-nums">{formatMoney(payment.amount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{payment.isStatement ? "Estado de cuenta" : "Estimado"}</p>
                  {cycle.paymentStatus === "PARTIALLY_PAID" && <p className="mt-1 text-xs text-warning">Pago parcial · Pendiente: {formatMoney(cycle.pendingAmount)}</p>}
                </TableCell>
                <TableCell className="font-semibold">{formatCompactDate(cycle.dueDate)}</TableCell>
                <TableCell>{formatCompactDate(cycle.cutDate)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={getStatusBadgeClass(cycle.displayStatus)}>{getStatusLabel(cycle.displayStatus)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
