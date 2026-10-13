"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemTitle } from "@/components/ui/item";
import { DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value || 0));
}

export function DisclosureButton({ children, ...props }) {
  return (
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" className="group min-h-11 h-auto w-full justify-between gap-3 px-0 py-2 text-left text-sm whitespace-normal" {...props}>
        {children}
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
      </Button>
    </CollapsibleTrigger>
  );
}

function BreakdownItems({ items, emptyText, getPrimary, getSecondary, getAmount, getNote, isMobile }) {
  return (
    <>
      {items.length === 0 ? (
        <Empty className="px-0"><EmptyDescription>{emptyText}</EmptyDescription></Empty>
      ) : (
        <ItemGroup className={isMobile ? "gap-0" : undefined}>
          {items.map((item) => (
            <Item
              key={item.id}
              variant={isMobile ? "default" : "outline"}
              size="sm"
              role="listitem"
              className={isMobile ? "items-start rounded-none border-0 px-0 py-3 [&+&]:border-t [&+&]:border-border" : undefined}
            >
                <ItemContent className="min-w-0">
                  <ItemTitle className={isMobile ? "block w-full line-clamp-none break-words text-sm" : undefined}>{getPrimary(item)}</ItemTitle>
                  <ItemDescription className={isMobile ? "line-clamp-none break-words text-xs" : undefined}>
                    {getSecondary(item)}
                  </ItemDescription>
                </ItemContent>

                <p className="max-w-[45%] shrink-0 break-words text-right text-sm font-semibold tabular-nums">{formatMoney(getAmount(item))}</p>
              {getNote?.(item) && (
                <ItemFooter className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {isMobile ? (
                    <Collapsible className="w-full min-w-0">
                      <DisclosureButton aria-label={`Ver referencia de ${getPrimary(item)}`}>Referencia</DisclosureButton>
                      <CollapsibleContent className="break-words pb-2">{getNote(item)}</CollapsibleContent>
                    </Collapsible>
                  ) : getNote(item)}
                </ItemFooter>
              )}
            </Item>
          ))}
        </ItemGroup>
      )}
    </>
  );
}

export function BreakdownSection({ title, amount, items, isMobile, ...props }) {
  const [open, setOpen] = useState(false);
  const content = <BreakdownItems items={items} isMobile={isMobile} {...props} />;
  if (isMobile) {
    const summary = (
      <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          <span className="block text-xs font-normal text-muted-foreground">{items.length ? `${items.length} movimiento${items.length === 1 ? "" : "s"}` : "Sin movimientos"}</span>
        </span>
        <span className="max-w-[45%] shrink-0 break-words text-right font-semibold tabular-nums">{formatMoney(amount)}</span>
      </span>
    );
    return (
      <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border py-1" data-breakdown-section={title}>
        {items.length ? <DisclosureButton aria-label={`Ver ${title.toLocaleLowerCase("es")}`}>{summary}</DisclosureButton> : <div className="flex min-h-14 items-center py-2 pr-7 text-sm">{summary}</div>}
        <CollapsibleContent>{content}</CollapsibleContent>
      </Collapsible>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({formatMoney(amount)})</CardTitle></CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}

export function BreakdownDialogContent({ title, children, ...props }) {
  return (
    <DialogContent showCloseButton={false} className="flex max-h-[90svh] max-w-[calc(100%-1rem)] flex-col md:max-w-4xl" {...props}>
      <DialogHeader className="shrink-0 pr-12">
        <DialogTitle className="break-words text-base md:text-sm">{title}</DialogTitle>
        <DialogDescription className="sr-only md:not-sr-only">Detalle de los movimientos e importes de este período.</DialogDescription>
      </DialogHeader>
      <DialogClose asChild>
        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-11 md:size-7" aria-label="Cerrar desglose"><X /></Button>
      </DialogClose>
      <div className="min-h-0 overflow-y-auto overscroll-contain pr-1 [color-scheme:dark] [scrollbar-gutter:stable] md:pr-0 md:[scrollbar-gutter:auto]" role="region" aria-label="Movimientos del ciclo" tabIndex={0}>
        {children}
      </div>
    </DialogContent>
  );
}
