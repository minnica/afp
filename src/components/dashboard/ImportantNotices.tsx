"use client";
import type { Notice } from "@/lib/uiTypes";
import { errorMessage } from "@/lib/uiTypes";
import { FINANCIAL_TIME_ZONE, mexicoDayNumber } from '@/lib/financialDates';


import type * as React from "react";

import { ImportantNoticesCard } from "@/components/dashboard/DashboardPanels";
import { NoticeCategoryBadge } from "@/components/dashboard/NoticeCategory";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,
AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
DropdownMenu,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Item, ItemContent, ItemDescription, ItemGroup } from "@/components/ui/item";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { formatPaymentDeadline } from "@/lib/cardPaymentPresentation";
import { formatMoney } from "@/lib/dashboardPresentation";
import { getNoticeKey } from "@/lib/noticeDismissals";
import { ArrowLeft01Icon, MoreHorizontalIcon, ViewOffIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useRef, useState } from "react";

export function HiddenNoticesButton({ onClick }: { onClick: React.MouseEventHandler<HTMLButtonElement> }) {
  const { hiddenNotices, noticePreferences } = useDashboard();
  if (hiddenNotices.length === 0) return null;
  const payments = hiddenNotices.filter((notice) => notice.type === "CARD_PAYMENT").length;
  const label = `Ver ocultos este mes: ${hiddenNotices.length} aviso${hiddenNotices.length === 1 ? "" : "s"}${payments > 0 ? `; incluye ${payments} pago${payments === 1 ? "" : "s"} de tarjeta` : ""}`;

  return (
    <Button type="button" variant="ghost" size="icon-lg" className="relative size-11" onClick={onClick}
      aria-label={label} title={label} disabled={noticePreferences.saving} data-hidden-notices-trigger>
      <HugeiconsIcon icon={ViewOffSlashIcon} data-icon="inline-start" aria-hidden="true" />
      <Badge variant={payments > 0 ? "warning" : "secondary"} className="absolute top-0 right-0 h-4 min-w-4 px-1" aria-hidden="true">
        {hiddenNotices.length > 99 ? "99+" : hiddenNotices.length}
      </Badge>
    </Button>
  );
}

