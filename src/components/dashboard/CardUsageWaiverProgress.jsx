"use client";

import { useId, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/dashboardPresentation";
import { formatUsageCutDate, sortUsageByCutDate, usageHistoryOptions, usageHistoryPeriod } from "@/lib/cardUsagePresentation";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Item, ItemContent, ItemGroup, ItemHeader, ItemMedia, ItemSeparator } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { BreakdownDialogContent } from "@/components/ui/responsive-breakdown";
import CardUsageWaiverBreakdown from "@/components/dashboard/CardUsageWaiverBreakdown";

export function CardUsageWaiverTabs() {
  return (
    <TabsList variant="line" aria-label="Vista de consumo mínimo" className="h-8 w-fit self-start p-0 group-data-horizontal/tabs:h-8">
      <TabsTrigger value="current" className="h-8 flex-none px-2 before:absolute before:inset-x-0 before:top-1/2 before:min-h-11 before:-translate-y-1/2 motion-reduce:transition-none">En curso</TabsTrigger>
      <TabsTrigger value="history" className="h-8 flex-none px-2 before:absolute before:inset-x-0 before:top-1/2 before:min-h-11 before:-translate-y-1/2 motion-reduce:transition-none">Historial</TabsTrigger>
    </TabsList>
  );
}

function UsageList({ items, today, historical = false, onBreakdown }) {
  const listId = useId();
  return (
    <ItemGroup className="gap-0">
      {items.map((item, index) => {
        const needsReview = item.confirmationPending || item.periodSelectionPending;
        const missedGoal = historical && item.status === "NOT_MET" && !needsReview
          && !item.isExempt && Number(item.remainingAmount) > 0;
        const summary = item.periodSelectionPending ? "Revisar fechas"
          : item.confirmationPending ? "Por revisar"
          : item.isExempt ? "Meta alcanzada"
          : historical && item.status === "UNCONFIRMED" ? "Por confirmar"
          : `${historical ? "Faltaron" : "Faltan"} ${formatMoney(item.remainingAmount)}`;
        const content = (
          <ItemContent id={`${listId}-${item.selectedCycle?.id || item.card.id}`} className="min-w-0 gap-2">
            <ItemHeader className="items-start">
              <p className="min-w-0 break-words text-sm font-medium">{item.card.name}</p>
              {item.selectedCycle ? (
                <p className={cn("max-w-[60%] shrink-0 break-words text-right text-sm font-semibold tabular-nums", needsReview && "text-destructive")}>
                  {summary}
                </p>
              ) : null}
            </ItemHeader>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-xs text-muted-foreground">{formatUsageCutDate(item, today, historical)}</p>
              {missedGoal ? <Badge variant="warning" data-usage-missed-goal>Posible comisión</Badge> : null}
            </div>
            {item.selectedCycle ? (
              <>
                <Progress
                  value={Math.max(0, Math.min(Number(item.progress || 0), 100))}
                  aria-label={`Consumo registrado de ${item.card.name}`}
                  aria-valuetext={`${formatMoney(item.eligibleSpend)} de ${formatMoney(item.minimumAmount)}`}
                  className="[&_[data-slot=progress-indicator]]:motion-reduce:transition-none"
                />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(item.eligibleSpend)} de {formatMoney(item.minimumAmount)} registrados
                </p>
                {needsReview ? (
                  <p className="text-xs text-destructive">{item.periodSelectionPending ? "Hay períodos superpuestos." : "Hay importes distintos al estado."}</p>
                ) : null}
                {Number(item.projectedAmount) > 0 ? (
                  <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(item.projectedAmount)} por confirmar</p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Revisa sus ciclos en Tarjetas.</p>
            )}
          </ItemContent>
        );
        return (
          <div key={item.selectedCycle?.id || item.card.id} role="listitem" data-usage-card={item.card.id}>
            {item.selectedCycle ? (
              <Item asChild className="min-h-11 px-0 py-3 hover:bg-muted/50 motion-reduce:transition-none">
                <button type="button" className="text-left" aria-label={`Ver desglose de ${item.card.name}`} aria-describedby={`${listId}-${item.selectedCycle.id}`} onClick={(event) => onBreakdown(item, event.currentTarget)}>
                  {content}
                  <ItemMedia variant="icon" className="self-center"><HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></ItemMedia>
                </button>
              </Item>
            ) : <Item className="px-0 py-3">{content}</Item>}
            {index < items.length - 1 ? <ItemSeparator className="my-0" /> : null}
          </div>
        );
      })}
    </ItemGroup>
  );
}

