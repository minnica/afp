"use client";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch } from "@/lib/apiFetch";
import { captureSources } from "@/lib/capturePresentation";
import CaptureRolloutStatus from "@/components/configuracion/CaptureRolloutStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const aliasSchema = z.object({ sourcePackage: z.string().min(1), kind: z.string(), value: z.string().regex(/^\d{4}$/, "Escribe cuatro cifras, incluidos los ceros iniciales."), evidence: z.string().max(500), verified: z.boolean() }).refine(data => !data.verified || data.evidence.trim(), { path: ['evidence'], message: "Indica dónde verificaste la terminación." });
const ruleSchema = z.object({ merchant: z.string().trim().min(1, "Escribe el comercio exacto."), categoryId: z.string().min(1, "Selecciona una categoría."), subscriptionId: z.string() });
const kinds = { PHYSICAL: "Física", DIGITAL: "Digital", WALLET: "Wallet" };

export default function CaptureConfigurationPanel({ configuration, userId, refresh, captureFocus, restoreFocus }) {
  const [cardId, setCardId] = useState(configuration.cards[0]?.id || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [confirmation, setConfirmation] = useState(null);
  const aliasForm = useForm({ resolver: zodResolver(aliasSchema), defaultValues: { sourcePackage: "com.bancomer.mbanking", kind: "PHYSICAL", value: "", evidence: "", verified: false } });
  const ruleForm = useForm({ resolver: zodResolver(ruleSchema), defaultValues: { merchant: "", categoryId: "", subscriptionId: "none" } });
  async function perform(action) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch("/api/captures/configuration", { method: "PATCH", expectedUserId: userId, errorMode: "inline", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      setNotice("Configuración guardada."); setConfirmation(null); await refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-5" aria-label="Tarjetas, alias y reglas" onClickCapture={captureFocus}>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div role="status">{notice}</div>
    <Field><FieldLabel htmlFor="capture-config-card">Tarjeta a configurar</FieldLabel><ResponsiveSelect id="capture-config-card" value={cardId} disabled={busy} onValueChange={value => { setCardId(value); ruleForm.reset(); }} options={configuration.cards.map(row => ({ value: row.id, label: row.name }))} searchable="auto" /></Field>
    {!cardId ? <p className="text-sm text-muted-foreground">Añade una tarjeta en Tarjetas para configurar sus avisos.</p> : <>
      <CaptureRolloutStatus coverage={configuration.rollout?.find(row => row.cardId === cardId)} cardId={cardId} busy={busy} onAutomation={setConfirmation} />
      <Separator />
      <h3 className="font-medium">Terminaciones de la tarjeta</h3>
      <ItemGroup>{configuration.aliases.filter(row => row.cardId === cardId).map(alias => <Item key={alias.id} className="flex-wrap"><ItemContent>
        <ItemTitle>{kinds[alias.kind]} · •{alias.value}<Badge variant={alias.verifiedAt ? "secondary" : "warning"}>{alias.verifiedAt ? "Verificada" : "Por verificar"}</Badge></ItemTitle>
        <ItemDescription>{captureSources[alias.sourcePackage]}{alias.evidence ? ` · ${alias.evidence}` : ""}</ItemDescription>
      </ItemContent><ItemActions><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => aliasForm.reset({ sourcePackage: alias.sourcePackage, kind: alias.kind, value: alias.value, evidence: alias.evidence || "", verified: Boolean(alias.verifiedAt) })}>Editar</Button>
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: "deleteAlias", id: alias.id, label: `Eliminar terminación •${alias.value}` })}>Eliminar</Button></ItemActions></Item>)}</ItemGroup>
      <form className="flex flex-col gap-4" onSubmit={aliasForm.handleSubmit(values => perform({ action: "alias", cardId, ...values }))}>
        <FieldGroup>
          <Field><FieldLabel htmlFor="alias-source">Aplicación emisora</FieldLabel><Controller name="sourcePackage" control={aliasForm.control} render={({ field }) => <ResponsiveSelect id="alias-source" value={field.value} disabled={busy} onValueChange={value => {
            field.onChange(value); aliasForm.setValue("kind", value === "com.google.android.apps.walletnfcrel" ? "WALLET" : "PHYSICAL");
          }} options={Object.entries(captureSources).map(([value, label]) => ({ value, label }))} />} /></Field>
          <Field><FieldLabel htmlFor="alias-kind">Tipo de terminación</FieldLabel><Controller name="kind" control={aliasForm.control} render={({ field }) => <ResponsiveSelect id="alias-kind" value={field.value} disabled={busy} onValueChange={field.onChange} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} />} /></Field>
          {[['value', 'Últimas cuatro cifras'], ['evidence', 'Dónde la verificaste']].map(([name, label]) => <Field key={name} data-invalid={Boolean(aliasForm.formState.errors[name])}><FieldLabel htmlFor={`alias-${name}`}>{label}</FieldLabel><Input className="min-h-11" id={`alias-${name}`} maxLength={name === 'value' ? 4 : 500} inputMode={name === 'value' ? 'numeric' : undefined} disabled={busy} aria-invalid={Boolean(aliasForm.formState.errors[name])} {...aliasForm.register(name)} /><FieldError errors={[aliasForm.formState.errors[name]]} /></Field>)}
          <Field orientation="horizontal"><Controller name="verified" control={aliasForm.control} render={({ field }) => <Checkbox id="alias-verified" checked={field.value} onCheckedChange={field.onChange} disabled={busy} />} /><FieldLabel htmlFor="alias-verified" className="min-h-11">Comprobé esta terminación</FieldLabel></Field>
        </FieldGroup>
        <Button type="submit" className="min-h-11 self-start" disabled={busy}>Guardar terminación</Button>
      </form>
      <p className="text-sm text-muted-foreground">Guardar la misma fuente, tipo y terminación actualiza su verificación. Para cambiar las cifras, añade la correcta y elimina la anterior. Las coincidencias entre tarjetas requieren revisión.</p>
      <Separator />
      <h3 className="font-medium">Reglas por comercio exacto</h3>
      <ItemGroup>{configuration.rules.filter(row => row.cardId === cardId).map(rule => <Item key={rule.id} className="flex-wrap"><ItemContent><ItemTitle className="break-words">{rule.merchant}</ItemTitle><ItemDescription>{configuration.categories.find(row => row.id === rule.categoryId)?.name || 'Categoría no disponible'}{rule.subscriptionId ? ` · ${configuration.subscriptions.find(row => row.id === rule.subscriptionId)?.name || 'Suscripción no disponible'}` : ''}</ItemDescription></ItemContent><ItemActions>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => ruleForm.reset({ merchant: rule.merchant, categoryId: rule.categoryId, subscriptionId: rule.subscriptionId || 'none' })}>Editar regla</Button>
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: 'deleteRule', id: rule.id, label: 'Eliminar regla' })}>Eliminar</Button></ItemActions></Item>)}</ItemGroup>
      <form className="flex flex-col gap-4" onSubmit={ruleForm.handleSubmit(values => perform({ action: 'rule', cardId, ...values, subscriptionId: values.subscriptionId === 'none' ? null : values.subscriptionId }))}>
        <FieldGroup>
          <Field data-invalid={Boolean(ruleForm.formState.errors.merchant)}><FieldLabel htmlFor="rule-merchant">Comercio exacto del aviso</FieldLabel><Input className="min-h-11" id="rule-merchant" disabled={busy} aria-invalid={Boolean(ruleForm.formState.errors.merchant)} {...ruleForm.register('merchant')} /><FieldError errors={[ruleForm.formState.errors.merchant]} /></Field>
          {[['categoryId', 'Categoría', configuration.categories], ['subscriptionId', 'Suscripción opcional', [{ id: 'none', name: 'Sin suscripción' }, ...configuration.subscriptions.filter(row => row.cardId === cardId)]]].map(([name, label, rows]) => <Field key={name} data-invalid={Boolean(ruleForm.formState.errors[name])}><FieldLabel htmlFor={`rule-${name}`}>{label}</FieldLabel><Controller name={name} control={ruleForm.control} render={({ field }) => <ResponsiveSelect id={`rule-${name}`} value={field.value} onValueChange={field.onChange} disabled={busy} searchable="auto" options={rows.map(row => ({ value: row.id, label: row.name }))} />} /><FieldError errors={[ruleForm.formState.errors[name]]} /></Field>)}
        </FieldGroup><Button type="submit" className="min-h-11 self-start" disabled={busy}>Guardar regla</Button>
      </form>
    </>}
    <Separator />
    <Field><FieldLabel htmlFor="capture-inventory-file">Importar terminaciones desde JSON</FieldLabel><Input className="min-h-11" id="capture-inventory-file" type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      if (file.size > 60000) { setError('El archivo supera el tamaño permitido.'); return; }
      try { await perform({ action: 'importAliases', inventory: JSON.parse(await file.text()) }); } catch { setError('No se pudo leer el JSON.'); }
    }} /></Field>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><AlertDialogContent onCloseAutoFocus={restoreFocus}><AlertDialogHeader><AlertDialogTitle>{confirmation?.label}</AlertDialogTitle><AlertDialogDescription>{confirmation?.action === 'formatPolicy' ? <>Los avisos exactos de pago CFE de Nu se asignarán a {configuration.cards.find(row => row.id === confirmation.cardId)?.name}, en pesos mexicanos (MXN), con la fecha de publicación en hora de México. La tarjeta y moneda proceden de esta regla, porque el aviso no las incluye. Se confirmará el cobro pendiente de la suscripción elegida, usando el importe real. La configuración habitual de la suscripción se conserva. Cambiar la regla vuelve a observación y requiere revisar una muestra propia.</> : confirmation?.action === 'automation' ? <>El modo se aplica a esta tarjeta y formato. Los avisos ya recibidos conservan sus resoluciones.{confirmation.mode === 'AUTOMATIC' && confirmation.datePolicy === 'NOTIFICATION_POSTED_AT' && ' Los gastos se registrarán con la fecha de publicación del aviso, en hora de México. Ese origen de la fecha quedará indicado en el aviso.'}</> : 'Los avisos y gastos existentes conservan sus datos. Esta configuración dejará de aplicarse a nuevos avisos.'}</AlertDialogDescription></AlertDialogHeader>{confirmation?.action === "formatPolicy" && <FieldGroup><Field><FieldLabel htmlFor="capture-policy-subscription">Suscripción para los pagos CFE</FieldLabel><ResponsiveSelect id="capture-policy-subscription" value={confirmation.subscriptionId} disabled={busy} onValueChange={value => setConfirmation(prior => ({ ...prior, subscriptionId: value }))} searchable="auto" options={configuration.subscriptions.map(row => ({ value: row.id, label: row.name }))} /></Field></FieldGroup>}<AlertDialogFooter><AlertDialogCancel disabled={busy} className="min-h-11">Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy || (confirmation?.action === "formatPolicy" && !confirmation.subscriptionId)} className="min-h-11" onClick={event => { event.preventDefault(); const { label: ignored, ...action } = confirmation; void ignored; perform(action); }}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
