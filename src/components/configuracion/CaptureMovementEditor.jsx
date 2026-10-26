"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import CaptureFields from "@/components/configuracion/CaptureFields";
import CaptureMoneyEditor from "@/components/configuracion/CaptureMoneyEditor";
import { moneyCaptureKind, accountDebitNotice } from "@/lib/captureMoneyParsers";
import CapturePaymentEditor from "@/components/configuracion/CapturePaymentEditor";
import { paymentCaptureKind } from "@/lib/capturePaymentParsers";
import { refundCaptureKind } from "@/lib/captureRefundParsers";
import CaptureRefundEditor from "@/components/configuracion/CaptureRefundEditor";
import { apiFetch } from "@/lib/apiFetch";
import { captureReasons } from "@/lib/capturePresentation";
import CaptureNotificationDetails from "@/components/configuracion/CaptureNotificationDetails";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const captureFormSchema = z.object({ merchant: z.string().trim().min(1, "Escribe un concepto."), amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Usa hasta dos decimales.").refine(value => Number(value) > 0, "El importe debe ser positivo."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona la fecha."), cardId: z.string().min(1, "Selecciona la tarjeta."), categoryId: z.string().min(1, "Selecciona la categoría."), currency: z.literal("MXN") });

export default function CaptureMovementEditor({ detail, configuration, userId, onClose, onSaved, restoreFocus }) {
  const [current, setCurrent] = useState(detail);
  const movement = current.movement;
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [months, setMonths] = useState("12"), [search, setSearch] = useState(""), [matches, setMatches] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const titleRef = useRef(null);
  const proposal = { ...movement.proposal, ...movement.correction };
  const form = useForm({ resolver: zodResolver(captureFormSchema), defaultValues: {
    merchant: proposal.merchant || "", amount: proposal.amount || "", date: proposal.date || "", cardId: proposal.cardId || "",
    categoryId: proposal.categoryId || "", currency: "MXN",
  } });
  const open = ["REVIEW", "OBSERVED"].includes(movement.status);
  async function act(action, registerAfterSave = false) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch("/api/captures/movements", { method: "PATCH", expectedUserId: userId, errorMode: "inline",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: movement.id, ...action }) });
      if (registerAfterSave) await apiFetch("/api/captures/movements", { method: "PATCH", expectedUserId: userId, errorMode: "inline",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: movement.id, action: "register" }) });
      await onSaved();
      const response = await apiFetch(`/api/captures/movements?id=${movement.id}`, { expectedUserId: userId, errorMode: "inline" });
      const next = await response.json();
      setCurrent(next);
      setNotice(registerAfterSave ? next.movement.expenseId ? "Gasto registrado." : "No se registró el gasto. Revisa el motivo indicado." : "Cambio guardado.");
      if (action.action === "correct") form.reset({ ...next.movement.correction });
      if (action.action === "reinterpret") {
        const parsed = next.movement.proposal;
        form.reset({ merchant: parsed.merchant || "", amount: parsed.amount || "", date: parsed.date || "", cardId: parsed.cardId || "",
          categoryId: "", currency: "MXN" });
      }
      setConfirmation(null);
    } catch (err) {
      setError(`${err.message} Cierra y vuelve a abrir el gasto para comprobar el resultado.`);
      if (registerAfterSave) {
        try {
          const response = await apiFetch(`/api/captures/movements?id=${movement.id}`, { expectedUserId: userId, errorMode: "inline" });
          const next = await response.json(); setCurrent(next);
          if (next.movement.correction) form.reset(next.movement.correction);
          await onSaved();
        } catch { /* Keep the explicit recovery instruction if refresh also failed. */ }
      }
    }
    finally { setBusy(false); }
  }
  if (moneyCaptureKind(movement) || accountDebitNotice(movement)) return <CaptureMoneyEditor detail={current} configuration={configuration} userId={userId} onClose={onClose} onSaved={onSaved} restoreFocus={restoreFocus} />;
  if (paymentCaptureKind(movement)) return <CapturePaymentEditor detail={current} configuration={configuration} userId={userId} onClose={onClose} onSaved={onSaved} restoreFocus={restoreFocus} />;
  if (refundCaptureKind(movement)) return <CaptureRefundEditor detail={current} configuration={configuration} userId={userId} onClose={onClose} onSaved={onSaved} restoreFocus={restoreFocus} />;
  return <><Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="flex [&_[data-slot=dialog-close]]:size-11 max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl" onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={restoreFocus}
      onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }} showCloseButton={!busy}>
      <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>Revisar gasto</DialogTitle><DialogDescription>Comprueba tarjeta, importe y fecha antes de registrar.</DialogDescription></DialogHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <p className="text-sm text-muted-foreground">{captureReasons[movement.reason] || "Completa los datos para registrar este gasto."}</p>
        {proposal.dateSource === "NOTIFICATION_POSTED_AT" && <Alert><AlertDescription>Usamos la fecha del aviso, en hora de México. Corrígela si el banco indica otra.</AlertDescription></Alert>}
        {proposal.completionPolicy === "NU_CFE_MXN" && <Alert><AlertDescription>Este gasto corresponde a {configuration.subscriptions.find(row => row.id === proposal.subscriptionId)?.name || "tu suscripción CFE"}. Usamos la tarjeta y MXN de tu regla Nu/CFE; al registrar se confirmará el cobro de este mes con el importe del aviso.</AlertDescription></Alert>}
        {proposal.completionPolicy === "MERCADOPAGO_CREDIT_MXN" && <Alert><AlertDescription>Usamos la única tarjeta y MXN que configuraste para Mercado Pago. Si ahora usas otra tarjeta o moneda, pausa esta regla en Ajustes.</AlertDescription></Alert>}
        {movement.status === "LINKED" && movement.expenseId && movement.parserKey === "wallet.santander-purchase.es.v1" && <Button variant="outline" className="min-h-11 self-start" disabled={busy} onClick={() => setConfirmation({ action: "validateWalletBackup" })}>Validar Wallet como respaldo</Button>}
        {movement.status === "DISCARDED" && movement.reason === "NON_CREDIT_ACCOUNT" && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: "reinterpret" })}>Revisar como posible pago de tarjeta</Button>}
        {open ? <>
          {!movement.correction && movement.events.length === 1 && <Button variant="outline" className="min-h-11 self-start" disabled={busy || form.formState.isDirty} onClick={() => setConfirmation({ action: "reinterpret" })}>Volver a leer notificación</Button>}
          {proposal.currency && proposal.currency !== "MXN" && <Alert><AlertDescription>El aviso indica {proposal.currency}. Captura el importe final cobrado en MXN según el banco antes de registrar.</AlertDescription></Alert>}
          <form id="capture-correction-form" onSubmit={form.handleSubmit(values => act({ action: "correct", correction: values, expectedCorrection: JSON.stringify(movement.correction ?? null) }, true))} className="flex flex-col gap-4">
            <CaptureFields form={form} configuration={configuration} disabled={busy} />
            <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={busy}>{busy && <Spinner />}Guardar y registrar gasto</Button><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={form.handleSubmit(values => act({ action: "correct", correction: values, expectedCorrection: JSON.stringify(movement.correction ?? null) }))}>Guardar sin registrar</Button></div>
          </form>
          <Separator />
          <p className="text-sm text-muted-foreground">Si el gasto ya existe, vincula este aviso para evitar duplicarlo. Para marcarlo como otra compra, guarda primero los datos.</p>
          <div className="flex flex-wrap gap-2">
            {(movement.correction || ["POSSIBLE_DUPLICATE", "NOTIFICATION_REVISION"].includes(movement.reason)) && <Button variant="outline" className="min-h-11" disabled={busy || form.formState.isDirty}
              onClick={() => setConfirmation({ action: "distinct" })}>Es otra compra</Button>}
          </div>
          <Collapsible className="flex flex-col gap-2"><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 self-start">Este gasto ya está registrado</Button></CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-4 pt-2">
          <Field><FieldLabel htmlFor="capture-expense-search">Buscar gasto existente por concepto</FieldLabel><Input className="min-h-11" id="capture-expense-search" value={search} onChange={event => setSearch(event.target.value)} disabled={busy} /></Field>
          <Button variant="outline" className="min-h-11 self-start" disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try {
              const response = await apiFetch(`/api/expenses?cardId=${encodeURIComponent(form.getValues("cardId"))}&concept=${encodeURIComponent(search)}`, { expectedUserId: userId, errorMode: "inline" });
              setMatches((await response.json()).expenses);
            } catch (err) { setError(err.message); } finally { setBusy(false); }
          }}>Buscar gasto</Button>
          <ItemGroup>{[...new Map([...(current.candidates || []).filter(row => row.type === "EXPENSE"), ...matches].map(row => [row.id, row])).values()].map(row => <Item role="listitem" key={row.id} className="flex-wrap"><ItemContent><ItemTitle>{row.concept}</ItemTitle>
            {row.date && <ItemDescription>{row.date.slice(0, 10)} · {row.amount} MXN</ItemDescription>}</ItemContent>
            <Button variant="outline" className="min-h-11" disabled={busy || form.formState.isDirty} onClick={() => act({ action: "link", expenseId: row.id })}>Vincular este aviso</Button></Item>)}</ItemGroup>
          <ItemGroup>{(current.candidates || []).filter(row => row.type === "INSTALLMENT").map(row => <Item role="listitem" key={row.id} className="flex-wrap"><ItemContent><ItemTitle>{row.concept}</ItemTitle><ItemDescription>Compra a meses existente con la misma tarjeta e importe total.</ItemDescription></ItemContent><Button variant="outline" className="min-h-11" disabled={busy || form.formState.isDirty} onClick={() => act({ action: "linkInstallment", installmentPurchaseId: row.id })}>Vincular a compra a meses</Button></Item>)}</ItemGroup>
          </CollapsibleContent></Collapsible>
          {(current.candidates || []).some(row => row.type === "DELETED") && <Alert><AlertDescription>Existe una compra eliminada con estos datos. Vincula otra existente o confirma expresamente una compra distinta.</AlertDescription></Alert>}
        </> : <>
          <p className="text-sm">El movimiento ya fue resuelto. Puedes consultar y editar el registro correspondiente.</p>
          {movement.expenseId && <>
            <Button variant="outline" className="min-h-11 self-start" asChild><a href="/gastos">Editar gasto en Gastos</a></Button>
            <Collapsible className="flex flex-col gap-2"><CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 self-start">Convertir a compra a meses</Button></CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-3">
            <Field><FieldLabel htmlFor="capture-months">Plazo de MSI (meses)</FieldLabel><Input className="min-h-11" id="capture-months" type="number" min="2" max="120" value={months} onChange={event => setMonths(event.target.value)} disabled={busy} /></Field>
            <Button variant="outline" className="min-h-11 self-start" disabled={busy} onClick={() => setConfirmation({ action: "convertToInstallments", months: Number(months) })}>Convertir a meses</Button></CollapsibleContent></Collapsible>
          </>}
          {movement.installmentPurchaseId && <Button variant="outline" className="min-h-11 self-start" asChild><a href="/compras-a-meses">Ver compra a meses</a></Button>}
        </>}
        <CaptureNotificationDetails movement={movement} />
      </div>
      <DialogFooter><Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>Cerrar</Button></DialogFooter>
    </DialogContent>
  </Dialog><AlertDialog open={Boolean(confirmation)} onOpenChange={value => { if (!value && !busy) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation?.action === "validateWalletBackup" ? "Validar Wallet como respaldo" : confirmation?.action === "reinterpret" ? "Volver a leer notificación" : confirmation?.action === "distinct" ? "Registrar otra compra" : "Convertir a meses"}</AlertDialogTitle><AlertDialogDescription>{confirmation?.action === "validateWalletBackup" ? "Se comprobará este aviso contra el gasto bancario ya cotejado. El gasto y las evidencias originales se conservan; la validación permite habilitar Wallet como fuente alternativa. Los futuros avisos Wallet usarán la fecha de su publicación en México, con aceptación separada al habilitar. Si las fechas difieren, la validación pedirá revisión." : confirmation?.action === "reinterpret" ? "AFP volverá a leer el aviso con las reglas actuales. Conservará la notificación y las correcciones que guardaste. Esta acción no registra un gasto." : confirmation?.action === "distinct" ? "Confirma que es otra compra, aunque coincida con los movimientos existentes. Se creará otro gasto pendiente de comprobar en el estado de cuenta." : `El gasto completo se sustituirá por una compra de ${months} mensualidades, conservando sus datos. Las aportaciones y vínculos personales requieren revisión previa.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy} className="min-h-11">Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} className="min-h-11" onClick={event => { event.preventDefault(); void act(confirmation); }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
