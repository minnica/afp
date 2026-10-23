"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BreakdownHelp } from "@/components/ui/responsive-breakdown";
import { Separator } from "@/components/ui/separator";
import { getPayablesSummary } from "@/lib/payablesSummary";

const money = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

function AmountRow({ label, value }) {
  return <div className="payables-summary-row"><dt>{label}</dt><dd>{money(value)}</dd></div>;
}

function SummaryDivider() {
  return <>
    <Separator className="payables-summary-divider-horizontal" />
    <Separator orientation="vertical" className="payables-summary-divider-vertical" />
  </>;
}

export default function PayablesSummary({ payables }) {
  const summary = useMemo(() => getPayablesSummary(payables), [payables]);

  return (
    <Card className="payables-summary" role="region" aria-label="Resumen de deuda y reembolsos">
      <CardHeader className="payables-summary-header">
        <div>
          <CardTitle><h2>Tu deuda actual</h2></CardTitle>
          <CardDescription>Todas tus cuentas vigentes · Importes en MXN</CardDescription>
        </div>
        <BreakdownHelp title="Cómo se calcula tu deuda neta" label="Cómo se calcula tu deuda neta">
          <p className="text-sm">Del total pendiente de tus cuentas por pagar se resta únicamente lo que falta por cobrar de los préstamos vinculados a otras personas.</p>
          <p className="text-sm">Los abonos que ya recibiste están descontados de cada cuenta por cobrar. No se descuentan otra vez. Las cuentas canceladas y los excedentes pagados no compensan otras deudas.</p>
          <p className="text-sm">El saldo de los préstamos corresponde a la última conciliación bancaria y no incluye intereses futuros. Recibir un reembolso no registra un pago al banco.</p>
          <dl className="flex flex-col gap-2 text-sm">
            <AmountRow label="Capital original" value={summary.original} />
            <AmountRow label="Capital abonado" value={summary.paid} />
          </dl>
        </BreakdownHelp>
      </CardHeader>
      <CardContent className="payables-summary-content">
        <div className="payables-summary-equation">
          <section className="payables-summary-part" aria-labelledby="payables-total-title">
            <h3 id="payables-total-title">Total por pagar</h3>
            <p className="payables-summary-amount">{money(summary.pending)}</p>
            <dl className="payables-summary-breakdown">
              <AmountRow label="Préstamos" value={summary.loans} />
              <AmountRow label="Otras cuentas" value={summary.other} />
            </dl>
          </section>
          <SummaryDivider />
          <section className="payables-summary-part" aria-labelledby="payables-reimbursements-title">
            <h3 id="payables-reimbursements-title"><span aria-hidden="true">−</span> Reembolsos pendientes</h3>
            <p className="payables-summary-amount text-warning">{money(summary.toRecover)}</p>
            {summary.reimbursements.length ? (
              <dl className="payables-summary-breakdown">
                {summary.reimbursements.map((account) => <AmountRow key={account.id} label={account.name} value={account.pendingBalance} />)}
              </dl>
            ) : <p className="payables-summary-note">No hay reembolsos pendientes de estos préstamos.</p>}
          </section>
          <SummaryDivider />
          <section className="payables-summary-part payables-summary-own" aria-labelledby="payables-own-title">
            <h3 id="payables-own-title"><span aria-hidden="true">=</span> A tu cargo</h3>
            <p className="payables-summary-amount">{money(summary.own)}</p>
            <p className="payables-summary-note">Deuda neta si recuperas todo lo que te deben de estos préstamos.</p>
            {summary.recoverySurplus > 0 ? <p className="payables-summary-note">Por recuperar por encima de la deuda: <strong>{money(summary.recoverySurplus)}</strong>.</p> : null}
          </section>
        </div>
        <Separator />
        <p className="payables-summary-footnote">Capital pendiente, sin intereses futuros. Recibir un reembolso no reduce por sí solo el saldo bancario.</p>
      </CardContent>
    </Card>
  );
}
