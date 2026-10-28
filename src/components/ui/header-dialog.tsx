"use client";

import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Dialog,DialogClose,DialogContent,DialogDescription,
DialogHeader,DialogTitle,DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";

export function HeaderDialog({ title, contentTitle = title, description, icon, count = 0, disabled = false, onOpenChange, headerContent, headerLeading, headerActions, scrollRef, children, ...props }: Omit<React.ComponentProps<typeof DialogContent>, "title"> & { title: string; contentTitle?: string; description?: React.ReactNode; icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]; count?: number; disabled?: boolean; onOpenChange?: (open: boolean) => void; headerContent?: React.ReactNode; headerLeading?: React.ReactNode; headerActions?: React.ReactNode; scrollRef?: React.Ref<HTMLDivElement> }) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [contentTitle]);

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="relative size-11"
          aria-label={count > 0 ? `${title}: ${count} aviso${count === 1 ? "" : "s"}` : title}
          title={title}
          disabled={disabled}
        >
          <HugeiconsIcon icon={icon} data-icon="inline-start" aria-hidden="true" />
          {count > 0 ? (
            <Badge className="absolute top-0 right-0 min-w-4 px-1" aria-hidden="true">
              {count > 99 ? "99+" : count}
            </Badge>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent
        data-header-dialog
        showCloseButton={false}
        className="flex max-h-[90svh] max-w-[calc(100%-1rem)] flex-col overflow-hidden sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
        {...props}
      >
        <div data-header-dialog-header className="flex shrink-0 flex-col gap-4">
          <div className={cn("flex items-center gap-2 pr-10", (headerLeading || headerActions) && "min-h-11")}>
            {headerLeading}
            <DialogHeader className="min-w-0 flex-1">
              <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">{contentTitle}</DialogTitle>
              <DialogDescription className="sr-only">{description}</DialogDescription>
            </DialogHeader>
            {headerActions}
          </div>
          {headerContent}
        </div>
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="icon-lg" className={cn("absolute top-2 right-2 size-11", (headerLeading || headerActions) && "top-4")} aria-label={`Cerrar ${title.toLowerCase()}`}>
            <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" aria-hidden="true" />
          </Button>
        </DialogClose>
        <div ref={scrollRef} data-header-dialog-scroll className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain [color-scheme:dark]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
