"use client";
import type { OfflineExpense } from "@/lib/offlineExpenseContracts";
import { errorMessage } from "@/lib/uiTypes";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { resolveOfflineCapture } from "@/lib/offlineExpenses";
import { useState } from "react";

export default function OfflineCaptureConflicts({ userId, pending, onResolved, disabled }: { userId: string; pending: OfflineExpense[]; onResolved: () => Promise<void>; disabled: boolean }) {
  const [confirmation, setConfirmation] = useState<{ row: OfflineExpense; distinct: boolean } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { captureFocus, restoreFocus } = useDialogFocus();
  const conflicts = pending.filter(row => row.lastStatus === 409 && row.lastError?.includes("captura por conciliar"));
  if (!conflicts.length && !confirmation) return null;
  return <section className="mb-5 flex flex-col gap-3" onClickCapture={captureFocus} aria-label="Compras pendientes de distinguir">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <ItemGroup>{conflicts.map(row => <Item key={row.clientId} className="flex-wrap"><ItemContent><ItemTitle>{String(row.payload.concept ?? "")}</ItemTitle><ItemDescription>{String(row.payload.amount ?? "")} MXN · Hay una captura con tarjeta e importe similares. Revisa los gastos antes de decidir.</ItemDescription></ItemContent>
      <Button variant="outline" className="min-h-11" disabled={disabled || busy} onClick={() => setConfirmation({ row, distinct: true })}>Es otra compra</Button>
      <Button variant="outline" className="min-h-11" disabled={disabled || busy} onClick={() => setConfirmation({ row, distinct: false })}>Conservar gasto existente</Button>
    </Item>)}</ItemGroup>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><AlertDialogContent onCloseAutoFocus={restoreFocus}><AlertDialogHeader><AlertDialogTitle>{confirmation?.distinct ? "Registrar otra compra" : "Retirar el pendiente local"}</AlertDialogTitle><AlertDialogDescription>{confirmation?.distinct ? "El pendiente se enviará como una compra distinta con el mismo identificador de operación." : "Confirma que ya existe este gasto y revisaste sus datos. Se retirará esta captura local; sus notas y aportaciones locales no se copiarán al gasto existente. Puedes editarlo antes de continuar."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11" disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction className="min-h-11" disabled={busy} onClick={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { await resolveOfflineCapture(userId, confirmation!.row.clientId, confirmation!.distinct); setConfirmation(null); await onResolved(); }
      catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
    }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