export default function ImportantNotices({ inDialog = false, view: controlledView, onViewChange }: { inDialog?: boolean; view?: string; onViewChange?: (view: string) => void }) {
  const { today, visibleNotices, hiddenNotices, noticePreferences } = useDashboard();
  const [internalView, setInternalView] = useState("active");
  const view = controlledView ?? internalView;
  const hiddenView = view === "hidden";
  const [pending, setPending] = useState<{ notice: Notice; month: string; key: string | null } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [actionError, setActionError] = useState("");
  const triggerRefs = useRef(new Map<string | null | undefined, HTMLElement>());
  const pendingRef = useRef<typeof pending>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const checkboxId = useId();
  const hiddenPayments = hiddenNotices.filter((notice) => notice.type === "CARD_PAYMENT").length;
  const isPayment = pending?.notice.type === "CARD_PAYMENT";
  const financialDate = new Date(mexicoDayNumber(today));
  const monthName = today.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: FINANCIAL_TIME_ZONE });
  const endOfMonth = new Date(Date.UTC(financialDate.getUTCFullYear(), financialDate.getUTCMonth() + 1, 0))
    .toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: 'UTC' });

  function changeView(nextView: string) {
    setActionError("");
    if (onViewChange) onViewChange(nextView);
    else {
      setInternalView(nextView);
      requestAnimationFrame(() => summaryRef.current?.focus({ preventScroll: true }));
    }
  }

  function askToHide(notice: Notice) {
    const selection = { notice, month: noticePreferences.month, key: getNoticeKey(notice) };
    pendingRef.current = selection;
    setPending(selection);
    setAcknowledged(false);
    setActionError("");
  }

  async function confirmHide(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!pending || (isPayment && !acknowledged) || noticePreferences.saving) return;
    setActionError("");
    const stillVisible = visibleNotices.some((notice) => getNoticeKey(notice) === pending.key);
    if (!stillVisible) {
      setActionError("El aviso cambió. Cancela y revisa su información actualizada.");
      return;
    }
    try {
      await noticePreferences.update(pending.notice, true, pending.month);
      setPending(null);
      toast.success("Aviso oculto por este mes", { description: "Recupéralo desde el icono de ocultos junto al título." });
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function restore(notice: Notice) {
    setActionError("");
    try {
      await noticePreferences.update(notice, false);
      summaryRef.current?.focus({ preventScroll: true });
      toast.success("El aviso vuelve a estar visible");
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  const content = (
    <div ref={summaryRef} tabIndex={-1} aria-label={hiddenView ? "Avisos ocultos este mes" : "Avisos visibles"}
      className="flex flex-col gap-3 outline-none" data-notices-summary data-notices-view={view}>
      {noticePreferences.error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-2">
            <p>{noticePreferences.error}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={noticePreferences.refresh}>Reintentar sincronización</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {actionError && !pending ? <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert> : null}
      {hiddenView ? (
        <>
          <p className="text-xs text-muted-foreground">Ocultos solo durante {monthName}. Puedes volver a mostrarlos cuando quieras.</p>
          {hiddenPayments > 0 ? (
            <p className="text-xs text-warning" role="status">
              {hiddenPayments === 1 ? "Hay un aviso de pago de tarjeta oculto." : `Hay ${hiddenPayments} avisos de pago de tarjeta ocultos.`}
            </p>
          ) : null}
          {hiddenNotices.length > 0 ? (
            <ItemGroup>
              {hiddenNotices.map((notice) => (
                <Item key={notice.id} variant="muted" size="sm">
                  <ItemContent className="min-w-0">
                    <NoticeCategoryBadge type={notice.type} />
                    <p className="break-words font-medium">{notice.title}</p>
                    <ItemDescription>{formatPaymentDeadline(notice.date, today)}</ItemDescription>
                    <ItemDescription>{formatMoney(notice.amount)}</ItemDescription>
                  </ItemContent>
                  <Button type="button" variant="outline" className="min-h-11" disabled={noticePreferences.saving}
                    aria-label={`Volver a mostrar: ${notice.title}`} onClick={() => restore(notice)}>
                    Volver a mostrar
                  </Button>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <Empty><EmptyDescription>No tienes avisos ocultos este mes.</EmptyDescription></Empty>
          )}
        </>
      ) : <ImportantNoticesCard notices={visibleNotices} today={today} inDialog={inDialog} embedded
        emptyDescription={hiddenNotices.length > 0 ? "No quedan avisos visibles. Puedes recuperarlos desde el icono de ocultos junto al título." : undefined}
        renderNoticeActions={inDialog ? (notice) => getNoticeKey(notice) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-lg" className="absolute right-0 bottom-0 size-11"
                ref={(element) => { if (element) triggerRefs.current.set(getNoticeKey(notice), element); else triggerRefs.current.delete(getNoticeKey(notice)); }}
                aria-label={`Opciones del aviso: ${notice.title}`} disabled={!noticePreferences.ready || noticePreferences.saving}>
                <HugeiconsIcon icon={MoreHorizontalIcon} data-icon="inline-start" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)] motion-reduce:animate-none"
              onCloseAutoFocus={(event) => { if (pendingRef.current) event.preventDefault(); }}>
              <DropdownMenuGroup>
                <DropdownMenuItem className="min-h-11" onSelect={() => askToHide(notice)}>
                  <HugeiconsIcon icon={ViewOffIcon} aria-hidden="true" />
                  Ocultar este aviso por este mes
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined}
      />}
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !noticePreferences.saving) setPending(null); }}>
        <AlertDialogContent className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] overflow-y-auto motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = triggerRefs.current.get(pendingRef.current?.key);
            (trigger?.isConnected ? trigger : summaryRef.current)?.focus({ preventScroll: true });
            pendingRef.current = null;
          }}
          onEscapeKeyDown={(event) => { if (noticePreferences.saving) event.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ocultar este aviso por este mes?</AlertDialogTitle>
            <AlertDialogDescription>
              Se ocultará hasta el {endOfMonth}. Los siguientes cobros y cortes seguirán apareciendo. Puedes recuperarlo desde el icono de ocultos junto al título.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending ? (
            <Item variant="muted" size="sm">
              <ItemContent className="min-w-0">
                <NoticeCategoryBadge type={pending.notice.type} />
                <p className="break-words font-medium">{pending.notice.title}</p>
                <ItemDescription>{formatPaymentDeadline(pending.notice.date, today)}</ItemDescription>
                {pending.notice.description.split("\n").slice(1).map((line) => <ItemDescription key={line}>{line}</ItemDescription>)}
              </ItemContent>
            </Item>
          ) : null}
          {isPayment ? (
            <FieldGroup>
              <Field orientation="horizontal" data-disabled={noticePreferences.saving || undefined}>
                <Checkbox id={checkboxId} checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} disabled={noticePreferences.saving} />
                <FieldLabel htmlFor={checkboxId} className="min-h-11 items-center">
                  Entiendo que este pago seguirá pendiente aunque oculte el aviso.
                </FieldLabel>
              </Field>
            </FieldGroup>
          ) : <p className="text-xs text-muted-foreground">Ocultarlo no registra un cobro ni un pago y no cambia tus saldos.</p>}
          {actionError ? <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert> : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={noticePreferences.saving}>Conservar aviso</AlertDialogCancel>
            <AlertDialogAction variant={isPayment ? "destructive" : "default"} className="min-h-11"
              disabled={noticePreferences.saving || (isPayment && !acknowledged) || !noticePreferences.ready}
              onClick={confirmHide}>
              {noticePreferences.saving ? <Spinner data-icon="inline-start" /> : null}
              {noticePreferences.saving ? "Guardando…" : "Ocultar por este mes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // En escritorio se conservan todos los enlaces y se permite recuperar lo
  // ocultado desde el celular, con la misma preferencia sincronizada.
  if (inDialog) return content;
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="flex flex-row items-center gap-2">
        {hiddenView ? (
          <Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label="Volver a avisos importantes" onClick={() => changeView("active")}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
          </Button>
        ) : null}
        <CardTitle className="min-w-0 flex-1 text-lg font-semibold uppercase text-center">{hiddenView ? "Ocultos este mes" : "Avisos importantes"}</CardTitle>
        {!hiddenView ? <HiddenNoticesButton onClick={() => changeView("hidden")} /> : null}
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
