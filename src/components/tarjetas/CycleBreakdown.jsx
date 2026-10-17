"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BreakdownHelp, BreakdownSection, BreakdownSections } from "@/components/ui/responsive-breakdown";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { PopoverDescription } from "@/components/ui/popover";

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(value || 0)
  );
}

function formatShortDate(dateString) {
  if (!dateString) return "-";
  return format(new Date(dateString.slice(0, 10) + "T12:00:00"), "d MMM", { locale: es });
}

export default function CycleBreakdown({ cycle }) {
  const isMobile = useIsMobile();
  const hasCredits = Number(cycle.creditsAmount || 0) > 0;
  const warnings = cycle.dataWarnings || [];
  const explanation = "El cálculo incluye los gastos registrados y las cuotas y suscripciones previstas; los importes conciliados usan su referencia bancaria. Una diferencia pendiente requiere revisar el estado de cuenta.";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 text-muted-foreground">
        <p className={cn(isMobile ? "text-sm" : "text-xs")}>Del {formatShortDate(cycle.startDate)} al {formatShortDate(cycle.cutDate)}</p>
        {warnings.length > 0 && (
          <BreakdownHelp
            title={`Fechas por revisar (${warnings.length})`}
            label={`Ver avisos del período (${warnings.length})`}
            data-cycle-period-help
          >
            <ul className="flex flex-col gap-3">
              {warnings.map((warning) => <li key={warning} className="break-words">{warning}</li>)}
            </ul>
          </BreakdownHelp>
        )}
      </div>
      {isMobile ? (
        <div className="space-y-3">
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex min-w-0 items-center text-sm">
                Total calculado
                <BreakdownHelp
                  title="Cómo se calcula"
                  label="Cómo se calcula el total"
                  description={explanation}
                  data-cycle-calculation-help
                  footer={cycle.difference != null && <PopoverDescription>Diferencia = estado de cuenta − total calculado.</PopoverDescription>}
                >
                  <dl className="flex flex-col gap-2">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cargos del corte</dt><dd className="min-w-0 break-words text-right font-medium tabular-nums">{formatMoney(cycle.grossCalculatedAmount)}</dd></div>
                    {hasCredits && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Bonificaciones aplicadas</dt><dd className="min-w-0 break-words text-right font-medium tabular-nums">{formatMoney(-cycle.creditsAmount)}</dd></div>}
                  </dl>
                </BreakdownHelp>
              </dt>
              <dd className="min-w-0 max-w-[55%] shrink-0 break-words text-right text-lg font-semibold tabular-nums">{formatMoney(cycle.calculatedAmount)}</dd>
            </div>
            {cycle.statementAmount != null ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Estado de cuenta</dt>
                <dd className="min-w-0 break-words text-right text-sm font-medium tabular-nums">{formatMoney(cycle.statementAmount)}</dd>
              </div>
            ) : <p className="text-xs text-muted-foreground">Estado de cuenta sin capturar.</p>}
            {cycle.difference != null && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Diferencia{Number(cycle.difference) !== 0 ? " por conciliar" : ""}</dt>
                <dd className={`min-w-0 break-words text-right text-sm font-medium tabular-nums ${Number(cycle.difference) !== 0 ? "text-red-400" : "text-emerald-400"}`}>{formatMoney(cycle.difference)}</dd>
              </div>
            )}
          </dl>
        </div>
      ) : (
        <dl className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Cargos del corte</dt>
            <dd className="font-semibold">{formatMoney(cycle.grossCalculatedAmount)}</dd>
          </div>
          {hasCredits && <div>
            <dt className="text-sm text-muted-foreground">Bonificaciones aplicadas</dt>
            <dd className="font-semibold text-emerald-400">{formatMoney(-cycle.creditsAmount)}</dd>
          </div>}
          <div>
            <dt className="text-sm text-muted-foreground">Total calculado a pagar</dt>
            <dd className="font-semibold">{formatMoney(cycle.calculatedAmount)}</dd>
          </div>
          {cycle.statementAmount != null && <div>
            <dt className="text-sm text-muted-foreground">Estado de cuenta</dt>
            <dd className="font-semibold">{formatMoney(cycle.statementAmount)}</dd>
          </div>}
          {cycle.difference != null && <div>
            <dt className="text-sm text-muted-foreground">Diferencia (estado − calculado)</dt>
            <dd className="font-semibold">{formatMoney(cycle.difference)}</dd>
          </div>}
        </dl>
      )}
      {!isMobile && <p className="text-xs text-muted-foreground">
        {explanation}
      </p>}
      {Number(cycle.postCutCreditAmount) > 0 && <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3"><dt>Devoluciones después del corte</dt><dd className="tabular-nums">{formatMoney(cycle.postCutCreditAmount)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Pago del período tras devoluciones</dt><dd className="tabular-nums">{formatMoney(cycle.paymentDueAmount)}</dd></div>
        <div><dt className="text-muted-foreground">Referencia · {formatShortDate(cycle.postCutCreditDate)}</dt><dd className="break-words">{cycle.postCutCreditNotes}</dd></div>
      </dl>}
      <BreakdownSections isMobile={isMobile} className={cn("grid gap-4", hasCredits ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
        <BreakdownSection
          title="Gastos"
          amount={cycle.expensesAmount}
          isMobile={isMobile}
          items={cycle.includedExpenses || []}
          emptyText="No hay gastos diarios en este ciclo."
          getPrimary={(item) => item.concept}
          getSecondary={(item) =>
            `${formatShortDate(item.date)}${item.categoryName ? ` · ${item.categoryName}` : ""}`
          }
          getAmount={(item) => item.amount}
        />

        <BreakdownSection
          title="Suscripciones"
          amount={cycle.subscriptionsAmount}
          isMobile={isMobile}
          items={cycle.includedSubscriptions || []}
          emptyText="No hay suscripciones en este ciclo."
          getPrimary={(item) => item.name}
          getSecondary={(item) =>
            `${formatShortDate(item.chargeDate)}${
              item.categoryName ? ` · ${item.categoryName}` : ""
            }`
          }
          getAmount={(item) => item.amount}
        />

        <BreakdownSection
          title="Compras a meses"
          amount={cycle.purchasesAmount}
          isMobile={isMobile}
          items={cycle.includedPurchases || []}
          emptyText="No hay mensualidades en este ciclo."
          getPrimary={(item) => item.concept}
          getSecondary={(item) =>
            `${formatShortDate(item.purchaseDate)} · mes ${item.currentMonth || "-"}/${
              item.months
            }${item.categoryName ? ` · ${item.categoryName}` : ""}`
          }
          getAmount={(item) => item.amount}
        />
        {hasCredits && (
          <BreakdownSection
            title="Bonificaciones aplicadas"
            amount={-cycle.creditsAmount}
            isMobile={isMobile}
            items={cycle.includedCredits || []}
            emptyText="No hay bonificaciones aplicadas en este ciclo."
            getPrimary={(item) => item.concept}
            getSecondary={(item) =>
              `${formatShortDate(item.date)} · ingreso completo: ${formatMoney(item.incomeAmount)}`
            }
            getAmount={(item) => -item.amount}
            getNote={(item) => item.notes}
          />
        )}
      </BreakdownSections>
    </div>
  );
}
