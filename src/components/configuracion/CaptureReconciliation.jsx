"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/apiFetch";
import { useCaptureResource } from "@/hooks/use-capture-resource";
import CaptureFields from "@/components/configuracion/CaptureFields";
import { captureFormSchema } from "@/components/configuracion/CaptureMovementEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import CapturePilotSummary from "@/components/configuracion/CapturePilotSummary";

const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value));

function StatementResult({ data, configuration, userId, refresh, onChanged }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [notes, setNotes] = useState(data.statement?.notes || ""), [chargesTotal, setChargesTotal] = useState(data.statement?.chargesTotal ?? "");
  const [version, setVersion] = useState(data.statement?.updatedAt ?? null);
  const [metadata, setMetadata] = useState(() => JSON.stringify([data.statement?.chargesTotal == null ? null : String(data.statement.chargesTotal), data.statement?.notes || ""]));
  const [confirmedDistinct, setConfirmedDistinct] = useState(false);
  const draftKey = `afp:capture-missing:${userId}:${data.period.cardId}:${data.period.startDate}:${data.period.endDate}`;
  const [draft] = useState(() => { try { return JSON.parse(sessionStorage.getItem(draftKey)); } catch { return null; } });
  const [operationId, setOperationId] = useState(() => draft?.operationId || crypto.randomUUID());
  const [missingOpen, setMissingOpen] = useState(false);
  const form = useForm({ resolver: zodResolver(captureFormSchema), defaultValues: draft?.expense || { merchant: "", amount: "", date: data.period.endDate, cardId: data.period.cardId, categoryId: "", currency: "MXN" } });
  async function act(action) {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    let saved = false;
    try {
      if (action.action === "missing") sessionStorage.setItem(draftKey, JSON.stringify({ operationId, expense: action.expense }));
      const response = await apiFetch("/api/captures/reconciliation", { method: "PATCH", expectedUserId: userId, errorMode: "inline", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data.period, ...action }) });
      const result = await response.json(); saved = true;
      setNotice("Comparación guardada.");
      if (result.updatedAt) setVersion(result.updatedAt);
      if (action.action === "save") setMetadata(JSON.stringify([result.chargesTotal == null ? null : String(result.chargesTotal), result.notes]));
      if (action.action === "missing") { sessionStorage.removeItem(draftKey); setOperationId(crypto.randomUUID()); form.reset({ ...form.getValues(), merchant: "", amount: "" }); setConfirmedDistinct(false); }
      await refresh(); await onChanged();
      return true;
    } catch (err) { setError(saved ? `El cambio se guardó. Actualiza los datos: ${err.message}` : `${err.message} Si se perdió la respuesta, conserva los datos y reintenta el mismo cargo.`); return false; }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-5">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div role="status">{notice}</div>
    <p className="text-sm">Compras en AFP: <strong>{money(data.total)}</strong> · Comprobadas: <strong>{money(data.confirmed)}</strong>{data.difference !== null ? <> · Diferencia: <strong>{money(data.difference)}</strong></> : null}</p>
    <p className="text-sm text-muted-foreground">Compara solo las compras y las mensualidades del período. Excluye pagos, saldo anterior, comisiones e intereses. El saldo a pagar se consulta en Tarjetas.</p>
    <CapturePilotSummary pilot={data.pilot} />
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void act({ action: "save", chargesTotal: chargesTotal === "" ? null : String(chargesTotal), notes, expectedUpdatedAt: version, expectedMetadata: metadata }); }}>
      <FieldGroup>
        <Field><FieldLabel htmlFor="statement-total">Total de compras en el estado de cuenta (opcional)</FieldLabel><Input className="min-h-11" id="statement-total" type="number" formatNumber min="0" step="0.01" value={chargesTotal} onChange={event => setChargesTotal(event.target.value)} disabled={busy} /></Field>
        <Field><FieldLabel htmlFor="statement-notes">Notas sobre diferencias</FieldLabel><Textarea id="statement-notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={4000} disabled={busy} /></Field>
      </FieldGroup><div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={busy}>{busy && <Spinner />}Guardar comparación</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => {
          setNotes(data.statement?.notes || ""); setChargesTotal(data.statement?.chargesTotal ?? "");
          setVersion(data.statement?.updatedAt ?? null); setMetadata(JSON.stringify([data.statement?.chargesTotal == null ? null : String(data.statement.chargesTotal), data.statement?.notes || ""]));
          setError("");
        }}>Restablecer campos</Button></div>
    </form>
    <Separator />
    {data.records.length === 0 ? <Empty><EmptyDescription>No hay cargos de compras en este período. Puedes registrar los que falten.</EmptyDescription></Empty> : <ItemGroup className="gap-3">{data.records.map(row => <Item role="listitem" key={`${row.type}:${row.id}`} variant="outline" className="flex-wrap">
      <ItemContent className="min-w-0 basis-full sm:basis-0"><ItemTitle className="flex-wrap break-words">{row.concept}<Badge variant={row.matched ? "secondary" : "warning"}>{row.matched ? "Conciliado" : row.changed ? "Cambió; revisar de nuevo" : "Por comprobar"}</Badge></ItemTitle>
        <ItemDescription>{new Date(row.date).toISOString().slice(0, 10)} · {money(row.chargeAmount)}{row.type === "INSTALLMENT" ? " · Cuota MSI" : ""}</ItemDescription>
        {data.pilot && <ItemDescription>{data.pilot.evidenceByRecord.find(item => item.id === row.id && item.type === row.type)?.count || 0} avisos vinculados</ItemDescription>}</ItemContent>
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => act({ action: row.matched ? "unconfirm" : "confirm", type: row.type, recordId: row.id, fingerprint: row.fingerprint })}>{row.matched ? "Quitar comprobación" : "Está en el estado de cuenta"}</Button>
    </Item>)}</ItemGroup>}
    <Collapsible open={missingOpen} onOpenChange={setMissingOpen} className="flex flex-col gap-4"><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 self-start">Registrar cargo faltante</Button></CollapsibleTrigger><CollapsibleContent>
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(expense => act({ action: "missing", expense, operationId, confirmDistinct: confirmedDistinct }))}>
        <CaptureFields form={form} configuration={configuration} disabled={busy} prefix="capture-missing" />
        <Field orientation="horizontal"><Checkbox id="missing-distinct" checked={confirmedDistinct} onCheckedChange={setConfirmedDistinct} disabled={busy} /><FieldLabel htmlFor="missing-distinct" className="min-h-11">Revisé los cargos existentes; esta es otra compra del estado.</FieldLabel></Field>
        <Button type="submit" className="min-h-11 self-start" disabled={busy || !confirmedDistinct}>{busy && <Spinner />}Guardar cargo faltante</Button>
        <p className="text-sm text-muted-foreground">Se conserva como Por conciliar hasta confirmarlo individualmente en la lista. Para un faltante a MSI, regístralo en Compras a meses y vuelve a esta comparación.</p>
      </form>
    </CollapsibleContent></Collapsible>
  </div>;
}

