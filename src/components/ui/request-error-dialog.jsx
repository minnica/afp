"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Alert02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { supabase } from "@/lib/supabase";
import {
  dismissRecovery, getRecoverySnapshot, getServerRecoverySnapshot,
  resetRecovery, retryRecovery, subscribeRecovery,
} from "@/lib/requestRecovery";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function RequestErrorDialog() {
  const { items, busy, retryFailed } = useSyncExternalStore(subscribeRecovery, getRecoverySnapshot, getServerRecoverySnapshot);
  const pathname = usePathname();
  const router = useRouter();
  const previousPath = useRef(pathname);
  const focusRef = useRef(null);
  const titleRef = useRef(null);
  const [now, setNow] = useState(() => Date.now());
  const error = items.find((item) => !item.retryable) || items[0];
  const retryAt = Math.max(0, ...items.map((item) => item.retryAt || 0));
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const refreshOnly = items.length > 0 && items.every((item) => item.mutationCompleted && item.retryable);
  const tone = refreshOnly ? "warning" : error?.tone || "destructive";
  const retryLabel = refreshOnly ? "Actualizar" : "Reintentar";
  const busyLabel = refreshOnly ? "Actualizando…" : "Reintentando…";

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      resetRecovery();
      previousPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    let owner;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (owner && session?.user.id !== owner && previousPath.current !== "/login")) resetRecovery();
      owner = session?.user.id;
    });
    return () => { subscription.unsubscribe(); resetRecovery(); };
  }, []);

  return (
    <AlertDialog open={items.length > 0} onOpenChange={(open) => { if (!open && !busy) dismissRecovery(); }}>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-sm"
        aria-busy={busy}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const active = document.activeElement;
          focusRef.current = active?.closest("[role='dialog']") || active;
          titleRef.current?.focus({ preventScroll: true });
          setNow(Date.now());
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Esperar a que el formulario quite disabled y conservar el teclado cerrado.
          requestAnimationFrame(() => {
            if (focusRef.current?.isConnected) focusRef.current.focus({ preventScroll: true });
          });
        }}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
      >
        <AlertDialogHeader className="sm:grid-cols-[auto_1fr]">
          <AlertDialogMedia variant={tone}>
            <HugeiconsIcon icon={tone === "warning" ? Alert02Icon : AlertCircleIcon} strokeWidth={2} aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {refreshOnly ? "Cambio guardado" : error?.title || "No pudimos completar la acción"}
          </AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {refreshOnly ? "La lista no se actualizó. Vuelve a cargarla." : error?.message}
            {!refreshOnly && error?.hint ? <span className="mt-2 block">{error.hint}</span> : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div role="status" aria-live="polite" className="sr-only">
          {busy ? busyLabel : retryFailed ? "El reintento falló." : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={busy}>
            {error?.retryable ? "Ahora no" : "Cerrar"}
          </AlertDialogCancel>
          {error?.action === "login" ? (
            <Button className="min-h-11" onClick={() => { dismissRecovery(); router.push("/login"); }}>
              Iniciar sesión
            </Button>
          ) : error?.retryable ? (
            <Button className="min-h-11" disabled={busy || remaining > 0} onClick={retryRecovery}>
              {busy ? <Spinner data-icon="inline-start" aria-hidden="true" /> : <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" aria-hidden="true" />}
              {busy ? busyLabel : remaining ? `${retryLabel} en ${remaining} s` : retryLabel}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
