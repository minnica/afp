'use client';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import type { MoneyResponse } from '@/lib/money/responses';
import { useState } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';



import { Button } from '@/components/ui/button';



import MoneyForecastBreakdown from './MoneyForecastBreakdown';
import MoneyMonthlySummary from './MoneyMonthlySummary';
import { money, dateLabel, monthLabel, accountOptions } from './format';

export default function MoneyProjection({ data, onScenario, onResetScenario }: { data: MoneyResponse; onScenario: () => void; onResetScenario: () => void }) {
  const [month, setMonth] = useState(data.forecast.today.slice(0, 7));
  const [accountId, setAccountId] = useState('ALL');
  const base = data.forecast, forecast = data.simulated || base;
  const rows = forecast.events.filter(e => e.date.startsWith(month) && (accountId === 'ALL' || e.accountId === accountId));
  const account = forecast.accounts.find(a => a.id === accountId);
  const points = forecast.daily.filter(d => d.date.startsWith(month)).map(d => {
    const original = base.daily.find(b => b.date === d.date);
    return { date: d.date, balance: account ? d.accounts[accountId] : d.balance, original: account ? original!.accounts[accountId] : original!.balance };
  });
  const selected = forecast.monthly.find(m => m.month === month);
  const yields = rows.filter(e => e.kind === 'YIELD').reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
  const summary = forecast.summary;
  const hasReserve = summary.reserved > 0;
  const riskDate = hasReserve ? summary.belowReserveDate : summary.zeroDate;
  const currentIssues = forecast.issues.filter(issue => issue.scope !== 'HISTORICAL');
  return <div className="flex flex-col gap-6">
    {data.simulated && <p role="status" className="text-sm font-medium">Estás viendo un escenario simulado. El saldo registrado de hoy se conserva; las fechas y saldos futuros reflejan tus cambios.</p>}
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardDescription>{forecast.issues.some(i => i.key === 'unassigned') ? 'Disponible registrado · parcial' : forecast.accounts.some(a => a.calculatedYield) ? 'Disponible calculado hoy' : 'Disponible registrado hoy'}</CardDescription><CardTitle className="tabular-nums text-2xl">{money(summary.available)}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Saldo {money(summary.balance)} · reserva personal {money(summary.reserved)}. Todo permanece a la vista.</p></CardContent></Card>
      <Card><CardHeader><CardDescription>Menor capital total previsto</CardDescription><CardTitle className="tabular-nums text-2xl">{money(summary.minimum)}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{dateLabel(summary.minimumDate)} · próximos 12 meses</p></CardContent></Card>
      <Card><CardHeader><CardDescription>{hasReserve ? 'Capital total bajo tu reserva' : 'Capital total cero o negativo'}</CardDescription><CardTitle>{riskDate ? dateLabel(riskDate) : 'No en estos 12 meses'}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{hasReserve && summary.zeroDate ? `Capital total cero o negativo: ${dateLabel(summary.zeroDate)}.` : 'Suma de todas tus cuentas.'}</p></CardContent></Card>
    </div>
    {!!currentIssues.length && <Alert><AlertDescription><p>Proyección por completar</p><ul className="list-disc pl-5">{currentIssues.map(issue => <li key={issue.key}>{issue.message}</li>)}</ul></AlertDescription></Alert>}
    {(summary.zeroDate || (hasReserve && summary.belowReserveDate)) && <Alert variant={summary.zeroDate ? 'destructive' : 'default'}>
      <AlertTitle>{summary.zeroDate ? 'Capital total insuficiente' : 'Capital total bajo tu reserva'}</AlertTitle>
      <AlertDescription>
        {hasReserve && summary.belowReserveDate && <p>La suma de todas tus cuentas baja de tu reserva personal de {money(summary.reserved)} el {dateLabel(summary.belowReserveDate)}.</p>}
        {summary.zeroDate && <p>Tu capital total llega a cero o queda negativo el {dateLabel(summary.zeroDate)}.</p>}
      </AlertDescription>
    </Alert>}
    <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Tu dinero en el tiempo</CardTitle><div className="flex flex-wrap gap-2">{data.simulated && <Button variant="ghost" onClick={onResetScenario} className="min-h-11">Quitar escenario</Button>}<Button variant="outline" onClick={onScenario} className="min-h-11">Simular cambios</Button></div></div><CardDescription>Desde {dateLabel(forecast.today)}. Las previsiones dependen de tus fechas, importes y tasas. Los rendimientos se calculan por día y se reflejan según el calendario configurado en cada cuenta.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="money-projection-month">Mes</Label><ResponsiveSelect className="min-h-11" id="money-projection-month" title="Mes de la proyección" value={month} onValueChange={setMonth} options={forecast.monthly.map(m => ({ value: m.month, label: monthLabel(m.month) }))} /></div><div className="flex flex-col gap-2"><Label htmlFor="money-projection-account">Cuenta</Label><ResponsiveSelect className="min-h-11" id="money-projection-account" title="Cuenta proyectada" value={accountId} onValueChange={setAccountId} options={[{ value: 'ALL', label: 'Todas las cuentas' }, ...accountOptions(forecast.accounts)]} /></div></div>
        {data.simulated && <Badge variant="secondary">Escenario simulado · tus movimientos no cambian</Badge>}
        <ChartContainer className="h-64 w-full aspect-auto" config={{ balance: { label: data.simulated ? 'Escenario' : 'Saldo previsto', color: 'color-mix(in oklch, var(--chart-1) 75%, var(--foreground))' }, original: { label: 'Plan actual', color: 'var(--chart-2)' } }}>
          <LineChart accessibilityLayer data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}><CartesianGrid vertical={false} /><XAxis tick={{ fill: 'var(--muted-foreground)' }} dataKey="date" tickFormatter={(v: string) => v.slice(-2)} minTickGap={20} /><YAxis tick={{ fill: 'var(--muted-foreground)' }} width={68} tickFormatter={(v: number) => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(v)} /><ChartTooltip content={<ChartTooltipContent labelFormatter={label => dateLabel(typeof label === 'string' ? label : null)} formatter={(value, name) => <span>{name === 'original' ? 'Plan actual' : 'Saldo previsto'}: {money(value)}</span>} />} /><ReferenceLine y={account ? Number(account.reservedAmount) : summary.reserved} stroke="var(--muted-foreground)" strokeDasharray="4 4" />{data.simulated && <Line dataKey="original" type="linear" stroke="var(--color-original)" dot={false} strokeDasharray="4 4" isAnimationActive={false} />}<Line dataKey="balance" type="linear" stroke="var(--color-balance)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
        </ChartContainer>
        <p className="text-sm text-muted-foreground">{data.simulated && 'Línea continua: escenario. Línea discontinua: plan actual. '}La línea discontinua horizontal indica tu reserva personal. Rendimientos previstos en este mes: {money(yields)}.</p>
        {!account && selected && <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Al inicio', selected.opening], ['Entradas', selected.incoming], ['Salidas', selected.outgoing], ['Al cierre', selected.closing]].map(([label, value]) => <div key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="font-medium tabular-nums">{money(value)}</p></div>)}</div>}
      </CardContent>
    </Card>
    <MoneyForecastBreakdown forecast={forecast} plans={data.plans} categories={data.categories} month={month} accountId={accountId} />
    <MoneyMonthlySummary monthly={forecast.monthly} daily={forecast.daily} today={forecast.today} reserved={summary.reserved} incomplete={currentIssues.length > 0} />
  </div>;
}
