"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { captureReasons, captureSources, captureInboxStatuses } from "@/lib/capturePresentation";
import { useCaptureResource } from "@/hooks/use-capture-resource";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import CaptureMovementEditor from "@/components/configuracion/CaptureMovementEditor";
import CaptureConfigurationPanel from "@/components/configuracion/CaptureConfigurationPanel";
import CaptureReconciliation from "@/components/configuracion/CaptureReconciliation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

function CaptureInbox({ userId, configuration }) {
  const [status, setStatus] = useState("REVIEW"), [cursor, setCursor] = useState(null), [detail, setDetail] = useState(null), [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { captureFocus, restoreFocus } = useDialogFocus();
  const { data, error: loadError, loading, refresh, region } = useCaptureResource(`/api/captures/movements?status=${status}${cursor ? `&cursor=${cursor}` : ''}`, userId);
  return <section ref={region} className="flex flex-col gap-4" aria-label="Bandeja de captura" onClickCapture={captureFocus}>
    <div className="flex flex-wrap items-center gap-3"><ResponsiveSelect id="capture-inbox-status" aria-label="Estado de los avisos" value={status} onValueChange={value => { setStatus(value); setCursor(null); }} options={Object.entries(captureInboxStatuses).map(([value, label]) => ({ value, label }))} />
      <Button variant="outline" className="min-h-11" disabled={busy || loading} onClick={refresh}>Actualizar avisos</Button></div>
    <p className="text-sm text-muted-foreground">Se actualiza al volver a AFP y cada 30 segundos mientras esta bandeja está visible. Los avisos por revisar no cambian tus totales.</p>
    {(error || loadError) && <Alert variant="destructive"><AlertDescription>{error || loadError}</AlertDescription></Alert>}
    {!data ? <Skeleton className="h-24 w-full" /> : data.movements.length === 0 ? <Empty><EmptyDescription>No hay avisos en este estado. Los nuevos aparecerán al recibirse desde el teléfono.</EmptyDescription></Empty> : <ItemGroup className="gap-3">{data.movements.map(movement => {
      const proposal = { ...movement.proposal, ...movement.correction };
      return <Item key={movement.id} variant="outline" className="flex-wrap"><ItemContent className="min-w-0 basis-full">
        <ItemTitle className="flex-wrap break-words">{proposal.merchant || "Aviso sin compra identificada"}<Badge variant={movement.inboxState === 'REVIEW' ? 'warning' : 'secondary'}>{captureInboxStatuses[movement.inboxState]}</Badge></ItemTitle>
        <ItemDescription>{proposal.amount ? `${proposal.amount} ${proposal.currency || ''} · ${proposal.date || ''} · ` : ''}{captureReasons[movement.reason] || "Requiere revisión."}</ItemDescription>
        <ItemDescription>{configuration.cards.find(card => card.id === proposal.cardId)?.name || 'Tarjeta por identificar'} · {captureSources[movement.events[0]?.sourcePackage] || 'Aviso'}{movement.status === 'OBSERVED' ? ' · Observación' : ''}</ItemDescription>
        {(movement.originalExpenseId && !movement.expenseId && movement.status !== 'CONVERTED') && <ItemDescription>Gasto eliminado; el aviso conserva su resolución y no lo recrea.</ItemDescription>}
        {movement.status === 'CONVERTED' && <ItemDescription>{movement.reason === 'USER_LINKED_INSTALLMENT' ? 'Vinculado a una compra a meses existente.' : 'Convertido a MSI; el gasto completo fue sustituido.'}</ItemDescription>}
      </ItemContent><ItemActions className="flex-wrap"><Button variant="outline" className="min-h-11" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { const response = await apiFetch(`/api/captures/movements?id=${movement.id}`, { expectedUserId: userId, errorMode: 'inline' }); setDetail(await response.json()); }
        catch (err) { setError(err.message); } finally { setBusy(false); }
      }}>Revisar aviso</Button>{['REVIEW','OBSERVED'].includes(movement.status) && <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirmation(movement)}>Descartar aviso</Button>}</ItemActions></Item>;
    })}</ItemGroup>}
    <div className="flex flex-wrap gap-2">{cursor && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setCursor(null)}>Volver al inicio</Button>}{data?.nextCursor && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setCursor(data.nextCursor)}>Ver más avisos</Button>}</div>
    {detail && <CaptureMovementEditor key={detail.movement.id} detail={detail} configuration={configuration} userId={userId} onSaved={refresh} onClose={() => setDetail(null)} restoreFocus={restoreFocus} />}
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><AlertDialogContent onCloseAutoFocus={restoreFocus}><AlertDialogHeader><AlertDialogTitle>Descartar aviso</AlertDialogTitle><AlertDialogDescription>El aviso se conservará en Descartado y no creará un gasto.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={busy} onClick={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try { await apiFetch('/api/captures/movements', { method: 'PATCH', expectedUserId: userId, errorMode: 'inline', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: confirmation.id, action: 'discard' }) }); setConfirmation(null); await refresh(); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }}>Descartar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

export default function CaptureReview({ userId }) {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const { data: configuration, error, refresh, region } = useCaptureResource('/api/captures/configuration', userId);
  return <section ref={region} className="flex min-w-0 flex-col gap-4" aria-label="Revisión y conciliación de captura"><Separator />
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription><Button variant="outline" onClick={refresh}>Reintentar configuración</Button></Alert>}
    {!configuration ? <Skeleton className="h-24 w-full" /> : <Tabs defaultValue="inbox" className="min-w-0"><TabsList className="h-auto w-full flex-wrap"><TabsTrigger value="inbox" className="min-h-11">Bandeja</TabsTrigger><TabsTrigger value="configuration" className="min-h-11">Tarjetas y reglas</TabsTrigger><TabsTrigger value="statement" className="min-h-11">Conciliar</TabsTrigger></TabsList>
      <TabsContent value="inbox"><CaptureInbox userId={userId} configuration={configuration} /></TabsContent>
      <TabsContent value="configuration"><CaptureConfigurationPanel configuration={configuration} userId={userId} refresh={refresh} captureFocus={captureFocus} restoreFocus={restoreFocus} /></TabsContent>
      <TabsContent value="statement"><CaptureReconciliation configuration={configuration} userId={userId} onChanged={refresh} /></TabsContent>
    </Tabs>}
  </section>;
}