export default function CaptureReconciliation({ configuration, userId, onChanged }) {
  const today = new Date().toLocaleDateString("sv-SE");
  const [cardId, setCardId] = useState(configuration.cards[0]?.id || ""), [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`), [endDate, setEndDate] = useState(today);
  const [query, setQuery] = useState(null);
  const url = query ? `/api/captures/reconciliation?${new URLSearchParams(query)}` : null;
  const { data, error, loading, refresh, region } = useCaptureResource(url, userId);
  const matches = data && query && ['cardId', 'startDate', 'endDate'].every(key => data.period[key] === query[key]);
  return <section ref={region} aria-label="Conciliación manual" className="flex flex-col gap-5">
    <p className="text-sm text-muted-foreground">Compara cada compra con tu estado de cuenta. Confirma las que coincidan y registra las que falten.</p>
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); const next = { cardId, startDate, endDate }; if (query && Object.keys(next).every(key => query[key] === next[key])) void refresh(); else setQuery(next); }}>
      <FieldGroup><Field><FieldLabel htmlFor="statement-card">Tarjeta del estado</FieldLabel><ResponsiveSelect className="min-h-11" id="statement-card" value={cardId} onValueChange={setCardId} options={configuration.cards.map(row => ({ value: row.id, label: row.name }))} searchable="auto" /></Field>
        <Field><FieldLabel htmlFor="statement-start">Inicio del período</FieldLabel><DatePicker className="min-h-11" id="statement-start" value={startDate} onChange={setStartDate} /></Field>
        <Field><FieldLabel htmlFor="statement-end">Fin del período</FieldLabel><DatePicker className="min-h-11" id="statement-end" value={endDate} onChange={setEndDate} /></Field>
      </FieldGroup><Button type="submit" variant="outline" className="min-h-11 self-start" disabled={!cardId || !startDate || !endDate || loading}>Ver compras del período</Button>
    </form>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading && !matches ? <Skeleton className="h-24 w-full" /> : matches && <StatementResult key={url} data={data} configuration={configuration} userId={userId} refresh={refresh} onChanged={onChanged} />}
  </section>;
}
