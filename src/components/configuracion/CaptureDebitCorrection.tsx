"use client";
import type { CaptureDetail, NamedRecord } from "@/lib/uiTypes";
import { errorMessage } from "@/lib/uiTypes";

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Spinner } from '@/components/ui/spinner';
import { uiFetch as apiFetch } from "@/lib/uiClient";
import type * as React from "react";
import { useState } from 'react';

export default function CaptureDebitCorrection({ detail, accounts, userId, busy, setBusy, onSaved, onCancel }: { detail: CaptureDetail; accounts: NamedRecord[]; userId: string; busy: boolean; setBusy: (busy: boolean) => void; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [kind, setKind] = useState('WITHDRAWAL'), [destination, setDestination] = useState(''), [error, setError] = useState('');
  const posting = detail.moneyDetail!.posting!;
  const money = Number(posting.snapshot.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  const options = kind === 'TRANSFER'
    ? accounts.filter(a => a.id !== posting.snapshot.fromAccountId).map(a => ({ value: a.id, label: a.name }))
    : (detail.moneyDetail!.cycles || []).map(c => ({ value: c.id, label: `${c.card.name} · ${String(c.month).padStart(2, '0')}/${c.year}` }));
  const effect = kind === 'WITHDRAWAL' ? 'Quedará registrado como retiro de efectivo.' : kind === 'TRANSFER' ? 'Se sumará el mismo importe a tu cuenta de destino.' : 'Se aplicará como abono al corte de la tarjeta que elijas.';
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await apiFetch('/api/captures/movements', { method: 'PATCH', expectedUserId: userId, errorMode: 'inline', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: detail.movement.id, action: 'correctDebitType', correction: { kind, ...(kind === 'TRANSFER' ? { toAccountId: destination } : kind === 'CARD_PAYMENT' ? { cycleId: destination } : {}) } }) });
      await onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <form className="flex flex-col gap-4 rounded-lg border p-4" onSubmit={save}>
    <h3 className="text-sm font-semibold">Cambiar tipo de movimiento</h3>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <FieldGroup>
      <Field><FieldLabel htmlFor="debit-correction-kind">Qué hiciste</FieldLabel><ResponsiveSelect id="debit-correction-kind" className="min-h-11" value={kind} onValueChange={v => { setKind(v); setDestination(''); setError(''); }} disabled={busy} options={[{ value: 'WITHDRAWAL', label: 'Retiro de efectivo' }, { value: 'TRANSFER', label: 'Transferencia entre mis cuentas' }, { value: 'CARD_PAYMENT', label: 'Pago de tarjeta de crédito' }]} /></Field>
      {kind !== 'WITHDRAWAL' && <Field><FieldLabel htmlFor="debit-correction-destination">{kind === 'TRANSFER' ? 'Mi cuenta de destino' : 'Tarjeta y corte que pagaste'}</FieldLabel><ResponsiveSelect id="debit-correction-destination" className="min-h-11" value={destination} onValueChange={setDestination} disabled={busy} options={options} />{!options.length && <p className="text-sm text-muted-foreground">{kind === 'TRANSFER' ? 'Agrega otra cuenta desde Mi dinero para transferir entre tus cuentas.' : 'No hay cortes con saldo pendiente. Revisa el estado de cuenta en Tarjetas.'}</p>}</Field>}
    </FieldGroup>
    <Alert><AlertDescription>El gasto de {money} se sustituirá. {effect} La salida de {posting.snapshot.fromName} seguirá siendo de {money}, una sola vez.</AlertDescription></Alert>
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onCancel}>Conservar gasto</Button><Button type="submit" className="min-h-11" disabled={busy || (kind !== 'WITHDRAWAL' && !destination)}>{busy && <Spinner />}Sustituir gasto</Button></div>
  </form>;
}
