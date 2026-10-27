'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, AlertCircleIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { money, monthLabel } from './format';
import { monthlySummaryStatus } from './monthlySummaryStatus';

const toneClass = { success: 'text-success', warning: 'text-warning', destructive: 'text-destructive' };
const statusIcons = { success: CheckmarkCircle02Icon, warning: Alert02Icon, destructive: AlertCircleIcon };

export default function MoneyMonthlySummary({ monthly, today, reserved = 0, incomplete = false }) {
  return <section aria-labelledby="money-monthly-summary-title" className="@container/money-summary flex min-w-0 flex-col gap-3">
    <h2 id="money-monthly-summary-title" className="text-lg font-semibold">Resumen de los próximos 12 meses</h2>
    <p className="text-sm text-muted-foreground @3xl/money-summary:hidden">Todas tus cuentas</p>

    <Accordion key={monthly[0]?.month} type="single" collapsible defaultValue={monthly[0]?.month} className="@3xl/money-summary:hidden">
      {monthly.map(month => {
        const status = monthlySummaryStatus(month, { reserved, incomplete });
        return <AccordionItem key={month.month} value={month.month}>
        <AccordionTrigger className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 **:data-[slot=accordion-trigger-icon]:col-start-2 **:data-[slot=accordion-trigger-icon]:row-start-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{monthLabel(month.month)}</span>
            {month.month === today.slice(0, 7) && <Badge variant="outline">Desde hoy</Badge>}
          </span>
          <span className="col-span-full grid min-w-0 grid-cols-2 gap-x-2 gap-y-3 @xs/money-summary:grid-cols-3">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-normal text-muted-foreground">Inicio</span>
              <span className="break-words text-sm font-medium tabular-nums">{money(month.opening)}</span>
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-normal text-muted-foreground">Cierre</span>
              <span className={cn('break-words text-sm font-medium tabular-nums', toneClass[status.closingTone])}>{money(month.closing)}</span>
            </span>
            <span className="col-span-full flex min-w-0 flex-col gap-1 @xs/money-summary:col-span-1">
              <span className="font-normal text-muted-foreground">Mínimo diario</span>
              <span className={cn('break-words text-sm font-medium tabular-nums', toneClass[status.minimumTone])}>{money(month.minimum)}</span>
            </span>
          </span>
          <span className="col-span-full flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Badge variant={status.variant}>
              <HugeiconsIcon icon={statusIcons[status.variant]} strokeWidth={2} data-icon="inline-start" aria-hidden="true" />
              {status.label}
            </Badge>
            <span className="min-w-0 break-words font-normal text-muted-foreground">{status.change === 0 ? 'Sin cambio' : `${status.change > 0 ? '+' : ''}${money(status.change)} vs. inicio`}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-2 pb-2">
          <dl className="grid gap-3">
            {[['Entradas', month.incoming], ['Salidas', month.outgoing], ...(reserved > 0 ? [['Reserva personal', reserved]] : [])].map(([label, value]) => <div key={label} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-right font-medium tabular-nums">{money(value)}</dd>
            </div>)}
          </dl>
        </AccordionContent>
      </AccordionItem>;
      })}
    </Accordion>

    <div className="hidden overflow-x-auto @3xl/money-summary:block"><Table tabIndex={0} className="focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"><TableHeader><TableRow><TableHead>Mes</TableHead><TableHead>Inicio</TableHead><TableHead>Entradas</TableHead><TableHead>Salidas</TableHead><TableHead>Cierre</TableHead><TableHead>Mínimo diario</TableHead></TableRow></TableHeader><TableBody>{monthly.map(m => <TableRow key={m.month}><TableCell className="whitespace-nowrap">{monthLabel(m.month)}</TableCell>{['opening', 'incoming', 'outgoing', 'closing', 'minimum'].map(k => <TableCell key={k} className="whitespace-nowrap tabular-nums">{money(m[k])}</TableCell>)}</TableRow>)}</TableBody></Table></div>
  </section>;
}
