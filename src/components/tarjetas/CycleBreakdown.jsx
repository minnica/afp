"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(value || 0)
  );
}

function formatShortDate(dateString) {
  if (!dateString) return "-";
  return format(new Date(dateString), "d MMM", { locale: es });
}

function BreakdownSection({ title, items, emptyText, getPrimary, getSecondary, getAmount, getNote }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h5 className="mb-3 text-sm font-medium">{title}</h5>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-background/60 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{getPrimary(item)}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {getSecondary(item)}
                  </p>
                </div>

                <p className="shrink-0 text-sm font-semibold">{formatMoney(getAmount(item))}</p>
              </div>
              {getNote?.(item) && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {getNote(item)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CycleBreakdown({ cycle }) {
  const hasCredits = Number(cycle.creditsAmount || 0) > 0;
  return (
    <div className="space-y-4">
      {hasCredits && (
        <dl className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Cargos del corte</dt>
            <dd className="font-semibold">{formatMoney(cycle.grossCalculatedAmount)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Bonificaciones aplicadas</dt>
            <dd className="font-semibold text-emerald-400">{formatMoney(-cycle.creditsAmount)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Total calculado a pagar</dt>
            <dd className="font-semibold">{formatMoney(cycle.calculatedAmount)}</dd>
          </div>
        </dl>
      )}
      <div className={`grid gap-4 ${hasCredits ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        <BreakdownSection
          title={`Gastos (${formatMoney(cycle.expensesAmount)})`}
          items={cycle.includedExpenses || []}
          emptyText="No hay gastos diarios en este ciclo."
          getPrimary={(item) => item.concept}
          getSecondary={(item) =>
            `${formatShortDate(item.date)}${item.categoryName ? ` · ${item.categoryName}` : ""}`
          }
          getAmount={(item) => item.amount}
        />

        <BreakdownSection
          title={`Suscripciones (${formatMoney(cycle.subscriptionsAmount)})`}
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
          title={`Compras a meses (${formatMoney(cycle.purchasesAmount)})`}
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
            title={`Bonificaciones aplicadas (${formatMoney(-cycle.creditsAmount)})`}
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
      </div>
    </div>
  );
}
