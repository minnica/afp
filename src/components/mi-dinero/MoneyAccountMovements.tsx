'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemFooter, ItemGroup, ItemSeparator } from '@/components/ui/item';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { buildAccountLedger, filterAccountLedger, type AccountLedgerEntry } from '@/lib/money/accountLedger';
import { cents } from '@/lib/money/balance';
import type { AccountResponse, DisplayEvent } from '@/lib/money/responses';
import { cn } from '@/lib/utils';
import { dateLabel, money, monthLabel } from './format';

type MoneyAccountMovementsProps = {
  account: AccountResponse;
  events: DisplayEvent[];
  today: string;
  error?: string;
  onClose: () => void;
  onRefresh: () => void;
  restoreFocus: (event: { preventDefault: () => void }) => void;
};
const shortMonth = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function EntryConcept({ entry }: { entry: AccountLedgerEntry }) {
  return <div className="flex min-w-0 flex-col gap-1.5">
    <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{entry.label}</p>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{entry.kindLabel}</span>
      {entry.certainty === 'CALCULATED' && <Badge variant="outline">Calculado por AFP</Badge>}
      {entry.certainty === 'ESTIMATED' && <Badge variant="warning">Importe estimado</Badge>}
      {entry.source && <Link href={entry.source.href} className="inline-flex min-h-11 w-fit items-center rounded-sm text-xs underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring md:min-h-6">Ver en {entry.source.label}</Link>}
    </div>
    {entry.description && <p className="max-w-prose text-xs text-muted-foreground">{entry.description}</p>}
  </div>;
}

function MovementAmount({ entry }: { entry: AccountLedgerEntry }) {
  return <span className={cn('font-medium tabular-nums [overflow-wrap:anywhere]', !entry.adjustment && (entry.cents > 0 ? 'text-success' : 'text-destructive'))}>
    {entry.cents > 0 ? '+' : '−'}{money(Math.abs(entry.amount))}
  </span>;
}

