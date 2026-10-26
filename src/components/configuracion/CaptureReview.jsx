"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { captureReasons, captureSources, captureInboxStatuses } from "@/lib/capturePresentation";
import { useCaptureResource } from "@/hooks/use-capture-resource";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import CaptureMovementEditor from "@/components/configuracion/CaptureMovementEditor";
import CaptureConfigurationPanel from "@/components/configuracion/CaptureConfigurationPanel";
import CaptureReconciliation from "@/components/configuracion/CaptureReconciliation";
import CaptureMoneySettings from "@/components/configuracion/CaptureMoneySettings";
import CaptureDevices from "@/components/configuracion/CaptureDevices";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const views = { pendientes: ["PENDING", "Pendientes"], gastos: ["EXPENSE", "Gastos"], pagos: ["PAYMENT", "Pagos"], devoluciones: ["REFUND", "Devoluciones"], cuentas: ["MONEY", "Cuentas"], otros: ["OTHER", "Otros avisos"] };
const labels = { EXPENSE: "Gasto", PAYMENT: "Pago de tarjeta", REFUND: "Devolución", MONEY: "Movimiento de cuenta", OTHER: "Aviso" };
const money = (value, currency = "MXN") => new Intl.NumberFormat("es-MX", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "MXN" }).format(Number(value));
const date = value => value ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "Sin fecha";

