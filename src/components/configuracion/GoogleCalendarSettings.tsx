"use client";
import type { UiResponse } from "@/lib/uiResponseSchemas";
import { errorMessage } from "@/lib/uiTypes";


import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { uiFetch as apiFetch } from "@/lib/uiClient";
import { CalendarDays, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const types = [["cuts", "Cortes de tarjetas"], ["cardPayments", "Pagos de tarjetas"], ["subscriptions", "Suscripciones"], ["receivables", "Cuentas por cobrar"], ["payables", "Cuentas por pagar"]] as const;
const initialPreferences = { types: types.map(([type]) => type), showAmounts: false, reminders: true };
const statusLabels = { CONNECTED: "Conectado", DISCONNECTED: "Sin conectar", RECONNECT_REQUIRED: "Reconectar", DISCONNECTING: "Desconectando" };

export default function GoogleCalendarSettings({ userId }: { userId: string }) {
  const [data, setData] = useState<UiResponse<"calendar/google"> | null>(null), [draft, setDraft] = useState<UiResponse<"calendar/google">["preferences"]>(initialPreferences);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(""), [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const mounted = useRef(true), revision = useRef(0), dirty = useRef(false), request = useRef<AbortController | null>(null);
  const load = useCallback(async (background = false) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const version = ++revision.current;
    try {
      const response = await apiFetch("/api/calendar/google", { expectedUserId: userId, signal: controller.signal, errorMode: "inline" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo consultar la conexión.");
      if (!mounted.current || version !== revision.current) return;
      setData(result);
      if (!dirty.current) setDraft(result.preferences);
      if (!background) setError("");
    } catch (err) { if (!controller.signal.aborted && mounted.current) setError(errorMessage(err) || "No se pudo consultar la conexión."); }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    async function initialize() {
      await load();
      if (!mounted.current) return;
      const result = new URLSearchParams(window.location.search).get("calendar");
      if (result) {
        setMessage(result === "connected" ? "Cuenta conectada. Estamos preparando tu calendario AFP."
          : result === "DENIED" ? "La conexión fue cancelada. Puedes intentarlo de nuevo."
            : result === "ACCOUNT_MISMATCH" ? "Elige la misma cuenta de Google que conectaste anteriormente."
              : "No se pudo completar la conexión. Iníciala de nuevo desde aquí.");
        const url = new URL(window.location.href); url.searchParams.delete("calendar"); window.history.replaceState(null, "", url);
      }
    }
    initialize();
    const refresh = () => { if (document.visibilityState === "visible") load(true); };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    return () => { mounted.current = false; request.current?.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [load]);

  function change(value: UiResponse<"calendar/google">["preferences"]) { dirty.current = true; setHasChanges(true); setDraft(value); setMessage(""); }
  async function act(action: "connect" | "sync" | "disconnect" | "preferences") {
    if (busy) return;
    setBusy(action); setError(""); setMessage("");
    try {
      const save = action === "preferences";
      const response = await apiFetch(`/api/calendar/google${save ? "" : `/${action}`}`, {
        method: save ? "PATCH" : "POST", expectedUserId: userId, errorMode: "inline",
        ...(save ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo completar la acción.");
      if (!mounted.current) return;
      if (action === "connect") { window.location.assign(result.url!); return; }
      if (save) { dirty.current = false; setHasChanges(false); }
      setMessage(save ? "Preferencias guardadas. Actualizaremos el calendario." : action === "sync" ? "Sincronización solicitada. El estado se actualizará aquí." : "Estamos retirando los eventos futuros de AFP y desconectando la cuenta.");
      setConfirmDisconnect(false);
      await load(true);
    } catch (err) { if (mounted.current) setError(errorMessage(err) || "No se pudo completar la acción."); }
    finally { if (mounted.current) setBusy(""); }
  }

  const connected = data?.status === "CONNECTED", disconnecting = data?.status === "DISCONNECTING";
  const disabled = Boolean(busy || disconnecting);
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><CalendarDays aria-hidden="true" />Google Calendar</CardTitle>
      <CardDescription>Tus cortes, pagos y cobros en el calendario y en el widget de tu celular.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-5">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
      {!data ? <>{error ? <Button variant="outline" onClick={() => load()}>Reintentar</Button> : <Skeleton className="h-28 w-full" />}</> : <>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.status === "RECONNECT_REQUIRED" ? "warning" : "secondary"}>{statusLabels[data.status]}</Badge>
          {data.email && <span className="break-all text-sm text-muted-foreground">{data.email}</span>}
        </div>
        {!data.configured && <Alert><AlertDescription>La conexión con Google Calendar está en preparación. Tus preferencias se pueden guardar desde ahora.</AlertDescription></Alert>}
        {data.error && <Alert variant="destructive"><AlertDescription>{data.error}</AlertDescription></Alert>}
        {data.lastSyncedAt && <p className="text-sm text-muted-foreground">Última sincronización: {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.lastSyncedAt))}.</p>}
        {(data.syncing || (connected && data.pending)) && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />{data.syncing ? "Sincronizando calendario…" : "Hay cambios por sincronizar."}</p>}
        <div className="flex flex-wrap gap-2">
          {(!connected && !disconnecting) && <Button disabled={disabled || !data.configured} onClick={() => act("connect")} className="min-h-11">{busy === "connect" && <Spinner />}{data.status === "RECONNECT_REQUIRED" ? "Volver a conectar Google" : "Conectar Google Calendar"}</Button>}
          {connected && <Button variant="outline" disabled={disabled || data.syncing} onClick={() => act("sync")} className="min-h-11"><RefreshCw data-icon="inline-start" />Sincronizar ahora</Button>}
          {data.calendarUrl && <Button variant="outline" asChild className="min-h-11"><a href={data.calendarUrl} target="_blank" rel="noopener noreferrer"><ExternalLink data-icon="inline-start" />Abrir calendario</a></Button>}
        </div>
        <p className="text-sm text-muted-foreground">AFP crea su propio calendario y consulta la lista de calendarios para encontrarlo. Los nombres de tus registros aparecerán en Google; tú decides si incluir importes. <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Política de privacidad</a>.</p>
        <Separator />
        <form onSubmit={event => { event.preventDefault(); act("preferences"); }} className="flex flex-col gap-5">
          <FieldSet disabled={disabled}>
            <FieldLegend>Qué mostrar en el calendario</FieldLegend>
            <FieldDescription>Los cambios se administran en AFP y se reflejan automáticamente en Google.</FieldDescription>
            <FieldGroup>
              {types.map(([type, label]) => <Field key={type} orientation="horizontal">
                <Checkbox id={`calendar-${type}`} checked={draft.types.includes(type)} disabled={disabled} onCheckedChange={checked => change({ ...draft, types: checked ? [...draft.types, type] : draft.types.filter(value => value !== type) })} />
                <FieldLabel htmlFor={`calendar-${type}`} className="min-h-11 flex-1">{label}</FieldLabel>
              </Field>)}
              <Field orientation="horizontal"><Checkbox id="calendar-amounts" checked={draft.showAmounts} disabled={disabled} onCheckedChange={checked => change({ ...draft, showAmounts: checked === true })} /><FieldLabel htmlFor="calendar-amounts" className="min-h-11 flex-1">Mostrar importes en los detalles</FieldLabel></Field>
              <Field orientation="horizontal"><Checkbox id="calendar-reminders" checked={draft.reminders} disabled={disabled} onCheckedChange={checked => change({ ...draft, reminders: checked === true })} /><FieldLabel htmlFor="calendar-reminders" className="min-h-11 flex-1">Recordarme un día antes</FieldLabel></Field>
            </FieldGroup>
          </FieldSet>
          <Button type="submit" disabled={disabled || !hasChanges} className="min-h-11 self-start">{busy === "preferences" && <Spinner />}Guardar preferencias</Button>
        </form>
        <p className="text-sm text-muted-foreground">El calendario muestra los próximos 120 días y el historial reciente. Los pagos parciales conservan su pendiente; los liquidados dejan de generar recordatorios. Las fechas previstas se identifican en los detalles.</p>
        <p className="text-sm text-muted-foreground">Para verlo en tu celular: mantén pulsada la pantalla de inicio → Widgets → Calendar → Mes o Agenda. Comprueba que el calendario AFP esté visible y sincronizado.</p>
      </>}
    </CardContent>
    {data && data.status !== "DISCONNECTED" && <CardFooter>
      <Button variant="ghost" disabled={disabled || data.syncing} onClick={() => setConfirmDisconnect(true)} className="min-h-11"><Unplug data-icon="inline-start" />Desconectar Google</Button>
    </CardFooter>}
    <AlertDialog open={confirmDisconnect} onOpenChange={open => { if (!busy) setConfirmDisconnect(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Desconectar Google Calendar</AlertDialogTitle><AlertDialogDescription>
          {data?.status === "RECONNECT_REQUIRED" ? "Google ya no permite actualizar el calendario. AFP eliminará su credencial guardada; retira los eventos o recordatorios restantes desde Google Calendar."
            : "AFP retirará sus eventos de hoy en adelante y dejará de sincronizar. El historial anterior y los registros financieros se conservan."}
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={Boolean(busy)}>Conservar conexión</AlertDialogCancel><AlertDialogAction disabled={Boolean(busy)} onClick={event => { event.preventDefault(); act("disconnect"); }}>{busy === "disconnect" && <Spinner />}Desconectar</AlertDialogAction></AlertDialogFooter>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}
