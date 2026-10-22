"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { BreakdownHelp, BreakdownSection, BreakdownSections } from "@/components/ui/responsive-breakdown";
import { NuTurboUsageBreakdown } from "@/components/dashboard/NuTurboUsage";

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value || 0));
}

function formatBreakdownDate(dateString) {
  if (!dateString) return "-";
  return format(new Date(dateString.slice(0, 10) + "T12:00:00"), "d MMM", { locale: es });
}

export default function CardUsageWaiverBreakdown({ item }) {
  const isMobile = useIsMobile();
  if (item.requirementType === "PURCHASE_FREQUENCY") return <NuTurboUsageBreakdown item={item} />;
  const breakdown = item.breakdown || {};
  const sections = [
    {
      title: "Gastos diarios",
      amount: breakdown.dailyExpensesAmount,
      items: breakdown.includedDailyExpenses || [],
      emptyText: "No hay gastos diarios que cuenten en este ciclo.",
      getPrimary: (entry) => entry.concept,
      getSecondary: (entry) => `${formatBreakdownDate(entry.date)}${entry.categoryName ? ` · ${entry.categoryName}` : ""}`,
    },
    {
      title: "Suscripciones confirmadas",
      amount: breakdown.subscriptionsAmount,
      items: breakdown.includedSubscriptions || [],
      emptyText: "No hay suscripciones que cuenten en este ciclo.",
      getPrimary: (entry) => entry.name,
      getSecondary: (entry) => `${formatBreakdownDate(entry.chargeDate)}${entry.categoryName ? ` · ${entry.categoryName}` : ""}`,
    },
    {
      title: "Compras nuevas a meses",
      amount: breakdown.installmentPurchasesAmount,
      items: breakdown.includedInstallmentPurchases || [],
      emptyText: "No hay compras a meses que cuenten en este ciclo.",
      getPrimary: (entry) => entry.concept,
      getSecondary: (entry) => `${formatBreakdownDate(entry.purchaseDate)} · compra total${entry.categoryName ? ` · ${entry.categoryName}` : ""}`,
    },
    ...(breakdown.excludedExpenses?.length ? [{
      title: "Cargos que no cuentan",
      amount: breakdown.excludedAmount,
      items: breakdown.excludedExpenses,
      getPrimary: (entry) => entry.concept,
      getSecondary: (entry) => `${formatBreakdownDate(entry.date)} · ${entry.reason}`,
    }] : []),
    ...(breakdown.projectedCharges?.length ? [{
      title: "Previstos, por confirmar",
      amount: item.projectedAmount,
      items: breakdown.projectedCharges,
      getPrimary: (entry) => entry.name || entry.concept,
      getSecondary: (entry) => `${formatBreakdownDate(entry.chargeDate || entry.date || entry.purchaseDate)} · ${entry.reason}`,
    }] : []),
  ];
  const rules = "Las comisiones, sus impuestos, los intereses y las mensualidades de compras anteriores no cuentan. Los cargos previstos se muestran aparte hasta registrar o verificar el cobro.";
  const statusText = item.periodSelectionPending ? "Por revisar: hay períodos superpuestos"
    : item.confirmationPending ? "Por revisar: importes distintos al estado"
    : item.status === "NO_CYCLE" ? "Sin ciclo registrado"
    : item.status === "FUTURE" ? "Período futuro"
    : item.isExempt ? "Meta alcanzada"
    : item.status === "NOT_MET" ? "Meta no alcanzada en este período"
    : item.status === "UNCONFIRMED" ? "Hay cargos previstos por confirmar"
    : "Meta en progreso";

  return (
    <div className="space-y-4">
      {isMobile ? (
        <div className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{item.product}{item.selectedCycle ? ` · ${item.periodVerified ? "Período verificado" : "Período previsto"}` : ""}</p>
            {item.selectedCycle && <p>Del {formatBreakdownDate(item.selectedCycle.startDate)} al {formatBreakdownDate(item.selectedCycle.cutDate)}</p>}
          </div>
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex min-w-0 items-center text-sm">
                Consumo que cuenta
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
          <p className={`text-sm ${item.confirmationPending ? "text-red-400" : item.isExempt ? "text-emerald-400" : "text-muted-foreground"}`}>{statusText}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Ciclo del {formatBreakdownDate(item.selectedCycle?.startDate)} al {formatBreakdownDate(item.selectedCycle?.cutDate)}</p>
          <p className="text-sm text-muted-foreground">{item.product}: meta de {formatMoney(item.minimumAmount)} por período. {rules}{" "}<a href={item.ruleSourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Consultar condiciones del banco</a>.</p>
        </>
      )}

      <BreakdownSections isMobile={isMobile} className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => <BreakdownSection key={section.title} {...section} isMobile={isMobile} getAmount={(entry) => entry.amount} />)}
      </BreakdownSections>

    </div>
  );
}
