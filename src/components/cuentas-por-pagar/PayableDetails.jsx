"use client";

import { useRef } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, BankIcon, Cancel01Icon, Invoice01Icon, MoneyReceiveSquareIcon } from "@hugeicons/core-free-icons";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { BreakdownHelp } from "@/components/ui/responsive-breakdown";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import ReceivableBalanceAdjustment from "@/components/cuentas-por-cobrar/ReceivableBalanceAdjustment";

const money = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "Sin definir";
const percentage = (paid, original) => Number(original) > 0 ? Math.min(100, Math.max(0, Number(paid || 0) / Number(original) * 100)) : 0;
const percentText = (value) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value);

function DetailField({ label, children }) {
  return <div className="min-w-0"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function LoanReimbursementSummary({ payable, compact = false }) {
  const account = payable.reimbursementReceivable;
  if (!account) return null;
  const name = account.person?.name || "Esta persona";
  const adjustedAmount = Number(account.originalAmount) + Number(account.balanceAdjustment || 0);
  const progress = percentage(account.paidAmount, adjustedAmount);
  const ownAmount = Math.max(0, Number(payable.originalAmount) - Number(account.originalAmount));
  const cancelled = account.status === "CANCELLED";
  const excess = Number(account.pendingBalance) < 0;
  const settled = !cancelled && Number(account.pendingBalance) <= 0;
  const balanceLabel = excess ? "Recibido de más" : cancelled ? "Saldo de la cuenta cancelada" : settled ? "Cuenta liquidada" : "Por cobrar";

  return (
    <section className={cn("loan-reimbursement", compact && "loan-reimbursement-compact")} aria-label={`Reembolsos de ${name}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold"><HugeiconsIcon icon={MoneyReceiveSquareIcon} aria-hidden="true" className="size-5 shrink-0" />{name}</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{account.concept}</p>
        </div>
        {cancelled ? <Badge variant="secondary">Cancelada</Badge> : settled ? <Badge variant="success">Liquidada</Badge> : <Badge variant="success">{percentText(progress)} % recuperado</Badge>}
      </div>
      <dl className="loan-reimbursement-amounts">
        <div><dt>{balanceLabel}</dt><dd className={cn("loan-reimbursement-balance", !cancelled && !settled && !excess && "text-warning", (settled || excess) && "text-success")}>{money(Math.abs(Number(account.pendingBalance || 0)))}</dd></div>
        <div><dt>Ya recibiste</dt><dd className="loan-reimbursement-paid text-success">{money(account.paidAmount)}</dd></div>
      </dl>
      <Progress variant="success" value={progress} aria-label={`Recuperado de ${name}`} aria-valuetext={`${money(account.paidAmount)} de ${money(adjustedAmount)}`} className="h-2" />
      <p className="text-sm text-muted-foreground">Importe original: {money(account.originalAmount)}</p>
      <ReceivableBalanceAdjustment receivable={account} />
      {!compact ? (
        <>
          <Separator />
          <p className="text-sm text-muted-foreground">Tu parte del capital inicial: <strong className="font-semibold text-foreground">{money(ownAmount)}</strong></p>
        </>
      ) : null}
    </section>
  );
}

function BankBalance({ payable }) {
  const loan = payable.accountType === "LOAN";
  const excess = Number(payable.pendingBalance) < 0;
  const paid = percentage(payable.paidAmount, payable.originalAmount);
  return (
    <section className="payable-bank-balance" aria-label={loan ? "Deuda con el banco" : "Saldo de la cuenta"}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium"><HugeiconsIcon icon={BankIcon} aria-hidden="true" className="size-5" />{excess ? "Excedente pagado" : loan ? "Por pagar al banco" : "Pendiente de pago"}</p>
        {loan ? <BreakdownHelp title="Cómo leer estos saldos" label="Cómo se relacionan el préstamo y los reembolsos" description="Los importes de capital se muestran sin intereses ni otros cargos.">
          <p className="text-sm">El saldo bancario ya incluye el capital descontado de tu nómina hasta la última conciliación.</p>
          <p className="text-sm">Los reembolsos reducen lo que esa persona te debe. Los pagos al banco se concilian por separado.</p>
        </BreakdownHelp> : null}
      </div>
      <div className="payable-bank-amount-row">
        <p className="payable-bank-amount">{money(Math.abs(Number(payable.pendingBalance || 0)))}</p>
        {loan && payable.paymentAmount != null ? <dl className="payable-payment"><dt>Descuento quincenal</dt><dd>{money(payable.paymentAmount)}</dd></dl> : null}
      </div>
      <Progress value={paid} aria-label={loan ? "Capital pagado al banco" : "Avance de pago"} aria-valuetext={`${money(payable.paidAmount)} de ${money(payable.originalAmount)}`} className="h-1.5" />
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <p>{loan ? "Capital pagado" : "Pagado"} <strong className="font-medium text-foreground">{money(payable.paidAmount)}</strong></p>
        <p>Capital inicial <span className="tabular-nums">{money(payable.originalAmount)}</span></p>
      </div>
      {loan ? <p className="text-sm text-muted-foreground">Saldo de la última conciliación de nómina.</p> : null}
    </section>
  );
}

function PaymentHistory({ payable }) {
  const payments = [...(payable.dailyExpenses || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!payments.length) return (
    <Empty className="px-0 py-4">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HugeiconsIcon icon={Invoice01Icon} aria-hidden="true" /></EmptyMedia>
        <EmptyTitle>Sin pagos vinculados</EmptyTitle>
        <EmptyDescription>{payable.accountType === "LOAN" ? "Los descuentos de nómina ya están incluidos en el saldo bancario. Aquí verás los gastos que vincules a este préstamo." : "Aquí verás los gastos que registres como pago de esta cuenta."}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
  return <ItemGroup className="gap-0">{payments.map(payment => (
    <Item key={payment.id} role="listitem" className="px-0 py-3">
      <ItemContent className="min-w-0"><ItemTitle className="block line-clamp-none break-words">{payment.concept}</ItemTitle><ItemDescription>{date(payment.date)}</ItemDescription></ItemContent>
      <p className="max-w-[45%] break-words text-right font-semibold tabular-nums">{money(payment.amount)}</p>
    </Item>
  ))}</ItemGroup>;
}

export default function PayableDetails({ payable, restoreFocus }) {
  const contentRef = useRef(null);
  const conceptTitle = payable.concept?.replace(/^préstamo n[oó]mina\s*·\s*/i, "").trim();
  const title = conceptTitle ? conceptTitle.charAt(0).toLocaleUpperCase("es-MX") + conceptTitle.slice(1) : "Detalle de la cuenta";
  const loan = payable.accountType === "LOAN";
  const account = payable.reimbursementReceivable;
  const remaining = payable.totalPayments != null && payable.paymentsMade != null ? Math.max(0, payable.totalPayments - payable.paymentsMade) : null;
  const days = payable.paymentDays?.map(day => day === 31 ? "fin de mes" : String(day)).join(" y ");
  const payments = payable.dailyExpenses?.length || 0;
  const status = { ACTIVE: loan ? "En curso" : "Activa", PAID_OFF: "Liquidada", CANCELLED: "Cancelada" }[payable.status] || payable.status;
  const note = payable.notes?.trim() === "Registrado desde la BD." ? null : payable.notes;
  const conditionsSummary = loan ? [remaining != null ? `${remaining} cuotas pendientes` : null, payable.annualInterestRate != null ? `${Number(payable.annualInterestRate)} % anual` : null].filter(Boolean).join(" · ") : "Fechas, importe esperado y notas";

  return (
    <DialogContent ref={contentRef} showCloseButton={false} className="payable-detail" onCloseAutoFocus={restoreFocus} onOpenAutoFocus={(event) => { event.preventDefault(); contentRef.current?.focus(); }}>
      <DialogHeader className="payable-detail-header">
        <div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="outline">{loan ? "Préstamo de nómina" : "Cuenta por pagar"}</Badge><Badge variant={payable.status === "PAID_OFF" ? "success" : "secondary"}>{status}</Badge></div>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{payable.person?.name || "Persona / proveedor"}</DialogDescription>
      </DialogHeader>
      <DialogClose asChild><Button type="button" variant="ghost" size="icon" className="payable-detail-close" aria-label="Cerrar detalle"><HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" /></Button></DialogClose>

      <div className="payable-detail-body" role="region" aria-label="Saldos y condiciones de la cuenta" tabIndex={0}>
        <BankBalance payable={payable} />
        {account ? <LoanReimbursementSummary payable={payable} /> : loan ? <p className="payable-own-note">Todo el capital de este préstamo está a tu cargo.</p> : null}

        <Accordion type="multiple" defaultValue={!loan && payments ? ["payments"] : []} className="payable-detail-sections">
          <AccordionItem value="conditions">
            <AccordionTrigger><span><span className="block">{loan ? "Condiciones del préstamo" : "Datos de la cuenta"}</span><span className="mt-1 block text-sm font-normal text-muted-foreground">{conditionsSummary}</span></span></AccordionTrigger>
            <AccordionContent>
              <dl className="payable-condition-fields">
                <DetailField label="Fecha de inicio">{date(payable.originDate)}</DetailField>
                {payable.expectedDate ? <DetailField label={loan ? "Fin del contrato" : "Fecha esperada"}>{date(payable.expectedDate)}</DetailField> : null}
                {loan && payable.firstPaymentDate ? <DetailField label="Primer descuento">{date(payable.firstPaymentDate)}</DetailField> : null}
                {days ? <DetailField label="Días de descuento">{days}</DetailField> : null}
                {payable.paymentAmount != null ? <DetailField label="Descuento quincenal">{money(payable.paymentAmount)}</DetailField> : null}
                {payable.expectedMonthlyPayment ? <DetailField label="Pago mensual esperado">{money(payable.expectedMonthlyPayment)}</DetailField> : null}
                {payable.annualInterestRate != null ? <DetailField label="Tasa anual">{Number(payable.annualInterestRate)} %</DetailField> : null}
                {remaining != null ? <DetailField label="Cuotas pendientes">{remaining} de {payable.totalPayments}</DetailField> : null}
              </dl>
              {loan ? <p className="mt-4 text-sm text-muted-foreground">El descuento incluye capital e intereses.</p> : null}
              {note ? <div className="mt-4 flex flex-col gap-1"><p className="font-medium">Notas</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{note}</p></div> : null}
            </AccordionContent>
          </AccordionItem>
          {payments > 0 || !loan ? (
            <AccordionItem value="payments">
              <AccordionTrigger><span className="flex min-w-0 items-center gap-2">{loan ? "Pagos vinculados al banco" : "Pagos registrados"}<Badge variant="secondary">{payments}</Badge></span></AccordionTrigger>
              <AccordionContent><PaymentHistory payable={payable} /></AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </div>

      <DialogFooter className="payable-detail-footer">
        <DialogClose asChild><Button type="button" variant="secondary">Cerrar</Button></DialogClose>
        {account ? <Button asChild variant="outline"><Link href="/cuentas-por-cobrar">Ver cuenta por cobrar<HugeiconsIcon icon={ArrowUpRight01Icon} aria-hidden="true" data-icon="inline-end" /></Link></Button> : null}
      </DialogFooter>
    </DialogContent>
  );
}
