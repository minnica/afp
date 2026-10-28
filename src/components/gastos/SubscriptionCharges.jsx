"use client";

import { financialFetch as apiFetch } from "@/lib/financialClient";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, Cancel01Icon, CheckmarkCircle02Icon, MoreHorizontalIcon, RepeatIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { PaymentMethodSelector } from "@/components/ui/payment-method-selector";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { DisclosureButton } from "@/components/ui/responsive-breakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { validChargeDay, validChargeMonth } from "@/lib/subscriptionCharges";

const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
const dayLabel = value => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const months = Array.from({ length: 12 }, (_, index) => {
  const label = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1)));
  return { value: String(index + 1).padStart(2, "0"), label: label[0].toUpperCase() + label.slice(1) };
});
const localDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const adjustmentSchema = z.object({
  amount: z.string().refine(value => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0
    && Number.isSafeInteger(Math.round(Number(value) * 100)), "Ingresa un monto positivo con hasta dos decimales."),
  date: z.string().refine(value => validChargeDay(value) && value <= localDay(), "Elige una fecha válida no posterior a hoy."),
  paymentMethod: z.enum(["CASH", "CARD"]),
  cardId: z.string(),
}).superRefine((values, context) => {
  if (values.paymentMethod === "CARD" && !values.cardId) {
    context.addIssue({ code: "custom", path: ["cardId"], message: "Selecciona la tarjeta con la que pagaste." });
  }
});

function ChargeAdjustmentForm({ charge, cards, busy, isOnline, error, onConfirm }) {
  const { control, handleSubmit, setValue, setError } = useForm({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { amount: String(charge.amount), date: charge.date, paymentMethod: charge.paymentMethod, cardId: charge.cardId || "" },
  });
  const paymentMethod = useWatch({ control, name: "paymentMethod" });

  return (
    <form className="flex flex-col gap-4" aria-busy={busy} noValidate onSubmit={handleSubmit(values => {
      if (values.paymentMethod === "CARD" && !cards.some(card => card.id === values.cardId)) {
        setError("cardId", { message: "Selecciona una tarjeta disponible para este cobro." });
        return;
      }
      return onConfirm({ ...values, cardId: values.paymentMethod === "CARD" ? values.cardId : null });
    })}>
      <div className="flex flex-col gap-1">
        <p className="break-words font-medium">{charge.name}</p>
        <p className="text-sm text-muted-foreground">Los cambios se aplican solo a este cobro.</p>
      </div>
      <fieldset disabled={busy}><FieldGroup>
        <Controller name="amount" control={control} render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="subscription-charge-amount">Monto pagado</FieldLabel>
            <Input {...field} id="subscription-charge-amount" type="number" formatNumber min="0.01" step="0.01"
              aria-invalid={fieldState.invalid} aria-describedby={fieldState.invalid ? "subscription-charge-amount-error" : "subscription-charge-amount-hint"} />
            <FieldDescription id="subscription-charge-amount-hint">Previsto: {money(charge.amount)}</FieldDescription>
            {fieldState.error ? <FieldError id="subscription-charge-amount-error">{fieldState.error.message}</FieldError> : null}
          </Field>
        )} />
        <Controller name="date" control={control} render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="subscription-charge-date">Fecha de pago</FieldLabel>
            <DatePicker id="subscription-charge-date" value={field.value} onChange={field.onChange} disabled={busy} aria-label="Fecha de pago" />
            {fieldState.error ? <FieldError role="alert">{fieldState.error.message}</FieldError> : null}
          </Field>
        )} />
        <Controller name="paymentMethod" control={control} render={({ field }) => (
          <Field>
            <FieldLabel id="subscription-charge-payment-label">Método de pago</FieldLabel>
            <PaymentMethodSelector id="subscription-charge-payment" value={field.value} disabled={busy} onValueChange={value => {
              field.onChange(value);
              if (value === "CASH") setValue("cardId", "", { shouldValidate: true });
            }} />
          </Field>
        )} />
        {paymentMethod === "CARD" ? <Controller name="cardId" control={control} render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="subscription-charge-card">Tarjeta</FieldLabel>
            <ResponsiveSelect id="subscription-charge-card" value={field.value} onValueChange={field.onChange}
              options={cards.map(card => ({ value: card.id, label: card.name }))} title="Seleccionar tarjeta" placeholder="Selecciona la tarjeta"
              searchable="auto" disabled={busy || !cards.length} aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? "subscription-charge-card-error" : !cards.length ? "subscription-charge-card-hint" : undefined} />
            {!cards.length ? <FieldDescription id="subscription-charge-card-hint">Agrega una tarjeta en Tarjetas para poder seleccionarla.</FieldDescription> : null}
            {fieldState.error ? <FieldError id="subscription-charge-card-error">{fieldState.error.message}</FieldError> : null}
          </Field>
        )} /> : null}
      </FieldGroup></fieldset>
      {error ? <FieldError role="alert">{error}</FieldError> : null}
      {!isOnline ? <Alert><AlertDescription>Conéctate para confirmar este cobro. Tus ajustes se conservan.</AlertDescription></Alert> : null}
      <DialogFooter><Button disabled={busy || !isOnline} className="h-11">{busy ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden="true" />}Confirmar cobro</Button></DialogFooter>
    </form>
  );
}

