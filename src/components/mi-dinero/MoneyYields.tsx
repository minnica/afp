'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buildYieldReport } from '@/lib/money/yieldReport';
import type { AccountResponse, ForecastResponse } from '@/lib/money/responses';
import { dateLabel, money, monthLabel } from './format';

type YieldReport = ReturnType<typeof buildYieldReport>;
type MoneyYieldsProps = { forecast: ForecastResponse; onEditAccount: (account: AccountResponse) => void };

function AccountEarnings({ earned }: { earned: number }) {
  return <dl className="text-sm">
    <div className="flex min-w-0 flex-col gap-1"><dt className="text-muted-foreground">Acumulado del período</dt><dd className="font-medium tabular-nums [overflow-wrap:anywhere]">{money(earned)}</dd></div>
  </dl>;
}

function YieldAccounts({ report, onEdit }: { report: YieldReport; onEdit: (id: string) => void }) {
  return <section aria-labelledby="yield-accounts-title" className="flex min-w-0 flex-col gap-4">
    <div><h3 id="yield-accounts-title" className="text-lg font-semibold">Rendimiento por cuenta</h3><p className="text-sm text-muted-foreground">Ganancias del período elegido y estimaciones con el saldo de hoy.</p></div>
    <div className="hidden min-w-0 rounded-lg border md:block">
      <Table tabIndex={0} className="min-w-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <TableCaption className="sr-only">Rendimiento acumulado automáticamente en el período, con abonos registrados cuando existen. Estimados a 7 y 30 días con saldo y condiciones actuales.</TableCaption>
        <TableHeader><TableRow>
          <TableHead scope="col" className="pl-4">Cuenta / saldo actual</TableHead>
          <TableHead scope="col" className="text-right">Acumulado del período</TableHead>
          <TableHead scope="col" className="text-right">7 días estimado</TableHead>
          <TableHead scope="col" className="pr-4 text-right">30 días estimado</TableHead>
        </TableRow></TableHeader>
        <TableBody>{report.rows.map(({ account, earned }) => <TableRow key={account.id}>
          <TableHead scope="row" className="max-w-64 py-3 pl-4 whitespace-normal"><div className="flex flex-col items-start gap-1">
            <Button variant="link" onClick={() => onEdit(account.id)} className="h-auto min-h-11 max-w-full justify-start px-0 whitespace-normal text-left" aria-label={`Configurar rendimientos de ${account.name}`}>{account.name}</Button>
            <span className="font-normal tabular-nums text-muted-foreground">{money(account.balance)}</span>
          </div></TableHead>
          <TableCell className="text-right tabular-nums">{money(earned)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(account.yieldEstimate.weekly)}</TableCell>
          <TableCell className="pr-4 text-right tabular-nums">{money(account.yieldEstimate.monthly)}</TableCell>
        </TableRow>)}</TableBody>
        <TableFooter><TableRow>
          <TableHead scope="row" className="pl-4">Total en cuentas</TableHead>
          <TableCell className="text-right tabular-nums">{money(report.assignedEarned)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(report.weekly)}</TableCell>
          <TableCell className="pr-4 text-right tabular-nums">{money(report.monthly)}</TableCell>
        </TableRow></TableFooter>
      </Table>
    </div>
    <ItemGroup className="md:hidden">{report.rows.map(({ account, earned }) => <Item key={account.id} className="flex-col items-stretch gap-3 px-0 py-4">
      <div className="flex min-w-0 items-start justify-between gap-3"><ItemContent><ItemTitle><h4 className="break-words [overflow-wrap:anywhere]">{account.name}</h4></ItemTitle><ItemDescription>Saldo actual: {money(account.balance)}</ItemDescription></ItemContent><ItemActions><Button variant="outline" className="min-h-11" onClick={() => onEdit(account.id)} aria-label={`Configurar rendimientos de ${account.name}`}>Configurar</Button></ItemActions></div>
      <AccountEarnings earned={earned} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex min-w-0 flex-col gap-1"><dt className="text-muted-foreground">7 días estimado</dt><dd className="font-medium tabular-nums [overflow-wrap:anywhere]">{money(account.yieldEstimate.weekly)}</dd></div>
        <div className="flex min-w-0 flex-col gap-1"><dt className="text-muted-foreground">30 días estimado</dt><dd className="font-medium tabular-nums [overflow-wrap:anywhere]">{money(account.yieldEstimate.monthly)}</dd></div>
      </dl>
      <Separator />
    </Item>)}</ItemGroup>
    <p className="text-xs text-muted-foreground">El acumulado se calcula automáticamente con el historial de saldos y condiciones de cada cuenta. Puedes revisar sus tasas y topes en Configurar.</p>
  </section>;
}

