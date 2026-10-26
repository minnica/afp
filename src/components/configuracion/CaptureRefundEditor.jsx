"use client";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { captureReasons, captureSources } from "@/lib/capturePresentation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value));

export default function CaptureRefundEditor({ detail, configuration, userId, onClose, onSaved, restoreFocus }) {
  const [current, setCurrent] = useState(detail), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null), [distinct, setDistinct] = useState(false), [notice, setNotice] = useState("");
  const titleRef = useRef(null), p = current.movement.proposal, refund = current.refundDetail?.refund;
  const duplicates = current.refundDetail?.possibleDuplicates || [];
  async function act(action) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await apiFetch("/api/captures/movements", { method: "PATCH", expectedUserId: userId, errorMode: "inline",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.movement.id, ...action }) });
      setConfirmation(null); setDistinct(false); setNotice("Cambio guardado.");
      await onSaved();
      const response = await apiFetch(`/api/captures/movements?id=${current.movement.id}`, { expectedUserId: userId, errorMode: "inline" });
      setCurrent(await response.json());
    } catch (err) { setError(`${err.message} Actualiza para comprobar el resultado si se perdió la respuesta.`); }
    finally { setBusy(false); }
  }
  return <><Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl" onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}
      onCloseAutoFocus={restoreFocus} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }} showCloseButton={!busy}>
      <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>Revisar devolución</DialogTitle><DialogDescription>Comprueba el aviso y confirma a qué gasto pertenece. El cargo original y tus datos se conservan.</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <p role="status" className="text-sm">{notice}</p>
        <p className="text-sm">{p.merchant || "Comercio por identificar"}{p.amount && ` · ${money(p.amount)}`} · {configuration.cards.find(card => card.id === p.cardId)?.name || "Tarjeta por identificar"}</p>
        <p className="text-sm text-muted-foreground">{captureReasons[current.movement.reason] || "El formato está incompleto; revisa sus datos antes de resolverlo."}</p>
        <ItemGroup>{current.movement.events.map(event => <Item key={event.id}><ItemContent>
          <ItemTitle>{captureSources[event.sourcePackage]}</ItemTitle>
          <ItemDescription>{new Date(event.postedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · publicación en hora de México</ItemDescription>
          <p className="whitespace-pre-wrap break-words text-sm">{Object.values(event.fields).join("\n")}</p>
        </ItemContent></Item>)}</ItemGroup>
        {!refund && current.movement.status === "REVIEW" && <>
          <Alert><AlertDescription>El aviso no incluye una referencia única de compra. Revisa comercio, tarjeta e importe: una coincidencia es una propuesta, requiere tu confirmación.</AlertDescription></Alert>
          {duplicates.length > 0 && <Alert variant="destructive"><AlertDescription>Ya revisaste otra devolución de este importe y comercio. Comprueba que este aviso corresponde a una devolución distinta.</AlertDescription></Alert>}
          <ItemGroup>{current.refundDetail?.candidates.map(candidate => <Item key={candidate.id} variant="outline" className="flex-wrap">
            <ItemContent><ItemTitle className="break-words">{candidate.concept}</ItemTitle><ItemDescription>{new Date(candidate.date).toLocaleDateString("es-MX", { timeZone: "UTC" })} · original {money(candidate.originalAmount)} · neto actual {money(candidate.amount)}</ItemDescription>
              <ItemDescription>Después de la devolución: {money(Number(candidate.amount) - Number(p.amount))}</ItemDescription></ItemContent>
            <ItemActions><Button variant="outline" disabled={busy} className="min-h-11" onClick={() => { setError(""); setConfirmation({ action: "applyRefund", expenseId: candidate.id, expectedExpenseUpdatedAt: candidate.updatedAt }); }}>Aplicar devolución</Button></ItemActions>
          </Item>)}</ItemGroup>
          {!current.refundDetail?.candidates.length && <p className="text-sm text-muted-foreground">No hay un cargo capturado compatible en los 30 días anteriores con saldo suficiente para esta devolución. Los gastos con suscripciones, aportaciones o cuentas vinculadas requieren una revisión aparte.</p>}
        </>}
        {refund && <Alert><AlertDescription>{refund.reversedAt ? "Deshiciste esta devolución. Se conserva la evidencia y este aviso no volverá a aplicarse." : `Devolución de ${money(refund.amount)} aplicada al gasto original. Puedes deshacerla si seleccionaste el gasto equivocado.`}</AlertDescription></Alert>}
      </div>
      <DialogFooter className="flex-wrap">
        {!refund && current.movement.status === "REVIEW" && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => act({ action: "reinterpret" })}>Actualizar propuesta</Button>}
        {refund && !refund.reversedAt && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: "reverseRefund" })}>Deshacer devolución</Button>}
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>Cerrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) { setConfirmation(null); setDistinct(false); } }}>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation?.action === "reverseRefund" ? "Deshacer devolución" : "Confirmar devolución"}</AlertDialogTitle>
      <AlertDialogDescription>{confirmation?.action === "reverseRefund" ? "Se restituirá el importe de esta devolución al neto del gasto. El historial se conserva." : `Se descontarán ${money(p.amount)} del gasto seleccionado. Si es un reembolso total, su neto quedará en cero. El concepto, la categoría y el cargo original se conservan; quedará pendiente de conciliar.`}</AlertDialogDescription></AlertDialogHeader>
      {confirmation?.action === "applyRefund" && duplicates.length > 0 && <Field orientation="horizontal"><Checkbox id="distinct-refund" disabled={busy} checked={distinct} onCheckedChange={setDistinct} /><FieldLabel htmlFor="distinct-refund">Comprobé que es otra devolución, no un aviso repetido</FieldLabel></Field>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={busy || (confirmation?.action === "applyRefund" && duplicates.length > 0 && !distinct)} onClick={event => { event.preventDefault(); void act({ ...confirmation, distinctRefund: distinct }); }}>{busy && <Spinner />}Confirmar</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></>;
}
