"use client";
import type { RegularUsage, Usage } from "@/lib/uiTypes";



import { NuTurboUsageBreakdown } from "@/components/dashboard/NuTurboUsage";
import { BreakdownHelp, BreakdownSection, BreakdownSections } from "@/components/ui/responsive-breakdown";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Entry = RegularUsage["breakdown"]["includedDailyExpenses"][number];
function recordDetails(entry: Entry) {
  return [entry.categoryName, entry.isCaptured && "Captura automática", entry.reconciled && "Conciliado"].filter(Boolean).join(" · ");
}
function sumEntries(entries: Entry[]) {
  return entries.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0) / 100;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value || 0));
}

function formatBreakdownDate(dateString?: string | null) {
  if (!dateString) return "-";
  return format(new Date(dateString.slice(0, 10) + "T12:00:00"), "d MMM", { locale: es });
}

export default function CardUsageWaiverBreakdown({ item }: { item: Usage }) {
  const isMobile = useIsMobile();
  if (item.requirementType === "PURCHASE_FREQUENCY") return <NuTurboUsageBreakdown item={item} />;
  const breakdown = item.breakdown || {};
  const projected = (breakdown.projectedCharges || []).filter(entry => !entry.requiresReview);
  const review = (breakdown.projectedCharges || []).filter(entry => entry.requiresReview);
  const sections = [
    {
      title: "Gastos diarios",
      amount: breakdown.dailyExpensesAmount,
      items: breakdown.includedDailyExpenses || [],
      emptyText: "No hay gastos diarios que cuenten en este ciclo.",
      getPrimary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => entry.concept,
      getSecondary: (entry: Entry) => [formatBreakdownDate(entry.date), recordDetails(entry)].filter(Boolean).join(" · "),
    },
    {
      title: "Suscripciones verificadas",
      amount: breakdown.subscriptionsAmount,
      items: breakdown.includedSubscriptions || [],
      emptyText: "No hay suscripciones que cuenten en este ciclo.",
      getPrimary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => entry.name,
      getSecondary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => `${formatBreakdownDate(entry.chargeDate)}${entry.categoryName ? ` · ${entry.categoryName}` : ""}`,
    },
    {
      title: "Compras nuevas a meses",
      amount: breakdown.installmentPurchasesAmount,
      items: breakdown.includedInstallmentPurchases || [],
      emptyText: "No hay compras a meses que cuenten en este ciclo.",
      getPrimary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => entry.concept,
      getSecondary: (entry: Entry) => [formatBreakdownDate(entry.purchaseDate), "compra total", recordDetails(entry)].filter(Boolean).join(" · "),
    },
    ...(breakdown.excludedExpenses?.length ? [{
      title: "Cargos que no cuentan",
      amount: breakdown.excludedAmount,
      items: breakdown.excludedExpenses,
      getPrimary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => entry.concept,
      getSecondary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => `${formatBreakdownDate(entry.date)} · ${entry.reason}`,
    }] : []),
    ...(review.length ? [{
      title: "Cargos por revisar",
      amount: sumEntries(review),
      items: review,
      getPrimary: (entry: Entry) => entry.name || entry.concept,
      getSecondary: (entry: Entry) => `${formatBreakdownDate(entry.chargeDate || entry.date || entry.purchaseDate)} · ${entry.reason}`,
    }] : []),
    ...(projected.length ? [{
      title: "Cargos previstos",
      amount: sumEntries(projected),
      items: projected,
      getPrimary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => entry.name || entry.concept,
      getSecondary: (entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => `${formatBreakdownDate(entry.chargeDate || entry.date || entry.purchaseDate)} · ${entry.reason}`,
    }] : []),
  ];
  const rules = "Las compras registradas en AFP, incluidas las automáticas, suman sin cotejarlas con el estado de cuenta. La conciliación es una comprobación opcional. Las comisiones, sus impuestos, los intereses y las mensualidades de compras anteriores no cuentan. Los cargos futuros y las suscripciones sin cargo registrado se muestran aparte; las diferencias con el estado requieren revisión.";
  const statusText = item.periodSelectionPending ? "Por revisar: hay períodos superpuestos"
    : item.confirmationPending ? "Por revisar: importes distintos al estado"
    : item.status === "NO_CYCLE" ? "Sin ciclo registrado"
    : item.status === "FUTURE" ? "Período futuro"
    : item.isExempt ? "Meta alcanzada según lo registrado"
    : item.status === "NOT_MET" ? "Meta no alcanzada en este período"
    : item.status === "UNCONFIRMED" ? "Hay cargos previstos por confirmar"
    : "Meta en progreso";

  return (
    <div className="flex flex-col gap-4">
      {isMobile ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>{item.product}{item.selectedCycle ? ` · ${item.periodVerified ? "Período verificado" : "Período previsto"}` : ""}</p>
            {item.selectedCycle && <p>Del {formatBreakdownDate(item.selectedCycle.startDate)} al {formatBreakdownDate(item.selectedCycle.cutDate)}</p>}
          </div>
          <dl className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex min-w-0 items-center text-sm">
                Consumo registrado
                <BreakdownHelp
                  title="Qué cuenta para la meta"
                  description={rules}
                  data-usage-calculation-help
                  footer={<a href={item.ruleSourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">Consultar condiciones del banco</a>}
                />
              </dt>
              <dd className="min-w-0 max-w-[55%] shrink-0 break-words text-right text-lg font-semibold tabular-nums">{formatMoney(item.eligibleSpend)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3"><dt className="text-sm text-muted-foreground">Meta del período</dt><dd className="min-w-0 break-words text-right text-sm font-medium tabular-nums">{formatMoney(item.minimumAmount)}</dd></div>
            <div className="flex items-baseline justify-between gap-3"><dt className="text-sm text-muted-foreground">{item.status === "NOT_MET" ? "Faltó para la meta" : "Falta para la meta"}</dt><dd className="min-w-0 break-words text-right text-sm font-medium tabular-nums">{formatMoney(item.remainingAmount)}</dd></div>
          </dl>
          <p className={cn("text-sm text-muted-foreground", item.confirmationPending && "text-destructive")}>{statusText}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Ciclo del {formatBreakdownDate(item.selectedCycle?.startDate)} al {formatBreakdownDate(item.selectedCycle?.cutDate)}</p>
          <p className="text-sm text-muted-foreground">{item.product}: meta de {formatMoney(item.minimumAmount)} por período. {rules}{" "}<a href={item.ruleSourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Consultar condiciones del banco</a>.</p>
        </>
      )}

      <BreakdownSections isMobile={isMobile} className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => <BreakdownSection key={section.title} {...section} isMobile={isMobile} getAmount={(entry: RegularUsage["breakdown"]["includedDailyExpenses"][number]) => entry.amount} />)}
      </BreakdownSections>

    </div>
  );
}
