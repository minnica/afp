"use client";

import { ResponsiveSelect } from "@/components/ui/responsive-select";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Empty, EmptyDescription } from "@/components/ui/empty";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import PageSkeleton from "@/components/layout/PageSkeleton";
import CardUsageWaiverBreakdown from "@/components/dashboard/CardUsageWaiverBreakdown";
import { BreakdownDialogContent } from "@/components/ui/responsive-breakdown";
import CyclePeriodHelp from "@/components/dashboard/CyclePeriodHelp";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Scissors,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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

function getCutDateSortValue(dateString) {
  if (!dateString) return Number.MAX_SAFE_INTEGER;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return Number.MAX_SAFE_INTEGER;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function compareByCutDate(a, b, direction) {
  const aDate = getCutDateSortValue(a.selectedCycle?.cutDate);
  const bDate = getCutDateSortValue(b.selectedCycle?.cutDate);
  // Los ciclos sin fecha permanecen al final en ambos sentidos.
  const difference = aDate === Number.MAX_SAFE_INTEGER || bDate === Number.MAX_SAFE_INTEGER
    ? aDate - bDate
    : (aDate - bDate) * (direction === "desc" ? -1 : 1);
  return difference || String(a.card?.name || "").localeCompare(
    String(b.card?.name || ""), "es",
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
    overdue: "border-red-500/60 bg-red-500/15 text-red-400 dark:text-red-300",
    today:
      "border-orange-500/60 bg-orange-500/15 text-orange-400 dark:text-orange-300",
    upcoming:
      "border-amber-500/50 bg-amber-500/12 text-amber-500 dark:text-amber-400",
    cut: "border-blue-500/25 bg-blue-500/8 text-blue-500 dark:text-blue-400",
  };

  return classes[group] || "border-border bg-muted/30";
}

function getNoticeIcon(group) {
  if (group === "overdue") return AlertTriangle;
  if (group === "today") return CalendarClock;
  if (group === "cut") return Scissors;
  return Bell;
}

export default function DashboardContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard(userId) {
    const clientDate = new Date().toLocaleDateString("en-CA");
    const response = await fetch(
      `/api/dashboard?userId=${userId}&clientDate=${clientDate}`,
    );
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

        await ensureUserSetup(session.user);

        await loadDashboard(session.user.id);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0-11

  const [activeMonthTab, setActiveMonthTab] = useState(String(currentMonthIndex));

  const cycles = useMemo(() => dashboard?.cycles || [], [dashboard?.cycles]);

  const cardUsageWaiversByMonth = useMemo(() => {
    return dashboard?.cardUsageWaiversByMonth || {};
  }, [dashboard?.cardUsageWaiversByMonth]);

  const activeMonthIndex = Number(activeMonthTab);

  const importantNotices = dashboard?.importantNotices || [];

  const hasCardUsageWaivers = useMemo(() => {
    return Object.values(cardUsageWaiversByMonth).some((items) => {
      return Array.isArray(items) && items.length > 0;
    });
  }, [cardUsageWaiversByMonth]);

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

        <div className="space-y-6">
          {hasCardUsageWaivers ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <ImportantNoticesCard notices={importantNotices} />
              <CardUsageWaiverProgress
                cardUsageWaiversByMonth={cardUsageWaiversByMonth}
                currentMonthIndex={currentMonthIndex}
              />
            </div>
          ) : (
            <ImportantNoticesCard notices={importantNotices} />
          )}

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

function MonthSelector({ value, onChange, id, className = "w-full max-w-[160px] h-8 text-xs" }) {
  return (
    <ResponsiveSelect
      id={id}
      value={String(value)}
      onValueChange={v => onChange(Number(v))}
      aria-label="Mes del período"
      className={className}
      title="Mes del período"
      placeholder="Selecciona una opción"
      options={MONTH_NAMES.map((name, i) => ({
        value: String(i),
        label: String(name)
      }))}
    />
  );
}

function CardUsageWaiverProgress({ cardUsageWaiversByMonth, currentMonthIndex }) {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(currentMonthIndex);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const sortId = useId();
  const monthId = useId();
  const items = useMemo(() => {
    const monthItems = cardUsageWaiversByMonth[selectedMonthIndex] || [];

    return [...monthItems].sort((a, b) => compareByCutDate(a, b, sortDirection));
  }, [cardUsageWaiversByMonth, selectedMonthIndex, sortDirection]);

  if (!items.length) {
    return null;
  }

  return (
    <Card data-usage-waivers className="rounded-2xl border-border bg-card">
      <CardHeader>
        <div className="flex flex-col items-center gap-3">
          <CardTitle className="text-lg font-semibold uppercase text-center">
            Consumo mínimo
          </CardTitle>
          <FieldGroup className="grid max-w-sm grid-cols-[minmax(0,6.25rem)_minmax(0,1fr)] gap-1">
            <Field className="min-w-0">
              <FieldLabel htmlFor={monthId} className="sr-only">Mes del período</FieldLabel>
              <MonthSelector
                id={monthId}
                className="h-8 px-1.5 text-xs"
                value={selectedMonthIndex}
                onChange={setSelectedMonthIndex}
              />
            </Field>
            <Field className="min-w-0">
              <FieldLabel htmlFor={sortId} className="sr-only">Orden de consumo mínimo</FieldLabel>
              <ResponsiveSelect
                id={sortId}
                value={sortDirection}
                onValueChange={setSortDirection}
                aria-label="Orden de consumo mínimo"
                title="Ordenar consumo mínimo"
                className="h-8 px-1.5 text-xs"
                options={[
                  { value: "asc", label: "Corte más próximo" },
                  { value: "desc", label: "Corte más lejano" },
                ]}
              />
            </Field>
          </FieldGroup>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {items.map((item) => {
            const progress = Math.max(0, Math.min(Number(item.progress || 0), 100));

            return (
              <div
                key={item.card.id}
                data-usage-card={item.card.id}
                className="grid gap-2 md:grid-cols-[190px_1fr_160px_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.card.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Corte {item.periodVerified ? "verificado" : "previsto"}: {formatCompactDate(item.selectedCycle?.cutDate)}
                  </p>
                </div>

                <Progress
                  value={progress}
                  aria-label={`Progreso de consumo de ${item.card.name}`}
                  className={`h-2.5 ${item.isExempt ? "[&_[data-slot=progress-indicator]]:bg-emerald-400" : "[&_[data-slot=progress-indicator]]:bg-blue-400"}`}
                />

                <div className="space-y-1 text-sm md:text-right">
                  <p>
                    <span className="font-medium">{formatMoney(item.eligibleSpend)}</span>
                    <span className="text-xs text-muted-foreground"> / {formatMoney(item.minimumAmount)}</span>
                  </p>
                  <p className={`text-xs ${item.isExempt ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {item.confirmationPending ? "Por revisar: importes distintos al estado"
                      : item.status === "NO_CYCLE" ? "Sin ciclo registrado"
                      : item.status === "FUTURE" ? "Período futuro"
                      : item.isExempt ? "Meta alcanzada"
                      : `${item.status === "NOT_MET" ? "Faltaron" : "Faltan por registrar"} ${formatMoney(item.remainingAmount)}`}
                  </p>
                  {item.projectedAmount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(item.projectedAmount)} previstos, por confirmar
                    </p>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-11 md:h-6"
                  onClick={(event) => {
                    captureFocus(event);
                    setSelectedItem(item);
                  }}
                >
                  Desglose
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>

      <Dialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
      >
        {selectedItem ? (
          <BreakdownDialogContent onCloseAutoFocus={restoreFocus} data-usage-breakdown-dialog title={`Desglose — ${selectedItem.card.name}`}>
            <CardUsageWaiverBreakdown item={selectedItem} />
          </BreakdownDialogContent>
        ) : null}
      </Dialog>
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
          <Empty>
            <EmptyDescription>
              No tienes avisos importantes por ahora.
            </EmptyDescription>
          </Empty>
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
