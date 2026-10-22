"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Info, X } from "lucide-react";
import { creditBalanceSchema, getBalanceToday, getCardBalance, summarizeCardBalances } from "@/lib/cardBalances";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemGroup } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";

const currency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateFormat = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (amount) => amount == null ? "—" : currency.format(amount);
const dateLabel = (date) => dateFormat.format(new Date(`${date}T00:00:00Z`));

function BalanceEditor({ card, onSave, onClose, restoreFocus }) {
  const titleRef = useRef(null);
  const validationRef = useRef(null);
  const dialogRef = useRef(null);
  const [saveError, setSaveError] = useState("");
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm({
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
      if (!dialog) return;
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

  async function save(values) {
    setSaveError("");
    try {
      await onSave(card.id, values);
      toast.success(`Saldo de ${card.name} actualizado.`);
      onClose();
    } catch (error) {
      setSaveError(error.message || "No se pudo guardar el saldo. Intenta de nuevo.");
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
          <DialogDescription>Captura los importes que muestra tu banco, en pesos mexicanos.</DialogDescription>
        </DialogHeader>
        <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2 size-11" aria-label="Cerrar saldo" disabled={isSubmitting} onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
        <form onSubmit={(event) => handleSubmit(save, () => requestAnimationFrame(() => validationRef.current?.focus()))(event)} noValidate aria-busy={isSubmitting} className="flex min-h-0 flex-col">
          <div className="min-h-0 space-y-4 overflow-y-auto p-4">
            {saveError ? <Alert variant="destructive"><AlertDescription>{saveError}</AlertDescription></Alert> : null}
            {Object.keys(errors).length > 0 ? <Alert variant="destructive" ref={validationRef} tabIndex={-1}>
              <AlertDescription>
                <p className="font-medium">Revisa los datos</p>
                <ul className="list-inside list-disc">
                  {[["creditLimit", "card-credit-limit"], ["usedBalance", "card-used-balance"], ["balanceAsOf", "card-balance-date"]].filter(([key]) => errors[key]).map(([key, id]) => (
                    <li key={key}><a href={`#${id}`} className="underline underline-offset-2" onClick={(event) => { event.preventDefault(); document.getElementById(id)?.focus(); }}>{errors[key].message}</a></li>
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
              {preview?.overLimit > 0 ? <p className="w-full text-xs text-warning">El saldo supera el límite por {money(preview.overLimit)}.</p> : null}
            </Item>
            <p className="text-xs text-muted-foreground">Esta captura se actualiza manualmente. Registrar compras o pagos en AFP no modifica estos importes.</p>
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

function BalanceMetric({ label, amount, emphasized = false }) {
  return (
    <div className={cn("min-w-0 space-y-1", emphasized && "col-span-2 sm:col-span-1")}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn("break-words text-xl font-semibold tracking-tight tabular-nums", emphasized && "text-3xl")}>{money(amount)}</dd>
    </div>
  );
}

export default function CardBalances({ cards, onSave, loadError, onRetry }) {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const [editingCard, setEditingCard] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const summary = summarizeCardBalances(cards);

  async function retry() {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  }

  return (
    <section className="mb-6 space-y-4" aria-labelledby="credit-balances-title" data-credit-balances onClickCapture={captureFocus}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="credit-balances-title" className="text-base font-semibold md:text-lg">Crédito y deuda</h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Cómo se calculan los saldos">
              <Info aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-w-[calc(100vw-2rem)] space-y-2 text-sm">
            <p>Los saldos son los que capturas de tu banco en la fecha indicada. Incluye toda la deuda, también las mensualidades futuras.</p>
            <p>El disponible se calcula como límite menos saldo utilizado, con mínimo cero. Retenciones o cargos pendientes pueden hacer que difiera del banco.</p>
            <p>Un saldo a favor aumenta el disponible de esa tarjeta y no reduce la deuda de las demás. Los pagos mensuales se consultan en Ciclos mensuales.</p>
          </PopoverContent>
        </Popover>
      </div>

      {loadError ? (
        <Alert variant="destructive"><AlertDescription className="space-y-2">
          <p>No se pudieron cargar los saldos de tus tarjetas.</p>
          <Button type="button" variant="outline" className="min-h-11" disabled={retrying} onClick={retry}>{retrying ? "Cargando…" : "Reintentar saldos"}</Button>
        </AlertDescription></Alert>
      ) : !cards.length ? (
        <Empty className="border"><EmptyDescription>Agrega tu primera tarjeta en «Administrar tarjetas» para consultar su límite, saldo y disponible.</EmptyDescription></Empty>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3 sm:gap-6">
                <BalanceMetric label={summary.missingCards ? "Deuda capturada" : "Deuda total"} amount={summary.debt} emphasized />
                <BalanceMetric label="Límite de crédito" amount={summary.creditLimit} />
                <BalanceMetric label="Crédito disponible" amount={summary.availableCredit} />
              </dl>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                <span>{summary.capturedCards} de {summary.totalCards} tarjetas con saldo</span>
                {summary.oldestDate ? <span>{summary.oldestDate === summary.newestDate ? `Consultado el ${dateLabel(summary.oldestDate)}` : `Consultas del ${dateLabel(summary.oldestDate)} al ${dateLabel(summary.newestDate)}`}</span> : null}
                <span>MXN · Actualización manual · Disponible calculado</span>
              </div>
              {summary.missingCards > 0 ? <p className="text-sm text-warning" role="status">{summary.capturedCards === 0 ? "Captura los saldos de tus tarjetas para conocer tu deuda total." : `Faltan ${summary.missingCards} ${summary.missingCards === 1 ? "tarjeta" : "tarjetas"} por capturar. Estos totales están incompletos.`}</p> : null}
              {summary.creditBalance > 0 ? <p className="text-xs text-muted-foreground">Saldo a favor: {money(summary.creditBalance)}. No se descuenta de la deuda de otras tarjetas.</p> : null}
            </CardContent>
          </Card>

          <Collapsible defaultOpen={summary.capturedCards === 0}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="group h-auto min-h-11 max-w-full gap-2 whitespace-normal text-left">
                Saldos por tarjeta <Badge variant="secondary">{cards.length}</Badge>
                <ChevronDown aria-hidden="true" className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <ItemGroup className="gap-3">
                {cards.map((card) => {
                  const balance = getCardBalance(card);
                  return (
                    <Item key={card.id} role="listitem" variant="outline" className="grid min-w-0 grid-cols-1 gap-3 bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] lg:gap-6" data-credit-card={card.id}>
                      <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
                        <div className="min-w-0 space-y-1">
                          <h3 className="break-words text-sm font-semibold">{card.name}</h3>
                          {balance.hasBalance ? <p className="text-xs text-muted-foreground">Consulta: <time dateTime={balance.balanceAsOf}>{dateLabel(balance.balanceAsOf)}</time></p> : <Badge variant="secondary">Sin capturar</Badge>}
                        </div>
                        <Button type="button" variant="outline" className="min-h-11 shrink-0 lg:hidden" aria-label={`${balance.hasBalance ? "Actualizar" : "Capturar"} saldo de ${card.name}`} onClick={() => setEditingCard(card)}>{balance.hasBalance ? "Actualizar" : "Capturar"}</Button>
                      </div>
                      <div className="min-w-0 space-y-3">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <dt className="text-xs text-muted-foreground">Saldo utilizado</dt>
                            <dd className="break-words text-lg font-semibold tabular-nums">{money(balance.usedBalance)}</dd>
                          </div>
                          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Límite de crédito</dt><dd className="break-words text-sm tabular-nums">{money(balance.creditLimit)}</dd></div>
                          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Crédito disponible</dt><dd className="break-words text-sm tabular-nums">{money(balance.availableCredit)}</dd></div>
                        </dl>
                        {balance.hasBalance && balance.utilization !== null ? <div className="flex items-center gap-3">
                          <Progress value={Math.min(balance.utilization, 100)} aria-label={`Crédito utilizado de ${card.name}`} getValueLabel={() => `${balance.utilization.toFixed(1)} % del límite utilizado`} className="flex-1 [&_[data-slot=progress-indicator]]:motion-reduce:transition-none" />
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{balance.utilization.toFixed(1)} % usado</span>
                        </div> : null}
                        {balance.overLimit > 0 ? <p className="text-xs text-warning">Sobre el límite por {money(balance.overLimit)}</p> : null}
                        {balance.creditBalance > 0 ? <p className="text-xs text-muted-foreground">Saldo a favor: {money(balance.creditBalance)}</p> : null}
                      </div>
                      <Button type="button" variant="outline" className="hidden min-h-11 lg:inline-flex" aria-label={`${balance.hasBalance ? "Actualizar" : "Capturar"} saldo de ${card.name}`} onClick={() => setEditingCard(card)}>{balance.hasBalance ? "Actualizar" : "Capturar"}</Button>
                    </Item>
                  );
                })}
              </ItemGroup>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
      {editingCard ? <BalanceEditor key={editingCard.id} card={editingCard} onSave={onSave} onClose={() => setEditingCard(null)} restoreFocus={restoreFocus} /> : null}
    </section>
  );
}