export default function CardUsageWaiverProgress({
  currentItems = [], historyItems = [], today, inDialog = false, externalTabs = false,
  historyPeriod: controlledPeriod, onHistoryPeriodChange,
}) {
  const breakdownTriggerRef = useRef(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [localPeriod, setLocalPeriod] = useState("");
  const historyPeriod = controlledPeriod ?? localPeriod;
  const setHistoryPeriod = onHistoryPeriodChange ?? setLocalPeriod;
  const periodId = useId();
  const current = useMemo(() => sortUsageByCutDate(currentItems), [currentItems]);
  const historyOptions = useMemo(() => usageHistoryOptions(historyItems), [historyItems]);
  const selectedPeriod = historyOptions.some((option) => option.value === historyPeriod)
    ? historyPeriod : historyOptions[0]?.value || "";
  const history = useMemo(() => sortUsageByCutDate(historyItems.filter((item) => usageHistoryPeriod(item) === selectedPeriod)), [historyItems, selectedPeriod]);
  const pending = current.filter((item) => item.selectedCycle && !item.isExempt);
  const missing = current.filter((item) => !item.selectedCycle);
  const completed = current.filter((item) => item.selectedCycle && item.isExempt);
  const onBreakdown = (item, trigger) => {
    breakdownTriggerRef.current = trigger;
    setSelectedItem(item);
  };
  const listProps = { today, onBreakdown };
  const panels = (
    <>
      <TabsContent value="current" className="flex min-w-0 flex-col gap-3 data-[state=inactive]:hidden">
        {pending.length ? <UsageList items={pending} {...listProps} /> : current.length === completed.length && completed.length ? (
          <Empty className="px-0 py-4"><EmptyDescription>Todas tus metas en curso están alcanzadas.</EmptyDescription></Empty>
        ) : null}
        {missing.length ? <UsageList items={missing} {...listProps} /> : null}
        {completed.length ? (
          <Collapsible className="flex flex-col gap-2">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="group h-11 w-full justify-between px-0 motion-reduce:transition-none">
                Meta alcanzada ({completed.length})
                <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" aria-hidden="true" className="transition-transform duration-200 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent><UsageList items={completed} {...listProps} /></CollapsibleContent>
          </Collapsible>
        ) : null}
        {!current.length ? <Empty><EmptyDescription>No tienes tarjetas con consumo mínimo configurado.</EmptyDescription></Empty> : null}
      </TabsContent>
      <TabsContent value="history" className="flex min-w-0 flex-col gap-3 data-[state=inactive]:hidden">
        {historyOptions.length ? (
          <>
            <FieldGroup>
              <Field className="max-w-[200px]">
                <FieldLabel htmlFor={periodId} className="sr-only">Mes de corte del historial</FieldLabel>
                <ResponsiveSelect id={periodId} value={selectedPeriod} onValueChange={setHistoryPeriod} options={historyOptions} aria-label="Mes de corte del historial" title="Mes de corte del historial" />
              </Field>
            </FieldGroup>
            <UsageList items={history} historical {...listProps} />
          </>
        ) : <Empty><EmptyDescription>No hay cortes terminados para consultar.</EmptyDescription></Empty>}
      </TabsContent>
    </>
  );
  const content = externalTabs ? panels : (
    <Tabs defaultValue="current" className="min-w-0 gap-4">
      <CardUsageWaiverTabs />
      {panels}
    </Tabs>
  );
  const breakdown = (
    <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
      {selectedItem ? (
        <BreakdownDialogContent
          data-usage-breakdown-dialog title={`Desglose — ${selectedItem.card.name}`}
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
  if (inDialog) return <div data-usage-waivers className="min-w-0">{content}{breakdown}</div>;
  return (
    <Card data-usage-waivers>
      <CardHeader><CardTitle>Consumo mínimo</CardTitle></CardHeader>
      <CardContent>{content}</CardContent>
      {breakdown}
    </Card>
  );
}
