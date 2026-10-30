"use client";

import { useEffect, useId, useState } from "react";
import { Cancel01Icon, ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ReceivableBalanceAdjustment from "@/components/cuentas-por-cobrar/ReceivableBalanceAdjustment";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator } from "@/components/ui/item";
import { RecordField } from "@/components/ui/record-card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { getInstallmentRecipient } from "@/lib/installmentRecipients";
import { uiFetch } from "@/lib/uiClient";
import type { UiResponse } from "@/lib/uiResponseSchemas";
import { errorMessage, type Purchase } from "@/lib/uiTypes";

type Payments = UiResponse<"installment-purchases/payments">;
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Payments };

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const bankDate = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" });
const formatMoney = (value: unknown) => money.format(Number(value || 0));

export default function PurchasePaymentsSheet({ purchase, userId, onClose, onCloseAutoFocus }: {
  purchase: Purchase;
  userId: string;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const isMobile = useIsMobile();
  const historyId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await uiFetch(`/api/installment-purchases/payments?purchaseId=${encodeURIComponent(purchase.id)}`, {
          signal: controller.signal,
          expectedUserId: userId,
          errorMode: "inline",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudieron cargar los pagos.");
        if (data.purchase.id !== purchase.id) throw new Error("Los pagos no corresponden a la compra seleccionada. Inténtalo de nuevo.");
        if (active) setState({ status: "ready", data });
      } catch (error) {
        if (active) setState({ status: "error", message: errorMessage(error) || "No se pudieron cargar los pagos." });
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [purchase.id, userId, attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt(current => current + 1);
  }

  const account = state.status === "ready" ? state.data.receivable : null;
  const recipient = getInstallmentRecipient(purchase);

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[92svh] data-[side=bottom]:rounded-t-2xl data-[side=right]:max-h-none data-[side=right]:w-full data-[side=right]:sm:max-w-xl motion-reduce:animate-none motion-reduce:transition-none"
      >
        <SheetHeader className="shrink-0 pr-16">
          <SheetTitle className="break-words">{account ? `Pagos de ${account.person.name}` : "Pagos recibidos"}</SheetTitle>
          <SheetDescription className="break-words">
            {purchase.concept} · {purchase.card.name}
            {!account ? ` · ${recipient.label}` : ""}
          </SheetDescription>
        </SheetHeader>
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" className="absolute top-3 right-3 size-11" aria-label="Cerrar pagos">
            <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
          </Button>
        </SheetClose>
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" role="region" aria-label="Detalle de pagos recibidos" tabIndex={0} aria-busy={state.status === "loading"}>
          {state.status === "loading" ? (
            <div role="status" className="flex flex-col gap-6">
              <span className="sr-only">Cargando pagos de {purchase.concept}…</span>
              <div className="grid grid-cols-2 gap-4" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
              </div>
              <Skeleton className="h-6 w-40" aria-hidden="true" />
              {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 w-full" aria-hidden="true" />)}
            </div>
          ) : state.status === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <Alert variant="destructive">
                <AlertTitle>No se pudieron cargar los pagos</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
              <Button type="button" variant="outline" size="touch" onClick={retry}>
                <HugeiconsIcon icon={ArrowReloadHorizontalIcon} data-icon="inline-start" aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          ) : !account ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Sin cuenta por cobrar vinculada</EmptyTitle>
                <EmptyDescription>Esta compra todavía no tiene una cuenta por cobrar desde la que consultar los pagos.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <section className="flex flex-col gap-4" aria-label="Resumen de cobros">
                <Badge variant="outline">{account.status === "PAID_OFF" ? "Cuenta liquidada" : account.status === "CANCELLED" ? "Cuenta cancelada" : "Por cobrar"}</Badge>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <RecordField label="Recibido">{formatMoney(account.paidAmount)}</RecordField>
                  <RecordField label="Falta por recibir">{formatMoney(Math.max(0, account.pendingBalance))}</RecordField>
                  <RecordField label="Monto original">{formatMoney(account.originalAmount)}</RecordField>
                  <RecordField label="Pago mensual acordado">{account.expectedMonthlyPayment == null ? "Sin definir" : formatMoney(account.expectedMonthlyPayment)}</RecordField>
                </dl>
                {Number(account.balanceAdjustment) !== 0 ? (
                  <div className="flex flex-col gap-2">
                    <ReceivableBalanceAdjustment receivable={account} />
                    <p className="text-xs text-muted-foreground">Este ajuste cambia el saldo por recuperar; se muestra aparte de los pagos recibidos.</p>
                  </div>
                ) : null}
                {account.excessAmount > 0 ? <p className="text-sm">Saldo a favor de {account.person.name}: <span className="font-medium tabular-nums">{formatMoney(account.excessAmount)}</span></p> : null}
              </section>
              <Separator />
              <section className="flex flex-col gap-3" aria-labelledby={historyId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id={historyId} className="text-sm font-semibold">Pagos recibidos</h3>
                  <p className="text-xs text-muted-foreground">{account.incomes.length} {account.incomes.length === 1 ? "pago registrado" : "pagos registrados"}</p>
                </div>
                {account.incomes.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Sin pagos registrados</EmptyTitle>
                      <EmptyDescription>Aquí aparecerán los ingresos que vincules a esta cuenta por cobrar.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ItemGroup aria-label={`Pagos de ${account.person.name}`}>
                    {account.incomes.map((payment, index) => (
                      <div key={payment.id}>
                        {index > 0 ? <ItemSeparator /> : null}
                        <Item role="listitem" className="items-start px-0">
                          <ItemContent className="min-w-0">
                            <p className="break-words text-sm font-medium">{payment.concept}</p>
                            <ItemDescription className="line-clamp-none break-words">
                              <time dateTime={payment.date.slice(0, 10)}>{bankDate.format(new Date(payment.date))}</time>
                              {payment.source ? ` · ${payment.source}` : ""}
                            </ItemDescription>
                            {payment.notes ? <ItemDescription className="line-clamp-none whitespace-pre-wrap break-words">{payment.notes}</ItemDescription> : null}
                          </ItemContent>
                          <p className="max-w-full shrink-0 text-sm font-semibold tabular-nums">{formatMoney(payment.amount)}</p>
                        </Item>
                      </div>
                    ))}
                  </ItemGroup>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
