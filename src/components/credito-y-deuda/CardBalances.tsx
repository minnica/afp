"use client";
import type { Card as FinancialCard } from "@/lib/uiTypes";
import { errorMessage } from "@/lib/uiTypes";


import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemGroup } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { creditBalanceSchema, getBalanceToday, getCardBalance, summarizeCardBalances } from "@/lib/cardBalances";
import { isRecord } from "@/lib/financialJson";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Cancel01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import MobileCreditCard from "./MobileCreditCard";

type BalanceInput = z.input<ReturnType<typeof creditBalanceSchema>>;
type BalanceOutput = z.output<ReturnType<typeof creditBalanceSchema>>;
export type BalanceSaveValues = BalanceOutput & { balanceCaptureId: string; expectedBalanceCaptureId: string | null };
type BalanceSave = (cardId: string, values: BalanceSaveValues) => Promise<void>;
type BalanceEditorProps = { card: FinancialCard; onSave: BalanceSave; onClose: () => void; restoreFocus: (event: Event) => void };
const currency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (amount: number | null | undefined) => amount == null ? "—" : currency.format(amount);
const dateLabel = (date: string | null) => dateFormat.format(new Date(`${date}T00:00:00Z`));

function BalanceEditor({ card, onSave, onClose, restoreFocus }: BalanceEditorProps) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const validationRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const captureRequestRef = useRef<{ payload: string; id: string } | null>(null);
  const [saveError, setSaveError] = useState("");
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<BalanceInput, unknown, BalanceOutput>({
    resolver: zodResolver(creditBalanceSchema()),
    shouldFocusError: false,
    defaultValues: {
      creditLimit: card.creditLimit == null ? "" : String(card.creditLimit),
      usedBalance: card.usedBalance == null ? "" : String(card.usedBalance),
      balanceAsOf: getBalanceToday(),
    },
  });
  const draft = useWatch({ control });
  const parsed = creditBalanceSchema().safeParse(draft);
  const preview = parsed.success ? getCardBalance(parsed.data) : null;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    function updateViewport() {
      const dialog = dialogRef.current;
      if (!dialog || !viewport) return;
      dialog.style.maxHeight = `${Math.max(0, viewport.height - 32)}px`;
      dialog.style.top = `${viewport.offsetTop + viewport.height / 2}px`;
    }
    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
    };
  }, []);

  async function save(values: BalanceOutput) {
    setSaveError("");
    try {
      const payload = JSON.stringify(values);
      if (captureRequestRef.current?.payload !== payload) {
        captureRequestRef.current = { payload, id: crypto.randomUUID() };
      }
      await onSave(card.id, { ...values, balanceCaptureId: captureRequestRef.current.id, expectedBalanceCaptureId: isRecord(card.balanceTracking) && typeof card.balanceTracking.captureId === "string" ? card.balanceTracking.captureId : null });
      toast.success(`Saldo de ${card.name} actualizado.`);
      onClose();
    } catch (error) {
      setSaveError(errorMessage(error) || "No se pudo guardar el saldo. Intenta de nuevo.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent
        ref={dialogRef}
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 motion-reduce:animate-none sm:max-w-md"
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        onCloseAutoFocus={restoreFocus}
        onEscapeKeyDown={(event) => { if (isSubmitting) event.preventDefault(); }}
        onInteractOutside={(event) => { if (isSubmitting) event.preventDefault(); }}
      >
        <DialogHeader className="shrink-0 border-b p-4 pr-16">
          <DialogTitle ref={titleRef} tabIndex={-1} className="break-words outline-none">Saldo de {card.name}</DialogTitle>
          <DialogDescription>Captura los importes actuales del banco para establecer un nuevo punto de partida.</DialogDescription>
        </DialogHeader>
        <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2 size-11" aria-label="Cerrar saldo" disabled={isSubmitting} onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
        </Button>
        <form onSubmit={(event) => handleSubmit(save, () => requestAnimationFrame(() => validationRef.current?.focus()))(event)} noValidate aria-busy={isSubmitting} className="flex min-h-0 flex-col">
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
            {saveError ? <Alert variant="destructive"><AlertDescription>{saveError}</AlertDescription></Alert> : null}
            {Object.keys(errors).length > 0 ? <Alert variant="destructive" ref={validationRef} tabIndex={-1}>
              <AlertDescription>
                <p className="font-medium">Revisa los datos</p>
                <ul className="list-inside list-disc">
                  {([["creditLimit", "card-credit-limit"], ["usedBalance", "card-used-balance"], ["balanceAsOf", "card-balance-date"]] as const).filter(([key]) => errors[key]).map(([key, id]) => (
                    <li key={key}><a href={`#${id}`} className="underline underline-offset-2" onClick={(event) => { event.preventDefault(); document.getElementById(id)?.focus(); }}>{errors[key]?.message}</a></li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert> : null}
            <FieldGroup>
              <Field data-invalid={Boolean(errors.creditLimit)}>
                <FieldLabel htmlFor="card-credit-limit">Límite de crédito</FieldLabel>
                <Controller name="creditLimit" control={control} render={({ field }) => (
                  <Input {...field} onChange={(event) => field.onChange(event.target.value)} id="card-credit-limit" type="number" formatNumber step="0.01" min="0" className="h-11 text-base" disabled={isSubmitting} aria-invalid={Boolean(errors.creditLimit)} aria-describedby={errors.creditLimit ? "credit-limit-error" : undefined} />
                )} />
                <FieldError id="credit-limit-error">{errors.creditLimit?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.usedBalance)}>
                <FieldLabel htmlFor="card-used-balance">Saldo utilizado</FieldLabel>
                <Controller name="usedBalance" control={control} render={({ field }) => (
                  <Input {...field} onChange={(event) => field.onChange(event.target.value)} id="card-used-balance" type="number" formatNumber step="0.01" className="h-11 text-base" disabled={isSubmitting} aria-invalid={Boolean(errors.usedBalance)} aria-describedby={`used-balance-help${errors.usedBalance ? " used-balance-error" : ""}`} />
                )} />
                <FieldDescription id="used-balance-help">Usa el saldo total, incluido lo pendiente a meses. Si tienes saldo a favor, escríbelo con signo negativo.</FieldDescription>
                <FieldError id="used-balance-error">{errors.usedBalance?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.balanceAsOf)}>
                <FieldLabel htmlFor="card-balance-date">Fecha de consulta</FieldLabel>
                <Controller name="balanceAsOf" control={control} render={({ field }) => (
                  <DatePicker id="card-balance-date" value={field.value} onChange={field.onChange} aria-label="Fecha de consulta del saldo" disabled={isSubmitting} className="h-11 [&_input]:h-11" />
                )} />
                <FieldError>{errors.balanceAsOf?.message}</FieldError>
              </Field>
            </FieldGroup>
            <Item variant="muted" className="justify-between gap-2">
              <span className="text-sm">Crédito disponible calculado</span>
              <strong className="text-base tabular-nums">{money(preview?.availableCredit)}</strong>
              {(preview?.overLimit ?? 0) > 0 ? <p className="w-full text-xs text-warning">El saldo supera el límite por {money(preview?.overLimit)}.</p> : null}
            </Item>
            <p className="text-xs text-muted-foreground">Después de guardar, AFP actualizará el saldo con tus gastos, compras a meses, pagos y devoluciones registrados.</p>
          </div>
          <DialogFooter className="shrink-0 border-t p-4">
            <Button type="button" variant="outline" className="min-h-11" disabled={isSubmitting} onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="min-h-11" disabled={isSubmitting}>{isSubmitting ? "Guardando…" : "Guardar saldo"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BalanceMetric({ label, amount, emphasized = false }: { label: string; amount: number | null | undefined; emphasized?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", emphasized && "col-span-2 sm:col-span-1")}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("break-words text-xl font-semibold tracking-tight tabular-nums", emphasized && "text-3xl")}>{money(amount)}</dd>
    </div>
  );
}

export default function CardBalances({ cards, onSave, loadError, onRetry }: { cards: FinancialCard[]; onSave: BalanceSave; loadError: boolean; onRetry: () => Promise<void> }) {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const [editingCard, setEditingCard] = useState<FinancialCard | null>(null);
  const [retrying, setRetrying] = useState(false);
  const summary = summarizeCardBalances(cards);

  async function retry() {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="credit-balances-title" data-credit-balances onClickCapture={captureFocus}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle><h2 id="credit-balances-title">Resumen de crédito</h2></CardTitle>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Cómo se calculan los saldos">
                <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex max-w-[calc(100vw-2rem)] flex-col gap-2 text-sm">
              <p>El saldo estimado parte de tu última captura del banco y se actualiza con los movimientos registrados en AFP. Los gastos y las compras a meses suman; los pagos y las devoluciones restan.</p>
              <p>Una compra a meses consume su importe completo una vez. Los cobros previstos y las mensualidades calculadas no se vuelven a sumar. Los pagos acumulados se aplican solo por su diferencia.</p>
              <p>«Actualizar» permite ajustar el saldo con el banco y establecer un nuevo punto de partida. Los cargos anteriores al día de inicio ya están incluidos en ese saldo base.</p>
              <p>El disponible se calcula como límite menos saldo utilizado, con mínimo cero. Retenciones o cargos pendientes pueden hacer que difiera del banco.</p>
              <p>Un saldo a favor aumenta el disponible de esa tarjeta y no reduce la deuda de las demás. Para registrar pagos y consultar los ciclos mensuales, abre Tarjetas.</p>
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loadError ? (
            <Alert variant="destructive"><AlertDescription className="flex flex-col gap-2">
              <p>No se pudieron cargar los saldos de tus tarjetas.</p>
              <Button type="button" variant="outline" className="min-h-11" disabled={retrying} onClick={retry}>{retrying ? "Cargando…" : "Reintentar saldos"}</Button>
            </AlertDescription></Alert>
          ) : !cards.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Aún no tienes tarjetas</EmptyTitle>
                <EmptyDescription>Agrega tu primera tarjeta para consultar su límite, saldo y disponible.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button asChild className="min-h-11"><Link href="/tarjetas">Administrar tarjetas</Link></Button></EmptyContent>
            </Empty>
          ) : (
            <>
              <dl className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3 sm:gap-6">
                <BalanceMetric label={summary.missingCards ? "Deuda capturada" : summary.automaticCards ? "Deuda estimada" : "Deuda total"} amount={summary.debt} emphasized />
                <BalanceMetric label="Límite de crédito" amount={summary.creditLimit} />
                <BalanceMetric label="Crédito disponible" amount={summary.availableCredit} />
              </dl>
              <Separator />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{summary.capturedCards} de {summary.totalCards} tarjetas con saldo</span>
                {summary.oldestDate ? <span>{summary.oldestDate === summary.newestDate ? `Saldo base del ${dateLabel(summary.oldestDate)}` : `Saldos base del ${dateLabel(summary.oldestDate)} al ${dateLabel(summary.newestDate)}`}</span> : null}
                <span>{summary.automaticCards ? "MXN · Se actualiza con tus movimientos" : "MXN · Captura del banco"} · Disponible calculado</span>
              </div>
              {summary.missingCards > 0 ? <p className="text-sm text-warning" role="status">{summary.capturedCards === 0 ? "Captura los saldos de tus tarjetas para conocer tu deuda total." : `Faltan ${summary.missingCards} ${summary.missingCards === 1 ? "tarjeta" : "tarjetas"} por capturar. Estos totales están incompletos.`}</p> : null}
              {(summary.creditBalance ?? 0) > 0 ? <p className="text-xs text-muted-foreground">Saldo a favor: {money(summary.creditBalance)}. No se descuenta de la deuda de otras tarjetas.</p> : null}
            </>
          )}
        </CardContent>
      </Card>

      {!loadError && cards.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="card-balances-list-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 id="card-balances-list-title" className="text-sm font-medium">Saldos por tarjeta</h2>
              <Badge variant="secondary">{cards.length}</Badge>
            </div>
            <Button asChild variant="ghost" className="min-h-11"><Link href="/tarjetas">Ver ciclos y pagos</Link></Button>
          </div>
          <ItemGroup className="gap-3">
            {cards.map((card) => {
              const balance = getCardBalance(card);
              return (
                <Item key={card.id} role="listitem" variant="outline" className="block min-w-0 overflow-hidden border-0 bg-transparent p-0 md:grid md:grid-cols-1 md:gap-3 md:border md:bg-card md:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] lg:gap-6" data-credit-card={card.id}>
                  <MobileCreditCard card={card} balance={balance} onEdit={() => setEditingCard(card)} />
                  <div className="hidden min-w-0 items-start justify-between gap-3 md:flex lg:block">
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="break-words text-sm font-semibold">{card.name}</h3>
                      {balance.hasBalance ? <>
                        <p className="text-xs text-muted-foreground">Base: <time dateTime={balance.balanceAsOf}>{dateLabel(balance.balanceAsOf)}</time></p>
                        <Badge variant={balance.automatic ? "secondary" : "warning"}>{balance.automatic ? "Automático · Estimado" : "Actualiza para iniciar seguimiento"}</Badge>
                      </> : <Badge variant="secondary">Sin capturar</Badge>}
                    </div>
                    <Button type="button" variant="outline" className="min-h-11 shrink-0 lg:hidden" aria-label={`${balance.hasBalance ? "Actualizar" : "Capturar"} saldo de ${card.name}`} onClick={() => setEditingCard(card)}>{balance.hasBalance ? "Actualizar" : "Capturar"}</Button>
                  </div>
                  <div className="hidden min-w-0 flex-col gap-3 md:flex">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <dt className="text-xs text-muted-foreground">Saldo utilizado</dt>
                        <dd className="break-words text-lg font-semibold tabular-nums">{money(balance.usedBalance)}</dd>
                      </div>
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Límite de crédito</dt><dd className="break-words text-sm tabular-nums">{money(balance.creditLimit)}</dd></div>
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">Crédito disponible</dt><dd className="break-words text-sm tabular-nums">{money(balance.availableCredit)}</dd></div>
                    </dl>
                    {balance.hasBalance && balance.utilization !== null ? <p className="text-xs tabular-nums text-muted-foreground">{balance.utilization.toFixed(1)} % del límite utilizado</p> : null}
                    {(balance.overLimit ?? 0) > 0 ? <p className="text-xs text-warning">Sobre el límite por {money(balance.overLimit)}</p> : null}
                    {(balance.creditBalance ?? 0) > 0 ? <p className="text-xs text-muted-foreground">Saldo a favor: {money(balance.creditBalance)}</p> : null}
                  </div>
                  <Button type="button" variant="outline" className="hidden min-h-11 lg:inline-flex" aria-label={`${balance.hasBalance ? "Actualizar" : "Capturar"} saldo de ${card.name}`} onClick={() => setEditingCard(card)}>{balance.hasBalance ? "Actualizar" : "Capturar"}</Button>
                </Item>
              );
            })}
          </ItemGroup>
        </section>
      ) : null}
      {editingCard ? <BalanceEditor key={editingCard.id} card={editingCard} onSave={onSave} onClose={() => setEditingCard(null)} restoreFocus={restoreFocus} /> : null}
    </section>
  );
}
