"use client";
import { errorMessage } from "@/lib/uiTypes";
import type { CaptureAction, CaptureEditorProps } from "./captureUiTypes";

import CaptureNotificationDetails from "@/components/configuracion/CaptureNotificationDetails";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { captureReasons } from "@/lib/capturePresentation";
import { uiFetch as apiFetch } from "@/lib/uiClient";
import { useRef, useState } from "react";

const money = (value: unknown) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value));

export default function CaptureRefundEditor({ detail, configuration, userId, onClose, onSaved, restoreFocus }: CaptureEditorProps) {
  const [current, setCurrent] = useState(detail), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ action: "applyRefund"; expenseId: string; expectedExpenseUpdatedAt: string; distinctRefund?: boolean } | { action: "reverseRefund"; expenseId?: never } | null>(null), [distinct, setDistinct] = useState(false), [notice, setNotice] = useState("");
  const titleRef = useRef<HTMLHeadingElement | null>(null), p = current.movement.proposal, refund = current.refundDetail?.refund;
  const selectedExpense = current.refundDetail?.candidates.find(row => row.id === confirmation?.expenseId);
  const duplicates = current.refundDetail?.possibleDuplicates || [];
  async function act(action: (CaptureAction & { distinctRefund?: boolean }) | null) {
    if (busy || !action) return;
    setBusy(true); setError("");
    try {
      await apiFetch("/api/captures/movements", { method: "PATCH", expectedUserId: userId, errorMode: "inline",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.movement.id, ...action }) });
      setConfirmation(null); setDistinct(false); setNotice("Cambio guardado.");
      await onSaved();
      const response = await apiFetch(`/api/captures/movements?id=${current.movement.id}`, { expectedUserId: userId, errorMode: "inline" });
      setCurrent(await response.json());
    } catch (err) { setError(`${errorMessage(err)} Actualiza para comprobar el resultado si se perdió la respuesta.`); }
    finally { setBusy(false); }
  }
  return <><Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="flex [&_[data-slot=dialog-close]]:size-11 max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl" onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}
      onCloseAutoFocus={restoreFocus} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }} showCloseButton={!busy}>
      <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>{refund?.reversedAt ? "Devolución deshecha" : refund ? "Devolución aplicada" : "Revisar devolución"}</DialogTitle><DialogDescription>{configuration.cards.find(card => card.id === p.cardId)?.name || "Tarjeta sin identificar"}{p.date && ` · ${p.date}`}</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <div className="flex flex-col gap-1"><p className="text-2xl font-semibold tabular-nums">{p.amount ? money(p.amount) : "Importe sin identificar"}</p><p className="break-words text-sm font-medium">{p.merchant || "Comercio sin identificar"}</p></div>
        {!refund && current.movement.status === "REVIEW" && <>
          <Alert><AlertDescription>Elige el gasto al que pertenece. AFP no descontará dinero hasta que lo confirmes.</AlertDescription></Alert>
          {duplicates.length > 0 && <Alert variant="destructive"><AlertDescription>Hay otra devolución del mismo importe y comercio. Confirma que son devoluciones distintas.</AlertDescription></Alert>}
          <ItemGroup>{current.refundDetail?.candidates.map(candidate => <Item role="listitem" key={candidate.id} variant="outline" className="flex-wrap">
            <ItemContent className="basis-full"><ItemTitle className="line-clamp-none break-words">{candidate.concept}</ItemTitle><ItemDescription className="line-clamp-none">{new Date(candidate.date).toLocaleDateString("es-MX", { timeZone: "UTC" })} · cargo original {money(candidate.originalAmount)}</ItemDescription>
              <dl className="mt-2 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Gasto actual</dt><dd className="font-medium tabular-nums">{money(candidate.amount)}</dd></div><div><dt className="text-xs text-muted-foreground">Tras la devolución</dt><dd className="font-semibold tabular-nums">{money(Number(candidate.amount) - Number(p.amount))}</dd></div></dl></ItemContent>
            <ItemActions className="w-full justify-end"><Button disabled={busy} className="min-h-11" onClick={() => { setError(""); setConfirmation({ action: "applyRefund", expenseId: candidate.id, expectedExpenseUpdatedAt: candidate.updatedAt! }); }}>Elegir este gasto</Button></ItemActions>
          </Item>)}</ItemGroup>
          {!current.refundDetail?.candidates.length && <p className="text-sm text-muted-foreground">No encontramos un gasto compatible. Comprueba que la compra esté registrada con la misma tarjeta y comercio, en los últimos 30 días. Los gastos con suscripciones, aportaciones o cuentas vinculadas se revisan aparte.</p>}
        </>}
        {refund && <Alert><AlertDescription>{refund.reversedAt ? "El importe volvió al gasto. Este aviso conserva el historial y no se aplicará de nuevo." : `Se descontaron ${money(refund.amount)} del gasto original. Puedes deshacerlo si elegiste otro gasto.`}</AlertDescription></Alert>}
        {!["REFUND_REVIEW", "REFUND_APPLIED", "REFUND_REVERSED"].includes(current.movement.reason) && <p className="text-sm text-muted-foreground">{captureReasons[current.movement.reason] || "Revisa los datos del aviso."}</p>}
        <CaptureNotificationDetails movement={current.movement}>
          {!refund && current.movement.status === "REVIEW" && <Button variant="outline" className="min-h-11 self-start" disabled={busy} onClick={() => act({ action: "reinterpret" })}>Buscar coincidencias de nuevo</Button>}
        </CaptureNotificationDetails>
      </div>
      <DialogFooter className="flex-wrap">
        {refund && !refund.reversedAt && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: "reverseRefund" })}>Deshacer devolución</Button>}
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>Cerrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) { setConfirmation(null); setDistinct(false); } }}>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation?.action === "reverseRefund" ? "Deshacer devolución" : "Confirmar devolución"}</AlertDialogTitle>
      <AlertDialogDescription>{confirmation?.action === "reverseRefund" ? "El importe de la devolución volverá a sumarse al gasto. Se conservará el historial." : `${selectedExpense?.concept || "Gasto seleccionado"}: pasará de ${money(selectedExpense?.amount || 0)} a ${money(Number(selectedExpense?.amount || 0) - Number(p.amount))}. Se conservarán sus datos y quedará pendiente de comprobar en el estado de cuenta.`}</AlertDialogDescription></AlertDialogHeader>
      {confirmation?.action === "applyRefund" && duplicates.length > 0 && <Field orientation="horizontal"><Checkbox id="distinct-refund" disabled={busy} checked={distinct} onCheckedChange={value => setDistinct(value === true)} /><FieldLabel htmlFor="distinct-refund">Confirmo que es otra devolución</FieldLabel></Field>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={busy || (confirmation?.action === "applyRefund" && duplicates.length > 0 && !distinct)} onClick={event => { event.preventDefault(); if (confirmation) void act({ ...confirmation, distinctRefund: distinct }); }}>{busy && <Spinner />}{confirmation?.action === "reverseRefund" ? "Deshacer devolución" : `Descontar ${money(p.amount)}`}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></>;
}
