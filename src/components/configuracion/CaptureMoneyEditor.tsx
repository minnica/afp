"use client";
import { errorMessage } from "@/lib/uiTypes";
import type { CaptureEditorProps } from "./captureUiTypes";

import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Spinner } from '@/components/ui/spinner';
import { accountDebitNotice } from '@/lib/captureMoneyParsers';
import { captureReasons } from '@/lib/capturePresentation';
import { uiFetch as apiFetch } from "@/lib/uiClient";
import Link from 'next/link';
import { useRef, useState } from 'react';
import CaptureDebitCorrection from './CaptureDebitCorrection';
import CaptureNotificationDetails from './CaptureNotificationDetails';
import CapturePaymentEditor from './CapturePaymentEditor';
const money = (v: unknown) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
export default function CaptureMoneyEditor({ detail, configuration, userId, onClose, onSaved, restoreFocus }: CaptureEditorProps) {
  const [current, setCurrent] = useState(detail), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmation, setConfirmation] = useState<boolean | null>(null), [paymentView, setPaymentView] = useState(false), [correcting, setCorrecting] = useState(false);
  const p = current.movement.proposal, posting = current.moneyDetail?.posting;
  const generic = accountDebitNotice(current.movement), accounts = configuration.moneyAccounts || [];
  const [kind, setKind] = useState(p.movementType === 'MONEY_TRANSFER' ? 'TRANSFER' : generic ? 'DEBIT_EXPENSE' : 'WITHDRAWAL');
  const [from, setFrom] = useState(p.fromAccountId || ''), [to, setTo] = useState(p.toAccountId || ''), [categoryId, setCategoryId] = useState('none');
  const [concept, setConcept] = useState(generic ? 'Cargo BBVA' : p.merchant || 'Retiro de efectivo'), [distinct, setDistinct] = useState(false);
  const title = useRef<HTMLHeadingElement | null>(null), open = ['REVIEW', 'OBSERVED'].includes(current.movement.status) && !posting;
  const name = (id: string) => accounts.find(a => a.id === id)?.name || 'Cuenta por identificar';
  async function save() {
    setBusy(true); setError('');
    try {
      await apiFetch('/api/captures/movements', { method: 'PATCH', expectedUserId: userId, errorMode: 'inline', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current.movement.id,
        action: kind === 'TRANSFER' ? 'registerMoneyTransfer' : kind === 'WITHDRAWAL' ? 'registerMoneyWithdrawal' : 'registerDebitExpense',
        money: { fromAccountId: from, ...(kind === 'TRANSFER' ? { toAccountId: to } : {}), amount: p.amount, date: p.date, concept, currency: 'MXN', distinct, ...(categoryId !== 'none' && kind === 'DEBIT_EXPENSE' ? { categoryId } : {}) } }) });
      setConfirmation(null); await onSaved();
      const r = await apiFetch(`/api/captures/movements?id=${current.movement.id}`, { expectedUserId: userId, errorMode: 'inline' }); setCurrent(await r.json());
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  if (paymentView) return <CapturePaymentEditor detail={current} configuration={configuration} userId={userId} onSaved={onSaved} onClose={onClose} restoreFocus={restoreFocus} />;
  const effect = kind === 'TRANSFER' ? `${name(from)}: −${money(p.amount)}. ${name(to)}: +${money(p.amount)}. El total de tu dinero se conserva.` : kind === 'DEBIT_EXPENSE' ? `Se registrará un gasto con débito y se descontarán ${money(p.amount)} de ${name(from)}.` : `Se descontarán ${money(p.amount)} de ${name(from)} como retiro. No se creará una compra ni un pago de tarjeta.`;
  return <><Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}><DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl [&_[data-slot=dialog-close]]:size-11" showCloseButton={!busy} onCloseAutoFocus={restoreFocus} onOpenAutoFocus={e => { e.preventDefault(); title.current?.focus(); }} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }}>
    <DialogHeader><DialogTitle ref={title} tabIndex={-1}>{posting ? 'Movimiento registrado' : generic ? 'Identificar salida de BBVA' : kind === 'TRANSFER' ? 'Transferencia entre mis cuentas' : 'Retiro de efectivo'}</DialogTitle><DialogDescription>{p.amount ? money(p.amount) : 'Importe por identificar'} · {p.date || 'Fecha por identificar'}</DialogDescription></DialogHeader>
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <p className="text-sm text-muted-foreground">{captureReasons[current.movement.reason] || 'Revisa qué movimiento hizo el banco antes de registrarlo.'}</p>
      {open ? <form id="capture-money-form" className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); setConfirmation(true); }}><FieldGroup>
        {generic && <><Alert><AlertDescription>Este aviso no indica destinatario ni tipo de operación. La decisión se aplica solo a este aviso.</AlertDescription></Alert><Field><FieldLabel htmlFor="money-kind">Qué hiciste</FieldLabel><ResponsiveSelect className="min-h-11" id="money-kind" value={kind} onValueChange={setKind} disabled={busy} options={[{ value: 'DEBIT_EXPENSE', label: 'Compra o transferencia para pagar un gasto' }, { value: 'WITHDRAWAL', label: 'Retiro de efectivo' }]} /></Field></>}
        <Field><FieldLabel htmlFor="money-from">Cuenta de salida</FieldLabel><ResponsiveSelect className="min-h-11" id="money-from" value={from} onValueChange={setFrom} disabled={busy} options={accounts.map(a => ({ value: a.id, label: a.name }))} /></Field>
        {kind === 'TRANSFER' && <Field><FieldLabel htmlFor="money-to">Mi cuenta de destino</FieldLabel><ResponsiveSelect className="min-h-11" id="money-to" value={to} onValueChange={setTo} disabled={busy} options={accounts.filter(a => a.id !== from).map(a => ({ value: a.id, label: a.name }))} /></Field>}
        <Field><FieldLabel htmlFor="money-concept">Concepto</FieldLabel><Input className="min-h-11" id="money-concept" value={concept} onChange={e => setConcept(e.target.value)} maxLength={160} disabled={busy} required /></Field>
        {kind === 'DEBIT_EXPENSE' && <Field><FieldLabel htmlFor="money-category">Categoría</FieldLabel><ResponsiveSelect className="min-h-11" id="money-category" value={categoryId} onValueChange={setCategoryId} disabled={busy} options={[{ value: 'none', label: 'Por clasificar' }, ...configuration.categories.filter(a => a.name !== 'Por clasificar').map(a => ({ value: a.id, label: a.name }))]} /></Field>}
        <p className="text-xs text-muted-foreground">La fecha procede del aviso, en hora de México. La moneda MXN y las cuentas las confirmas al registrar.</p>
        <Field orientation="horizontal"><Checkbox id="money-distinct" checked={distinct} onCheckedChange={v => setDistinct(v === true)} disabled={busy} /><FieldLabel htmlFor="money-distinct" className="min-h-11">Es otro movimiento aunque coincida con uno registrado</FieldLabel></Field>
        <Alert><AlertDescription>{effect}</AlertDescription></Alert>
      </FieldGroup></form> : posting ? <div className="flex flex-col gap-2 text-sm"><p>{posting.snapshot.fromName}{posting.snapshot.toName && ` → ${posting.snapshot.toName}`}</p><p>{posting.kind === 'DEBIT_EXPENSE' && !posting.expense ? 'El gasto fue eliminado. Este aviso no volverá a crearlo.' : posting.transfer?.reversedAt || posting.withdrawal?.reversedAt || posting.cardPayment?.reversedAt ? 'El movimiento fue revertido. Su historial se conserva.' : posting.kind === 'CARD_PAYMENT' && !posting.cardPayment ? 'El pago fue eliminado. El aviso conserva su historial.' : 'Se aplicó una sola vez. Puedes revisar el registro y su efecto en Mi dinero.'}</p><Button variant="outline" className="min-h-11 self-start" asChild><Link href={posting.kind === 'DEBIT_EXPENSE' ? '/gastos' : '/mi-dinero'}>{posting.kind === 'DEBIT_EXPENSE' ? 'Ver gastos' : 'Ver Mi dinero'}</Link></Button></div> : <p className="text-sm">Este aviso conserva su resolución.</p>}
      {generic && posting?.kind === 'DEBIT_EXPENSE' && posting.expense && (correcting ? <CaptureDebitCorrection detail={current} accounts={accounts} userId={userId} busy={busy} setBusy={setBusy} onCancel={() => setCorrecting(false)} onSaved={async () => { await onSaved(); const r = await apiFetch(`/api/captures/movements?id=${current.movement.id}`, { expectedUserId: userId, errorMode: 'inline' }); setCurrent(await r.json()); setCorrecting(false); }} /> : <Button className="min-h-11 self-start" variant="outline" onClick={() => setCorrecting(true)}>Cambiar tipo de movimiento</Button>)}
      {generic && open && <Button className="min-h-11 self-start" variant="outline" onClick={() => setPaymentView(true)}>Fue un pago de tarjeta</Button>}
      <CaptureNotificationDetails movement={current.movement} />
    </div><DialogFooter><Button className="min-h-11" variant="outline" disabled={busy} onClick={onClose}>Cerrar</Button>{open && <Button className="min-h-11" form="capture-money-form" type="submit" disabled={busy || !from || (kind === 'TRANSFER' && (!to || to === from)) || !p.amount || !p.date}>Revisar y registrar</Button>}</DialogFooter>
  </DialogContent></Dialog><AlertDialog open={!!confirmation} onOpenChange={v => { if (!v && !busy) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar movimiento</AlertDialogTitle><AlertDialogDescription>{effect}</AlertDialogDescription></AlertDialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={busy} onClick={e => { e.preventDefault(); void save(); }}>{busy && <Spinner />}Registrar movimiento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
