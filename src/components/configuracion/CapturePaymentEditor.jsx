"use client";
import { useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch } from "@/lib/apiFetch";
import { captureSources } from "@/lib/capturePresentation";
import { getCyclePaymentState } from "@/lib/calculations/cardCyclePayments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const schema = z.object({ cycleId: z.string().min(1, "Selecciona la tarjeta y el corte."),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Usa hasta dos decimales.").refine(value => Number(value) > 0, "El importe debe ser positivo."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona la fecha."), statementConcept: z.string().max(100),
});
const money = value => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const month = value => new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, value - 1, 1)));

export default function CapturePaymentEditor({ detail, configuration, userId, onClose, onSaved, restoreFocus }) {
  const [current, setCurrent] = useState(detail), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const titleRef = useRef(null);
  const movement = current.movement, proposal = movement.proposal, payment = current.paymentDetail?.payment;
  const cycles = current.paymentDetail?.cycles || [];
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { cycleId: payment?.cycleId || "", amount: proposal.amount || "", date: proposal.date || "", statementConcept: proposal.statementConcept || "" } });
  const [selected, amount] = useWatch({ control: form.control, name: ["cycleId", "amount"] });
  const cycle = cycles.find(row => row.id === selected);
  const open = ["REVIEW", "OBSERVED"].includes(movement.status) && !payment;
  const label = row => `${configuration.cards.find(card => card.id === row.cardId)?.name || "Tarjeta"} · ${month(row.month)} ${row.year}`;
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
    } catch (err) { setConfirmation(null); setError(`${err.message} Puedes actualizar el aviso para comprobar el resultado.`); }
    finally { setBusy(false); }
  }
  function prepare(action) {
    return form.handleSubmit(values => {
      const selectedCycle = cycles.find(row => row.id === values.cycleId);
      if (!selectedCycle) return;
      setConfirmation({ action, payment: { ...values, currency: "MXN", confirmedApplied: true, distinct: true,
        expectedPaidAmount: String(selectedCycle.paidAmount ?? 0), expectedPaidAt: selectedCycle.paidAt?.slice(0, 10) || null } });
    })();
  }
  return <><Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl" showCloseButton={!busy}
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={restoreFocus}
      onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>Pago de tarjeta</DialogTitle><DialogDescription>Confirma a qué tarjeta y estado de cuenta corresponde el aviso.</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div role="status">{notice}</div>
        <ItemGroup>{movement.events.map(event => <Item key={event.id} role="listitem"><ItemContent><ItemTitle>{captureSources[event.sourcePackage]}</ItemTitle>
          <ItemDescription>{new Date(event.postedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · hora de México</ItemDescription>
          <p className="whitespace-pre-wrap break-words text-sm">{[...new Set(Object.values(event.fields))].join("\n")}</p>
        </ItemContent></Item>)}</ItemGroup>
        {open ? <>
          <Alert><AlertDescription>{proposal.paymentEvidence === "SHARED_BANK_RECEIPT" ? "Revisa el destino y el mes del concepto del comprobante. Puedes corregir el corte si escribiste otro mes al transferir." : proposal.movementType === "ACCOUNT_DEBIT" ? "BBVA solo informa la salida de dinero. Comprueba el destinatario y que el pago ya se aplicó a la tarjeta antes de registrarlo." : "Nu confirma un pago recibido. Revisa la tarjeta, el importe en MXN y el corte; el aviso no los identifica todos."} {proposal.dateSource === "BANK_OPERATION" ? "La fecha procede del comprobante bancario." : "La fecha propuesta es la publicación del aviso en México; corrígela si el banco indica otra."}</AlertDescription></Alert>
          <form onSubmit={event => { event.preventDefault(); void prepare("registerPayment"); }}>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.cycleId)}><FieldLabel htmlFor="payment-cycle">Tarjeta y corte</FieldLabel>
                <Controller control={form.control} name="cycleId" render={({ field }) => <ResponsiveSelect id="payment-cycle" aria-label="Tarjeta y corte" value={field.value} onValueChange={field.onChange} searchable disabled={busy}
                  aria-invalid={Boolean(form.formState.errors.cycleId)} options={cycles.map(row => ({ value: row.id, label: `${label(row)}${row.statementAmount == null ? " · Sin estado de cuenta" : ""}` }))} />} />
                <FieldError errors={[form.formState.errors.cycleId]} /></Field>
              <Field data-invalid={Boolean(form.formState.errors.amount)}><FieldLabel htmlFor="payment-amount">Importe del abono en MXN</FieldLabel>
                <Controller control={form.control} name="amount" render={({ field }) => <Input {...field} id="payment-amount" type="number" formatNumber min="0.01" step="0.01" disabled={busy} aria-invalid={Boolean(form.formState.errors.amount)} />} />
                <FieldError errors={[form.formState.errors.amount]} /></Field>
              <Field data-invalid={Boolean(form.formState.errors.date)}><FieldLabel htmlFor="payment-date">Fecha del pago</FieldLabel>
                <Controller control={form.control} name="date" render={({ field }) => <DatePicker id="payment-date" value={field.value} onChange={field.onChange} disabled={busy} aria-label="Fecha del pago" />} />
                <FieldError errors={[form.formState.errors.date]} /></Field>
              <Field><FieldLabel htmlFor="payment-concept">Concepto de transferencia (opcional)</FieldLabel><Input id="payment-concept" disabled={busy} placeholder="estado de cuenta octubre" {...form.register("statementConcept")} />
                <FieldError errors={[form.formState.errors.statementConcept]} /></Field>
              {cycle && <Alert><AlertDescription>{cycle.statementAmount == null ? "Captura primero el estado de cuenta en Tarjetas." : `Total pagado: ${money(cycle.paidAmount)}. Con este nuevo abono: ${money((Math.round(Number(cycle.paidAmount || 0) * 100) + Math.round(Number(amount || 0) * 100)) / 100)}. Pendiente actual: ${money(getCyclePaymentState(cycle).pendingAmount)}.`}</AlertDescription></Alert>}
              <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy || cycle?.statementAmount == null}>Registrar nuevo abono</Button>
                <Button className="min-h-11" type="button" variant="outline" disabled={busy || !Number(cycle?.paidAmount)} onClick={() => prepare("linkPayment")}>Ya está incluido en el total</Button></div>
            </FieldGroup>
          </form>
        </> : payment ? <>
          <p>{label({ ...payment.cycle })} · {money(payment.amount)} · {payment.date.slice(0, 10)}</p>
          <p>{payment.reversedAt ? "Este pago se deshizo o desvinculó. El aviso conserva su historial y no se volverá a aplicar." : payment.kind === "CAPTURE" ? "Este abono se sumó al total pagado del corte." : "Este pago ya estaba incluido en el total. Solo se vinculó su evidencia."}</p>
          {!payment.reversedAt && <Button className="min-h-11 self-start" variant="outline" disabled={busy} onClick={() => setConfirmation({ action: "reversePayment" })}>{payment.kind === "CAPTURE" ? "Deshacer este abono" : "Desvincular evidencia"}</Button>}
        </> : <p>El aviso conserva su resolución.</p>}
      </div>
      <DialogFooter><Button variant="outline" className="min-h-11" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await reload(); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>Actualizar aviso</Button><Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>Cerrar</Button></DialogFooter>
    </DialogContent>
  </Dialog><AlertDialog open={Boolean(confirmation)} onOpenChange={value => { if (!value && !busy) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader>
    <AlertDialogTitle>{confirmation?.action === "reversePayment" ? "Deshacer la resolución" : confirmation?.action === "linkPayment" ? "Vincular al total existente" : "Confirmar otro abono aplicado"}</AlertDialogTitle>
    <AlertDialogDescription>{confirmation?.action === "reversePayment" ? (payment?.kind === "CAPTURE" ? `Se restarán ${money(payment?.amount)} del total pagado. El aviso conservará su historial.` : "Se retirará el vínculo con el pago existente. El total pagado no cambiará.")
      : `${cycle ? label(cycle) : ""}: ${money(confirmation?.payment?.amount)} el ${confirmation?.payment?.date}. ${confirmation?.action === "linkPayment" ? "Confirmas que este pago ya está incluido en el total registrado. No se sumará otra vez." : "Confirmas que el banco ya aplicó este pago y que es un abono adicional, distinto de los ya registrados. Se sumará al total del corte."}`}</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void act(); }}>{busy && <Spinner />}Confirmar</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog></>;
}
