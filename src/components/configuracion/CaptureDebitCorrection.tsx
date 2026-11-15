"use client";
import type { CaptureConfiguration, CaptureDetail } from "@/lib/uiTypes";
import { errorMessage } from "@/lib/uiTypes";

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Spinner } from '@/components/ui/spinner';
import { uiFetch as apiFetch } from "@/lib/uiClient";
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { moneyInputSchema } from '@/lib/financialValidation';

const correctionKind = z.enum(['WITHDRAWAL', 'TRANSFER', 'CARD_PAYMENT']);
const formatMoney = (amount: string | number) => Number(amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export default function CaptureDebitCorrection({ detail, accounts, userId, busy, setBusy, onSaved, onCancel }: { detail: CaptureDetail; accounts: CaptureConfiguration['moneyAccounts']; userId: string; busy: boolean; setBusy: (busy: boolean) => void; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [error, setError] = useState('');
  const posting = detail.moneyDetail!.posting!;
  const total = Number(posting.snapshot.amount), money = formatMoney(total);
  const schema = z.object({ kind: correctionKind, destination: z.string().min(1, 'Selecciona la cuenta o el corte de destino.'), cashAmount: z.string() }).superRefine((values, ctx) => {
    if (values.kind === 'WITHDRAWAL' && (!moneyInputSchema.safeParse(values.cashAmount).success || Number(values.cashAmount) <= 0 || Math.round(Number(values.cashAmount) * 100) > Math.round(total * 100))) ctx.addIssue({ code: 'custom', path: ['cashAmount'], message: 'Indica el efectivo recibido, mayor que cero y hasta el total descontado.' });
  });
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { kind: 'WITHDRAWAL', destination: '', cashAmount: String(posting.snapshot.amount) } });
  const [kind, destination, cashAmount] = useWatch({ control: form.control, name: ['kind', 'destination', 'cashAmount'] });
  const cashError = form.formState.errors.cashAmount, destinationError = form.formState.errors.destination;
  const options = kind === 'TRANSFER'
    ? accounts.filter(a => a.id !== posting.snapshot.fromAccountId).map(a => ({ value: a.id, label: a.name }))
    : kind === 'WITHDRAWAL' ? accounts.filter(a => a.kind === 'CASH' && a.id !== posting.snapshot.fromAccountId).map(a => ({ value: a.id, label: a.name }))
      : (detail.moneyDetail!.cycles || []).map(c => ({ value: c.id, label: `${c.card.name} · ${String(c.month).padStart(2, '0')}/${c.year}` }));
  const validCash = moneyInputSchema.safeParse(cashAmount).success && Number(cashAmount) > 0 && Math.round(Number(cashAmount) * 100) <= Math.round(total * 100);
  const effect = kind === 'WITHDRAWAL' ? destination && validCash ? `Se sumarán ${formatMoney(cashAmount)} a ${accounts.find(a => a.id === destination)?.name}. La comisión será de ${formatMoney((Math.round(total * 100) - Math.round(Number(cashAmount) * 100)) / 100)}.` : 'Elige dónde guardar el efectivo e indica cuánto recibiste.' : kind === 'TRANSFER' ? 'Se sumará el mismo importe a tu cuenta de destino.' : 'Se aplicará como abono al corte de la tarjeta que elijas.';
  async function save(values: z.input<typeof schema>) {
    setBusy(true); setError('');
    let saved = false;
    try {
      await apiFetch('/api/captures/movements', { method: 'PATCH', expectedUserId: userId, errorMode: 'inline', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: detail.movement.id, action: 'correctDebitType', correction: { kind: values.kind, ...(values.kind === 'TRANSFER' ? { toAccountId: values.destination } : values.kind === 'CARD_PAYMENT' ? { cycleId: values.destination } : { cashAccountId: values.destination, cashAmount: values.cashAmount }) } }) });
      saved = true;
      await onSaved();
    } catch (e) { setError(saved ? 'La corrección se guardó, pero no se pudo actualizar la vista. Cierra y vuelve a abrir el movimiento.' : errorMessage(e)); } finally { setBusy(false); }
  }
  return <form className="flex flex-col gap-4 rounded-lg border p-4" onSubmit={form.handleSubmit(save)}>
    <h3 className="text-sm font-semibold">Cambiar tipo de movimiento</h3>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <FieldGroup>
      <Field><FieldLabel htmlFor="debit-correction-kind">Qué hiciste</FieldLabel><ResponsiveSelect id="debit-correction-kind" className="min-h-11" value={kind} onValueChange={v => { form.setValue('kind', correctionKind.parse(v)); form.setValue('destination', ''); form.clearErrors(); setError(''); }} disabled={busy} options={[{ value: 'WITHDRAWAL', label: 'Retiro de efectivo' }, { value: 'TRANSFER', label: 'Transferencia entre mis cuentas' }, { value: 'CARD_PAYMENT', label: 'Pago de tarjeta de crédito' }]} /></Field>
      <Field data-invalid={Boolean(destinationError)}><FieldLabel htmlFor="debit-correction-destination">{kind === 'WITHDRAWAL' ? 'Cuenta que recibe el efectivo' : kind === 'TRANSFER' ? 'Mi cuenta de destino' : 'Tarjeta y corte que pagaste'}</FieldLabel><ResponsiveSelect id="debit-correction-destination" className="min-h-11" value={destination} onValueChange={v => form.setValue('destination', v, { shouldValidate: true })} disabled={busy} options={options} aria-invalid={Boolean(destinationError)} />{!options.length && <FieldDescription>{kind === 'WITHDRAWAL' ? 'Agrega una cuenta de tipo Efectivo desde Mi dinero para recibir el retiro.' : kind === 'TRANSFER' ? 'Agrega otra cuenta desde Mi dinero para transferir entre tus cuentas.' : 'No hay cortes con saldo pendiente. Revisa el estado de cuenta en Tarjetas.'}</FieldDescription>}{destinationError && <FieldError errors={[destinationError]} />}</Field>
      {kind === 'WITHDRAWAL' && <Field data-invalid={Boolean(cashError)}><FieldLabel htmlFor="debit-correction-cash">Efectivo recibido</FieldLabel><Input id="debit-correction-cash" className="min-h-11" type="number" formatNumber min="0.01" max={total} step="0.01" disabled={busy} aria-invalid={Boolean(cashError)} {...form.register('cashAmount')} value={cashAmount} /><FieldDescription>El total descontado fue {money}. Si incluye comisión, escribe solo el efectivo que recibiste.</FieldDescription>{cashError && <FieldError errors={[cashError]} />}</Field>}
    </FieldGroup>
    <Alert><AlertDescription>El gasto de {money} se sustituirá. {effect} La salida de {posting.snapshot.fromName} seguirá siendo de {money}, una sola vez.</AlertDescription></Alert>
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onCancel}>Conservar gasto</Button><Button type="submit" className="min-h-11" disabled={busy || !destination || !options.some(option => option.value === destination)}>{busy && <Spinner />}Sustituir gasto</Button></div>
  </form>;
}
