"use client";
import type { Payable } from "@/lib/uiTypes";

import type * as React from "react";

import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemHeader } from "@/components/ui/item";
import { BreakdownHelp } from "@/components/ui/responsive-breakdown";
import { Separator } from "@/components/ui/separator";
import { getPayablesSummary } from "@/lib/payablesSummary";
import { useMemo } from "react";

const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

function AmountRow({ label, value }: { label: string; value: number }) {
  return <div className="payables-summary-row"><dt>{label}</dt><dd>{money(value)}</dd></div>;
}

function DesktopSummaryCard({ title, value, children }: React.PropsWithChildren<{ title: string; value: React.ReactNode }>) {
  return (
    <Card className="payables-summary-card relative min-w-0 rounded-2xl border-border bg-card">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle><p className="payables-summary-card-amount">{value}</p></CardTitle>
        {children ? <CardAction>{children}</CardAction> : null}
      </CardHeader>
    </Card>
  );
}

function SummaryHelp({ summary, withDetails = false }: { summary: ReturnType<typeof getPayablesSummary>; withDetails?: boolean }) {
  return (
    <BreakdownHelp title="Cómo se calcula tu deuda neta" label={withDetails ? "Ver desglose de deuda y reembolsos" : "Cómo se calcula tu deuda neta"}>
      {withDetails ? <div className="payables-summary-help-details">
        <p className="text-sm text-muted-foreground">Todas tus cuentas vigentes · Importes en MXN</p>
        <h3 className="text-sm font-medium">Total por pagar</h3>
        <dl className="flex flex-col gap-2">
          <AmountRow label="Préstamos" value={summary.loans} />
          <AmountRow label="Otras cuentas" value={summary.other} />
        </dl>
        <h3 className="text-sm font-medium">Reembolsos pendientes</h3>
        {summary.reimbursements.length ? (
          <dl className="flex flex-col gap-2">
            {summary.reimbursements.map((account) => <AmountRow key={account.id} label={account.name} value={account.pendingBalance} />)}
          </dl>
        ) : <p className="text-sm">No hay reembolsos pendientes de estos préstamos.</p>}
        <p className="text-sm">Deuda neta si recuperas todo lo que te deben de estos préstamos.</p>
        {summary.recoverySurplus > 0 ? <p className="text-sm">Por recuperar por encima de la deuda: <strong>{money(summary.recoverySurplus)}</strong>.</p> : null}
        <Separator />
      </div> : null}
      <p className="text-sm">Del total pendiente de tus cuentas por pagar se resta únicamente lo que falta por cobrar de los préstamos vinculados a otras personas.</p>
      <p className="text-sm">Los abonos que ya recibiste están descontados de cada cuenta por cobrar. No se descuentan otra vez. Las cuentas canceladas y los excedentes pagados no compensan otras deudas.</p>
      <p className="text-sm">El saldo de los préstamos corresponde a la última conciliación bancaria y no incluye intereses futuros. Recibir un reembolso no registra un pago al banco.</p>
      <dl className="flex flex-col gap-2 text-sm">
        <AmountRow label="Capital original" value={summary.original} />
        <AmountRow label="Capital abonado" value={summary.paid} />
      </dl>
    </BreakdownHelp>
  );
}

export default function PayablesSummary({ payables }: { payables: Payable[] }) {
  const summary = useMemo(() => getPayablesSummary(payables), [payables]);

  return (
    <>
      <div className="payables-summary-cards" role="region" aria-label="Resumen de deuda y reembolsos">
        <DesktopSummaryCard title="Total por pagar" value={money(summary.pending)} />
        <DesktopSummaryCard title="Reembolsos pendientes" value={<span className="text-warning">{money(summary.toRecover)}</span>} />
        <DesktopSummaryCard title="A tu cargo · si recuperas todo" value={money(summary.own)}>
          <SummaryHelp summary={summary} withDetails />
        </DesktopSummaryCard>
      </div>
      <Card className="payables-summary" role="region" aria-label="Resumen de deuda y reembolsos">
        <CardHeader className="payables-summary-header">
          <CardTitle><h2>Tu deuda actual</h2></CardTitle>
          <CardDescription>Todas tus cuentas vigentes · Importes en MXN</CardDescription>
          <CardAction>
            <SummaryHelp summary={summary} />
          </CardAction>
        </CardHeader>
        <CardContent className="payables-summary-content">
          <section className="payables-summary-own" aria-labelledby="payables-own-title">
            <h3 id="payables-own-title">A tu cargo</h3>
            <p className="payables-summary-amount">{money(summary.own)}</p>
            <p className="payables-summary-note">Deuda neta si recuperas todo lo que te deben de estos préstamos.</p>
            {summary.recoverySurplus > 0 ? <p className="payables-summary-note">Por recuperar por encima de la deuda: <strong>{money(summary.recoverySurplus)}</strong>.</p> : null}
          </section>
          <Separator className="payables-summary-divider-horizontal" />
          <ItemGroup className="payables-summary-sources">
            <Item asChild className="payables-summary-source">
              <section role="listitem" aria-labelledby="payables-total-title">
                <ItemHeader className="payables-summary-subtotal">
                  <h3 id="payables-total-title">Total por pagar</h3>
                  <p>{money(summary.pending)}</p>
                </ItemHeader>
                <ItemContent>
                  <dl className="payables-summary-breakdown">
                    <AmountRow label="Préstamos" value={summary.loans} />
                    <AmountRow label="Otras cuentas" value={summary.other} />
                  </dl>
                </ItemContent>
              </section>
            </Item>
            <Separator />
            <Item asChild className="payables-summary-source">
              <section role="listitem" aria-labelledby="payables-reimbursements-title">
                <ItemHeader className="payables-summary-subtotal">
                  <h3 id="payables-reimbursements-title">Reembolsos pendientes</h3>
                  <p className="text-warning"><span aria-hidden="true">− </span>{money(summary.toRecover)}</p>
                </ItemHeader>
                <ItemContent>
                  {summary.reimbursements.length ? (
                    <dl className="payables-summary-breakdown">
                      {summary.reimbursements.map((account) => <AmountRow key={account.id} label={account.name} value={account.pendingBalance} />)}
                    </dl>
                  ) : <p className="payables-summary-note">No hay reembolsos pendientes de estos préstamos.</p>}
                </ItemContent>
              </section>
            </Item>
          </ItemGroup>
        </CardContent>
        <Separator />
        <CardFooter>
          <p className="payables-summary-footnote">Capital pendiente, sin intereses futuros. Recibir un reembolso no reduce por sí solo el saldo bancario.</p>
        </CardFooter>
      </Card>
    </>
  );
}
