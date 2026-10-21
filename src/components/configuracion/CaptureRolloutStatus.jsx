"use client";

import { captureSources } from "@/lib/capturePresentation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

const reasons = {
  UNVERIFIED_FORMAT: "Faltan muestras reales y un formato comprobado.",
  NO_VERIFIED_ALIAS: "Falta una terminación verificada para esta fuente.",
  AMBIGUOUS_ALIAS: "Hay una terminación compartida con otra tarjeta; revisa los alias.",
  NO_REVIEWED_CAPTURE: "Falta una propuesta de esta tarjeta y formato revisada y conciliada sin corregir los datos interpretados.",
};

export default function CaptureRolloutStatus({ coverage, cardId, busy, onAutomation }) {
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
          <div><Badge variant={format.mode === "AUTOMATIC" ? "default" : "secondary"}>{format.mode === "AUTOMATIC" ? "Automático" : format.verified ? "Observación" : "Diagnóstico"}</Badge></div>
          <ItemDescription className="line-clamp-none">{format.reviewedCaptures} {format.reviewedCaptures === 1 ? "propuesta conciliada sin cambios en los datos interpretados" : "propuestas conciliadas sin cambios en los datos interpretados"}</ItemDescription>
          {format.mode !== "AUTOMATIC" && format.blockers.map(reason => <ItemDescription key={reason} className="line-clamp-none">{reasons[reason]}</ItemDescription>)}
          <ItemActions><Button variant="outline" className="min-h-11" disabled={busy || (format.mode !== "AUTOMATIC" && !format.canEnable)} onClick={() => onAutomation({ action: "automation", cardId, parserKey: format.parserKey,
            mode: format.mode === "AUTOMATIC" ? "OBSERVATION" : "AUTOMATIC",
            label: format.mode === "AUTOMATIC" ? "Volver a observación" : "Habilitar registro automático" })}>
            {format.mode === "AUTOMATIC" ? "Volver a observación" : "Habilitar"}
          </Button></ItemActions>
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