function ChargeList({ charges, renderActions }) {
  return (
    <ItemGroup className="gap-0">
      {charges.map((charge, index) => {
        const pending = charge.status === "PENDING";
        const amount = charge.status === "SKIPPED" ? null : pending ? charge.amount : charge.confirmedAmount ?? charge.amount;
        const recordedPayment = charge.confirmedPaymentMethod === "CASH" ? "Efectivo"
          : charge.confirmedPaymentMethod === "CARD" ? charge.confirmedCardName || "Tarjeta no disponible" : null;
        const detail = pending ? `${dayLabel(charge.date)} · ${charge.paymentMethod === "CASH" ? "Efectivo" : charge.cardName || "Tarjeta no disponible"}`
          : charge.status === "SKIPPED" ? "Omitido" : charge.status === "VERIFIED" ? "Estado de cuenta" : ["Registrado", recordedPayment].filter(Boolean).join(" · ");
        return (
          <Fragment key={charge.id}>
            {index ? <ItemSeparator className="my-0" /> : null}
            <Item role="listitem" className="min-w-0 px-0 py-3">
              <ItemContent className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <ItemTitle className="min-w-0 flex-1 basis-32 line-clamp-none break-words">{charge.name}</ItemTitle>
                  {amount !== null ? <span className="max-w-full break-words font-medium tabular-nums">{money(amount)}</span> : null}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <ItemDescription className="min-w-0 flex-1 line-clamp-none break-words">{detail}</ItemDescription>
                  {renderActions ? <ItemActions className="shrink-0 gap-0">{renderActions(charge)}</ItemActions> : null}
                </div>
              </ItemContent>
            </Item>
          </Fragment>
        );
      })}
    </ItemGroup>
  );
}

