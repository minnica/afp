'use client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Separator, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './ui';
import type { ForecastResponse } from '@/lib/money/responses';

import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, AlertCircleIcon, ArrowDownRight01Icon, ArrowUpRight01Icon, CheckmarkCircle02Icon, MinusSignIcon } from '@hugeicons/core-free-icons';




import { cn } from '@/lib/utils';
import { money, monthLabel } from './format';
import { monthlySummaryStatus } from './monthlySummaryStatus';
import { MINIMUM_PROXIMITY_PERCENT, monthlyMinimumPeriod } from './monthlyMinimumPeriod';

const toneClass = { success: 'text-success', warning: 'text-warning', destructive: 'text-destructive' };
const statusIcons = { success: CheckmarkCircle02Icon, warning: Alert02Icon, destructive: AlertCircleIcon };

export default function MoneyMonthlySummary({ monthly, daily = [], today, reserved = 0, incomplete = false }: { monthly: ForecastResponse['monthly']; daily?: ForecastResponse['daily']; today: string; reserved?: number; incomplete?: boolean }) {
  const minimumPeriods = new Map(monthly.map(month => [month.month, monthlyMinimumPeriod(month, daily, today)]));
  return <section aria-labelledby="money-monthly-summary-title" className="@container/money-summary flex min-w-0 flex-col gap-3">
    <h2 id="money-monthly-summary-title" className="text-lg font-semibold">Resumen de los próximos 12 meses</h2>
    <p className="text-sm text-muted-foreground">Todas tus cuentas</p>

    <Accordion key={monthly[0]?.month} type="single" collapsible className="@3xl/money-summary:hidden">
      {monthly.map(month => {
        const status = monthlySummaryStatus(month, { reserved, incomplete });
        return <AccordionItem key={month.month} value={month.month}>
        <AccordionTrigger className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 **:data-[slot=accordion-trigger-icon]:col-start-2 **:data-[slot=accordion-trigger-icon]:row-start-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide">{monthLabel(month.month)}</span>
            {month.month === today.slice(0, 7) && <Badge variant="outline">Desde hoy</Badge>}
          </span>
          <span className="col-span-full grid min-w-0 grid-cols-2 gap-x-2 gap-y-3 @xs/money-summary:grid-cols-3">
            <span className="flex min-w-0 flex-col justify-between gap-1">
              <span className="font-normal text-muted-foreground">Inicio</span>
              <span className="break-words text-sm font-medium tabular-nums">{money(month.opening)}</span>
            </span>
            <span className="flex min-w-0 flex-col justify-between gap-1">
              <span className="font-normal text-muted-foreground">Cierre</span>
              <span className={cn('break-words text-sm font-medium tabular-nums', status.closingTone && toneClass[status.closingTone])}>{money(month.closing)}</span>
            </span>
            <span className="col-span-full flex min-w-0 flex-col justify-between gap-1 @xs/money-summary:col-span-1">
              <span className="font-normal text-muted-foreground">Saldo más bajo del mes</span>
              <span className={cn('break-words text-sm font-medium tabular-nums', status.minimumTone && toneClass[status.minimumTone])}>{money(month.minimum)}</span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-2 pb-2">
          <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Badge variant={status.variant}>
              <HugeiconsIcon icon={statusIcons[status.variant]} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
              {status.label}
            </Badge>
            <span className="min-w-0 break-words font-normal text-muted-foreground">{status.change === 0 ? 'Sin cambio' : `${status.change > 0 ? '+' : ''}${money(status.change)} vs. inicio`}</span>
          </div>
          {minimumPeriods.get(month.month)?.label && <>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-muted-foreground">Días cerca del saldo más bajo</p>
              <p className="break-words font-medium" aria-describedby={`money-minimum-period-help-${month.month}`}>{minimumPeriods.get(month.month)?.label}</p>
              <p id={`money-minimum-period-help-${month.month}`} className="text-xs text-muted-foreground">Margen del {MINIMUM_PROXIMITY_PERCENT} % respecto al mínimo.</p>
            </div>
            <Separator />
          </>}
          <dl className="grid gap-3">
            {[['Entradas', month.incoming], ['Salidas', month.outgoing], ...(reserved > 0 ? [['Reserva personal', reserved]] : [])].map(([label, value]) => <div key={label} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-right font-medium tabular-nums">{money(value)}</dd>
            </div>)}
          </dl>
          </div>
        </AccordionContent>
      </AccordionItem>;
      })}
    </Accordion>

    <div className="hidden @3xl/money-summary:block">
      <Table tabIndex={0} aria-labelledby="money-monthly-summary-title" className="focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
        <TableCaption className="sr-only">Capital total previsto de todas tus cuentas. La variación compara el cierre con el inicio. El saldo más bajo del mes es el menor saldo total previsto al cierre de un día. Las fechas indican los días cercanos a ese mínimo; el mes actual comienza hoy.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Mes</TableHead>
            <TableHead scope="col" className="text-right">Inicio</TableHead>
            <TableHead scope="col" className="text-right">Cierre</TableHead>
            <TableHead scope="col" className="text-right">Entradas</TableHead>
            <TableHead scope="col" className="text-right">Salidas</TableHead>
            <TableHead scope="col" className="text-right whitespace-normal">Saldo más bajo del mes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {monthly.map(month => {
            const status = monthlySummaryStatus(month, { reserved, incomplete });
            const trendIcon = status.change > 0 ? ArrowUpRight01Icon : status.change < 0 ? ArrowDownRight01Icon : MinusSignIcon;
            const trendTone = status.change > 0 ? 'success' : status.change < 0 ? 'warning' : null;
            return <TableRow key={month.month}>
              <TableCell className="py-3">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">{monthLabel(month.month)}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={status.variant}>
                      <HugeiconsIcon icon={statusIcons[status.variant]} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
                      {status.label}
                    </Badge>
                    {month.month === today.slice(0, 7) && <Badge variant="outline">Desde hoy</Badge>}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(month.opening)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <div className="flex flex-col items-end gap-1.5">
                  <span className={cn('font-semibold', status.closingTone && toneClass[status.closingTone])}>{money(month.closing)}</span>
                  <span className={cn('inline-flex items-center gap-1 text-xs', (trendTone && toneClass[trendTone]) || 'text-muted-foreground')}>
                    <HugeiconsIcon icon={trendIcon} size={14} strokeWidth={2} aria-hidden="true" />
                    {status.change === 0 ? 'Sin cambio' : `${status.change > 0 ? '+' : ''}${money(status.change)} vs. inicio`}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(month.incoming)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(month.outgoing)}</TableCell>
              <TableCell className="text-right tabular-nums">
                <div className="flex flex-col items-end gap-1.5">
                  <span className={cn('font-medium', status.minimumTone && toneClass[status.minimumTone])}>{money(month.minimum)}</span>
                  {minimumPeriods.get(month.month)?.label && <span className="max-w-48 whitespace-normal text-xs text-muted-foreground" aria-describedby="money-minimum-period-help">{minimumPeriods.get(month.month)?.label}</span>}
                </div>
              </TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
    </div>
    <p id="money-minimum-period-help" className="hidden text-xs text-muted-foreground @3xl/money-summary:block">Rangos cercanos al mínimo · margen del {MINIMUM_PROXIMITY_PERCENT} %.</p>
  </section>;
}
