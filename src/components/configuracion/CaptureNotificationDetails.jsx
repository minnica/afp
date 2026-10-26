"use client";
import { captureSources } from "@/lib/capturePresentation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

export default function CaptureNotificationDetails({ movement, children }) {
  return <Collapsible className="flex flex-col gap-2">
    <CollapsibleTrigger asChild><Button variant="ghost" className="min-h-11 self-start px-0">Ver notificación original <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" /></Button></CollapsibleTrigger>
    <CollapsibleContent className="flex flex-col gap-4 rounded-lg bg-muted/40 p-3">
      {movement.events.map(event => <div key={event.id} className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{captureSources[event.sourcePackage] || "Notificación"}</p>
        <p className="text-xs text-muted-foreground">{new Date(event.postedAt || event.receivedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })} · hora de México</p>
        <p className="whitespace-pre-wrap break-words text-sm">{[...new Set(Object.values(event.fields).filter(Boolean))].join("\n") || "La notificación no contiene texto accesible."}</p>
      </div>)}
      {movement.analysisHistory?.length > 0 && <p className="text-xs text-muted-foreground">El aviso conserva {movement.analysisHistory.length} {movement.analysisHistory.length === 1 ? "interpretación anterior" : "interpretaciones anteriores"}.</p>}
      {children}
    </CollapsibleContent>
  </Collapsible>;
}
