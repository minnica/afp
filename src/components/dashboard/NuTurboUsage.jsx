"use client";

import { useId } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/dashboardPresentation";
import { formatPaymentDeadline } from "@/lib/cardPaymentPresentation";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemGroup, ItemHeader, ItemMedia } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { BreakdownHelp } from "@/components/ui/responsive-breakdown";

function purchaseDate(value) {
  return value ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "Sin compra registrada";
}

function TurboStatus({ item }) {
  return <Badge variant={item.status === "MET" ? "secondary" : "warning"}>
    {item.status === "DUE_TODAY" ? "Compra hoy" : item.isExempt ? "Compra registrada" : "Falta 1 compra"}
  </Badge>;
}

export function NuTurboUsageRow({ item, today, mobile = false, onBreakdown }) {
  const descriptionId = useId();
  const completedPurchases = item.isExempt ? 1 : 0;
  return (
    <div role="listitem" data-usage-card={item.card.id} data-usage-requirement="purchase-frequency">
      <Item asChild variant={mobile ? "outline" : "default"}
        className={cn("min-h-11 hover:bg-muted/50 motion-reduce:transition-none", mobile ? "rounded-lg p-3" : "px-0 py-3")}>
        <button type="button" className="text-left" aria-label={`Ver desglose de ${item.card.name}`} aria-describedby={descriptionId}
          onClick={(event) => onBreakdown(item, event.currentTarget)}>
          <ItemContent id={descriptionId} className={cn("min-w-0", mobile ? "gap-2.5" : "gap-2")}>
            <ItemHeader className="items-start">
              <p className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{item.card.name}</p>
              <ItemActions className="shrink-0 gap-1">
                {item.isExempt && mobile ? <Badge variant="secondary">Meta alcanzada</Badge>
                  : <p className="text-right text-sm font-semibold">{item.isExempt ? "Meta alcanzada" : "Falta 1 compra"}</p>}
                {mobile ? <ItemMedia variant="icon"><HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></ItemMedia> : null}
              </ItemActions>
            </ItemHeader>
            <p className={cn("text-muted-foreground", mobile ? "text-sm" : "text-xs")}>Cajita Turbo · 1 compra cada 30 días</p>
            {item.isExempt ? <p className={cn(mobile ? "text-sm" : "text-xs text-muted-foreground")}>
              Renovación: {formatPaymentDeadline(item.renewBy, today, { includeDate: !mobile })}
            </p> : <p className="text-xs text-muted-foreground">Sin monto mínimo</p>}
            <Progress
              value={completedPurchases * 100}
              aria-label={`Compras registradas de ${item.card.name}`}
              aria-valuetext={`Compras registradas: ${completedPurchases} de 1`}
              className="[&_[data-slot=progress-indicator]]:motion-reduce:transition-none"
            />
            {!mobile ? <p className="text-xs text-muted-foreground tabular-nums">Compras registradas: {completedPurchases} de 1</p> : null}
          </ItemContent>
          {!mobile ? <ItemMedia variant="icon" className="self-center"><HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></ItemMedia> : null}
        </button>
      </Item>
    </div>
  );
}

export function NuTurboUsageBreakdown({ item }) {
  return (
    <div className="space-y-4" data-nu-turbo-breakdown>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Cajita Turbo</p>
        <TurboStatus item={item} />
      </div>
      <p className="flex items-center text-sm">
        1 compra cada 30 días, sin monto mínimo.
        <BreakdownHelp title="Qué cuenta para Turbo"
          description="Nu acepta compras con crédito o débito. AFP revisa el crédito registrado; confirma la activación de Turbo en Nu. Las mensualidades de compras anteriores y los cargos previstos no renuevan el plazo."
          footer={<a href={item.ruleSourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">Consultar condiciones de Nu</a>} />
      </p>
      <dl className="space-y-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Última compra</dt>
          <dd className="min-w-0 text-right font-medium">{purchaseDate(item.lastPurchase?.date)}</dd>
        </div>
        {item.renewBy ? <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{item.isExempt ? "Renovar a más tardar" : "Plazo anterior"}</dt>
          <dd className="text-right font-medium">{purchaseDate(item.renewBy)}</dd>
        </div> : null}
      </dl>
      <div className="space-y-2">
        <p className="text-sm font-medium">Compras recientes ({item.purchaseCount})</p>
        {item.recentPurchases.length ? <ItemGroup className="gap-2">
          {item.recentPurchases.map((purchase) => <Item key={purchase.id} role="listitem" variant="outline" className="items-start">
            <ItemContent className="min-w-0">
              <p className="text-sm [overflow-wrap:anywhere]">{purchase.concept}</p>
              <p className="text-xs text-muted-foreground">{purchaseDate(purchase.date)}</p>
            </ItemContent>
            <p className="shrink-0 text-sm tabular-nums">{formatMoney(purchase.amount)}</p>
          </Item>)}
        </ItemGroup> : <p className="text-sm text-muted-foreground">Sin compras registradas en los últimos 30 días.</p>}
      </div>
    </div>
  );
}
