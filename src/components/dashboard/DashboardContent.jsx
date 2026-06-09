"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

import { supabase } from "@/lib/supabase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, Bell, CalendarClock, Scissors } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    cut: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
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

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0-11

  const [activeMonthTab, setActiveMonthTab] = useState(String(currentMonthIndex));

  const cycles = useMemo(() => dashboard?.cycles || [], [dashboard?.cycles]);

  const categoryBreakdownPrev = dashboard?.categoryBreakdownPrev || [];
  const categoryBreakdownCurrent = dashboard?.categoryBreakdownCurrent || [];
  const categoryBreakdownNext = dashboard?.categoryBreakdownNext || [];
  const categoryBreakdownByMonth = dashboard?.categoryBreakdownByMonth || {};
  const weeklyComparisonByMonth = dashboard?.weeklyComparisonByMonth || {};
  const weeklyComparisonByCategoryAndMonth = dashboard?.weeklyComparisonByCategoryAndMonth || {};
  const dashboardCategories = dashboard?.categories || [];

  const prevMonthIndex = (currentMonthIndex - 1 + 12) % 12;
  const nextMonthIndex = (currentMonthIndex + 1) % 12;
  const activeMonthIndex = Number(activeMonthTab);

  const weeklyComparison = weeklyComparisonByMonth[activeMonthIndex] || null;

  const categoryBreakdown =
    activeMonthIndex === prevMonthIndex
      ? categoryBreakdownPrev
      : activeMonthIndex === nextMonthIndex
        ? categoryBreakdownNext
        : activeMonthIndex === currentMonthIndex
          ? categoryBreakdownCurrent
          : [];

  const importantNotices = dashboard?.importantNotices || [];

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

          <div className="grid gap-6 lg:grid-cols-2">
            <WeeklyComparisonChart
              weeklyComparison={weeklyComparison}
              activeMonthIndex={activeMonthIndex}
              weeklyComparisonByCategoryAndMonth={weeklyComparisonByCategoryAndMonth}
              categories={dashboardCategories}
            />
            <CategoryBarChart
              categoryBreakdownByMonth={categoryBreakdownByMonth}
              activeMonthIndex={activeMonthIndex}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#14b8a6",
];

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#1c1c1c",
    border: "1px solid #333",
    borderRadius: "8px",
    color: "#f5f5f5",
    fontSize: "12px",
  },
  itemStyle: { color: "#f5f5f5" },
  labelStyle: { color: "#a1a1aa" },
};

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function ComparisonTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ ...TOOLTIP_STYLE.contentStyle, padding: "10px 14px" }}>
      <p style={{ color: "#a1a1aa", marginBottom: "8px", fontSize: "11px" }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, margin: "4px 0", fontSize: "12px" }}>
          <span style={{ color: "#a1a1aa" }}>{entry.name}: </span>
          {MXN.format(entry.value)}
        </p>
      ))}
    </div>
  );
}

