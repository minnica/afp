"use client";

import { useId, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemTitle } from "@/components/ui/item";
import { DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value || 0));
}

export function BreakdownHelp({ title, label = title, description, children, footer, ...props }) {
  const titleId = useId();
  const descriptionId = `${titleId}-description`;
  const contentRef = useRef(null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={label}>
          <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        sideOffset={8}
        collisionPadding={16}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="max-h-[min(24rem,var(--radix-popover-content-available-height))] max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto p-4 motion-reduce:animate-none"
        {...props}
      >
        <PopoverHeader><PopoverTitle id={titleId}>{title}</PopoverTitle></PopoverHeader>
        {children}
        {description && <PopoverDescription id={descriptionId}>{description}</PopoverDescription>}
        {footer}
      </PopoverContent>
    </Popover>
  );
}

export function DisclosureButton({ children, ...props }) {
  return (
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" className="group min-h-11 h-auto w-full justify-between gap-3 px-0 py-2 text-left text-sm whitespace-normal" {...props}>
        {children}
        <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" data-icon="inline-end" className="shrink-0 transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
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
        <ItemGroup className={cn(isMobile && "gap-0")}>
          {items.map((item) => (
            <Item
              key={item.id}
              variant={isMobile ? "default" : "outline"}
              size="sm"
              role="listitem"
              className={cn(isMobile && "items-start rounded-none border-0 px-0 py-3 [&+&]:border-t [&+&]:border-border")}
            >
                <ItemContent className="min-w-0">
                  <ItemTitle className={cn(isMobile && "block w-full line-clamp-none break-words text-sm")}>{getPrimary(item)}</ItemTitle>
                  <ItemDescription className={cn(isMobile && "line-clamp-none break-words text-xs")}>
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

export function BreakdownSections({ isMobile, className, children }) {
  const accordionRef = useRef(null);
  const lastSectionRef = useRef("");

  function alignSection() {
    const accordion = accordionRef.current;
    const section = Array.from(accordion?.children || []).find(
      (element) => element.dataset.breakdownSection === lastSectionRef.current
    );
    const scroller = accordion?.closest("[data-breakdown-scroll]");
    if (section && scroller) {
      scroller.scrollTop += section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    }
  }

  if (isMobile) {
    return (
      <Accordion
        ref={accordionRef}
        type="single"
        collapsible
        className="gap-3 overflow-visible rounded-none border-0"
        onValueChange={(value) => {
          if (value) lastSectionRef.current = value;
          requestAnimationFrame(alignSection);
        }}
        onAnimationEnd={(event) => {
          // Reposition after the preceding section has finished collapsing.
          if (event.target.dataset.slot === "accordion-content") alignSection();
        }}
      >{children}</Accordion>
    );
  }
  return <div className={className}>{children}</div>;
}

export function BreakdownSection({ title, amount, items, isMobile, ...props }) {
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
      <AccordionItem value={title} disabled={!items.length} className="rounded-xl border" data-breakdown-section={title}>
        <AccordionTrigger
          headerClassName="sticky top-0 z-10 rounded-xl bg-popover data-[state=open]:rounded-b-none data-[state=open]:border-b"
          className={cn("min-h-16 items-center gap-3 rounded-xl px-3 py-3 text-sm hover:no-underline", !items.length && "disabled:opacity-100 [&_[data-slot=accordion-trigger-icon]]:hidden")}
          aria-label={`${title}: ${items.length} movimiento${items.length === 1 ? "" : "s"}, ${formatMoney(amount)}`}
        >{summary}</AccordionTrigger>
        <AccordionContent className="px-1 pb-1">{content}</AccordionContent>
      </AccordionItem>
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
        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-11 md:size-7" aria-label="Cerrar desglose"><HugeiconsIcon icon={Cancel01Icon} /></Button>
      </DialogClose>
      <div data-breakdown-scroll className="min-h-0 overflow-y-auto overscroll-contain pr-1 [color-scheme:dark] [scrollbar-gutter:stable] md:pr-0 md:[scrollbar-gutter:auto]" role="region" aria-label="Movimientos del ciclo" tabIndex={0}>
        {children}
      </div>
    </DialogContent>
  );
}
