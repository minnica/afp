"use client";

import { useCallback, useRef } from "react";

// Conserva el botón que abre un diálogo controlado desde una tabla o lista.
export function useDialogFocus() {
  const triggerRef = useRef<HTMLElement | null>(null);

  const captureFocus = useCallback((event: { target: EventTarget | null }) => {
    const trigger = (event.target instanceof Element ? event.target : null)?.closest<HTMLElement>("button, [role='button']");
    if (trigger && !trigger.closest("[role='dialog'], [role='alertdialog']")) {
      triggerRef.current = trigger;
    }
  }, []);

  const restoreFocus = useCallback((event: { preventDefault: () => void }) => {
    if (triggerRef.current?.isConnected) {
      event.preventDefault();
      triggerRef.current.focus({ preventScroll: true });
    }
  }, []);

  return { captureFocus, restoreFocus };
}
