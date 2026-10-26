"use client";
import { useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Item, ItemGroup, ItemContent, ItemTitle, ItemDescription } from '@/components/ui/item';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
export default function CaptureMoneySettings({ configuration, userId, refresh, restoreFocus }) {
  const accounts = configuration.moneyAccounts || [], [kind, setKind] = useState('NU_TRANSFER');
  const policy = configuration.moneyPolicies?.find(p => p.kind === kind);
  const [sample, setSample] = useState("none");
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [label, setLabel] = useState('BBVA DEBITO'), [suffix, setSuffix] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [confirmation, setConfirmation] = useState(null);
  const options = accounts.map(a => ({ value: a.id, label: a.name }));
  function chooseKind(value) { setSample('none'); setKind(value); setFrom(''); setTo(''); setSuffix(''); }
  async function perform() {
    setBusy(true); setError('');
    try { await apiFetch('/api/captures/configuration', { method: 'PATCH', expectedUserId: userId, errorMode: 'inline', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(confirmation) }); setNotice('Regla guardada. Se aplicará a avisos nuevos.'); setConfirmation(null); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="flex max-w-2xl flex-col gap-5" aria-label="Captura de cuentas"><h3 className="text-base font-semibold">Transferencias y retiros</h3><p className="text-sm text-muted-foreground">Las transferencias entre tus cuentas conservan el total de tu dinero. Los gastos con débito y retiros descuentan de la cuenta de salida.</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <Field><FieldLabel htmlFor="money-policy-kind">Tipo de aviso</FieldLabel><ResponsiveSelect className="min-h-11" id="money-policy-kind" value={kind} onValueChange={chooseKind} options={[{ value: 'NU_TRANSFER', label: 'Nu · Transferencia exitosa' }, { value: 'BBVA_WITHDRAWAL', label: 'BBVA · Retiro de efectivo' }]} /></Field>
    {policy && <ItemGroup><Item role="listitem" variant="outline"><ItemContent><ItemTitle>Regla actual <Badge variant="secondary">{policy.mode === 'AUTOMATIC' ? 'Activa' : 'Solo revisión'}</Badge></ItemTitle><ItemDescription className="line-clamp-none">{accounts.find(a => a.id === policy.fromAccountId)?.name}{policy.toAccountId && ` → ${accounts.find(a => a.id === policy.toAccountId)?.name}`} · MXN · fecha del aviso</ItemDescription></ItemContent><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: 'moneyPolicy', kind: policy.kind, fromAccountId: policy.fromAccountId, toAccountId: policy.toAccountId, destinationLabel: policy.destinationLabel, accountLast4: policy.accountLast4, verifiedMovementId: policy.verifiedMovementId, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: policy.mode === 'AUTOMATIC' ? 'OBSERVATION' : 'AUTOMATIC' })}>{policy.mode === 'AUTOMATIC' ? 'Pausar regla' : 'Activar regla'}</Button></Item></ItemGroup>}
    {kind === 'BBVA_WITHDRAWAL' && <Alert><AlertDescription>Primero necesitas un aviso real que indique retiro, importe y cuenta. El cargo genérico de BBVA seguirá por revisar. Puedes registrar un retiro sin aviso desde Mi dinero.</AlertDescription></Alert>}
    <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); setConfirmation({ action: 'moneyPolicy', kind, fromAccountId: from, ...(kind === 'NU_TRANSFER' ? { toAccountId: to } : { accountLast4: suffix, ...(sample !== 'none' ? { verifiedMovementId: sample } : {}) }), destinationLabel: kind === 'NU_TRANSFER' ? label : '', currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: kind === 'NU_TRANSFER' || sample !== 'none' ? 'AUTOMATIC' : 'OBSERVATION' }); }}><FieldGroup>
      <Field><FieldLabel htmlFor="money-policy-from">Cuenta de salida</FieldLabel><ResponsiveSelect className="min-h-11" id="money-policy-from" value={from} onValueChange={setFrom} disabled={busy} options={options} /></Field>
      {kind === 'NU_TRANSFER' ? <><Field><FieldLabel htmlFor="money-policy-label">Destino tal como aparece en Nu</FieldLabel><Input className="min-h-11" id="money-policy-label" value={label} onChange={e => setLabel(e.target.value)} required maxLength={160} disabled={busy} /></Field><Field><FieldLabel htmlFor="money-policy-to">Mi cuenta de destino</FieldLabel><ResponsiveSelect className="min-h-11" id="money-policy-to" value={to} onValueChange={setTo} disabled={busy} options={options.filter(a => a.value !== from)} /></Field></> : <Field><FieldLabel htmlFor="money-policy-suffix">Últimas cuatro cifras de la cuenta BBVA</FieldLabel><Input className="min-h-11" id="money-policy-suffix" value={suffix} onChange={e => setSuffix(e.target.value)} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required disabled={busy} /></Field>}
      {kind === 'BBVA_WITHDRAWAL' && <Field><FieldLabel htmlFor="money-policy-sample">Aviso real que comprobaste</FieldLabel><ResponsiveSelect className="min-h-11" id="money-policy-sample" value={sample} onValueChange={setSample} disabled={busy} options={[{ value: 'none', label: 'Todavía sin muestra: guardar para revisión' }, ...(configuration.moneyWithdrawalSamples || []).filter(s => s.moneyPosting.snapshot.fromAccountId === from && s.proposal.accountLast4 === suffix && !s.moneyPosting.withdrawal?.reversedAt).map(s => ({ value: s.id, label: `${s.proposal.date} · $${Number(s.proposal.amount).toFixed(2)}` }))]} /></Field>}
      <Button className="min-h-11 self-start" disabled={busy || !from || (kind === 'NU_TRANSFER' && (!to || to === from))}>Revisar regla</Button>
    </FieldGroup></form>
    <p className="text-sm text-muted-foreground">Los cargos genéricos de BBVA se clasifican uno por uno. Guardar una regla no aplica avisos anteriores.</p>
    <AlertDialog open={!!confirmation} onOpenChange={v => { if (!v && !busy) setConfirmation(null); }}><AlertDialogContent onCloseAutoFocus={restoreFocus}><AlertDialogHeader><AlertDialogTitle>Confirmar regla de cuentas</AlertDialogTitle><AlertDialogDescription>{confirmation?.mode === 'OBSERVATION' ? 'Los avisos nuevos quedarán por revisar. Los movimientos ya registrados se conservan.' : 'Confirmas que estas cuentas son tuyas, que el movimiento está en MXN y que se usará la fecha del aviso en hora de México. Cada aviso compatible nuevo se aplicará una sola vez; las coincidencias dudosas quedarán por revisar.'}</AlertDialogDescription></AlertDialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy} className="min-h-11">Cancelar</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={busy} onClick={e => { e.preventDefault(); void perform(); }}>{busy ? 'Guardando…' : 'Guardar regla'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
