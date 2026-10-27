'use client';
import { useState } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { money, dateLabel, monthLabel, accountOptions } from './format';

export default function MoneyProjection({ data, onScenario, onResetScenario }) {
  const [month, setMonth] = useState(data.forecast.today.slice(0, 7));
  const [accountId, setAccountId] = useState('ALL');
  const base = data.forecast, forecast = data.simulated || base;
  const rows = forecast.events.filter(e => e.date.startsWith(month) && (accountId === 'ALL' || e.accountId === accountId));
  const account = forecast.accounts.find(a => a.id === accountId);
  const points = forecast.daily.filter(d => d.date.startsWith(month)).map(d => {
    const original = base.daily.find(b => b.date === d.date);
    return { date: d.date, balance: account ? d.accounts[accountId] : d.balance, original: account ? original.accounts[accountId] : original.balance };
  });
  const selected = forecast.monthly.find(m => m.month === month);
  const yields = rows.filter(e => e.kind === 'YIELD').reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
  const summary = forecast.summary;
  const currentIssues = forecast.issues.filter(issue => issue.scope !== 'HISTORICAL');
  const historicalIssues = forecast.issues.filter(issue => issue.scope === 'HISTORICAL');
  return <div className="flex flex-col gap-6">
    {data.simulated && <p role="status" className="text-sm font-medium">Estás viendo un escenario simulado. El saldo registrado de hoy se conserva; las fechas y saldos futuros reflejan tus cambios.</p>}
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardDescription>{forecast.issues.some(i => i.key === 'unassigned') ? 'Disponible registrado · parcial' : forecast.accounts.some(a => a.calculatedYield) ? 'Disponible calculado hoy' : 'Disponible registrado hoy'}</CardDescription><CardTitle className="tabular-nums text-2xl">{money(summary.available)}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Saldo {money(summary.balance)} · reserva personal {money(summary.reserved)}. Todo permanece a la vista.</p></CardContent></Card>
      <Card><CardHeader><CardDescription>Menor saldo previsto</CardDescription><CardTitle className="tabular-nums text-2xl">{money(summary.minimum)}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{dateLabel(summary.minimumDate)} · próximos 12 meses</p></CardContent></Card>
      <Card><CardHeader><CardDescription>Por debajo de tu reserva</CardDescription><CardTitle>{summary.belowReserveDate ? dateLabel(summary.belowReserveDate) : 'No en estos 12 meses'}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{summary.zeroDate ? `Saldo cero o negativo: ${dateLabel(summary.zeroDate)}.` : 'No se alcanza saldo cero dentro del período.'}</p></CardContent></Card>
    </div>
    {!!currentIssues.length && <Alert><AlertDescription><p>Proyección por completar</p><ul className="list-disc pl-5">{currentIssues.map(issue => <li key={issue.key}>{issue.message}</li>)}</ul></AlertDescription></Alert>}
    {!!historicalIssues.length && <Alert><AlertDescription><p>Revisión histórica pendiente</p><p>Estos períodos están liquidados. Puedes cotejar sus fechas después; este aviso no agrega pagos a la proyección.</p><ul className="list-disc pl-5">{historicalIssues.map(issue => <li key={issue.key}>{issue.message}</li>)}</ul></AlertDescription></Alert>}
    {!!forecast.accountShortfalls.length && <Alert><AlertDescription>{forecast.accountShortfalls.map(a => <p key={a.id}>{a.name}: por debajo de su reserva el {dateLabel(a.date)}. Revisa si necesitas transferir dinero.</p>)}</AlertDescription></Alert>}
    <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Tu dinero en el tiempo</CardTitle><div className="flex flex-wrap gap-2">{data.simulated && <Button variant="ghost" onClick={onResetScenario} className="min-h-11">Quitar escenario</Button>}<Button variant="outline" onClick={onScenario} className="min-h-11">Simular cambios</Button></div></div><CardDescription>Desde {dateLabel(forecast.today)}. Las previsiones dependen de tus fechas, importes y tasas. Los rendimientos se calculan por día y se reflejan según el calendario configurado en cada cuenta.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="money-projection-month">Mes</Label><ResponsiveSelect className="min-h-11" id="money-projection-month" title="Mes de la proyección" value={month} onValueChange={setMonth} options={forecast.monthly.map(m => ({ value: m.month, label: monthLabel(m.month) }))} /></div><div className="flex flex-col gap-2"><Label htmlFor="money-projection-account">Cuenta</Label><ResponsiveSelect className="min-h-11" id="money-projection-account" title="Cuenta proyectada" value={accountId} onValueChange={setAccountId} options={[{ value: 'ALL', label: 'Todas las cuentas' }, ...accountOptions(forecast.accounts)]} /></div></div>
        {data.simulated && <Badge variant="secondary">Escenario simulado · tus movimientos no cambian</Badge>}
        <ChartContainer className="h-64 w-full aspect-auto" config={{ balance: { label: data.simulated ? 'Escenario' : 'Saldo previsto', color: 'color-mix(in oklch, var(--chart-1) 75%, var(--foreground))' }, original: { label: 'Plan actual', color: 'var(--chart-2)' } }}>
          <LineChart accessibilityLayer data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}><CartesianGrid vertical={false} /><XAxis tick={{ fill: 'var(--muted-foreground)' }} dataKey="date" tickFormatter={v => v.slice(-2)} minTickGap={20} /><YAxis tick={{ fill: 'var(--muted-foreground)' }} width={68} tickFormatter={v => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(v)} /><ChartTooltip content={<ChartTooltipContent labelFormatter={dateLabel} formatter={(value, name) => <span>{name === 'original' ? 'Plan actual' : 'Saldo previsto'}: {money(value)}</span>} />} /><ReferenceLine y={account ? Number(account.reservedAmount) : summary.reserved} stroke="var(--muted-foreground)" strokeDasharray="4 4" />{data.simulated && <Line dataKey="original" type="linear" stroke="var(--color-original)" dot={false} strokeDasharray="4 4" isAnimationActive={false} />}<Line dataKey="balance" type="linear" stroke="var(--color-balance)" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
        </ChartContainer>
        <p className="text-sm text-muted-foreground">{data.simulated && 'Línea continua: escenario. Línea discontinua: plan actual. '}La línea discontinua horizontal indica tu reserva personal. Rendimientos previstos en este mes: {money(yields)}.</p>
        {!account && selected && <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Al inicio', selected.opening], ['Entradas', selected.incoming], ['Salidas', selected.outgoing], ['Al cierre', selected.closing]].map(([label, value]) => <div key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="font-medium tabular-nums">{money(value)}</p></div>)}</div>}
      </CardContent>
    </Card>
    <section className="flex flex-col gap-3"><p className="text-xs text-muted-foreground sm:hidden">Desliza la tabla para ver todas las columnas.</p><h2 className="text-lg font-semibold">Movimientos previstos · {monthLabel(month)}</h2>
      {rows.length ? <div className="overflow-x-auto"><Table tabIndex={0} className="focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>Cuenta</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{rows.map(e => <TableRow key={e.key}><TableCell className="whitespace-nowrap">{dateLabel(e.date)}</TableCell><TableCell>{e.label}</TableCell><TableCell>{forecast.accounts.find(a => a.id === e.accountId)?.name || 'Sin asignar'}</TableCell><TableCell className="text-right tabular-nums whitespace-nowrap">{money(e.amount)}</TableCell><TableCell><Badge variant={e.status === 'COMMITTED' ? 'secondary' : 'outline'}>{e.status === 'COMMITTED' ? 'Comprometido' : e.status === 'REGISTERED_FUTURE' ? 'Registrado a futuro' : e.status === 'ESTIMATED' ? 'Estimado' : 'Previsto'}</Badge></TableCell></TableRow>)}</TableBody></Table></div> : <Empty><EmptyHeader><EmptyTitle>Sin movimientos previstos</EmptyTitle><EmptyDescription>Agrega planes o asigna tus compromisos a una cuenta.</EmptyDescription></EmptyHeader></Empty>}
    </section>
    <section className="flex flex-col gap-3"><p className="text-xs text-muted-foreground sm:hidden">Desliza la tabla para ver todas las columnas.</p><h2 className="text-lg font-semibold">Resumen de los próximos 12 meses</h2><div className="overflow-x-auto"><Table tabIndex={0} className="focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"><TableHeader><TableRow><TableHead>Mes</TableHead><TableHead>Inicio</TableHead><TableHead>Entradas</TableHead><TableHead>Salidas</TableHead><TableHead>Cierre</TableHead><TableHead>Mínimo diario</TableHead></TableRow></TableHeader><TableBody>{forecast.monthly.map(m => <TableRow key={m.month}><TableCell className="whitespace-nowrap">{monthLabel(m.month)}</TableCell>{['opening', 'incoming', 'outgoing', 'closing', 'minimum'].map(k => <TableCell key={k} className="whitespace-nowrap tabular-nums">{money(m[k])}</TableCell>)}</TableRow>)}</TableBody></Table></div></section>
  </div>;
}
