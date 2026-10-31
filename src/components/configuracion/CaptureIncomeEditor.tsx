'use client';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { calendarDaySchema as captureDate, moneyInputSchema } from '@/lib/financialValidation';
const captureAmount = z.string().refine(v => moneyInputSchema.safeParse(v).success && Number(v) > 0, 'Usa un importe positivo con hasta dos decimales.');
import { captureReasons } from '@/lib/capturePresentation';
import { uiFetch } from '@/lib/uiClient';
import { errorMessage } from '@/lib/uiTypes';
import type { CaptureEditorProps } from './captureUiTypes';
import CaptureNotificationDetails from './CaptureNotificationDetails';
const schema = z.object({ accountId: z.string().min(1, 'Selecciona la cuenta.'), incomeTypeId: z.string().min(1, 'Selecciona el tipo de ingreso.'), amount: captureAmount, date: captureDate, concept: z.string().trim().min(1), confirmedReceived: z.boolean().refine(v => v, 'Confirma el abono en tu cuenta.'), distinct: z.boolean() });
export default function CaptureIncomeEditor({ detail, configuration, userId, onClose, onSaved, restoreFocus }: CaptureEditorProps) {
  const [current, setCurrent] = useState(detail), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const title = useRef<HTMLHeadingElement>(null), p = current.movement.proposal, posting = current.incomeDetail?.posting;
  const income = posting?.income, open = ['REVIEW', 'OBSERVED'].includes(current.movement.status) && !posting;
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { accountId: p.incomeAccountId || '', incomeTypeId: p.incomeTypeId || '', amount: income?.amount || p.amount || (typeof p.estimatedAmount === 'string' ? p.estimatedAmount : ''), date: income?.date.slice(0, 10) || p.date || '', concept: p.merchant || 'Ingreso BBVA', confirmedReceived: false, distinct: false } });
  async function save(values: z.infer<typeof schema>, incomeId?: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await uiFetch('/api/captures/movements', { method: 'PATCH', expectedUserId: userId, errorMode: 'inline', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current.movement.id, action: income?.isEstimated ? 'confirmIncome' : incomeId ? 'linkIncome' : 'registerIncome', income: income?.isEstimated ? { amount: values.amount, expectedUpdatedAt: income.updatedAt, confirmedReceived: true } : { ...values, confirmedReceived: true, currency: 'MXN', ...(incomeId ? { incomeId } : {}) } }) });
      setNotice('Ingreso guardado.');
      await onSaved();
      const response = await uiFetch(`/api/captures/movements?id=${current.movement.id}`, { expectedUserId: userId, errorMode: 'inline' });
      setCurrent(await response.json());
    } catch (err) { setError(`${errorMessage(err)} Actualiza el aviso para comprobar su estado antes de volver a guardar.`); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}><DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl [&_[data-slot=dialog-close]]:size-11" onOpenAutoFocus={e => { e.preventDefault(); title.current?.focus(); }} onCloseAutoFocus={restoreFocus} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }} showCloseButton={!busy}>
    <DialogHeader><DialogTitle ref={title} tabIndex={-1}>Revisar ingreso</DialogTitle><DialogDescription>Confirma el dinero recibido y la cuenta donde se abonó.</DialogDescription></DialogHeader>
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {notice && <p role="status">{notice}</p>}
      <p className="text-sm text-muted-foreground">{captureReasons[current.movement.reason]}</p>
      {income?.isEstimated && <Alert><AlertDescription>Tu saldo ya incluye esta nómina estimada. Al confirmar el importe real se ajustará el mismo ingreso.</AlertDescription></Alert>}
      {!p.amount && open && <Alert><AlertDescription>El banco no informó el importe. Comprueba la cantidad recibida. La fecha propuesta corresponde al aviso en México.</AlertDescription></Alert>}
      {(open || income?.isEstimated) && <form onSubmit={form.handleSubmit(v => save(v))} className="flex flex-col gap-4"><FieldGroup>
        {open && (['accountId', 'incomeTypeId'] as const).map(name => <Field key={name} data-invalid={Boolean(form.formState.errors[name])}><FieldLabel htmlFor={`income-${name}`}>{name === 'accountId' ? 'Cuenta de destino' : 'Tipo de ingreso'}</FieldLabel><Controller name={name} control={form.control} render={({ field }) => <ResponsiveSelect id={`income-${name}`} className="min-h-11" value={field.value} onValueChange={field.onChange} disabled={busy} aria-invalid={Boolean(form.formState.errors[name])} options={(name === 'accountId' ? configuration.moneyAccounts.filter(a => a.kind === 'BANK') : configuration.incomeTypes || []).map(a => ({ value: a.id, label: a.name }))} />} /><FieldError errors={[form.formState.errors[name]]} /></Field>)}
        <Field data-invalid={Boolean(form.formState.errors.amount)}><FieldLabel htmlFor="income-amount">Importe recibido en MXN</FieldLabel><Input id="income-amount" type="number" formatNumber min="0.01" step="0.01" className="min-h-11" disabled={busy} readOnly={open && Boolean(p.amount)} aria-invalid={Boolean(form.formState.errors.amount)} {...form.register('amount')} /><FieldError errors={[form.formState.errors.amount]} /></Field>
        {open && <><Field><FieldLabel htmlFor="income-date">Fecha del abono</FieldLabel><Controller name="date" control={form.control} render={({ field }) => <DatePicker id="income-date" value={field.value} onChange={field.onChange} disabled={busy} className="min-h-11" />} /><FieldError errors={[form.formState.errors.date]} /></Field><Field><FieldLabel htmlFor="income-concept">Concepto</FieldLabel><Input id="income-concept" className="min-h-11" disabled={busy} {...form.register('concept')} /><FieldError errors={[form.formState.errors.concept]} /></Field></>}
        <Field orientation="horizontal"><Controller name="confirmedReceived" control={form.control} render={({ field }) => <Checkbox id="income-confirmed" checked={field.value} onCheckedChange={v => field.onChange(v === true)} disabled={busy} />} /><FieldLabel htmlFor="income-confirmed">Comprobé que recibí este importe en mi cuenta.</FieldLabel></Field><FieldError errors={[form.formState.errors.confirmedReceived]} />
        {open && <Field orientation="horizontal"><Controller name="distinct" control={form.control} render={({ field }) => <Checkbox id="income-distinct" checked={field.value} onCheckedChange={v => field.onChange(v === true)} disabled={busy} />} /><FieldLabel htmlFor="income-distinct">Es otro abono, aunque haya un ingreso parecido.</FieldLabel></Field>}
      </FieldGroup><Button className="min-h-11" disabled={busy}>{busy ? 'Guardando…' : income?.isEstimated ? 'Confirmar importe real' : 'Registrar ingreso'}</Button>
        {open && current.incomeDetail?.candidates.map(row => <Button key={row.id} type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={busy} onClick={form.handleSubmit(v => save(v, row.id))}>Vincular a {row.concept} · ${row.amount}</Button>)}
      </form>}
      {posting && !income && <p className="text-sm">El ingreso se eliminó. El aviso conserva su historial y no volverá a crearlo.</p>}
      {posting && <Button variant="outline" className="min-h-11" asChild><a href="/ingresos">Ver en Ingresos</a></Button>}
      <CaptureNotificationDetails movement={current.movement} />
    </div><DialogFooter><Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>Cerrar</Button></DialogFooter>
  </DialogContent></Dialog>;
}
