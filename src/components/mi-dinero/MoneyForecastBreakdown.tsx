'use client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import type { MoneyResponse, ForecastResponse } from '@/lib/money/responses';





import { buildProjectionBreakdown, monthlyBreakdownEvents } from './projectionBreakdown';
import { dateLabel, money, monthLabel } from './format';

const statusLabels = {
  COMMITTED: 'Comprometido', REGISTERED_FUTURE: 'Registrado a futuro',
  ESTIMATED: 'Estimado', EXPECTED: 'Previsto', CALCULATED: 'Calculado por AFP', ACTUAL: 'Registrado',
};

function signedMoney(value: number) { return value > 0 ? `+${money(value)}` : money(value); }
function datesLabel(dates: (string | null)[]) {
  return dates.length === 1 ? dateLabel(dates[0])
    : `${dates.length} fechas · ${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}`;
}

export default function MoneyForecastBreakdown({ forecast, plans, categories, month, accountId }: { forecast: ForecastResponse; plans: MoneyResponse['plans']; categories: MoneyResponse['categories']; month: string; accountId: string }) {
  const events = monthlyBreakdownEvents(forecast, month, accountId);
  const breakdown = buildProjectionBreakdown(events, forecast.accounts, plans, categories);
  const account = forecast.accounts.find(item => item.id === accountId);
  return <section aria-labelledby="money-breakdown-title" className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <h2 id="money-breakdown-title" className="text-lg font-semibold">Tu dinero en {monthLabel(month)}</h2>
      <p className="text-sm text-muted-foreground">
        {account ? account.name : 'Todas las cuentas'} · mes completo. Abre un grupo para ver lo registrado y lo previsto.
      </p>
    </div>
    {breakdown.groups.length ? <Accordion key={`${month}:${accountId}`} type="multiple">
      {breakdown.groups.map(group => <AccordionItem key={group.id} value={group.id}>
        <AccordionTrigger className="min-h-16 items-center gap-3 px-4 py-3">
          <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">{group.title}</span>
              <span className="font-normal text-muted-foreground">{group.description}</span>
            </span>
            <span className="text-sm font-medium tabular-nums"><span className="sr-only">Total del mes: </span>{signedMoney(group.amount)}{group.id === 'transfers' && ' neto'}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-2 pb-2">
          <dl className="mb-4 grid grid-cols-2 gap-4">
            <div className="flex min-w-0 flex-col gap-1"><dt className="text-muted-foreground">Registrado</dt><dd className="break-words font-medium tabular-nums">{signedMoney(group.registeredAmount)}</dd></div>
            <div className="flex min-w-0 flex-col gap-1"><dt className="text-muted-foreground">Previsto</dt><dd className="break-words font-medium tabular-nums">{signedMoney(group.expectedAmount)}</dd></div>
            {!!group.calculatedCents && <div className="col-span-2 flex flex-col gap-1"><dt className="text-muted-foreground">Calculado por AFP</dt><dd className="font-medium tabular-nums">{signedMoney(group.calculatedAmount)}</dd><dd className="text-muted-foreground">También se incluye en el total. Es rendimiento calculado de días transcurridos, pendiente de cotejar con el banco.</dd></div>}
          </dl>
          {group.id === 'variable' && <p className="mb-3 text-muted-foreground">El gasto con crédito se incluye en el pago de tarjeta. Aquí se resume lo que sale directamente de tus cuentas.</p>}
          {group.id === 'payments' && <p className="mb-3 text-muted-foreground">Cada pago de tarjeta ya incluye sus compras, mensualidades y suscripciones. Los importes estimados pueden cambiar.</p>}
          <ItemGroup>
            {group.rows.map(row => <Item key={row.key} role="listitem" size="sm" className="items-start px-0">
              <ItemContent className="min-w-0 basis-36">
                <ItemTitle className="line-clamp-none break-words">{row.label}</ItemTitle>
                <ItemDescription className="line-clamp-none break-words">
                  {group.id === 'yield' ? row.phase === 'REGISTERED' ? 'Abonos registrados en el mes' : row.phase === 'CALCULATED' ? 'Rendimiento calculado de días transcurridos' : 'Abonos previstos hasta el cierre del mes'
                    : group.id === 'variable' ? `${row.accountName}${row.phase === 'REGISTERED' ? ` · ${datesLabel(row.dates)}` : ''}`
                    : `${row.accountName} · ${datesLabel(row.dates)}${row.approximateDate ? ' · fecha aproximada' : ''}`}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="ml-auto flex-col items-end gap-1">
                <span className="font-medium tabular-nums">{signedMoney(row.amount)}</span>
                <Badge variant={row.status === 'COMMITTED' ? 'secondary' : 'outline'}>{row.phase === 'REGISTERED' ? 'Registrado' : row.phase === 'CALCULATED' ? 'Calculado por AFP' : statusLabels[row.status] || 'Previsto'}</Badge>
              </ItemActions>
            </Item>)}
          </ItemGroup>
        </AccordionContent>
      </AccordionItem>)}
    </Accordion> : <Empty>
      <EmptyHeader>
        <EmptyTitle>Sin movimientos en este mes</EmptyTitle>
        <EmptyDescription>No hay movimientos registrados ni previstos con cuenta asignada para este mes. Revisa tus registros y planes o selecciona otra cuenta.</EmptyDescription>
      </EmptyHeader>
    </Empty>}
    {!!breakdown.unassignedCount && <p className="text-sm text-muted-foreground">{breakdown.unassignedCount} {breakdown.unassignedCount === 1 ? 'movimiento sin cuenta queda' : 'movimientos sin cuenta quedan'} fuera de estos importes. Revisa sus asignaciones para completar el mes.</p>}
  </section>;
}
