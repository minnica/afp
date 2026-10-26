"use client";

import { captureSources } from "@/lib/capturePresentation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

const fallbackParserKeys = new Set([
  "banamex.card-charge.es.v1", "banamex.joy-card-charge.es.v1", "nu.card-purchase.es.v1", "santander.card-purchase.es.v1",
]);

const formatLabels = {
  "bbva.purchase.es.v1": "Compras BBVA",
  "wallet.purchase.es.v1": "Compras de Wallet · formato inicial",
  "nu.cfe-service-payment.es.v1": "Pagos CFE · formato anterior",
  "nu.cfe-service-payment.es.v2": "Pagos CFE",
  "mercadopago.card-purchase.es.v1": "Compras con Mercado Pago",
  "wallet.nu-purchase.es.v1": "Compras con Nu Mastercard Gold",
  "wallet.bbva-purchase.es.v1": "Compras con BBVA Platinum",
  "nu.card-purchase.es.v1": "Compras con Nu",
  "wallet.banamex-purchase.es.v1": "Compras con Joy Banamex",
  "banamex.card-charge.es.v1": "Compras Banamex · formato anterior",
  "banamex.joy-card-charge.es.v1": "Compras Joy Banamex",
  "santander.card-purchase.es.v1": "Compras Santander",
  "wallet.santander-purchase.es.v1": "Compras con Santander · formato anterior",
  "wallet.santander-purchase.es.v2": "Compras con Santander",
  "wallet.didi-purchase.es.v1": "Compras con DiDi",
};
const reasons = {
  UNVERIFIED_FORMAT: "Faltan muestras reales y un formato comprobado.",
  NO_VERIFIED_ALIAS: "Falta una terminación verificada para esta fuente.",
  AMBIGUOUS_ALIAS: "La terminación coincide con otra tarjeta. Revisa sus terminaciones.",
  NO_REVIEWED_CAPTURE: "Falta comprobar una compra de este tipo con el estado de cuenta, sin corregir los datos detectados.",
  FORMAT_POLICY_REQUIRED: "Configura la regla de este formato con tarjeta, MXN y fecha del aviso.",
};