function WeeklyComparisonChart({
  weeklyComparison,
  activeMonthIndex,
  weeklyComparisonByCategoryAndMonth,
  categories,
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");

  const activeComparison =
    selectedCategoryId === "all"
      ? weeklyComparison
      : weeklyComparisonByCategoryAndMonth[selectedCategoryId]?.[activeMonthIndex] || null;

  const selectedCategoryName =
    selectedCategoryId !== "all"
      ? categories.find((c) => c.id === selectedCategoryId)?.name
      : null;

  if (!activeComparison) {
    return (
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold uppercase text-center">
            Mes vs Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            Sin datos disponibles.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { prevMonthLabel, currMonthLabel, prevMonthTotal, currMonthTotal, weeks } = activeComparison;

  const chartData = weeks.map((w) => ({
    label: w.label,
    [prevMonthLabel]: w.prevTotal,
    [currMonthLabel]: w.currTotal,
  }));

  const hasData = weeks.some((w) => w.prevTotal > 0 || w.currTotal > 0);

  const diff = currMonthTotal - prevMonthTotal;
  const diffPct = prevMonthTotal > 0 ? ((diff / prevMonthTotal) * 100).toFixed(1) : null;

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <div className="flex flex-col items-center gap-3">
          <CardTitle className="text-lg font-semibold uppercase text-center">
            {prevMonthLabel} vs {currMonthLabel}
            {selectedCategoryName ? ` — ${selectedCategoryName}` : ""}
          </CardTitle>
          {categories.length > 0 && (
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger className="w-full max-w-[220px] h-8 text-xs">
                <SelectValue placeholder="Filtrar por categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">{prevMonthLabel}</p>
            <p className="mt-1 text-lg font-semibold text-blue-400">
              {formatMoney(prevMonthTotal)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">{currMonthLabel}</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">
              {formatMoney(currMonthTotal)}
            </p>
            {diffPct !== null && (
              <p
                className={`mt-1 text-xs ${
                  diff > 0
                    ? "text-red-400"
                    : diff < 0
                      ? "text-green-400"
                      : "text-muted-foreground"
                }`}
              >
                {diff > 0 ? "+" : ""}
                {diffPct}% vs {prevMonthLabel}
              </p>
            )}
          </div>
        </div>

        {!hasData ? (
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            Sin gastos registrados para comparar.
          </p>
        ) : (
          <div style={{ width: "100%", height: "280px" }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#333" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("es-MX", {
                      style: "currency",
                      currency: "MXN",
                      maximumFractionDigits: 0,
                    }).format(v)
                  }
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                  width={76}
                />
                <Tooltip content={ComparisonTooltip} />
                <Legend
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const ordered = [...payload].reverse();
                    return (
                      <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "8px" }}>
                        {ordered.map((entry, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "12px", height: "12px", backgroundColor: entry.color, borderRadius: "2px" }} />
                            <span style={{ color: "#a1a1aa", fontSize: "12px" }}>{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey={prevMonthLabel}
                  fill="#3b82f6"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                />
                <Bar
                  dataKey={currMonthLabel}
                  fill="#10b981"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryBarChart({ categoryBreakdownByMonth, activeMonthIndex }) {
  const prevMonthIndex = (activeMonthIndex - 1 + 12) % 12;

  const currBreakdown = categoryBreakdownByMonth[activeMonthIndex] || [];
  const prevBreakdown = categoryBreakdownByMonth[prevMonthIndex] || [];

  const currLabel = MONTH_NAMES[activeMonthIndex];
  const prevLabel = MONTH_NAMES[prevMonthIndex];

  const categoryIds = new Set([
    ...currBreakdown.map((c) => c.id),
    ...prevBreakdown.map((c) => c.id),
  ]);

  const nameById = {};
  [...currBreakdown, ...prevBreakdown].forEach((c) => {
    nameById[c.id] = c.name;
  });

  const chartData = Array.from(categoryIds)
    .map((id) => ({
      id,
      name: nameById[id],
      [prevLabel]: prevBreakdown.find((c) => c.id === id)?.total || 0,
      [currLabel]: currBreakdown.find((c) => c.id === id)?.total || 0,
    }))
    .filter((c) => c[prevLabel] > 0 || c[currLabel] > 0)
    .sort((a, b) => b[currLabel] - a[currLabel]);

  const hasData = chartData.length > 0;

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold uppercase text-center">
          {prevLabel} vs {currLabel} — por categoría
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            Aún no hay gastos para este período.
          </p>
        ) : (
          <div style={{ width: "100%", height: `${Math.max(chartData.length * 68 + 40, 200)}px` }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 0, right: 16, bottom: 8, left: 0 }}
                barCategoryGap="20%"
                barGap={2}
              >
                <CartesianGrid horizontal={false} stroke="#333" />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  tick={{ fontSize: 12, fill: "#a1a1aa" }}
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("es-MX", {
                      style: "currency",
                      currency: "MXN",
                      maximumFractionDigits: 0,
                    }).format(v)
                  }
                  tick={{ fontSize: 10, fill: "#a1a1aa" }}
                />
                <Tooltip content={ComparisonTooltip} />
                <Legend
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const ordered = [...payload].reverse();
                    return (
                      <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "8px" }}>
                        {ordered.map((entry, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "12px", height: "12px", backgroundColor: entry.color, borderRadius: "2px" }} />
                            <span style={{ color: "#a1a1aa", fontSize: "12px" }}>{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar dataKey={prevLabel} fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey={currLabel} fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
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
