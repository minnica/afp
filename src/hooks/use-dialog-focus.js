"use client";

import { useCallback, useRef } from "react";

// Conserva el botón que abre un diálogo controlado desde una tabla o lista.
export function useDialogFocus() {
  const triggerRef = useRef(null);

  const captureFocus = useCallback((event) => {
    const trigger = event.target.closest?.("button, [role='button']");
    if (trigger && !trigger.closest("[role='dialog'], [role='alertdialog']")) {
      triggerRef.current = trigger;
    }
  }, []);

  const restoreFocus = useCallback((event) => {
    if (triggerRef.current?.isConnected) {
      event.preventDefault();
      triggerRef.current.focus({ preventScroll: true });
    }
  }, []);

  return { captureFocus, restoreFocus };
}
