"use client";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { DisclosureButton } from "@/components/ui/responsive-breakdown";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

export default function CapturePilotSummary({ pilot }) {
  if (!pilot) return null;
  const metrics = [
    ["Cargos con aviso vinculado", pilot.recordsWithEvidence, "Cada gasto o cuota cuenta una vez, aunque reúna varios avisos."],
    ["Cargos sin aviso vinculado", pilot.recordsWithoutEvidence, `${pilot.confirmedWithoutEvidence} cotejados en el estado. Revisa la bandeja antes de considerarlos compras sin aviso.`],
    ["Avisos por revisar", pilot.pendingMovements, `${pilot.unresolvedCoincidences} coincidencias por resolver. No son duplicados confirmados.`],
    ["Propuestas corregidas", pilot.correctedProposals, "Cambió al menos un dato interpretado. Completar campos ausentes o elegir categoría no cuenta como error."],
    ["Evidencias adicionales", pilot.additionalEvidence, "Avisos adicionales vinculados al mismo cargo. Reenviar el mismo aviso no aumenta este contador."],
    ["Faltantes añadidos al cotejar", pilot.missingRecordsAdded, "Cargos registrados desde este cotejo que siguen presentes en el período."],
  ];
  return <Collapsible className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <DisclosureButton className="min-h-11 h-auto w-auto gap-3 px-0">Seguimiento de captura</DisclosureButton>
      <Badge variant="secondary">{pilot.automaticFormats.length ? `${pilot.automaticFormats.length} formatos automáticos` : "Sin registro automático"}</Badge>
    </div>
    <CollapsibleContent className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{pilot.confirmedRecords} de {pilot.records} cargos cotejados. Estos datos corresponden a la tarjeta y período consultados; se actualizan al recibir o resolver avisos.</p>
      <ItemGroup>{metrics.map(([label, count, description]) => <Item key={label}>
        <ItemContent><ItemTitle>{label}: {count}</ItemTitle><ItemDescription>{description}</ItemDescription></ItemContent>
      </Item>)}</ItemGroup>
      {(pilot.unassignedSourceEvents > 0 || pilot.undatedCardMovements > 0 || pilot.deletedExpenseLinks > 0) && <p className="text-sm text-muted-foreground">
        {pilot.unassignedSourceEvents} avisos sin tarjeta en fuentes compartidas · {pilot.undatedCardMovements} avisos de esta tarjeta sin fecha de operación · {pilot.deletedExpenseLinks} vínculos a gastos eliminados.
        {" "}Los avisos sin tarjeta o sin fecha se cuentan por recepción en horario de Ciudad de México; no se atribuyen a las compras del período. Revísalos en Bandeja.
      </p>}
      <p className="text-sm text-muted-foreground">La ausencia de evidencia vinculada no demuestra que el banco no avisó. El cotejo y la revisión de los avisos determinan los faltantes y errores reales; este resumen no acredita un corte completo ni pérdidas de la cola.</p>
    </CollapsibleContent>
  </Collapsible>;
}
