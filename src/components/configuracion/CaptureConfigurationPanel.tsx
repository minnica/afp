"use client";
import type { CaptureConfiguration } from "@/lib/uiTypes";
import { errorMessage } from "@/lib/uiTypes";
import type { ConfigurationAction } from "./captureUiTypes";

import CaptureRolloutStatus from "@/components/configuracion/CaptureRolloutStatus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { Separator } from "@/components/ui/separator";
import { capturePaymentPolicyDescription, capturePaymentSources, captureSources } from "@/lib/capturePresentation";
import { reviewOnlyCapturePackages } from "@/lib/captureSourcePolicy";
import { uiFetch as apiFetch } from "@/lib/uiClient";
import { zodResolver } from "@hookform/resolvers/zod";
import type * as React from "react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const aliasSchema = z.object({ sourcePackage: z.string().min(1), kind: z.string(), value: z.string().regex(/^\d{4}$/, "Escribe cuatro cifras, incluidos los ceros iniciales."), evidence: z.string().max(500), verified: z.boolean() }).refine(data => !data.verified || data.evidence.trim(), { path: ['evidence'], message: "Indica dónde verificaste la terminación." });
const ruleSchema = z.object({ merchant: z.string().trim().min(1, "Escribe el comercio exacto."), categoryId: z.string().min(1, "Selecciona una categoría."), subscriptionId: z.string() });
const kinds: Record<string, string> = { PHYSICAL: "Física", DIGITAL: "Digital", WALLET: "Wallet" };

