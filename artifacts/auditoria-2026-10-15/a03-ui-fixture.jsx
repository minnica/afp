// Fixture de UI con datos y guardado simulados. Montar temporalmente como src/app/a03-preview/page.jsx en desarrollo; retirar al terminar. No usa la API ni Supabase.
"use client";
import { useState } from "react";
import CyclesDataTable from "@/components/tarjetas/CyclesDataTable";
import { getCyclePaymentState, parseCycleMoney } from "@/lib/calculations/cardCyclePayments";
import { Button } from "@/components/ui/button";
const initial = { id: "test", card: { name: "Tarjeta de prueba" }, startDate: "2026-09-11T12:00:00Z", cutDate: "2026-10-10T12:00:00Z", dueDate: "2026-10-25T12:00:00Z", statementAmount: 1000, calculatedAmount: 1000, difference: 0, paidAmount: null, paidAt: null };
export default function Preview() {
  const [cycle, setCycle] = useState(initial);
  const [fail, setFail] = useState(false);
  async function update(fields) {
    if (fail) throw new Error("Error simulado: conserva el formulario y reintenta.");
    setCycle((old) => ({ ...old, ...fields }));
  }
  return <main className="p-4"><h1>Prueba A03 · datos ficticios</h1><Button onClick={() => setFail(!fail)}>Error simulado: {fail ? "sí" : "no"}</Button><Button onClick={() => setCycle({ ...initial, statementAmount: null })}>Sin estado</Button><CyclesDataTable cycles={[{ ...cycle, difference: cycle.statementAmount == null ? null : cycle.statementAmount - cycle.calculatedAmount, ...getCyclePaymentState(cycle) }]} month="9" monthOptions={[{value:"9",label:"Octubre 2026"}]} onMonthChange={() => {}} updateCycleDates={(_, fields) => update(fields)} updateStatementAmount={(_, amount) => update({statementAmount: parseCycleMoney(amount)})} markCycleAsPaid={(_, {paidAmount, paidAt}) => update({paidAmount: Number(paidAmount) || null, paidAt: Number(paidAmount) ? paidAt : null})} unmarkCycleAsPaid={() => update({paidAmount:null,paidAt:null})} /></main>;
}