export default function SubscriptionCharges({ userId, cards = [], isOnline, onChanged, refreshKey }) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(localDay);
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [state, setState] = useState({ charges: [], loading: true, error: "" });
  const [activeAction, setActiveAction] = useState(null);
  const busy = Boolean(activeAction);
  const busyRef = useRef(false);
  const revisionRef = useRef(0);
  const scopeRef = useRef("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState(null);
  const [skipping, setSkipping] = useState(null);
  const [formError, setFormError] = useState("");
  const actionTriggerRef = useRef(null);
  const sectionRef = useRef(null);
  const { refresh: refreshDashboard } = useDashboard();
  const scope = `${userId}:${month}`;

  const request = useCallback(async (body, signal) => {
    const params = new URLSearchParams({ month, today: localDay() });
    const response = await apiFetch(`/api/subscription-charges${body ? "" : `?${params}`}`, {
      expectedUserId: userId,
      errorMode: body ? "dialog" : "inline",
      method: body ? "POST" : "GET", cache: "no-store", signal,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify({ ...body, month, today: localDay() }) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo actualizar el cobro.");
    return result;
  }, [userId, month]);

  const refresh = useCallback(async ({ preserveError = false } = {}) => {
    if (busyRef.current || !isOnline || !validChargeMonth(month)) return;
    const revision = ++revisionRef.current;
    try {
      const result = await request();
      if (scopeRef.current === scope && revision === revisionRef.current) setState(previous => ({ charges: result.charges, loading: false, error: preserveError ? previous.error : "" }));
    } catch (error) {
      if (scopeRef.current === scope && revision === revisionRef.current) setState(previous => ({ ...previous, loading: false, error: error.message }));
    }
  }, [request, scope, isOnline, month]);

  useEffect(() => {
    let previousDay = localDay();
    let timer;
    const updateDay = () => {
      const day = localDay();
      const previousMonth = previousDay.slice(0, 7);
      previousDay = day;
      setToday(day);
      setMonth(selected => selected === previousMonth ? day.slice(0, 7) : selected);
      clearTimeout(timer);
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 100);
      timer = setTimeout(updateDay, midnight.getTime() - Date.now());
    };
    const visible = () => { if (document.visibilityState === "visible") updateDay(); };
    updateDay();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, []);

  useEffect(() => {
    scopeRef.current = scope;
    const revision = revisionRef;
    const timer = setTimeout(refresh, 0);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      scopeRef.current = "";
      revision.current++;
      clearTimeout(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [scope, refresh, refreshKey, today]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function update(charge, action, overrides = {}) {
    if (busyRef.current || !isOnline) return;
    busyRef.current = true;
    setActiveAction({ id: charge.id, action });
    setFormError("");
    setFeedback("");
    revisionRef.current++;
    let saved = false;
    try {
      const result = await request({ subscriptionId: charge.subscriptionId, action, ...overrides });
      saved = true;
      if (scopeRef.current !== scope) return;
      setEditing(null);
      setSkipping(null);
      if (editing) requestAnimationFrame(() => sectionRef.current?.focus({ preventScroll: true }));
      setState(previous => ({ ...previous, error: "", charges: previous.charges.map(item => item.id === charge.id
        ? { ...item, status: action === "skip" ? "SKIPPED" : action === "restore" ? "PENDING" : "CONFIRMED",
          confirmedAmount: action === "confirm" && !result.alreadyConfirmed ? Number(overrides.amount ?? charge.amount) : null,
          confirmedPaymentMethod: action === "confirm" && !result.alreadyConfirmed ? overrides.paymentMethod ?? charge.paymentMethod : null,
          confirmedCardName: action === "confirm" && !result.alreadyConfirmed
            ? cards.find(card => card.id === (overrides.cardId ?? charge.cardId))?.name || null : null } : item) }));
      setFeedback(action === "skip" ? "Cobro omitido." : action === "restore" ? "Cobro restaurado."
        : result.alreadyConfirmed ? "Este cobro ya estaba registrado." : "Cobro confirmado.");
      await Promise.all([onChanged(), refreshDashboard()]);
    } catch (error) {
      if (scopeRef.current === scope) {
        const message = saved ? "El cambio se guardó. Actualiza la lista para verlo." : error.message;
        if (!saved && (editing || skipping)) setFormError(message);
        else setState(previous => ({ ...previous, error: message }));
      }
    } finally {
      busyRef.current = false;
      setActiveAction(null);
      if (scopeRef.current === scope) await refresh({ preserveError: true });
    }
  }

  const pending = state.charges.filter(charge => charge.status === "PENDING");
  const history = state.charges.filter(charge => charge.status !== "PENDING");
  const total = pending.reduce((sum, charge) => sum + Math.round(charge.amount * 100), 0) / 100;
  const disabled = busy || !isOnline;
  function changeMonth(value) {
    if (value === month || !validChargeMonth(value) || value > today.slice(0, 7)) return;
    setMonth(value);
    setFeedback("");
    setState({ charges: [], loading: true, error: "" });
  }

  function returnToList() {
    setEditing(null);
    setFormError("");
    requestAnimationFrame(() => sectionRef.current?.focus({ preventScroll: true }));
  }

  function editCharge(charge) {
    setFormError("");
    setEditing(charge);
    requestAnimationFrame(() => sectionRef.current?.focus({ preventScroll: true }));
  }

  const yearOptions = Array.from({ length: Number(today.slice(0, 4)) - 1999 }, (_, index) => {
    const year = String(Number(today.slice(0, 4)) - index);
    return { value: year, label: year };
  });
  const closeFocus = event => {
    event.preventDefault();
    // La fila puede desaparecer; el foco permanece dentro del diálogo de cobros.
    const target = actionTriggerRef.current?.isConnected ? actionTriggerRef.current : sectionRef.current;
    target?.focus({ preventScroll: true });
  };
  const triggerLabel = state.loading ? "Cobros de suscripciones: consultando"
    : state.error ? "Cobros de suscripciones: no se pudieron actualizar"
    : pending.length ? `Cobros de suscripciones: ${pending.length} por confirmar` : "Cobros de suscripciones";

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={nextOpen => {
        if (busy) return;
        setOpen(nextOpen);
        if (nextOpen) refresh();
        else {
          setEditing(null);
          setFormError("");
          setFeedback("");
          const currentMonth = localDay().slice(0, 7);
          if (month !== currentMonth) changeMonth(currentMonth);
        }
      }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" className="h-11 min-w-11 gap-1 px-2" aria-label={triggerLabel}>
                <HugeiconsIcon icon={RepeatIcon} data-icon="inline-start" aria-hidden="true" />
                {!state.loading && state.error ? <Badge variant="destructive" aria-hidden="true">!</Badge>
                  : !state.loading && pending.length ? <Badge variant="warning" aria-hidden="true">{pending.length > 99 ? "99+" : pending.length}</Badge> : null}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{triggerLabel}</TooltipContent>
        </Tooltip>
        <DialogContent showCloseButton={false} className="flex max-h-[85dvh] max-w-[calc(100%-1rem)] flex-col sm:max-w-lg"
          onOpenAutoFocus={event => { event.preventDefault(); sectionRef.current?.focus(); }}
          onEscapeKeyDown={event => {
            if (busy || skipping) event.preventDefault();
            else if (editing) { event.preventDefault(); returnToList(); }
          }}
          onInteractOutside={event => { if (busy || editing || skipping) event.preventDefault(); }}>
          <DialogHeader className="shrink-0 pr-12">
            <div className="flex min-h-7 items-center gap-2">
              {editing ? <Button type="button" variant="ghost" size="icon" className="-my-2 -ml-2 size-11" disabled={busy} aria-label="Volver a cobros" onClick={returnToList}><HugeiconsIcon icon={ArrowLeft02Icon} aria-hidden="true" /></Button> : null}
              <DialogTitle>{editing ? "Ajustar cobro" : "Cobros de suscripciones"}</DialogTitle>
            </div>
            <DialogDescription className="sr-only">Confirma los cobros de tus suscripciones. Los ajustes de monto, fecha y método de pago afectan solo a ese cobro.</DialogDescription>
          </DialogHeader>
          <DialogClose asChild><Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-11" disabled={busy} aria-label="Cerrar cobros de suscripciones"><HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" /></Button></DialogClose>
          <div ref={sectionRef} tabIndex={-1} role="region" aria-label={editing ? "Ajustar cobro" : "Cobros del mes"} className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1 outline-none [color-scheme:dark] [scrollbar-gutter:stable] sm:[scrollbar-gutter:auto]">
            {editing ? (
              <ChargeAdjustmentForm charge={editing} cards={cards} busy={busy} isOnline={isOnline} error={formError}
                onConfirm={values => update(editing, "confirm", values)} />
            ) : (
              <>
                <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 py-2">
                  <ResponsiveSelect value={month.slice(5, 7)} aria-label="Mes de cobros" title="Seleccionar mes" disabled={busy}
                    options={months.filter(option => month.slice(0, 4) !== today.slice(0, 4) || option.value <= today.slice(5, 7))}
                    onValueChange={value => changeMonth(`${month.slice(0, 4)}-${value}`)} />
                  <ResponsiveSelect value={month.slice(0, 4)} aria-label="Año de cobros" title="Seleccionar año" disabled={busy} options={yearOptions}
                    onValueChange={value => changeMonth(`${value}-${value === today.slice(0, 4) && month.slice(5, 7) > today.slice(5, 7) ? today.slice(5, 7) : month.slice(5, 7)}`)} />
                </div>
                {!isOnline ? <Alert><AlertDescription>Conéctate para actualizar tus cobros.</AlertDescription></Alert> : null}
                {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}<Button variant="link" disabled={disabled} onClick={refresh}>Reintentar</Button></AlertDescription></Alert> : null}
                <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{feedback}</p>
                {feedback ? <Alert variant="success" role="presentation" aria-hidden="true"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /><AlertDescription>{feedback}</AlertDescription></Alert> : null}
                {state.loading && isOnline ? <Skeleton className="h-24 w-full" /> : pending.length ? (
                  <section aria-label="Cobros pendientes">
                    <p className="flex items-center justify-between gap-3 text-sm"><span>{pending.length} {pending.length === 1 ? "pendiente" : "pendientes"}</span><span className="font-medium tabular-nums">{money(total)}</span></p>
                    <ChargeList charges={pending} renderActions={charge => <>
                      <Tooltip>
                        <TooltipTrigger asChild><Button type="button" variant="outline" size="icon" className="size-11" disabled={disabled || Boolean(state.error)} aria-label={`Confirmar cobro de ${charge.name}: ${money(charge.amount)}`} onClick={() => update(charge, "confirm", { amount: charge.amount, date: charge.date })}>
                          {activeAction?.id === charge.id && activeAction.action === "confirm" ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" />}
                        </Button></TooltipTrigger>
                        <TooltipContent>Confirmar cobro</TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-11" disabled={disabled} onClick={event => { actionTriggerRef.current = event.currentTarget; }} aria-label={`Opciones de ${charge.name}`}><HugeiconsIcon icon={MoreHorizontalIcon} aria-hidden="true" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (editing || skipping) event.preventDefault(); }}><DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => editCharge(charge)}>Ajustar monto o pago</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setFormError(""); setSkipping(charge); }}>Omitir este mes</DropdownMenuItem>
                        </DropdownMenuGroup></DropdownMenuContent>
                      </DropdownMenu>
                    </>} />
                  </section>
                ) : !state.error && isOnline ? history.length
                  ? <Empty className="items-start px-0 py-0 text-left"><EmptyDescription>Sin pendientes</EmptyDescription></Empty>
                  : <Empty className="px-0 py-4"><EmptyHeader><EmptyTitle>Sin pendientes</EmptyTitle><EmptyDescription>Los próximos cobros aparecerán en su fecha.</EmptyDescription></EmptyHeader></Empty> : null}
                {history.length ? <Collapsible key={month} defaultOpen={!pending.length}>
                  <DisclosureButton><span className="flex items-center gap-2">Historial <Badge variant="secondary">{history.length}</Badge></span></DisclosureButton>
                  <CollapsibleContent><ChargeList charges={history} renderActions={charge => charge.status === "SKIPPED" ? <Button type="button" variant="ghost" disabled={disabled} className="h-11" aria-label={`Restaurar cobro de ${charge.name}`} onClick={() => update(charge, "restore")}>{activeAction?.id === charge.id ? <Spinner data-icon="inline-start" /> : null}Restaurar</Button> : null} /></CollapsibleContent>
                </Collapsible> : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(skipping)} onOpenChange={nextOpen => { if (!nextOpen && !busy) setSkipping(null); }}>
        <AlertDialogContent onCloseAutoFocus={closeFocus}>
          <AlertDialogHeader><AlertDialogTitle>Omitir cobro</AlertDialogTitle><AlertDialogDescription>{skipping?.name}. Solo afecta este mes; puedes restaurarlo.</AlertDialogDescription></AlertDialogHeader>
          {formError ? <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert> : null}
          <AlertDialogFooter><AlertDialogCancel disabled={busy} className="h-11">Cancelar</AlertDialogCancel><Button disabled={disabled} className="h-11" onClick={() => update(skipping, "skip")}>{busy ? <Spinner data-icon="inline-start" /> : null}Omitir</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