export default function CaptureRolloutStatus({ coverage, cardId, busy, onAutomation, fallbackPolicy }) {
  if (!coverage) return null;
  return <section className="flex min-w-0 flex-col gap-3" aria-label="Compras automáticas de esta tarjeta">
    <h3 className="font-medium">Compras automáticas</h3>
    <p className="text-sm text-muted-foreground">Activa o pausa el registro de compras por aplicación. Los avisos que necesitan una decisión quedarán en Pendientes.</p>
    {coverage.sources.every(source => source.sourcePackage === "com.google.android.apps.walletnfcrel") && <p className="text-sm text-muted-foreground">Configura una terminación de la aplicación bancaria para identificar su fuente.</p>}
    <ItemGroup className="gap-3">{coverage.sources.map(source => <Item role="listitem" key={source.sourcePackage} variant="outline" className="min-w-0 flex-wrap">
      <ItemContent className="min-w-0 basis-full">
        <ItemTitle className="flex-wrap">{captureSources[source.sourcePackage]}{source.formats.length === 0 && <Badge variant="secondary">Diagnóstico</Badge>}</ItemTitle>
        <ItemDescription>{source.verifiedAliases} {source.verifiedAliases === 1 ? "terminación verificada" : "terminaciones verificadas"}</ItemDescription>
        {source.formats.length === 0 && <ItemDescription className="line-clamp-none">Aún no hay compras comprobadas para activar esta aplicación.</ItemDescription>}
        {source.formats.map(format => <Collapsible key={format.parserKey} defaultOpen={format.mode === "AUTOMATIC" || format.reviewedCaptures > 0 || format.hasFormatPolicy} className="flex min-w-0 flex-col gap-2 border-t pt-3"><CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 h-auto justify-start whitespace-normal px-0 text-left">{formatLabels[format.parserKey] || "Otro tipo de compra"} · {format.mode === "AUTOMATIC" ? "Activo" : "Por activar"}</Button></CollapsibleTrigger><CollapsibleContent className="flex flex-col gap-3">
          <Collapsible><CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 px-0 text-xs">Detalles de este tipo de aviso</Button></CollapsibleTrigger><CollapsibleContent><p className="break-all text-xs text-muted-foreground">{format.parserKey}</p></CollapsibleContent></Collapsible>
          {fallbackPolicy?.bankSourcePackage === source.sourcePackage && fallbackParserKeys.has(format.parserKey) ? <ItemDescription>Compras gestionadas por el respaldo bancario de 15 minutos. Usa sus controles arriba.</ItemDescription> : <div><Badge variant={format.mode === "AUTOMATIC" ? "default" : "secondary"}>{format.mode === "AUTOMATIC" ? "Automático" : format.verified ? "Por activar" : "Por comprobar"}</Badge></div>}
          {format.dateSource === "NOTIFICATION_POSTED_AT" && <ItemDescription className="line-clamp-none">Usa la fecha del aviso de {captureSources[source.sourcePackage]} en hora de México. El aviso no incluye una fecha bancaria de operación.</ItemDescription>}
          {format.parserKey === "wallet.santander-purchase.es.v2" && <ItemDescription className="line-clamp-none">Puede registrar desde Wallet aunque no llegue el aviso de Santander. Si ya existe un cargo coincidente, el segundo aviso queda por revisar para evitar duplicados; no cambia automáticamente la fecha del gasto existente.</ItemDescription>}
          {format.completionPolicy && <><ItemDescription className="line-clamp-none">{format.policyRequiresSubscription
            ? "La regla asigna los pagos CFE a esta tarjeta, en MXN, y confirma el cobro pendiente de la suscripción elegida. Conserva la configuración habitual de la suscripción."
            : "La regla asigna los avisos de compra aprobada de Mercado Pago a esta única tarjeta de crédito y a MXN, según tu declaración. El aviso no incluye tarjeta ni moneda."}</ItemDescription>
            <ItemActions><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => onAutomation({ action: "formatPolicy", cardId, parserKey: format.parserKey,
              completionPolicy: format.completionPolicy, datePolicy: "NOTIFICATION_POSTED_AT",
              ...(format.policyRequiresSubscription ? { subscriptionId: format.policySubscriptionId || "" } : {}),
              label: `Configurar regla ${format.policyRequiresSubscription ? "Nu/CFE" : "Mercado Pago"}` })}>
              {format.hasFormatPolicy ? "Revisar" : "Configurar"} regla {format.policyRequiresSubscription ? "Nu/CFE" : "Mercado Pago"}
            </Button></ItemActions></>}
          <ItemDescription className="line-clamp-none">{format.reviewedCaptures} {format.reviewedCaptures === 1 ? "compra comprobada sin corregir datos" : "compras comprobadas sin corregir datos"}</ItemDescription>
          {!(fallbackPolicy?.bankSourcePackage === source.sourcePackage && fallbackParserKeys.has(format.parserKey)) && format.mode !== "AUTOMATIC" && format.blockers.map(reason => <ItemDescription key={reason} className="line-clamp-none">{reasons[reason]}</ItemDescription>)}
          {!(fallbackPolicy?.bankSourcePackage === source.sourcePackage && fallbackParserKeys.has(format.parserKey)) && <ItemActions><Button variant="outline" className="min-h-11" disabled={busy || (format.mode !== "AUTOMATIC" && !format.canEnable)} onClick={() => onAutomation({ action: "automation", cardId, parserKey: format.parserKey,
            mode: format.mode === "AUTOMATIC" ? "OBSERVATION" : "AUTOMATIC",
            ...(format.dateSource === "NOTIFICATION_POSTED_AT" ? { datePolicy: "NOTIFICATION_POSTED_AT" } : {}),
            label: format.mode === "AUTOMATIC" ? "Pausar registro" : "Activar compras automáticas" })}>
            {format.mode === "AUTOMATIC" ? "Pausar registro" : "Activar"}
          </Button></ItemActions>}
        </CollapsibleContent></Collapsible>)}
      </ItemContent>
    </Item>)}</ItemGroup>
    {coverage.retiredFormats.length > 0 && <ItemGroup>{coverage.retiredFormats.map(format => <Item role="listitem" key={format.parserKey} className="flex-wrap"><ItemContent className="min-w-0">
      <ItemTitle>Formato retirado<Badge variant="warning">{format.mode === "AUTOMATIC" ? "Desactivar" : "Observación"}</Badge></ItemTitle>
      <Collapsible><CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 px-0 text-xs">Detalles de este tipo de aviso</Button></CollapsibleTrigger><CollapsibleContent><p className="break-all text-xs text-muted-foreground">{format.parserKey}</p></CollapsibleContent></Collapsible>
    </ItemContent>{format.mode === "AUTOMATIC" && <ItemActions><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => onAutomation({ action: "automation", cardId, parserKey: format.parserKey, mode: "OBSERVATION", label: "Pausar registro" })}>Pausar registro</Button></ItemActions>}</Item>)}</ItemGroup>}
    <p className="text-sm text-muted-foreground">Pausar el registro conserva tus movimientos. Para dejar de recibir avisos de una aplicación, ve a Ajustes → Teléfono.</p>
  </section>;
}
