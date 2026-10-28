import type { Receivable } from "@/lib/uiTypes";

function money(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", signDisplay: "always" }).format(value);
}

export default function ReceivableBalanceAdjustment({ receivable }: { receivable: Pick<Receivable, "balanceAdjustment" | "balanceAdjustmentNotes"> }) {
  const adjustment = Number(receivable.balanceAdjustment || 0);
  if (!adjustment) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Conciliación de saldo</span>
        <span className="font-medium tabular-nums">{money(adjustment)}</span>
      </p>
      <p className="max-w-prose break-words text-xs text-muted-foreground">{receivable.balanceAdjustmentNotes || "Ajuste no monetario. No es un pago recibido."}</p>
    </div>
  );
}