export default function CaptureConfigurationPanel({ configuration, userId, refresh, captureFocus, restoreFocus }: { configuration: CaptureConfiguration; userId: string; refresh: () => Promise<void>; captureFocus: React.MouseEventHandler<HTMLElement>; restoreFocus: (event: Event) => void }) {
  const [cardId, setCardId] = useState(configuration.cards[0]?.id || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [confirmation, setConfirmation] = useState<ConfigurationAction | null>(null);
  const aliasForm = useForm({ resolver: zodResolver(aliasSchema), defaultValues: { sourcePackage: "com.bancomer.mbanking", kind: "PHYSICAL", value: "", evidence: "", verified: false } });
  const ruleForm = useForm({ resolver: zodResolver(ruleSchema), defaultValues: { merchant: "", categoryId: "", subscriptionId: "none" } });
  async function perform(action: Record<string, unknown> | null) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch("/api/captures/configuration", { method: "PATCH", expectedUserId: userId, errorMode: "inline", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      setNotice("Configuración guardada."); setConfirmation(null); await refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-5" aria-label="Tarjetas y reglas" onClickCapture={captureFocus}>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <Field><FieldLabel htmlFor="capture-config-card">Tarjeta a configurar</FieldLabel><ResponsiveSelect className="min-h-11" id="capture-config-card" value={cardId} disabled={busy} onValueChange={value => { setCardId(value); ruleForm.reset(); }} options={configuration.cards.map(row => ({ value: row.id, label: row.name }))} searchable="auto" /></Field>
    {!cardId ? <p className="text-sm text-muted-foreground">Añade una tarjeta en Tarjetas para configurar sus avisos.</p> : <>
      {(configuration.paymentPolicies || []).some(row => row.cardId === cardId) && <>
        <h3 className="font-medium">Pagos de tarjeta</h3>
        <ItemGroup>{configuration.paymentPolicies.filter(row => row.cardId === cardId).map(policy => <Item role="listitem" key={policy.id}><ItemContent>
          <ItemTitle>{capturePaymentSources[policy.source] || "Regla de pagos"}<Badge variant={policy.mode === "AUTOMATIC" ? "secondary" : "warning"}>{policy.mode === "AUTOMATIC" ? "Automático" : "Solo revisión"}</Badge></ItemTitle>
          <ItemDescription className="line-clamp-none">{capturePaymentPolicyDescription(policy)} Si faltan datos, te pediremos revisar el pago.</ItemDescription>
        </ItemContent><ItemActions><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => perform({ action: "paymentAutomation", id: policy.id, mode: policy.mode === "AUTOMATIC" ? "OBSERVATION" : "AUTOMATIC" })}>{policy.mode === "AUTOMATIC" ? "Pasar a revisión" : "Activar pagos automáticos"}</Button></ItemActions></Item>)}</ItemGroup>
        <Separator />
      </>}
      <section className="flex flex-col gap-3" aria-label="Prioridad Wallet y respaldo bancario">
        <h2 className="font-medium">Fuente principal y respaldo</h2>
        <p className="text-sm text-muted-foreground">Google Wallet registra primero. Si su aviso no llega, el banco puede registrar la compra tras esperar 15 minutos desde que AFP recibe su notificación.</p>
        {(configuration.fallbackPolicies || []).filter(row => row.cardId === cardId).map(policy => <Item role="listitem" key={policy.id} variant="outline" className="flex-wrap"><ItemContent>
          <ItemTitle>{captureSources[policy.bankSourcePackage]}<Badge variant="secondary">{policy.mode === "AUTOMATIC" ? "Respaldo activo · 15 min" : "Respaldo pausado"}</Badge></ItemTitle>
          <ItemDescription className="line-clamp-none">Compras en MXN. {policy.bankDatePolicy === "BANK_OPERATION" ? "Fecha de operación del banco." : "Fecha de publicación del aviso en hora de México."} Pausar detiene las esperas pendientes; reactivar solo se aplica a avisos nuevos.</ItemDescription>
        </ItemContent><ItemActions><Button variant="outline" className="min-h-11" disabled={busy || (policy.mode !== "AUTOMATIC" && !configuration.fallbackOptions?.some(row => row.cardId === cardId && row.bankSourcePackage === policy.bankSourcePackage))} onClick={() => setConfirmation({
          action: "bankFallback", cardId, bankSourcePackage: policy.bankSourcePackage, bankDatePolicy: policy.bankDatePolicy,
          evidenceMovementId: configuration.fallbackOptions?.find(row => row.cardId === cardId && row.bankSourcePackage === policy.bankSourcePackage)?.evidenceMovementId || policy.evidenceMovementId,
          currency: "MXN", purchasesOnly: true, waitMinutes: 15, mode: policy.mode === "AUTOMATIC" ? "OBSERVATION" : "AUTOMATIC",
          label: policy.mode === "AUTOMATIC" ? "Pausar respaldo bancario" : "Activar respaldo bancario",
        })}>{policy.mode === "AUTOMATIC" ? "Pausar respaldo" : "Activar respaldo"}</Button></ItemActions></Item>)}
        {!configuration.fallbackPolicies?.some(row => row.cardId === cardId) && <>
          {(configuration.fallbackOptions || []).filter(row => row.cardId === cardId).map(option => <Button key={option.bankSourcePackage} variant="outline" className="min-h-11 self-start" disabled={busy} onClick={() => setConfirmation({
            ...option, action: "bankFallback", mode: "AUTOMATIC", currency: "MXN", purchasesOnly: true, waitMinutes: 15, label: "Activar respaldo bancario",
          })}>Activar respaldo de {captureSources[option.bankSourcePackage]}</Button>)}
          {!configuration.fallbackOptions?.some(row => row.cardId === cardId) && <p className="text-sm text-muted-foreground">Para activar el respaldo necesitas Wallet activo y un aviso de Banamex, Nu o Santander comprobado con el estado de cuenta. La terminación debe identificar una sola tarjeta.</p>}
        </>}
      </section>
      <Separator />
      <CaptureRolloutStatus fallbackPolicy={configuration.fallbackPolicies?.find(row => row.cardId === cardId)} coverage={configuration.rollout?.find(row => row.cardId === cardId)} cardId={cardId} busy={busy} onAutomation={setConfirmation} />
      <Separator />
      <Collapsible className="flex flex-col gap-3"><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 self-start">Administrar terminaciones de la tarjeta</Button></CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-4">
      <ItemGroup>{configuration.aliases.filter(row => row.cardId === cardId).map(alias => <Item role="listitem" key={alias.id} className="flex-wrap"><ItemContent>
        <ItemTitle>{kinds[alias.kind]} · •{alias.value}<Badge variant={alias.verifiedAt ? "secondary" : "warning"}>{alias.verifiedAt ? "Verificada" : "Por verificar"}</Badge></ItemTitle>
        <ItemDescription>{captureSources[alias.sourcePackage]}{alias.evidence ? ` · ${alias.evidence}` : ""}</ItemDescription>
      </ItemContent><ItemActions><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => aliasForm.reset({ sourcePackage: alias.sourcePackage, kind: alias.kind, value: alias.value, evidence: String(alias.evidence || ""), verified: Boolean(alias.verifiedAt) })}>Editar</Button>
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: "deleteAlias", id: alias.id, label: `Eliminar terminación •${alias.value}` })}>Eliminar</Button></ItemActions></Item>)}</ItemGroup>
      <form className="flex flex-col gap-4" onSubmit={aliasForm.handleSubmit(values => perform({ action: "alias", cardId, ...values }))}>
        <FieldGroup>
          <Field><FieldLabel htmlFor="alias-source">Aplicación emisora</FieldLabel><Controller name="sourcePackage" control={aliasForm.control} render={({ field }) => <ResponsiveSelect className="min-h-11" id="alias-source" value={field.value} disabled={busy} onValueChange={value => {
            field.onChange(value); aliasForm.setValue("kind", value === "com.google.android.apps.walletnfcrel" ? "WALLET" : "PHYSICAL");
          }} options={Object.entries(captureSources).filter(([value]) => value !== "com.garatachia.afp.paymentreceipts" && value !== "com.google.android.gm" && !reviewOnlyCapturePackages.includes(value)).map(([value, label]) => ({ value, label }))} />} /></Field>
          <Field><FieldLabel htmlFor="alias-kind">Tipo de terminación</FieldLabel><Controller name="kind" control={aliasForm.control} render={({ field }) => <ResponsiveSelect className="min-h-11" id="alias-kind" value={field.value} disabled={busy} onValueChange={field.onChange} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} />} /></Field>
          {([['value', 'Últimas cuatro cifras'], ['evidence', 'Dónde la verificaste']] as const).map(([name, label]) => <Field key={name} data-invalid={Boolean(aliasForm.formState.errors[name])}><FieldLabel htmlFor={`alias-${name}`}>{label}</FieldLabel><Input className="min-h-11" id={`alias-${name}`} maxLength={name === 'value' ? 4 : 500} inputMode={name === 'value' ? 'numeric' : undefined} disabled={busy} aria-invalid={Boolean(aliasForm.formState.errors[name])} {...aliasForm.register(name)} /><FieldError errors={[aliasForm.formState.errors[name]]} /></Field>)}
          <Field orientation="horizontal"><Controller name="verified" control={aliasForm.control} render={({ field }) => <Checkbox id="alias-verified" checked={field.value} onCheckedChange={field.onChange} disabled={busy} />} /><FieldLabel htmlFor="alias-verified" className="min-h-11">Comprobé esta terminación</FieldLabel></Field>
        </FieldGroup>
        <Button type="submit" className="min-h-11 self-start" disabled={busy}>Guardar terminación</Button>
      </form>
      <p className="text-sm text-muted-foreground">Guardar la misma fuente, tipo y terminación actualiza su verificación. Para cambiar las cifras, añade la correcta y elimina la anterior. Las coincidencias entre tarjetas requieren revisión.</p>
      <Separator />
      </CollapsibleContent></Collapsible>
      <Collapsible className="flex flex-col gap-3"><CollapsibleTrigger asChild><Button variant="outline" className="min-h-11 self-start">Categorías y suscripciones por comercio</Button></CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Asigna una categoría o suscripción cuando el nombre del comercio coincida exactamente.</p>
      <ItemGroup>{configuration.rules.filter(row => row.cardId === cardId).map(rule => <Item role="listitem" key={rule.id} className="flex-wrap"><ItemContent><ItemTitle className="break-words">{rule.merchant}</ItemTitle><ItemDescription>{configuration.categories.find(row => row.id === rule.categoryId)?.name || 'Categoría no disponible'}{rule.subscriptionId ? ` · ${configuration.subscriptions.find(row => row.id === rule.subscriptionId)?.name || 'Suscripción no disponible'}` : ''}</ItemDescription></ItemContent><ItemActions>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => ruleForm.reset({ merchant: rule.merchant, categoryId: rule.categoryId, subscriptionId: rule.subscriptionId || 'none' })}>Editar regla</Button>
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => setConfirmation({ action: 'deleteRule', id: rule.id, label: 'Eliminar regla' })}>Eliminar</Button></ItemActions></Item>)}</ItemGroup>
      <form className="flex flex-col gap-4" onSubmit={ruleForm.handleSubmit(values => perform({ action: 'rule', cardId, ...values, subscriptionId: values.subscriptionId === 'none' ? null : values.subscriptionId }))}>
        <FieldGroup>
          <Field data-invalid={Boolean(ruleForm.formState.errors.merchant)}><FieldLabel htmlFor="rule-merchant">Comercio exacto del aviso</FieldLabel><Input className="min-h-11" id="rule-merchant" disabled={busy} aria-invalid={Boolean(ruleForm.formState.errors.merchant)} {...ruleForm.register('merchant')} /><FieldError errors={[ruleForm.formState.errors.merchant]} /></Field>
          {([['categoryId', 'Categoría', configuration.categories], ['subscriptionId', 'Suscripción opcional', [{ id: 'none', name: 'Sin suscripción' }, ...configuration.subscriptions.filter(row => row.cardId === cardId)]]] as const).map(([name, label, rows]) => <Field key={name} data-invalid={Boolean(ruleForm.formState.errors[name])}><FieldLabel htmlFor={`rule-${name}`}>{label}</FieldLabel><Controller name={name} control={ruleForm.control} render={({ field }) => <ResponsiveSelect className="min-h-11" id={`rule-${name}`} value={field.value} onValueChange={field.onChange} disabled={busy} searchable="auto" options={rows.map(row => ({ value: row.id, label: row.name }))} />} /><FieldError errors={[ruleForm.formState.errors[name]]} /></Field>)}
        </FieldGroup><Button type="submit" className="min-h-11 self-start" disabled={busy}>Guardar regla</Button>
      </form>
      </CollapsibleContent></Collapsible>
    </>}
    <Separator />
    <Collapsible><CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 px-0">Importar terminaciones desde archivo</Button></CollapsibleTrigger><CollapsibleContent className="pt-3"><Field><FieldLabel htmlFor="capture-inventory-file">Importar terminaciones desde JSON</FieldLabel><Input className="min-h-11" id="capture-inventory-file" type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      if (file.size > 60000) { setError('El archivo supera el tamaño permitido.'); return; }
      try { await perform({ action: 'importAliases', inventory: JSON.parse(await file.text()) }); } catch { setError('No se pudo leer el JSON.'); }
    }} /></Field></CollapsibleContent></Collapsible>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader><AlertDialogTitle>{confirmation?.label}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.action === "bankFallback" ? confirmation.mode === "AUTOMATIC"
            ? <>Google Wallet seguirá como fuente principal de {configuration.cards.find(row => row.id === confirmation.cardId)?.name}. Si falta su aviso, el banco podrá registrar la compra tras esperar 15 minutos desde que AFP reciba la notificación. Confirmas que las compras son en MXN y que $ significa pesos mexicanos. {confirmation.bankSourcePackage === "com.citibanamex.banamexmobile" && "Confirmas que usas esta tarjeta solo para compras; los avisos «Retiro/Compra» se tratarán como compras. Los retiros explícitos se revisarán. "}Se usará {confirmation.bankDatePolicy === "BANK_OPERATION" ? "la fecha de operación del banco" : "la fecha del aviso en hora de México"}. Se aplica a avisos nuevos. Si Wallet llega después, las coincidencias claras se vinculan al gasto; las dudosas quedan por revisar.</>
            : <>Se detendrán las esperas pendientes y los avisos bancarios nuevos no registrarán compras. Wallet seguirá activo. Reactivar el respaldo solo se aplica a avisos nuevos.</>
          : confirmation?.action === "formatPolicy" ? confirmation.completionPolicy === "MERCADOPAGO_CREDIT_MXN"
            ? <>Confirmas que Mercado Pago usa una única tarjeta de crédito para estas compras: {configuration.cards.find(row => row.id === confirmation.cardId)?.name}, siempre en MXN. Como el aviso no indica tarjeta ni moneda, AFP usará esta regla y la fecha del aviso en hora de México. Si cambias de tarjeta, moneda o fuente de fondos, pausa la regla. Para modificarla necesitarás comprobar otra compra.</>
            : <>Los pagos CFE de Nu usarán {configuration.cards.find(row => row.id === confirmation.cardId)?.name}, MXN y la fecha del aviso en hora de México. El importe real confirmará el cobro pendiente de la suscripción elegida. Si cambias esta regla, tendrás que comprobar otra compra antes de activarla.</>
          : confirmation?.action === "automation" ? <>El cambio se aplica a los nuevos avisos de esta tarjeta y aplicación.{confirmation.mode === "AUTOMATIC" && confirmation.datePolicy === "NOTIFICATION_POSTED_AT" && " Los gastos usarán la fecha del aviso, en hora de México."}{confirmation.mode === 'AUTOMATIC' && confirmation.datePolicy === 'RECEIPT_OPERATION' && ' Los recibos completos usarán la fecha del viaje. Confirmas asociar cargos de Uber por tarjeta, importe y un margen de 48 horas cuando haya una sola coincidencia, y actualizar propinas con la misma hora y tarjeta del recibo. Los casos ambiguos o editados quedan por revisar.'}</>
          : "Esta regla dejará de aplicarse a los nuevos avisos. Tus movimientos anteriores se conservarán."}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmation?.action === "formatPolicy" && confirmation.completionPolicy === "NU_CFE_MXN" && <FieldGroup><Field>
          <FieldLabel htmlFor="capture-policy-subscription">Suscripción para los pagos CFE</FieldLabel>
          <ResponsiveSelect className="min-h-11" id="capture-policy-subscription" value={confirmation.subscriptionId} disabled={busy} onValueChange={value => setConfirmation(prior => prior ? ({ ...prior, subscriptionId: value }) : null)} searchable="auto" options={configuration.subscriptions.map(row => ({ value: row.id, label: row.name }))} />
        </Field></FieldGroup>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy} className="min-h-11">Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={busy || (confirmation?.action === "formatPolicy" && confirmation.completionPolicy === "NU_CFE_MXN" && !confirmation.subscriptionId)} className="min-h-11" onClick={event => {
            event.preventDefault(); const { label: ignored, ...action } = confirmation!; void ignored; perform(action);
          }}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
