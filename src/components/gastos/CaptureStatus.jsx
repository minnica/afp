"use client";
import { Badge } from "@/components/ui/badge";
import { captureOrigin } from "@/lib/capturePresentation";

export default function CaptureStatus({ record }) {
  const origin = captureOrigin(record);
  return <>{origin && <span className="text-xs text-muted-foreground">{origin}</span>}
    {record.reconciledAt ? <Badge variant="secondary">Conciliado</Badge>
      : record.reconciliationStatus === "PENDING" ? <Badge variant="warning">Por conciliar</Badge> : null}</>;
}