export default function MoneyYields({ forecast, onEditAccount }: MoneyYieldsProps) {
  const [period, setPeriod] = useState(forecast.today.slice(0, 7));
  const [accountId, setAccountId] = useState('ALL');
  const [limit, setLimit] = useState(20);
  const report = buildYieldReport(forecast.accounts, forecast.actual, forecast.today, period, accountId);
  const selectedPeriod = period === 'ALL' ? 'Todo el historial registrado' : period === 'YEAR' ? `Año ${forecast.today.slice(0, 4)} hasta hoy` : monthLabel(period);
  const selectedAccount = forecast.accounts.find(account => account.id === accountId);
  const editAccount = (id: string) => { const account = forecast.accounts.find(account => account.id === id); if (account) onEditAccount(account); };

  return <div className="flex min-w-0 flex-col gap-7" data-slot="money-yields">
    <div className="flex flex-col gap-1"><h2 className="text-xl font-semibold">Rendimientos</h2><p className="text-sm text-muted-foreground">Lo que ha generado tu dinero y lo que podría generar después. Saldos al {dateLabel(forecast.today)}.</p></div>
    <FieldGroup className="sm:flex-row">
      <Field><FieldLabel htmlFor="yield-period">Período de ganancias</FieldLabel><ResponsiveSelect id="yield-period" title="Período de ganancias" className="min-h-11" value={period} onValueChange={value => { setPeriod(value); setLimit(20); }} options={[
        { value: 'ALL', label: 'Todo el historial registrado' },
        { value: 'YEAR', label: `Este año · ${forecast.today.slice(0, 4)}` },
        ...report.months.map(month => ({ value: month, label: month === forecast.today.slice(0, 7) ? `Este mes · ${monthLabel(month)}` : monthLabel(month) })),
      ]} /></Field>
      <Field><FieldLabel htmlFor="yield-account">Cuenta</FieldLabel><ResponsiveSelect id="yield-account" title="Cuenta de rendimientos" className="min-h-11" value={accountId} onValueChange={value => { setAccountId(value); setLimit(20); }} options={[{ value: 'ALL', label: 'Todas las cuentas' }, ...forecast.accounts.map(account => ({ value: account.id, label: account.name }))]} /></Field>
    </FieldGroup>

    <section aria-labelledby="yield-earned-title" className="flex flex-col gap-4">
      <div><h3 id="yield-earned-title" className="text-lg font-semibold">Ganancias del período</h3><p className="text-sm text-muted-foreground">{selectedPeriod} · {selectedAccount?.name || 'Todas las cuentas'}</p></div>
      <dl aria-live="polite" aria-atomic="true">
        <div className="flex min-w-0 flex-col gap-1"><dt className="text-sm text-muted-foreground">Rendimiento acumulado</dt><dd className="text-3xl font-semibold tabular-nums text-success [overflow-wrap:anywhere]">{money(report.earned)}</dd><dd className="text-sm text-muted-foreground">Se calcula automáticamente día a día. No necesitas registrar los abonos.</dd></div>
      </dl>
      <p className="max-w-prose text-xs text-muted-foreground">El cálculo usa tus saldos, tasas y calendario de abonos de los días transcurridos. Los importes automáticos se identifican en el detalle.{report.confirmed > 0 && ` El acumulado incluye ${money(report.confirmed)} de abonos ya registrados que sustituyen el cálculo de su cuenta y fecha.`}</p>
      {report.unassigned > 0 && <Alert><AlertTitle>Hay rendimientos sin cuenta asignada</AlertTitle><AlertDescription><p>{money(report.unassigned)} del acumulado provienen de ingresos ya registrados sin cuenta. Asígnalos en Movimientos para verlos en su desglose.</p></AlertDescription></Alert>}
    </section>

    <Card>
      <CardHeader><CardTitle><h3>Si mantienes tu saldo actual</h3></CardTitle><CardDescription>Estimación desde hoy para {selectedAccount?.name || 'todas tus cuentas'}. No depende del período histórico elegido.</CardDescription></CardHeader>
      <CardContent><dl className="grid grid-cols-2 gap-4">
        <div className="flex min-w-0 flex-col gap-1"><dt className="text-sm text-muted-foreground">En una semana · 7 días</dt><dd className="text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">{money(report.weekly)}</dd></div>
        <div className="flex min-w-0 flex-col gap-1"><dt className="text-sm text-muted-foreground">En un mes · 30 días</dt><dd className="text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">{money(report.monthly)}</dd></div>
      </dl></CardContent>
      <CardFooter className="flex-col items-start gap-2"><p className="text-sm">Sobre {money(report.balance)} de saldo actual · {money(report.daily)} al día.</p><p className="max-w-prose text-xs text-muted-foreground">Con saldo y condiciones de hoy, sin movimientos ni capitalización. Incluye topes, tramos, descuentos y redondeo configurados. Las fechas de abono dependen de cada cuenta.</p>{report.pending > 0 && <p className="text-xs text-muted-foreground">Además, {money(report.pending)} calculados por AFP están pendientes del próximo día de abono; no son ingresos confirmados ni se suman a estos estimados.</p>}</CardFooter>
    </Card>

    <YieldAccounts report={report} onEdit={editAccount} />

    <section aria-labelledby="yield-history-title" className="flex flex-col gap-3">
      <h3 id="yield-history-title" className="text-lg font-semibold">Detalle del período</h3>
      {report.entries.length === 0 ? <Empty><EmptyHeader><EmptyTitle>Sin rendimientos acumulados en este período</EmptyTitle><EmptyDescription>El historial se calcula automáticamente desde la fecha de referencia y la activación del rendimiento de cada cuenta. Puedes consultar otro período o revisar sus condiciones en Configurar; no hace falta capturar abonos diarios.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" className="min-h-11" onClick={() => { setPeriod('ALL'); setLimit(20); }}>Ver todo el historial</Button></EmptyContent></Empty> : <>
        <ItemGroup>{report.entries.slice(0, limit).map(entry => <Item key={entry.key} className="flex-wrap px-0 py-3">
          <ItemContent><ItemTitle><span className="break-words [overflow-wrap:anywhere]">{entry.confirmed ? entry.label : `Rendimiento · ${entry.accountName}`}</span></ItemTitle><ItemDescription>{dateLabel(entry.date)} · {entry.accountName}</ItemDescription></ItemContent>
          <div className="flex shrink-0 flex-col items-end gap-1"><span className="text-sm font-medium tabular-nums">{money(entry.cents / 100)}</span><Badge variant={entry.confirmed ? 'secondary' : 'outline'}>{entry.confirmed ? 'Registrado' : 'Automático'}</Badge></div>
        </Item>)}</ItemGroup>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{Math.min(limit, report.entries.length)} de {report.entries.length} movimientos. Los abonos registrados sustituyen al cálculo de su cuenta y fecha.</p>{limit < report.entries.length && <Button variant="outline" className="min-h-11" onClick={() => setLimit(value => value + 20)}>Ver más rendimientos</Button>}</div>
      </>}
    </section>
  </div>;
}
