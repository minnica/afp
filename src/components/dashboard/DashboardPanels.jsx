"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { MONTH_NAMES, formatMoney, formatCompactDate } from "@/lib/dashboardPresentation";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Dialog } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { BreakdownDialogContent } from "@/components/ui/responsive-breakdown";
import CardUsageWaiverBreakdown from "@/components/dashboard/CardUsageWaiverBreakdown";

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

export function CardUsageWaiverProgress({
  cardUsageWaiversByMonth, currentMonthIndex, inDialog = false,
  selectedMonthIndex: controlledMonth, onMonthChange,
  sortDirection: controlledSort, onSortChange,
}) {
  const breakdownTriggerRef = useRef(null);
  const [localMonth, setLocalMonth] = useState(currentMonthIndex);
  const selectedMonthIndex = controlledMonth ?? localMonth;
  const setSelectedMonthIndex = onMonthChange ?? setLocalMonth;
  const [selectedItem, setSelectedItem] = useState(null);
  const [localSort, setLocalSort] = useState("asc");
  const sortDirection = controlledSort ?? localSort;
  const setSortDirection = onSortChange ?? setLocalSort;
  const sortId = useId();
  const monthId = useId();
  const items = useMemo(() => {
    const monthItems = cardUsageWaiversByMonth[selectedMonthIndex] || [];

    return [...monthItems].sort((a, b) => compareByCutDate(a, b, sortDirection));
  }, [cardUsageWaiversByMonth, selectedMonthIndex, sortDirection]);

  const controls = (
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
  );
  const list = items.length ? (
    <div className="flex flex-col gap-4">
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
              className={cn("h-2.5", item.isExempt ? "[&_[data-slot=progress-indicator]]:bg-emerald-400" : "[&_[data-slot=progress-indicator]]:bg-blue-400")}
            />

            <div className="flex flex-col gap-1 text-sm md:text-right">
              <p>
                <span className="font-medium">{formatMoney(item.eligibleSpend)}</span>
                <span className="text-xs text-muted-foreground"> / {formatMoney(item.minimumAmount)}</span>
              </p>
              <p className={cn("text-xs", item.isExempt ? "text-emerald-400" : "text-muted-foreground")}>
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
                breakdownTriggerRef.current = event.currentTarget;
                setSelectedItem(item);
              }}
            >
              Desglose
            </Button>
          </div>
        );
      })}
    </div>
  ) : (
    <Empty>
      <EmptyDescription>No hay tarjetas con consumo mínimo en este mes.</EmptyDescription>
    </Empty>
  );
  const breakdownDialog = (
    <Dialog
      open={Boolean(selectedItem)}
      onOpenChange={(open) => {
        if (!open) setSelectedItem(null);
      }}
    >
      {selectedItem ? (
        <BreakdownDialogContent
          data-usage-breakdown-dialog
          title={`Desglose — ${selectedItem.card.name}`}
          onCloseAutoFocus={(event) => {
            if (breakdownTriggerRef.current?.isConnected) {
              event.preventDefault();
              breakdownTriggerRef.current.focus({ preventScroll: true });
            }
          }}
        >
          <CardUsageWaiverBreakdown item={selectedItem} />
        </BreakdownDialogContent>
      ) : null}
    </Dialog>
  );

  if (inDialog) {
    return (
      <div data-usage-waivers className="flex min-w-0 flex-col gap-4">
        {controls}
        {list}
        {breakdownDialog}
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <Card data-usage-waivers className="rounded-2xl border-border bg-card">
      <CardHeader>
        <div className="flex flex-col items-center gap-3">
          <CardTitle className="text-lg font-semibold uppercase text-center">Consumo mínimo</CardTitle>
          {controls}
        </div>
      </CardHeader>
      <CardContent>{list}</CardContent>
      {breakdownDialog}
    </Card>
  );
}

export function ImportantNoticesCard({ notices, inDialog = false }) {
  const content = notices.length === 0 ? (
    <Empty>
      <EmptyDescription>No tienes avisos importantes por ahora.</EmptyDescription>
    </Empty>
  ) : (
    <div className="grid gap-3">
      {notices.map((notice) => {
        const Icon = getNoticeIcon(notice.group);

        return (
          <Alert key={notice.id} className={getNoticeAlertClass(notice.group)}>
            <Icon aria-hidden="true" />
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription>{notice.description}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );

  if (inDialog) return content;

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold uppercase text-center">Avisos importantes</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
