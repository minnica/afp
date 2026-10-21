"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { captureReasons, captureStatuses } from "@/lib/capturePresentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDialogFocus } from "@/hooks/use-dialog-focus";

const aliasNames = { PHYSICAL: "Física", DIGITAL: "Digital", WALLET: "Wallet" };

export default function CaptureReview({ userId }) {
  const [configuration, setConfiguration] = useState(null);
  const [movements, setMovements] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const controller = useRef(null);
  const { captureFocus, restoreFocus } = useDialogFocus();
  const refresh = useCallback(async signal => {
    const [settings, inbox] = await Promise.all([
      apiFetch("/api/captures/configuration", { expectedUserId: userId, errorMode: "inline", signal }).then(response => response.json()),
      apiFetch("/api/captures/movements", { expectedUserId: userId, errorMode: "inline", signal }).then(response => response.json()),
    ]);
    if (!signal.aborted) { setConfiguration(settings); setMovements(inbox.movements); setCursor(inbox.nextCursor); }
  }, [userId]);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    const load = () => refresh(abort.signal).catch(err => { if (!abort.signal.aborted) setError(err.message); });
    load(); window.addEventListener("focus", load);
    return () => { abort.abort(); window.removeEventListener("focus", load); };
  }, [refresh]);

  async function perform(action) {
    if (busy) return;
    const signal = controller.current.signal;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch(action.inventory ? "/api/captures/configuration" : "/api/captures/movements", {
        method: "PATCH", expectedUserId: userId, errorMode: "inline", signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      if (!signal.aborted) setNotice(action.inventory ? "Terminaciones guardadas. La automatización conserva su estado." : "Resolución guardada.");
      await refresh(signal);
    } catch (err) { if (!signal.aborted) setError(`${err.message} Actualiza los avisos para comprobar el resultado.`); }
    finally { if (!signal.aborted) { setBusy(false); setConfirmation(null); } }
  }

  return <section className="flex flex-col gap-4" aria-label="Interpretación de avisos" onClickCapture={captureFocus}>
    <Separator />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-medium">Tarjetas y avisos</h3>
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={async () => {
        setError(""); setBusy(true);
        try { await refresh(controller.current.signal); } catch (err) { if (!controller.current.signal.aborted) setError(err.message); }
        finally { setBusy(false); }
      }}>Actualizar avisos</Button>
    </div>
    <p className="text-sm text-muted-foreground">Solo se registran automáticamente formatos validados y habilitados para una tarjeta concreta. Los casos en revisión no cambian tus totales.</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div role="status">{notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}</div>
    {!configuration ? <Skeleton className="h-20 w-full" /> : <>
      <ItemGroup>{configuration.cards.map(card => {
        const aliases = configuration.aliases.filter(alias => alias.cardId === card.id);
        const active = configuration.automations.filter(item => item.cardId === card.id && item.mode === "AUTOMATIC");
        return <Item key={card.id}>
          <ItemContent className="min-w-0">
            <ItemTitle>{card.name}<Badge variant="secondary">{active.length ? `${active.length} formato(s) automático(s)` : "Observación"}</Badge></ItemTitle>
            <ItemDescription>{aliases.length ? aliases.map(alias => `${aliasNames[alias.kind]} •${alias.value}${alias.verifiedAt ? "" : " sin verificar"}`).join(" · ") : "Terminaciones físicas, digitales y de Wallet pendientes"}</ItemDescription>
          </ItemContent>
        </Item>;
      })}</ItemGroup>
      <Field>
        <FieldLabel htmlFor="capture-inventory-file">Importar terminaciones desde JSON</FieldLabel>
        <Input id="capture-inventory-file" type="file" className="min-h-11" accept=".json,application/json" disabled={busy} onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (!file) return;
          if (file.size > 60000) { setError("El archivo supera el tamaño permitido."); return; }
          try { const inventory = JSON.parse(await file.text()); await perform({ action: "importAliases", inventory }); }
          catch { setError("No se pudo leer el JSON. Usa el formato captura-tarjetas.example.json."); }
        }} />
      </Field>
      {!configuration.parsers.some(parser => parser.verified) && <p className="text-sm text-muted-foreground">Faltan muestras reales de BBVA y Wallet. Los formatos iniciales solo están probados con datos ficticios; los demás bancos siguen pendientes.</p>}
    </>}
    <h3 className="font-medium">Avisos recibidos</h3>
    {configuration && movements.length === 0 && <Empty><EmptyDescription>Aún no hay avisos procesados. Los nuevos aparecerán al recibirse desde el teléfono.</EmptyDescription></Empty>}
    <ItemGroup className="gap-3">{movements.map(movement => {
      const p = movement.proposal;
      const open = ["REVIEW", "OBSERVED"].includes(movement.status);
      return <Item key={movement.id} variant="outline" className="flex-wrap">
        <ItemContent className="min-w-0 basis-full">
          <ItemTitle className="flex-wrap break-words">{p.merchant || "Aviso sin compra identificada"}<Badge variant={open ? "warning" : "secondary"}>{captureStatuses[movement.status]}</Badge></ItemTitle>
          <ItemDescription>{p.amount ? `${p.amount} ${p.currency} · ${p.date} · ` : ""}{captureReasons[movement.reason] || "Requiere revisión."}</ItemDescription>
          {movement.originalExpenseId && !movement.expenseId && movement.status !== "CONVERTED" && <ItemDescription>El gasto fue eliminado. El aviso conserva su resolución y no lo vuelve a crear.</ItemDescription>}
          {movement.expense && <a href="/gastos" className="flex min-h-11 items-center text-sm underline underline-offset-4">Ver gasto: {movement.expense.concept}{movement.expense.reconciliationStatus === "PENDING" ? " · Por conciliar" : ""}</a>}
        </ItemContent>
        {open && <ItemActions className="flex-wrap">
          {(p.candidates || []).filter(candidate => candidate.type === "EXPENSE").map(candidate => <Button key={candidate.id} variant="outline" className="min-h-11 h-auto min-w-0 max-w-full whitespace-normal break-words" disabled={busy}
            onClick={() => setConfirmation({ id: movement.id, action: "link", expenseId: candidate.id, label: `Vincular al existente: ${candidate.concept}` })}>Vincular al existente: {candidate.concept}</Button>)}
          {["POSSIBLE_DUPLICATE", "NOTIFICATION_REVISION"].includes(movement.reason) && <Button variant="outline" className="min-h-11" disabled={busy}
            onClick={() => setConfirmation({ id: movement.id, action: "distinct", label: "Es otra compra" })}>Es otra compra</Button>}
          <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ id: movement.id, action: "discard", label: "Descartar aviso" })}>Descartar aviso</Button>
        </ItemActions>}
      </Item>;
    })}</ItemGroup>
    {cursor && <Button variant="outline" className="min-h-11 self-start" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await apiFetch(`/api/captures/movements?cursor=${cursor}`, { expectedUserId: userId, errorMode: "inline", signal: controller.current.signal });
        const data = await response.json();
        if (!controller.current.signal.aborted) { setMovements(rows => [...rows, ...data.movements]); setCursor(data.nextCursor); }
      } catch (err) { if (!controller.current.signal.aborted) setError(err.message); }
      finally { setBusy(false); }
    }}>Ver más avisos</Button>}
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader><AlertDialogTitle className="break-words">{confirmation?.label}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.action === "distinct" ? "Se creará otro gasto por conciliar. Confirma que se trata de una compra diferente."
            : confirmation?.action === "link" ? "El aviso se asociará al gasto existente y conservará sus datos y correcciones." : "El aviso se conservará descartado y no creará un gasto."}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" disabled={busy} onClick={event => { event.preventDefault(); const { label: ignoredLabel, ...action } = confirmation; void ignoredLabel; perform(action); }}>{busy && <Spinner />}Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
