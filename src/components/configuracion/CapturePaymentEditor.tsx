"use client";
import { errorMessage } from "@/lib/uiTypes";
import type { CaptureAction, CaptureEditorProps } from "./captureUiTypes";

import CaptureNotificationDetails from "@/components/configuracion/CaptureNotificationDetails";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Spinner } from "@/components/ui/spinner";
import { getCyclePaymentAmounts } from "@/lib/calculations/cardCyclePayments";
import { uiFetch as apiFetch } from "@/lib/uiClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const schema = z.object({ cycleId: z.string().min(1, "Selecciona la tarjeta y el corte."),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Usa hasta dos decimales.").refine(value => Number(value) > 0, "El importe debe ser positivo."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona la fecha."), statementConcept: z.string().max(100),
});
const money = (value: unknown) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const month = (value: number) => new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, value - 1, 1)));

export default function CapturePaymentEditor({ detail, configuration, userId, onClose, onSaved, restoreFocus }: CaptureEditorProps) {
  const [current, setCurrent] = useState(detail), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Extract<CaptureAction, { payment: unknown }> | { action: "reversePayment"; payment?: never } | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const movement = current.movement, proposal = movement.proposal, payment = current.paymentDetail?.payment;
  const cycles = current.paymentDetail?.cycles || [];
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { cycleId: payment?.cycleId || "", amount: proposal.amount || "", date: proposal.date || "", statementConcept: proposal.statementConcept || "" } });
  const [selected, amount] = useWatch({ control: form.control, name: ["cycleId", "amount"] });
  const cycle = cycles.find(row => row.id === selected);
  const open = ["REVIEW", "OBSERVED"].includes(movement.status) && !payment;
  const label = (row: { cardId: string; month: number; year: number }) => `${configuration.cards.find(card => card.id === row.cardId)?.name || "Tarjeta"} · ${month(row.month)} ${row.year}`;
  async function reload() {
    const response = await apiFetch(`/api/captures/movements?id=${movement.id}`, { expectedUserId: userId, errorMode: "inline" });
    setCurrent(await response.json());
  }
  async function act() {
    if (busy || !confirmation) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch("/api/captures/movements", { method: "PATCH", expectedUserId: userId, errorMode: "inline", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: movement.id, ...confirmation }) });
      setConfirmation(null); setNotice("Cambio guardado.");
      await reload(); await onSaved();
    } catch (err) { setConfirmation(null); setError(`${errorMessage(err)} Puedes actualizar el aviso para comprobar el resultado.`); }
    finally { setBusy(false); }
  }
  function prepare(action: "registerPayment" | "linkPayment") {
    return form.handleSubmit(values => {
      const selectedCycle = cycles.find(row => row.id === values.cycleId);
      if (!selectedCycle) return;
      setConfirmation({ action, payment: { ...values, currency: "MXN", confirmedApplied: true, distinct: true,
        expectedPaidAmount: String(selectedCycle.paidAmount ?? 0), expectedPaidAt: selectedCycle.paidAt?.slice(0, 10) || null } });
    })();
  }
  return <><Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="flex [&_[data-slot=dialog-close]]:size-11 max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl" showCloseButton={!busy}
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={restoreFocus}
      onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>Pago de tarjeta</DialogTitle><DialogDescription>Confirma a qué tarjeta y estado de cuenta corresponde el aviso.</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {open ? <>
          <Alert><AlertDescription>{proposal.paymentEvidence === "SHARED_BANK_RECEIPT" ? "Comprueba la tarjeta de destino y el mes del estado de cuenta." : proposal.movementType === "ACCOUNT_DEBIT" ? "BBVA informa una salida de dinero. Regístrala solo si confirmaste que el pago llegó a tu tarjeta." : "El banco confirmó un pago recibido. Revisa la tarjeta, el importe y el estado de cuenta."} {proposal.dateSource === "BANK_OPERATION" ? "La fecha es la del comprobante." : "Usamos la fecha del aviso; corrígela si el banco indica otra."}</AlertDescription></Alert>
          <form onSubmit={event => { event.preventDefault(); void prepare("registerPayment"); }}>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.cycleId)}><FieldLabel htmlFor="payment-cycle">Tarjeta y estado de cuenta</FieldLabel>
                <Controller control={form.control} name="cycleId" render={({ field }) => <ResponsiveSelect className="min-h-11" id="payment-cycle" aria-label="Tarjeta y estado de cuenta" value={field.value} onValueChange={field.onChange} searchable disabled={busy}
                  aria-invalid={Boolean(form.formState.errors.cycleId)} options={cycles.map(row => ({ value: row.id, label: `${label(row)}${row.statementAmount == null ? " · Sin estado de cuenta" : ""}` }))} />} />
                <FieldError errors={[form.formState.errors.cycleId]} /></Field>
              <Field data-invalid={Boolean(form.formState.errors.amount)}><FieldLabel htmlFor="payment-amount">Importe pagado (MXN)</FieldLabel>
                <Controller control={form.control} name="amount" render={({ field }) => <Input className="min-h-11" {...field} id="payment-amount" type="number" formatNumber min="0.01" step="0.01" disabled={busy} aria-invalid={Boolean(form.formState.errors.amount)} />} />
                <FieldError errors={[form.formState.errors.amount]} /></Field>
              <Field data-invalid={Boolean(form.formState.errors.date)}><FieldLabel htmlFor="payment-date">Fecha del pago</FieldLabel>
                <Controller control={form.control} name="date" render={({ field }) => <DatePicker className="min-h-11" id="payment-date" value={field.value} onChange={field.onChange} disabled={busy} aria-label="Fecha del pago" />} />
                <FieldError errors={[form.formState.errors.date]} /></Field>
              <Field><FieldLabel htmlFor="payment-concept">Concepto de transferencia (opcional)</FieldLabel><Input className="min-h-11" id="payment-concept" disabled={busy} placeholder="estado de cuenta octubre" {...form.register("statementConcept")} />
                <FieldError errors={[form.formState.errors.statementConcept]} /></Field>
              {cycle && <Alert><AlertDescription>{cycle.statementAmount == null ? "Falta el estado de cuenta. Agrégalo en Tarjetas para registrar este pago." : `Pagado: ${money(cycle.paidAmount)}. Al sumar este pago: ${money((Math.round(Number(cycle.paidAmount || 0) * 100) + Math.round(Number(amount || 0) * 100)) / 100)}. Saldo pendiente actual: ${money(getCyclePaymentAmounts(cycle).pendingAmount)}.`}</AlertDescription></Alert>}
              <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy || cycle?.statementAmount == null}>Sumar este pago</Button>
                <Button className="min-h-11" type="button" variant="outline" disabled={busy || !Number(cycle?.paidAmount)} onClick={() => prepare("linkPayment")}>Ya lo había registrado</Button></div>
            </FieldGroup>
          </form>
        </> : payment ? <>
          <p>{label({ ...payment.cycle })} · {money(payment.amount)} · {payment.date.slice(0, 10)}</p>
          <p>{payment.reversedAt ? "Este pago se deshizo o desvinculó. El aviso no se aplicará de nuevo." : payment.kind === "CAPTURE" ? "Este pago se sumó al total pagado del estado de cuenta." : "Este pago ya estaba registrado. Se añadió la notificación sin volver a sumarlo."}</p>
          {!payment.reversedAt && <Button className="min-h-11 self-start" variant="outline" disabled={busy} onClick={() => setConfirmation({ action: "reversePayment" })}>{payment.kind === "CAPTURE" ? "Deshacer pago" : "Desvincular aviso"}</Button>}
        </> : <p>El aviso conserva su resolución.</p>}
        <CaptureNotificationDetails movement={movement}><Button variant="outline" className="min-h-11" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await reload(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }}>Actualizar</Button></CaptureNotificationDetails>
      </div>
      <DialogFooter><Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>Cerrar</Button></DialogFooter>
    </DialogContent>
  </Dialog><AlertDialog open={Boolean(confirmation)} onOpenChange={value => { if (!value && !busy) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader>
    <AlertDialogTitle>{confirmation?.action === "reversePayment" ? "Deshacer este pago" : confirmation?.action === "linkPayment" ? "Vincular al pago registrado" : "Sumar pago al estado de cuenta"}</AlertDialogTitle>
    <AlertDialogDescription>{confirmation?.action === "reversePayment" ? (payment?.kind === "CAPTURE" ? `Se restarán ${money(payment?.amount)} del total pagado. El aviso conservará su historial.` : "Se retirará el vínculo con el pago existente. El total pagado no cambiará.")
      : `${cycle ? label(cycle) : ""}: ${money(confirmation?.payment?.amount)} el ${confirmation?.payment?.date}. ${confirmation?.action === "linkPayment" ? "El aviso se vinculará al pago que ya registraste. El total pagado no cambiará." : "Confirma que el banco ya recibió este pago y que aún no lo registraste. Se sumará al total pagado."}`}</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void act(); }}>{busy && <Spinner />}{confirmation?.action === "linkPayment" ? "Vincular aviso" : confirmation?.action === "reversePayment" ? "Deshacer" : "Sumar pago"}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog></>;
}
