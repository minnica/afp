"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Item, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemTitle } from "@/components/ui/item";

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
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>

      {items.length === 0 ? (
        <Empty className="px-0"><EmptyDescription>{emptyText}</EmptyDescription></Empty>
      ) : (
        <ItemGroup>
          {items.map((item) => (
            <Item
              key={item.id}
              variant="outline"
              size="sm"
              role="listitem"
            >
                <ItemContent className="min-w-0">
                  <ItemTitle>{getPrimary(item)}</ItemTitle>
                  <ItemDescription>
                    {getSecondary(item)}
                  </ItemDescription>
                </ItemContent>

                <p className="shrink-0 text-sm font-semibold">{formatMoney(getAmount(item))}</p>
              {getNote?.(item) && (
                <ItemFooter className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {getNote(item)}
                </ItemFooter>
              )}
            </Item>
          ))}
        </ItemGroup>
      )}
      </CardContent>
    </Card>
  );
}

export default function CycleBreakdown({ cycle }) {
  const hasCredits = Number(cycle.creditsAmount || 0) > 0;
  return (
    <div className="space-y-4">
      {cycle.dataWarnings?.map((warning) => (
        <Alert key={warning} variant="destructive"><AlertDescription>{warning}</AlertDescription></Alert>
      ))}
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
      <p className="text-xs text-muted-foreground">
        Del {formatShortDate(cycle.startDate)} al {formatShortDate(cycle.cutDate)}.
        {" "}El cálculo incluye los gastos registrados y las cuotas y suscripciones previstas;
        los importes conciliados usan su referencia bancaria. Una diferencia pendiente requiere revisar el estado de cuenta.
      </p>
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
