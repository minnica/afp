"use client";
import type { Dashboard } from "@/lib/uiTypes";



import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

const DAY = 86400000;
const dateLabel = new Intl.DateTimeFormat("es-MX", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

function describeDates(cycle: Dashboard["cycles"][number], cycles: Dashboard["cycles"]) {
  const previous = cycles
    .filter((item) => item.cardId === cycle.cardId && item.id !== cycle.id
      && new Date(item.cutDate) < new Date(cycle.cutDate))
    .sort((a, b) => new Date(b.cutDate).getTime() - new Date(a.cutDate).getTime())[0];
  if (!previous) return "Revisa las fechas de este período.";

  const start = Date.parse(cycle.startDate.slice(0, 10));
  const previousCut = Date.parse(previous.cutDate.slice(0, 10));
  const overlap = start <= previousCut;
  const first = overlap ? start : previousCut + DAY;
  const last = overlap ? previousCut : start - DAY;
  if (first > last) return "Revisa las fechas de este período.";

  const dates = first === last
    ? dateLabel.format(first)
    : `${dateLabel.format(first)} al ${dateLabel.format(last)}`;
  return overlap
    ? `En dos períodos: ${dates}.`
    : `Sin período asignado: ${dates}.`;
}

export default function CyclePeriodHelp({ cycles, month, year }: { cycles: Dashboard["cycles"]; month: number; year: number }) {
  const titleId = useId();
  const pending = cycles.filter((cycle) => cycle.month === month
    && cycle.year === year && cycle.dataWarnings?.length);
  if (!pending.length) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground pointer-coarse:size-11"
          aria-label="Consultar fechas por confirmar"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-labelledby={titleId}
        className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-72 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto p-4 motion-reduce:animate-none"
      >
        <p id={titleId} className="text-sm font-medium">Fechas por confirmar</p>
        <ul className="space-y-3">
          {pending.map((cycle) => (
            <li key={cycle.id} className="space-y-1">
              <p className="text-sm font-medium">{cycle.card.name}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {describeDates(cycle, cycles)}
              </p>
            </li>
          ))}
        </ul>
        <Link
          href="/tarjetas"
          className="w-fit rounded-sm text-sm underline underline-offset-4 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver períodos en Tarjetas
        </Link>
      </PopoverContent>
    </Popover>
  );
}
