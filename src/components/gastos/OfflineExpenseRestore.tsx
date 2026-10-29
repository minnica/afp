"use client";

import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { restoreOfflineExpenses } from "@/lib/offlineExpenses";
import { errorMessage } from "@/lib/uiTypes";

export default function OfflineExpenseRestore({ userId, onRestored }: { userId: string; onRestored: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return <div className="flex flex-col gap-2">
    <input ref={input} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Respaldo de gastos pendientes" disabled={busy}
      onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setBusy(true); setError(""); setNotice("");
        void (async () => {
          try {
            const value: unknown = JSON.parse(await file.text());
            await restoreOfflineExpenses(userId, value);
            setNotice("Respaldo restaurado. Los pendientes se enviarán al recuperar conexión con esta cuenta.");
            await onRestored();
          } catch (err) { setError(errorMessage(err)); }
          finally { setBusy(false); }
        })();
      }} />
    <Button variant="outline" className="min-h-11 self-start" disabled={busy} onClick={() => input.current?.click()}>
      {busy ? "Restaurando…" : "Restaurar respaldo de pendientes"}
    </Button>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
  </div>;
}
