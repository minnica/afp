"use client";

import { captureSources } from "@/lib/capturePresentation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

const fallbackParserKeys = new Set([
  "banamex.card-charge.es.v1", "banamex.joy-card-charge.es.v1", "nu.card-purchase.es.v1", "santander.card-purchase.es.v1",
]);

const reasons = {
  UNVERIFIED_FORMAT: "Faltan muestras reales y un formato comprobado.",
  NO_VERIFIED_ALIAS: "Falta una terminación verificada para esta fuente.",
  AMBIGUOUS_ALIAS: "Hay una terminación compartida con otra tarjeta; revisa los alias.",
  NO_REVIEWED_CAPTURE: "Falta una propuesta de esta tarjeta y formato revisada y conciliada sin corregir los datos interpretados.",
  FORMAT_POLICY_REQUIRED: "Configura la regla de este formato con tarjeta, MXN y fecha del aviso.",
};

export default function CaptureRolloutStatus({ coverage, cardId, busy, onAutomation, fallbackPolicy }) {
  if (!coverage) return null;
  return <section className="flex min-w-0 flex-col gap-3" aria-label="Cobertura y activación de esta tarjeta">
    <h3 className="font-medium">Cobertura y activación</h3>
    <p className="text-sm text-muted-foreground">Cada fuente y formato se habilita solo para esta tarjeta. Revisa los canales de compra durante la observación y el cotejo del estado de cuenta.</p>
    {coverage.sources.every(source => source.sourcePackage === "com.google.android.apps.walletnfcrel") && <p className="text-sm text-muted-foreground">Configura una terminación de la aplicación bancaria para identificar su fuente.</p>}
    <ItemGroup className="gap-3">{coverage.sources.map(source => <Item key={source.sourcePackage} variant="outline" className="min-w-0 flex-wrap">
      <ItemContent className="min-w-0 basis-full">
        <ItemTitle className="flex-wrap">{captureSources[source.sourcePackage]}{source.formats.length === 0 && <Badge variant="secondary">Diagnóstico</Badge>}</ItemTitle>
        <ItemDescription>{source.verifiedAliases} {source.verifiedAliases === 1 ? "terminación verificada" : "terminaciones verificadas"}</ItemDescription>
        {source.formats.length === 0 && <ItemDescription className="line-clamp-none">Faltan muestras reales y un analizador de compras comprobado. Los avisos permanecen por revisar.</ItemDescription>}
        {source.formats.map(format => <div key={format.parserKey} className="flex min-w-0 flex-col gap-2">
          <ItemDescription className="break-all">{format.parserKey}</ItemDescription>
          {fallbackPolicy?.bankSourcePackage === source.sourcePackage && fallbackParserKeys.has(format.parserKey) ? <ItemDescription>Compras gestionadas por el respaldo bancario de 15 minutos. Usa sus controles arriba.</ItemDescription> : <div><Badge variant={format.mode === "AUTOMATIC" ? "default" : "secondary"}>{format.mode === "AUTOMATIC" ? "Automático" : format.verified ? "Observación" : "Diagnóstico"}</Badge></div>}
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
          <ItemDescription className="line-clamp-none">{format.reviewedCaptures} {format.reviewedCaptures === 1 ? "propuesta conciliada sin cambios en los datos interpretados" : "propuestas conciliadas sin cambios en los datos interpretados"}</ItemDescription>
          {!(fallbackPolicy?.bankSourcePackage === source.sourcePackage && fallbackParserKeys.has(format.parserKey)) && format.mode !== "AUTOMATIC" && format.blockers.map(reason => <ItemDescription key={reason} className="line-clamp-none">{reasons[reason]}</ItemDescription>)}
          {!(fallbackPolicy?.bankSourcePackage === source.sourcePackage && fallbackParserKeys.has(format.parserKey)) && <ItemActions><Button variant="outline" className="min-h-11" disabled={busy || (format.mode !== "AUTOMATIC" && !format.canEnable)} onClick={() => onAutomation({ action: "automation", cardId, parserKey: format.parserKey,
            mode: format.mode === "AUTOMATIC" ? "OBSERVATION" : "AUTOMATIC",
            ...(format.dateSource === "NOTIFICATION_POSTED_AT" ? { datePolicy: "NOTIFICATION_POSTED_AT" } : {}),
            label: format.mode === "AUTOMATIC" ? "Volver a observación" : "Habilitar registro automático" })}>
            {format.mode === "AUTOMATIC" ? "Volver a observación" : "Habilitar"}
          </Button></ItemActions>}
        </div>)}
      </ItemContent>
    </Item>)}</ItemGroup>
    {coverage.retiredFormats.length > 0 && <ItemGroup>{coverage.retiredFormats.map(format => <Item key={format.parserKey} className="flex-wrap"><ItemContent className="min-w-0">
      <ItemTitle>Formato retirado<Badge variant="warning">{format.mode === "AUTOMATIC" ? "Desactivar" : "Observación"}</Badge></ItemTitle>
      <ItemDescription className="break-all">{format.parserKey}</ItemDescription>
    </ItemContent>{format.mode === "AUTOMATIC" && <ItemActions><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => onAutomation({ action: "automation", cardId, parserKey: format.parserKey, mode: "OBSERVATION", label: "Volver a observación" })}>Volver a observación</Button></ItemActions>}</Item>)}</ItemGroup>}
    <p className="text-sm text-muted-foreground">Volver a observación conserva avisos, gastos y cotejos; solo los avisos nuevos dejan de registrar gastos automáticamente. Puedes pausar la captura de una aplicación en Dispositivos y fuentes.</p>
  </section>;
}
