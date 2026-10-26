"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch } from "@/lib/apiFetch";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { captureSources } from "@/lib/capturePresentation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const schema = z.object({ code: z.string().transform(value => value.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-F0-9]{12}$/, "Escribe los doce caracteres del código de tu teléfono.")) });

export default function CaptureDevices({ userId }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const { captureFocus, restoreFocus } = useDialogFocus();
  const controller = useRef(null);
  const requestVersion = useRef(0);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { code: "" } });
  const refresh = useCallback(async signal => {
    const version = ++requestVersion.current;
    const response = await apiFetch("/api/captures/devices", { expectedUserId: userId, errorMode: "inline", signal });
    const data = await response.json();
    if (!signal.aborted && version === requestVersion.current) setDevices(data.devices);
  }, [userId]);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const load = () => refresh(abort.signal).catch(err => { if (!abort.signal.aborted) setError(err.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    load();
    window.addEventListener("focus", load);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => { abort.abort(); clearInterval(interval); window.removeEventListener("focus", load); };
  }, [refresh]);

  async function perform() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const action = confirmation;
    try {
      const response = await apiFetch(action.code ? "/api/captures/pairings" : "/api/captures/devices", {
        method: "PATCH", expectedUserId: userId, errorMode: "inline", signal: controller.current.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      const { device } = await response.json();
      if (controller.current.signal.aborted) return;
      requestVersion.current++;
      setDevices(previous => [device, ...previous.filter(row => row.id !== device.id)]);
      setNotice(action.code ? "Teléfono autorizado. Abre AFP en el teléfono y pulsa Consultar estado."
        : action.action === "source" ? "Cambio guardado. Se aplicará cuando el teléfono sincronice con AFP."
        : action.action === "revoke" ? "Teléfono desvinculado. Se conservan sus avisos anteriores."
          : action.action === "pause" ? "Recepción pausada para este teléfono." : "Recepción reanudada.");
      if (action.code) form.reset();
    } catch (err) {
      if (!controller.current.signal.aborted) setError(`${err.message} Si se perdió la respuesta, actualiza la lista para comprobar el resultado.`);
    } finally {
      setBusy(false); setConfirmation(null);
    }
  }

  return <Card onClickCapture={captureFocus}>
    <CardHeader>
      <CardTitle>Teléfono y aplicaciones</CardTitle>
      <CardDescription>Elige qué notificaciones puede recibir AFP.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-6">
      <Collapsible defaultOpen={false} className="flex flex-col gap-3"><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 self-start">Vincular otro teléfono</Button></CollapsibleTrigger><CollapsibleContent><form onSubmit={form.handleSubmit(value => setConfirmation(value))} className="flex flex-col gap-3">
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.code)}>
            <FieldLabel htmlFor="capture-code">Código del teléfono</FieldLabel>
            <Input id="capture-code" placeholder="AB12-CD34-EF56" autoComplete="off" autoCapitalize="characters"
              spellCheck={false} maxLength={14} aria-invalid={Boolean(form.formState.errors.code)}
              aria-describedby={form.formState.errors.code ? "capture-code-error" : undefined} disabled={busy} {...form.register("code")} />
            <FieldError id="capture-code-error" errors={[form.formState.errors.code]} />
          </Field>
        </FieldGroup>
        <p className="text-sm text-muted-foreground">Abre AFP en tu teléfono y genera un código. Tienes cinco minutos para usarlo.</p>
        <Button type="submit" className="min-h-11 self-start" disabled={busy}>Autorizar teléfono</Button>
      </form></CollapsibleContent></Collapsible>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div role="status">{notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">Tus dispositivos</p>
        <Button variant="outline" className="min-h-11" disabled={busy || loading} onClick={async () => {
          setError(""); setLoading(true);
          try { await refresh(controller.current.signal); } catch (err) { if (!controller.current.signal.aborted) setError(err.message); }
          finally { setLoading(false); }
        }}>Actualizar lista</Button>
      </div>
      {loading ? <Skeleton className="h-20 w-full" /> : devices.length === 0
        ? <Empty><EmptyDescription>No tienes teléfonos vinculados. Pulsa Vincular otro teléfono para empezar.</EmptyDescription></Empty>
        : <ItemGroup className="gap-3">{devices.map(device => <Item role="listitem" key={device.id} variant="outline" className="flex-wrap">
          <ItemContent className="min-w-0 basis-full sm:basis-0">
            <ItemTitle className="break-words">{device.name}</ItemTitle>
            <ItemDescription>{device.lastSeenAt ? `Última conexión: ${new Date(device.lastSeenAt).toLocaleString("es-MX")}` : "Sin comunicación confirmada desde la autorización"}</ItemDescription>
            <Badge variant="secondary">{device.revokedAt ? "Revocado" : device.pausedAt ? "Pausado" : "Autorizado"}</Badge>
            <ItemDescription>{device.reportedAt ? `Último estado: ${new Date(device.reportedAt).toLocaleString("es-MX")}. Puede haber cambiado desde entonces.` : "Abre AFP en el teléfono y pulsa Consultar estado para conocer sus permisos."}</ItemDescription>
            {device.reportedState && <ItemDescription>{device.reportedState.notificationAccess ? "Acceso a avisos concedido" : "Sin acceso a avisos"} · {device.reportedState.listenerConnected ? "Lector conectado" : "Lector desconectado"} · {device.reportedState.active ? "Captura activa" : "Captura local pausada"} · {device.reportedState.deliveryPaused ? "Envíos pausados localmente" : "Envíos habilitados"} · {device.reportedState.batteryExempt ? "Batería sin restricción" : "Revisar batería"}</ItemDescription>}
            {!device.revokedAt && <Collapsible className="flex flex-col gap-3"><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 h-auto max-w-full self-start whitespace-normal text-left">Aplicaciones de {device.name}</Button></CollapsibleTrigger><CollapsibleContent>
              <ItemGroup>{Object.entries(captureSources).filter(([sourcePackage]) => sourcePackage !== "com.garatachia.afp.paymentreceipts").map(([sourcePackage, label]) => {
                const paused = (device.pausedPackages || []).includes(sourcePackage);
                const applied = device.reportedState && (device.reportedState.pausedPackages || []).includes(sourcePackage) === paused;
                const selected = device.reportedState?.selectedPackages?.includes(sourcePackage);
                return <Item role="listitem" key={sourcePackage} className="flex-wrap px-0"><ItemContent className="min-w-0 basis-32"><ItemTitle>{label}</ItemTitle><ItemDescription>{paused ? "Pausa solicitada" : "Permitida por AFP"} · {device.reportedState ? selected ? "Seleccionada en el teléfono" : "No seleccionada en el teléfono" : "Selección local desconocida"} · {applied ? "Cambio aplicado" : "Cambio por confirmar"}</ItemDescription></ItemContent>
                  <ItemActions><Button variant="outline" className="min-h-11" disabled={busy} aria-label={`${paused ? 'Reanudar' : 'Pausar'} ${label} en ${device.name}`} onClick={() => setConfirmation({ deviceId: device.id, action: 'source', sourcePackage, paused: !paused, name: label })}>{paused ? "Reanudar" : "Pausar"}</Button></ItemActions></Item>;
              })}</ItemGroup>
              <p className="text-sm text-muted-foreground">Los cambios se aplican cuando el teléfono sincroniza con conexión. Para hacerlo ahora, abre AFP allí y pulsa Consultar estado. Los avisos anteriores se conservan.</p>
            </CollapsibleContent></Collapsible>}
          </ItemContent>
          {!device.revokedAt && <ItemActions className="flex-wrap">
            <Button variant="outline" className="min-h-11" disabled={busy}
              onClick={() => setConfirmation({ deviceId: device.id, action: device.pausedAt ? "resume" : "pause", name: device.name })}>{device.pausedAt ? "Reanudar" : "Pausar"}</Button>
            <Button variant="destructive" className="min-h-11" disabled={busy}
              onClick={() => setConfirmation({ deviceId: device.id, action: "revoke", name: device.name })}>Desvincular</Button>
          </ItemActions>}
        </Item>)}</ItemGroup>}
      <p className="text-sm text-muted-foreground">El teléfono sigue enviando avisos aunque cierres esta página. Puedes pausarlo o desvincularlo aquí.</p>
    </CardContent>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.code ? "¿Autorizar este teléfono?" : confirmation?.action === "revoke" ? "¿Desvincular el teléfono?" : "¿Cambiar la recepción?"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.code
            ? `Confirma que ${confirmation.code} coincide con el código que acabas de generar en AFP en tu teléfono. El teléfono quedará vinculado a esta cuenta.`
            : confirmation?.action === "revoke" ? `${confirmation.name} dejará de enviar avisos. Se conservarán los movimientos anteriores. Para volver a vincularlo necesitarás una nueva autorización.`
              : confirmation?.action === "source" ? `${confirmation.name}: ${confirmation.paused ? "se pausarán nuevas capturas" : "se permitirá capturar de nuevo si la fuente está seleccionada en el teléfono"} al recibir la configuración. Los pendientes guardados se conservan.`
                : `${confirmation?.name}: ${confirmation?.action === "pause" ? "dejará de enviar avisos" : "volverá a enviar avisos"}.`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant={confirmation?.action === "revoke" ? "destructive" : "default"} disabled={busy} onClick={event => { event.preventDefault(); perform(); }}>
            {busy && <Spinner />}{busy ? "Guardando…" : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}
