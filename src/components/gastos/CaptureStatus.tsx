"use client";

import { Badge } from "@/components/ui/badge";
import { captureOrigin } from "@/lib/capturePresentation";

export default function CaptureStatus({ record }: { record: { amount?: unknown; refundOriginalAmount?: unknown; reconciliationStatus?: string; reconciledAt?: string | null; captureMovements?: { events?: { sourcePackage: string }[] }[] } }) {
  const origin = captureOrigin(record);
  return <>{origin && <span className="text-xs text-muted-foreground">{origin}</span>}
    {record.refundOriginalAmount != null && <><Badge variant="secondary">{Number(record.amount) === 0 ? "Devolución total" : "Devolución parcial"}</Badge>
      <span className="text-xs text-muted-foreground">Original ${Number(record.refundOriginalAmount).toFixed(2)} · devuelto ${(Number(record.refundOriginalAmount) - Number(record.amount)).toFixed(2)}</span></>}
    {record.reconciledAt ? <Badge variant="secondary">Conciliado</Badge>
      : record.reconciliationStatus === "PENDING" ? <Badge variant="warning">Por conciliar</Badge> : null}</>;
}