function CaptureInbox({ userId, configuration, view, cardId, onCardChange }) {
  const [status, setStatus] = useState("ALL"), [cursor, setCursor] = useState(null), [detail, setDetail] = useState(null), [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { captureFocus, restoreFocus } = useDialogFocus();
  const kind = views[view][0];
  const query = new URLSearchParams({ kind });
  if (view !== "pendientes" && status !== "ALL") query.set("status", status);
  if (cardId && view !== "cuentas") query.set("cardId", cardId);
  if (cursor) query.set("cursor", cursor);
  const { data, error: loadError, loading, refresh, region } = useCaptureResource(`/api/captures/movements?${query}`, userId);
  const count = data ? ["EXPENSE", "PAYMENT", "REFUND", "MONEY"].reduce((sum, type) => sum + data.pendingCounts[type], 0) : null;
  async function review(movement) {
    setBusy(true); setError("");
    try { const response = await apiFetch(`/api/captures/movements?id=${movement.id}`, { expectedUserId: userId, errorMode: "inline" }); setDetail(await response.json()); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section ref={region} className="flex min-w-0 flex-col gap-5" aria-label={views[view][1]} onClickCapture={captureFocus}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      {view !== "cuentas" && <Field className="min-w-0 sm:max-w-64"><FieldLabel htmlFor="capture-inbox-card">Tarjeta</FieldLabel><ResponsiveSelect className="min-h-11" id="capture-inbox-card" aria-label="Filtrar por tarjeta" value={cardId || "ALL"} onValueChange={value => { onCardChange(value === "ALL" ? "" : value); setCursor(null); }} options={[{ value: "ALL", label: "Todas las tarjetas" }, ...configuration.cards.map(row => ({ value: row.id, label: row.name }))]} searchable="auto" /></Field>}
      {view !== "pendientes" && <Field className="min-w-0 sm:max-w-52"><FieldLabel htmlFor="capture-inbox-status">Estado</FieldLabel><ResponsiveSelect className="min-h-11" id="capture-inbox-status" aria-label="Filtrar por estado" value={status} onValueChange={value => { setStatus(value); setCursor(null); }} options={[{ value: "ALL", label: "Todos los estados" }, ...Object.entries(captureInboxStatuses).map(([value, label]) => ({ value, label }))]} /></Field>}
      <Button variant="outline" className="min-h-11 self-start sm:ml-auto" disabled={busy || loading} onClick={refresh}>{loading ? "Actualizando…" : "Actualizar"}</Button>
    </div>
    <div className="flex flex-col gap-1" aria-live="polite">
      <h2 className="text-base font-semibold">{view === "pendientes" ? count == null ? "Movimientos por revisar" : count ? `${count} ${count === 1 ? "movimiento por revisar" : "movimientos por revisar"}` : "Todo al día" : views[view][1] === "Pagos" ? "Pagos de tarjeta" : views[view][1]}</h2>
      <p className="text-sm text-muted-foreground">{view === "pendientes" ? "Confirma los datos que faltan. Las propuestas aún no cambian tus totales." : view === "otros" ? "Avisos sin un movimiento de dinero identificado. Aquí también llegan los avisos de Uber, DiDi y Uber Eats para revisar su contenido." : view === "devoluciones" ? "AFP propone el gasto original. Tú confirmas antes de descontar la devolución." : view === "cuentas" ? "Transferencias y retiros que actualizan tus cuentas de Mi dinero." : view === "pagos" ? "Abonos a tus tarjetas y comprobantes compartidos con AFP." : "Compras detectadas desde Wallet y tus aplicaciones bancarias."}</p>
    </div>
    {(error || loadError) && <Alert variant="destructive"><AlertDescription>{error || loadError}</AlertDescription><Button variant="outline" className="min-h-11" onClick={refresh} disabled={loading}>Reintentar</Button></Alert>}
    {!data ? <div aria-label="Cargando movimientos" className="flex flex-col gap-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div> : data.movements.length === 0 ? <Empty className="border"><EmptyHeader><EmptyTitle>{view === "pendientes" ? "No tienes movimientos pendientes" : "No hay movimientos con estos filtros"}</EmptyTitle><EmptyDescription>{view === "pendientes" ? "Consulta los registros aplicados en Gastos, Tarjetas o Mi dinero. Los avisos que requieren tu decisión llegarán aquí." : "Prueba con otra tarjeta o cambia el estado. Los nuevos avisos aparecerán cuando AFP los reciba."}</EmptyDescription></EmptyHeader></Empty> : <ItemGroup className="gap-0 divide-y rounded-lg border">{data.movements.map(movement => {
      const p = { ...movement.proposal, ...movement.correction };
      const isAccount = movement.kind === "MONEY" || p.moneyKind === "DEBIT_EXPENSE" || p.movementType === "ACCOUNT_DEBIT";
      const account = configuration.moneyAccounts?.find(a => a.id === p.fromAccountId)?.name;
      const destination = configuration.moneyAccounts?.find(a => a.id === p.toAccountId)?.name;
      const card = isAccount ? `${account || "Cuenta por identificar"}${destination ? ` → ${destination}` : ""}` : configuration.cards.find(card => card.id === p.cardId)?.name;
      const isPending = ["REVIEW", "OBSERVED"].includes(movement.status);
      return <Item role="listitem" key={movement.id} className="min-w-0 gap-3 rounded-none p-4">
        <ItemContent className="min-w-0 basis-40 gap-2">
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">{labels[movement.kind]}</span><Badge variant={movement.inboxState === "REVIEW" ? "warning" : "secondary"}>{captureInboxStatuses[movement.inboxState]}</Badge></div>
          <ItemTitle className="line-clamp-none w-full break-words text-sm">{p.merchant || movement.events[0]?.fields?.["android.title"] || (movement.kind === "PAYMENT" ? "Pago de tarjeta" : "Notificación por identificar")}</ItemTitle>
          <ItemDescription className="line-clamp-none">{card || "Tarjeta sin identificar"} · {date(p.date)} · {captureSources[movement.events[0]?.sourcePackage] || "Notificación"}</ItemDescription>
          <ItemDescription className="line-clamp-none">{captureReasons[movement.reason] || "Revisa los datos del aviso."}</ItemDescription>
          {movement.reason === "BANK_FALLBACK_WAIT" && movement.fallbackDueAt && <ItemDescription className="line-clamp-none">Espera hasta las {new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit" }).format(new Date(movement.fallbackDueAt))}. Guardar cambios o descartar detiene la espera.</ItemDescription>}
          {movement.originalExpenseId && !movement.expenseId && movement.status !== "CONVERTED" && <ItemDescription>El gasto fue eliminado. Este aviso no volverá a crearlo.</ItemDescription>}
        </ItemContent>
        <div className="flex shrink-0 flex-col items-end gap-2 self-start"><p className="text-base font-semibold tabular-nums">{p.amount ? `${movement.kind === "REFUND" ? "−" : ""}${p.currency ? money(p.amount, p.currency) : Number(p.amount).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Sin importe"}</p><span className="text-xs text-muted-foreground">{p.amount && (p.currency || "Moneda por confirmar")}</span></div>
        <ItemActions className="basis-full sm:justify-end"><Button variant={isPending && movement.kind !== "OTHER" ? "default" : "outline"} className="min-h-11" disabled={busy} onClick={() => review(movement)}>{isPending ? movement.kind === "REFUND" ? "Revisar devolución" : movement.kind === "PAYMENT" ? "Revisar pago" : "Revisar" : "Ver detalle"}</Button>{isPending && <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirmation(movement)}>Descartar</Button>}</ItemActions>
      </Item>;
    })}</ItemGroup>}
    <div className="flex flex-wrap gap-2">{cursor && <Button variant="outline" className="min-h-11" disabled={busy || loading} onClick={() => setCursor(null)}>Volver al inicio</Button>}{data?.nextCursor && <Button variant="outline" className="min-h-11" disabled={busy || loading} onClick={() => setCursor(data.nextCursor)}>Ver más</Button>}</div>
    <p className="text-xs text-muted-foreground">Se actualiza al volver a AFP y cada 30 segundos mientras esta sección está visible.</p>
    {detail && <CaptureMovementEditor key={detail.movement.id} detail={detail} configuration={configuration} userId={userId} onSaved={refresh} onClose={() => setDetail(null)} restoreFocus={restoreFocus} />}
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><AlertDialogContent onCloseAutoFocus={restoreFocus}><AlertDialogHeader><AlertDialogTitle>Descartar este aviso</AlertDialogTitle><AlertDialogDescription>Se moverá a Descartados. No registrará un gasto, pago ni devolución.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={busy} onClick={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { await apiFetch("/api/captures/movements", { method: "PATCH", expectedUserId: userId, errorMode: "inline", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: confirmation.id, action: "discard" }) }); setConfirmation(null); await refresh(); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }}>{busy ? "Descartando…" : "Descartar aviso"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

export default function CaptureReview({ userId, initialTab, initialCardId }) {
  const tab = views[initialTab] || ["ajustes", "conciliar"].includes(initialTab) ? initialTab : "pendientes";
  const cardId = initialCardId || "";
  const { captureFocus, restoreFocus } = useDialogFocus();
  const { data: configuration, error, refresh, region } = useCaptureResource("/api/captures/configuration", userId);
  function navigate(value) {
    const params = new URLSearchParams({ tipo: value });
    if (cardId) params.set("tarjeta", cardId);
    window.history.replaceState(null, "", `/registro-automatico?${params}`);
  }
  return <section ref={region} className="flex min-w-0 flex-col gap-6" aria-label="Registro automático">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex flex-col gap-1"><h2 className="text-2xl font-semibold tracking-tight">Registro automático</h2><p className="max-w-prose text-sm text-muted-foreground">Revisa lo que AFP detectó y decide qué registrar.</p></div><Button variant={tab === "ajustes" ? "secondary" : "outline"} className="min-h-11 self-start" onClick={() => navigate(tab === "ajustes" ? "pendientes" : "ajustes")}>{tab === "ajustes" ? "Volver a pendientes" : "Ajustes"}</Button>{tab === "conciliar" && <Button variant="outline" className="min-h-11 self-start" onClick={() => navigate("gastos")}>Volver a gastos detectados</Button>}</div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription><Button variant="outline" className="min-h-11" onClick={refresh}>Reintentar</Button></Alert>}
    {!configuration ? <Skeleton className="h-32 w-full" /> : <Tabs value={tab} onValueChange={navigate} className="min-w-0 gap-6">
      <TabsList className="grid h-auto! w-full grid-cols-3 gap-1 sm:flex sm:w-fit">{Object.entries(views).map(([value, [, label]]) => <TabsTrigger key={value} value={value} className="min-h-11 px-3">{label}</TabsTrigger>)}</TabsList>
      {Object.keys(views).map(view => <TabsContent key={view} value={view} className="flex flex-col gap-5">
        <CaptureInbox key={view} userId={userId} configuration={configuration} view={view} cardId={configuration.cards.some(row => row.id === cardId) ? cardId : ""} onCardChange={value => { const params = new URLSearchParams({ tipo: tab }); if (value) params.set("tarjeta", value); window.history.replaceState(null, "", `/registro-automatico?${params}`); }} />
        {view === "gastos" && <Button variant="outline" className="min-h-11 self-start" onClick={() => navigate("conciliar")}>Comparar con estado de cuenta</Button>}
      </TabsContent>)}
      {tab === "ajustes" && <section aria-label="Ajustes de registro automático"><Tabs defaultValue="cards" className="gap-5"><TabsList className="h-auto! max-w-full flex-wrap"><TabsTrigger value="cards" className="min-h-11">Tarjetas y reglas</TabsTrigger><TabsTrigger value="accounts" className="min-h-11">Cuentas</TabsTrigger><TabsTrigger value="phone" className="min-h-11">Teléfono</TabsTrigger></TabsList><TabsContent value="cards"><CaptureConfigurationPanel configuration={configuration} userId={userId} refresh={refresh} captureFocus={captureFocus} restoreFocus={restoreFocus} /></TabsContent><TabsContent value="accounts"><CaptureMoneySettings configuration={configuration} userId={userId} refresh={refresh} restoreFocus={restoreFocus} /></TabsContent><TabsContent value="phone"><CaptureDevices userId={userId} /></TabsContent></Tabs></section>}
      {tab === "conciliar" && <section aria-label="Comparar estado de cuenta"><CaptureReconciliation configuration={configuration} userId={userId} onChanged={refresh} /></section>}
    </Tabs>}
    <Collapsible className="border-t pt-3"><CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 px-0">Cómo funciona el registro automático</Button></CollapsibleTrigger><CollapsibleContent className="flex max-w-prose flex-col gap-3 pb-3 text-sm text-muted-foreground"><p>Google Wallet es la fuente principal. Con el respaldo bancario activo, AFP espera 15 minutos desde que recibe el aviso del banco antes de registrar la compra.</p><p>Las transferencias entre cuentas usan sus propias reglas de origen y destino. Los cargos genéricos de BBVA requieren tu decisión. Los pagos de tarjeta se registran con sus propias reglas. Las devoluciones siempre requieren tu confirmación. Los avisos incompletos o con posibles duplicados quedan por revisar.</p><p>Los avisos de Uber, DiDi y Uber Eats se guardan para revisión; un aviso de viaje o pedido no demuestra un cobro final.</p><p>AFP solo puede detectar las notificaciones que recibe del teléfono. Compara tus gastos con el estado de cuenta para encontrar compras sin aviso.</p></CollapsibleContent></Collapsible>
  </section>;
}
