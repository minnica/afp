"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { clearFinancialSessionStorage, clearSyncedFinancialData, closeLocalData, isLocalDataClosed, LOCAL_DATA_EVENT } from "@/lib/localFinancialData";
import { localLogoutRunning, logoutWithLocalData } from "@/lib/logout";
import { backupOfflineExpenses, hasOfflineData, readOfflineExpenses, syncOfflineExpenses } from "@/lib/offlineExpenses";
import type { OfflineExpenseBackup } from "@/lib/offlineExpenses";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/uiTypes";

const LogoutContext = createContext<() => void>(() => {});
export const useLogout = () => useContext(LogoutContext);

export default function LogoutProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<OfflineExpenseBackup | null>(null);
  const [exported, setExported] = useState<OfflineExpenseBackup | null>(null);
  const [copySaved, setCopySaved] = useState(false);
  const [trusted, setTrusted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const actionRunning = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let owner: string | null = null;
    let active = true;
    const forget = (id: string) => {
      closeLocalData(id);
      // Fuera del callback Auth: no espera otras operaciones de Supabase.
      void clearSyncedFinancialData(id).catch(() => { console.error("No se pudo completar la limpieza local al terminar la sesión."); }).finally(() => window.location.replace("/login"));
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const previous = owner;
      owner = session?.user.id ?? null;
      if (event === "SIGNED_OUT" && previous && !localLogoutRunning) {
        queueMicrotask(() => { if (active) forget(previous); });
      } else if (previous && owner && previous !== owner) {
        queueMicrotask(() => { if (active) forget(previous); });
      }
    });
    const clearDrafts = () => {
      if (owner && isLocalDataClosed(owner)) clearFinancialSessionStorage(owner);
    };
    window.addEventListener("storage", clearDrafts);
    window.addEventListener(LOCAL_DATA_EVENT, clearDrafts);
    // Una pestaña restaurada desde bfcache vuelve a comprobar Auth y descarta
    // su estado React; evita mostrar la cuenta anterior al volver atrás.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("storage", clearDrafts);
      window.removeEventListener(LOCAL_DATA_EVENT, clearDrafts);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  async function inspect(id: string) {
    // Primero asigna UUID a la cola anterior dentro de su transacción. Un
    // respaldo posterior conserva esos mismos UUID tras restaurarlo.
    try { await readOfflineExpenses(id); }
    catch (err) { setError(errorMessage(err)); }
    const backup = await backupOfflineExpenses(id);
    setPending(backup);
    return backup;
  }

  async function start() {
    if (actionRunning.current) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    actionRunning.current = true;
    setOpen(true); setBusy(true); setError(""); setNotice("");
    setTrusted(false); setCopySaved(false); setExported(null); setPending(null); setUserId(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) throw new Error("La sesión terminó. Vuelve a iniciar sesión para revisar los pendientes de tu cuenta.");
      setUserId(data.session.user.id);
      await inspect(data.session.user.id);
    } catch (err) { setError(errorMessage(err)); }
    finally { actionRunning.current = false; setBusy(false); }
  }

  async function run(action: () => Promise<void>) {
    if (actionRunning.current) return;
    actionRunning.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (err) { setError(errorMessage(err)); }
    finally { actionRunning.current = false; setBusy(false); }
  }

  const hasPending = pending ? hasOfflineData(pending) : false;
  const copyCurrent = !!exported && JSON.stringify(exported) === JSON.stringify(pending);

  return <LogoutContext.Provider value={() => { void start(); }}>
    {children}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" showCloseButton={false}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const trigger = triggerRef.current?.isConnected ? triggerRef.current
            : document.querySelector<HTMLElement>('[data-slot="app-header"] [data-slot="sheet-trigger"]');
          trigger?.focus({ preventScroll: true });
        }}
        onInteractOutside={event => { if (busy) event.preventDefault(); }}
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Cerrar sesión en este navegador</DialogTitle>
          <DialogDescription>Al salir se borran el respaldo financiero y los borradores de esta cuenta en el navegador.</DialogDescription>
        </DialogHeader>
        {busy && !pending ? <p role="status"><Spinner /> Revisando pendientes…</p> : null}
        {hasPending ? <div className="flex flex-col gap-4">
          <p role="status">{pending!.expenses.length > 0 ? `${pending!.expenses.length} ${pending!.expenses.length === 1 ? "gasto pendiente" : "gastos pendientes"} en este dispositivo.` : "Hay una copia anterior de gastos por revisar."} Sincroniza o descarga una copia antes de salir.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { void run(async () => {
              const result = await syncOfflineExpenses(userId!);
              await inspect(userId!); setExported(null); setCopySaved(false);
              if (result.failedExpenses.length) throw new Error("Quedaron gastos pendientes. Puedes exportarlos o conservarlos en un dispositivo de confianza.");
              setNotice("Todos los gastos quedaron sincronizados.");
            }); }}>Sincronizar pendientes</Button>
            <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { void run(async () => {
              const backup = await inspect(userId!);
              const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
              const link = document.createElement("a"); link.href = url;
              link.download = `afp-pendientes-${new Date().toISOString().slice(0, 10)}.json`;
              document.body.append(link); link.click(); link.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
              setExported(backup); setCopySaved(false);
              setNotice("Comprueba que el archivo se descargó antes de borrar los pendientes. Contiene datos financieros; guárdalo en un lugar privado.");
            }); }}>Exportar pendientes</Button>
          </div>
          <FieldGroup>
            {copyCurrent ? <Field orientation="horizontal">
              <Checkbox id="logout-copy" checked={copySaved} disabled={busy} onCheckedChange={value => setCopySaved(value === true)} />
              <FieldLabel htmlFor="logout-copy">Verifiqué la descarga y quiero borrar los pendientes de este navegador.</FieldLabel>
            </Field> : null}
            <Field orientation="horizontal">
              <Checkbox id="logout-trusted" checked={trusted} disabled={busy} onCheckedChange={value => setTrusted(value === true)} />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="logout-trusted">Este dispositivo es de confianza: conservar pendientes</FieldLabel>
                <FieldDescription>Se recuperan al entrar con la misma cuenta. Quien tenga acceso al navegador podría leerlos; evita esta opción en equipos compartidos.</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </div> : pending ? <p role="status">No hay gastos pendientes por enviar.</p> : null}
        <p className="text-muted-foreground">La captura nativa Android seguirá vinculada. Para detenerla, revoca el teléfono en Registro automático → Ajustes antes de salir.</p>
        {notice ? <p role="status">{notice}</p> : null}
        {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setOpen(false)}>Seguir en AFP</Button>
          <Button className="min-h-11" disabled={busy || !pending || (hasPending && !trusted && !(copyCurrent && copySaved))} onClick={() => { void run(async () => {
            await logoutWithLocalData({ userId: userId!, keepPending: trusted,
              exported: copySaved ? exported : null,
              signOut: async () => {
                const { data, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) throw sessionError;
                if (data.session && data.session.user.id !== userId) throw new Error("La cuenta cambió. Cierra este diálogo y revisa la sesión actual.");
                const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
                if (signOutError) throw signOutError;
              } });
            window.location.replace("/login");
          }); }}>{busy ? <Spinner /> : null}{busy ? "Procesando…" : "Cerrar sesión"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </LogoutContext.Provider>;
}