export default function MoneyAccountMovements({ account, events, today, error, onClose, onRefresh, restoreFocus }: MoneyAccountMovementsProps) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState(''), [period, setPeriod] = useState('ALL'), [limit, setLimit] = useState(20);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const ledger = useMemo(() => buildAccountLedger(account, events, today), [account, events, today]);
  const filtered = useMemo(() => filterAccountLedger(ledger.entries, query, period), [ledger.entries, query, period]);
  const visible = filtered.slice(0, limit);
  const matchesBalance = cents(ledger.balance) === cents(account.balance);
  const hasFilters = Boolean(query.trim() || period !== 'ALL');
  const hasAdjustments = ledger.entries.some(entry => entry.adjustment);
  const estimatedIncluded = account.estimatedIncomeAmount ?? ledger.estimated;
  function clearFilters() { setQuery(''); setPeriod('ALL'); setLimit(20); }

  return <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent
      side={isMobile ? 'bottom' : 'right'}
      showCloseButton={false}
      onCloseAutoFocus={restoreFocus}
      className="gap-0 data-[side=bottom]:h-[94svh] data-[side=bottom]:rounded-t-xl data-[side=right]:w-full data-[side=right]:sm:max-w-4xl motion-reduce:animate-none motion-reduce:transition-none"
      data-account-movements
    >
      <SheetHeader className="shrink-0 p-4 pr-16 md:p-6 md:pr-16">
        <SheetTitle className="break-words [overflow-wrap:anywhere]">Movimientos de {account.name}</SheetTitle>
        <SheetDescription>Cómo llegaste a tu saldo actual, desde tu última referencia.</SheetDescription>
      </SheetHeader>
      <SheetClose asChild><Button variant="ghost" size="icon" className="absolute top-2 right-2 size-11 md:top-4 md:right-4" aria-label="Cerrar movimientos"><HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" /></Button></SheetClose>
      <Separator />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6" data-account-movements-scroll>
        {error && <Alert><AlertTitle>No se pudo actualizar el desglose</AlertTitle><AlertDescription><p>Se muestran los últimos datos cargados.</p><Button variant="outline" className="mt-2 min-h-11" onClick={onRefresh}>Reintentar actualización</Button></AlertDescription></Alert>}
        <section aria-label="Cómo se compone el saldo" className="flex min-w-0 flex-col gap-4">
          <dl className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <dt className="text-sm font-medium">Saldo actual en AFP</dt>
            <dd className="text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]" data-account-current-balance>{money(account.balance)}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">Desde el {dateLabel(ledger.referenceDate)} hasta el {dateLabel(today)}.</p>
          <Collapsible open={!isMobile || summaryOpen} onOpenChange={setSummaryOpen}>
            {isMobile && <CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 w-full justify-between px-0" aria-label="Desglose del saldo">
              {summaryOpen ? 'Ocultar desglose del saldo' : 'Ver desglose del saldo'}
              <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" aria-hidden="true" className={cn('transition-transform motion-reduce:transition-none', summaryOpen && 'rotate-180')} />
            </Button></CollapsibleTrigger>}
            <CollapsibleContent className="flex flex-col gap-4 pb-1">
          <dl className={cn('grid grid-cols-2 gap-x-5 gap-y-4', hasAdjustments ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
            <div className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">Saldo de referencia</dt><dd className="text-sm font-medium tabular-nums [overflow-wrap:anywhere]">{money(ledger.openingBalance)}</dd></div>
            <div className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">Entradas</dt><dd className="text-sm font-medium tabular-nums text-success [overflow-wrap:anywhere]">+{money(ledger.incoming)}</dd></div>
            <div className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">Salidas</dt><dd className="text-sm font-medium tabular-nums text-destructive [overflow-wrap:anywhere]">−{money(ledger.outgoing)}</dd></div>
            {hasAdjustments && <div className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">Ajustes de referencia</dt><dd className="text-sm font-medium tabular-nums [overflow-wrap:anywhere]">{ledger.adjustments < 0 ? '−' : '+'}{money(Math.abs(ledger.adjustments))}</dd></div>}
          </dl>
          <p className="max-w-prose text-xs text-muted-foreground">El saldo parte de tu referencia, más entradas, menos salidas{hasAdjustments && ' y con los ajustes indicados'}. Los movimientos incluidos en la referencia no se suman otra vez.</p>
            </CollapsibleContent>
          </Collapsible>
          {ledger.calculated > 0 && <p className="text-xs text-muted-foreground">Incluye {money(ledger.calculated)} de rendimientos calculados por AFP.</p>}
          {estimatedIncluded > 0 && <p className="text-xs text-warning">Incluye {money(estimatedIncluded)} de ingresos estimados pendientes de confirmar.</p>}
        </section>
        {!matchesBalance ? <Alert variant="destructive"><AlertTitle>El detalle necesita actualizarse</AlertTitle><AlertDescription><p>El desglose no coincide con el saldo cargado. Actualiza Mi dinero para consultar una referencia consistente.</p><Button variant="outline" className="mt-2 min-h-11" onClick={onRefresh}>Actualizar Mi dinero</Button></AlertDescription></Alert> : <>
          <Separator />
          <section aria-labelledby="account-ledger-title" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1"><h3 id="account-ledger-title" className="text-base font-semibold">Detalle de movimientos</h3><p className="text-xs text-muted-foreground">Más recientes primero. Los filtros conservan el saldo completo de cada movimiento.</p></div>
            <FieldGroup className="grid grid-cols-2 gap-3 sm:flex sm:flex-row">
              <Field><FieldLabel htmlFor="account-ledger-search">Buscar</FieldLabel><Input id="account-ledger-search" className="min-h-11" placeholder="Concepto o tipo" type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} /></Field>
              <Field className="sm:max-w-56"><FieldLabel htmlFor="account-ledger-period">Mes</FieldLabel><ResponsiveSelect id="account-ledger-period" title="Mes de los movimientos" className="min-h-11" value={period} onValueChange={value => { setPeriod(value); setLimit(20); }} options={[{ value: 'ALL', label: 'Todos los meses', shortLabel: 'Todos' }, ...ledger.months.map(month => ({ value: month, label: monthLabel(month), shortLabel: shortMonth.format(new Date(`${month}-01T12:00:00Z`)) }))]} /></Field>
            </FieldGroup>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground" role="status" aria-live="polite">{filtered.length} movimiento{filtered.length === 1 ? '' : 's'}{hasFilters ? ' con estos filtros' : ' desde la referencia'}.</p>{hasFilters && <Button variant="ghost" className="min-h-11" onClick={clearFilters}>Limpiar filtros</Button>}</div>
            {visible.length === 0 ? <Empty><EmptyHeader>
              <EmptyTitle>{ledger.entries.length ? 'Sin movimientos con estos filtros' : 'El saldo parte de tu referencia'}</EmptyTitle>
              <EmptyDescription>{ledger.entries.length ? 'Busca otro concepto o consulta todos los meses desde la referencia.' : 'No hay movimientos que cambien este saldo desde la referencia. Los nuevos ingresos, gastos y transferencias aparecerán aquí.'}</EmptyDescription>
            </EmptyHeader>{hasFilters && <EmptyContent><Button variant="outline" className="min-h-11" onClick={clearFilters}>Ver todos los movimientos</Button></EmptyContent>}</Empty> : <>
              <div className="hidden min-w-0 rounded-lg border md:block">
                <Table tabIndex={0} className="min-w-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                  <TableCaption className="sr-only">Movimientos que explican el saldo de {account.name}. El saldo después de cada movimiento conserva todos los registros, aunque se filtre la lista.</TableCaption>
                  <TableHeader><TableRow><TableHead scope="col" className="pl-4">Fecha</TableHead><TableHead scope="col">Concepto</TableHead><TableHead scope="col" className="text-right">Movimiento</TableHead><TableHead scope="col" className="pr-4 text-right">Saldo después</TableHead></TableRow></TableHeader>
                  <TableBody>{visible.map(entry => <TableRow key={entry.key} data-ledger-entry={entry.key}>
                    <TableCell className="py-4 pl-4 align-top"><div className="flex flex-col gap-1"><span>{dateLabel(entry.date)}</span>{entry.adjustment && <span className="text-xs text-muted-foreground">Referencia</span>}</div></TableCell>
                    <TableCell className="w-full py-4 align-top whitespace-normal"><EntryConcept entry={entry} /></TableCell>
                    <TableCell className="py-4 text-right align-top"><MovementAmount entry={entry} /></TableCell>
                    <TableCell className="py-4 pr-4 text-right align-top tabular-nums">{money(entry.balance)}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              </div>
              <ItemGroup role="list" className="md:hidden">{visible.map((entry, index) => <Fragment key={entry.key}>
                {index > 0 && <ItemSeparator />}
                <Item role="listitem" className="items-stretch px-0 py-4" data-ledger-entry={entry.key}>
                  <ItemContent><p className="text-xs text-muted-foreground">{dateLabel(entry.date)}{entry.adjustment ? ' · Referencia' : ''}</p><EntryConcept entry={entry} /></ItemContent>
                  <ItemFooter><dl className="grid w-full min-w-0 grid-cols-2 gap-3 text-sm">
                    <div className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">{entry.adjustment ? 'Ajuste' : entry.cents > 0 ? 'Entrada' : 'Salida'}</dt><dd><MovementAmount entry={entry} /></dd></div>
                    <div className="flex min-w-0 flex-col gap-1 text-right"><dt className="text-xs text-muted-foreground">Saldo después</dt><dd className="font-medium tabular-nums [overflow-wrap:anywhere]">{money(entry.balance)}</dd></div>
                  </dl></ItemFooter>
                </Item>
              </Fragment>)}</ItemGroup>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{visible.length} de {filtered.length} movimientos.</p>{filtered.length > limit && <Button variant="outline" className="min-h-11" onClick={() => setLimit(value => value + 20)}>Ver más movimientos</Button>}</div>
            </>}
            <p className="max-w-prose text-xs text-muted-foreground">El orden dentro de un mismo día es de AFP y puede diferir del banco. Las compras con crédito aparecen al pagar la tarjeta. Las previsiones y los rendimientos por abonar permanecen fuera de este saldo.</p>
          </section>
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
