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
import CaptureReview from "@/components/configuracion/CaptureReview";

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
      setNotice(action.code ? "Teléfono autorizado. Vuelve a la APK y pulsa Consultar estado."
        : action.action === "source" ? "Preferencia guardada. Se aplicará cuando el teléfono consulte su configuración; comprueba el último estado reportado."
        : action.action === "revoke" ? "Autorización revocada. Sus eventos recibidos conservan su propietario."
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
      <CardTitle>Captura automática</CardTitle>
      <CardDescription>Autoriza tu teléfono y revisa los avisos recibidos. El registro automático requiere validar cada tarjeta y formato.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-6">
      <form onSubmit={form.handleSubmit(value => setConfirmation(value))} className="flex flex-col gap-3">
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.code)}>
            <FieldLabel htmlFor="capture-code">Código del teléfono</FieldLabel>
            <Input id="capture-code" placeholder="AB12-CD34-EF56" autoComplete="off" autoCapitalize="characters"
              spellCheck={false} maxLength={14} aria-invalid={Boolean(form.formState.errors.code)}
              aria-describedby={form.formState.errors.code ? "capture-code-error" : undefined} disabled={busy} {...form.register("code")} />
            <FieldError id="capture-code-error" errors={[form.formState.errors.code]} />
          </Field>
        </FieldGroup>
        <p className="text-sm text-muted-foreground">Genera el código en la pantalla nativa de AFP. Vence a los cinco minutos y solo se puede autorizar una vez.</p>
        <Button type="submit" className="min-h-11 self-start" disabled={busy}>Autorizar teléfono</Button>
      </form>
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
        ? <Empty><EmptyDescription>No hay teléfonos vinculados. Genera un código en la APK para empezar.</EmptyDescription></Empty>
        : <ItemGroup className="gap-3">{devices.map(device => <Item key={device.id} variant="outline" className="flex-wrap">
          <ItemContent className="min-w-0 basis-full sm:basis-0">
            <ItemTitle className="break-words">{device.name}</ItemTitle>
            <ItemDescription>{device.lastSeenAt ? `Última consulta o recepción: ${new Date(device.lastSeenAt).toLocaleString("es-MX")}` : "Sin comunicación confirmada desde la autorización"}</ItemDescription>
            <Badge variant="secondary">{device.revokedAt ? "Revocado" : device.pausedAt ? "Pausado" : "Autorizado"}</Badge>
            <ItemDescription>{device.reportedAt ? `Estado reportado: ${new Date(device.reportedAt).toLocaleString("es-MX")}. No es una comprobación en tiempo real.` : "Sin estado nativo reportado. Requiere APK 0.4.0 o posterior; consulta el estado en el teléfono."}</ItemDescription>
            {device.reportedState && <ItemDescription>{device.reportedState.notificationAccess ? "Acceso a avisos concedido" : "Sin acceso a avisos"} · {device.reportedState.listenerConnected ? "Lector conectado" : "Lector desconectado"} · {device.reportedState.active ? "Captura activa" : "Captura local pausada"} · {device.reportedState.deliveryPaused ? "Envíos pausados localmente" : "Envíos habilitados"} · {device.reportedState.batteryExempt ? "Batería sin restricción" : "Revisar batería"}</ItemDescription>}
            {!device.revokedAt && <Collapsible className="flex flex-col gap-3"><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 h-auto max-w-full self-start whitespace-normal text-left">Aplicaciones de {device.name}</Button></CollapsibleTrigger><CollapsibleContent>
              <ItemGroup>{Object.entries(captureSources).filter(([sourcePackage]) => sourcePackage !== "com.garatachia.afp.paymentreceipts").map(([sourcePackage, label]) => {
                const paused = (device.pausedPackages || []).includes(sourcePackage);
                const applied = device.reportedState && (device.reportedState.pausedPackages || []).includes(sourcePackage) === paused;
                const selected = device.reportedState?.selectedPackages?.includes(sourcePackage);
                return <Item key={sourcePackage} className="flex-wrap px-0"><ItemContent className="min-w-0 basis-32"><ItemTitle>{label}</ItemTitle><ItemDescription>{paused ? "Pausa solicitada" : "Permitida por AFP"} · {device.reportedState ? selected ? "Seleccionada en el teléfono" : "No seleccionada en el teléfono" : "Selección local desconocida"} · {applied ? "Preferencia reportada como aplicada" : "Pendiente de confirmar por el teléfono"}</ItemDescription></ItemContent>
                  <ItemActions><Button variant="outline" className="min-h-11" disabled={busy} aria-label={`${paused ? 'Reanudar' : 'Pausar'} ${label} en ${device.name}`} onClick={() => setConfirmation({ deviceId: device.id, action: 'source', sourcePackage, paused: !paused, name: label })}>{paused ? "Reanudar" : "Pausar"}</Button></ItemActions></Item>;
              })}</ItemGroup>
              <p className="text-sm text-muted-foreground">La pausa remota se aplica al consultar estado o sincronizar con conexión (recuperación periódica de Android, sin plazo exacto). Conserva los avisos ya guardados. Reanudar aquí respeta tu selección local de fuentes.</p>
            </CollapsibleContent></Collapsible>}
          </ItemContent>
          {!device.revokedAt && <ItemActions className="flex-wrap">
            <Button variant="outline" className="min-h-11" disabled={busy}
              onClick={() => setConfirmation({ deviceId: device.id, action: device.pausedAt ? "resume" : "pause", name: device.name })}>{device.pausedAt ? "Reanudar" : "Pausar"}</Button>
            <Button variant="destructive" className="min-h-11" disabled={busy}
              onClick={() => setConfirmation({ deviceId: device.id, action: "revoke", name: device.name })}>Revocar</Button>
          </ItemActions>}
        </Item>)}</ItemGroup>}
      <p className="text-sm text-muted-foreground">Cerrar AFP o salir de la sesión web conserva la autorización del teléfono. Usa Pausar o Revocar para detener la recepción.</p>
      <CaptureReview key={userId} userId={userId} />
    </CardContent>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.code ? "¿Autorizar este teléfono?" : confirmation?.action === "revoke" ? "¿Revocar la autorización?" : "¿Cambiar la recepción?"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.code
            ? `Confirma que ${confirmation.code} coincide con el código que acabas de generar en tu APK de AFP. El teléfono quedará vinculado a esta cuenta.`
            : confirmation?.action === "revoke" ? `${confirmation.name} ya no podrá enviar eventos. Una nueva autorización requerirá otra identidad; los datos anteriores conservan su propietario.`
              : confirmation?.action === "source" ? `${confirmation.name}: ${confirmation.paused ? "se pausarán nuevas capturas" : "se permitirá capturar de nuevo si la fuente está seleccionada en la APK"} al recibir la configuración. Los pendientes guardados se conservan.`
                : `${confirmation?.name}: ${confirmation?.action === "pause" ? "se detendrá la recepción de eventos" : "se permitirá recibir eventos de nuevo"}.`}</AlertDialogDescription>
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
