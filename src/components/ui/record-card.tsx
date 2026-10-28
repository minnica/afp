"use client";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Item, ItemContent, ItemFooter, ItemHeader } from "@/components/ui/item";
import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { cn } from "@/lib/utils";
import { Delete02Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Table as TanTable } from "@tanstack/react-table";

// En móvil, el listado deja de ser una tarjeta que envuelve otras tarjetas.
export function RecordListCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card className={cn("rounded-2xl max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:ring-0 max-md:[&>[data-slot=card-header]]:px-0 max-md:[&>[data-slot=card-content]]:px-0", className)} {...props} />;
}

type RecordContentProps = { title: string; subtitle?: React.ReactNode; badges?: React.ReactNode; amount?: React.ReactNode; amountLabel?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode };
export function RecordCard({ title, subtitle, badges, amount, amountLabel, children, actions, className, ...props }: Omit<React.ComponentProps<typeof Item>, "title"> & RecordContentProps) {
  return (
    <Item variant="outline" role="listitem" aria-label={title} className={cn("block min-w-0 rounded-xl bg-card p-4", className)} {...props}>
      <RecordCardContent title={title} subtitle={subtitle} badges={badges} amount={amount} amountLabel={amountLabel} actions={actions}>{children}</RecordCardContent>
    </Item>
  );
}

export function RecordCardContent({ title, subtitle, badges, amount, amountLabel, children, actions }: RecordContentProps) {
  return (
    <ItemContent className="min-w-0 gap-3">
      <ItemHeader className="items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold">{title}</h3>
          {subtitle ? <p className="mt-1 break-words text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {badges ? <div className="flex max-w-[45%] flex-wrap justify-end gap-1">{badges}</div> : null}
      </ItemHeader>
      {amount != null ? (
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{amountLabel}</p>
          <p className="mt-1 break-words text-xl font-semibold tabular-nums">{amount}</p>
        </div>
      ) : null}
      {children}
      {actions ? <ItemFooter>{actions}</ItemFooter> : null}
    </ItemContent>
  );
}

export function RecordField({ label, children }: React.PropsWithChildren<{ label: React.ReactNode }>) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{children}</dd></div>;
}

export function RecordNote({ children }: React.PropsWithChildren) {
  return children ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{children}</p> : null;
}

export function RecordActions({ label, onEdit, onDelete, children }: React.PropsWithChildren<{ label: string; onEdit: React.MouseEventHandler<HTMLButtonElement>; onDelete: React.MouseEventHandler<HTMLButtonElement> }>) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1">
      {children ? <div className="mr-auto">{children}</div> : null}
      <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Editar ${label}`} onClick={onEdit}>
        <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Eliminar ${label}`} onClick={onDelete}>
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Los totales se calculan sobre todas las filas filtradas, también las de otras páginas. */
export function RecordListToolbar<T>({ table, label, totals = [] }: { table: TanTable<T>; label: string; totals?: { key: Extract<keyof T, string>; label: string; include?: (row: T) => boolean }[] }) {
  const sorting = table.getState().sorting[0];
  const rows = table.getFilteredRowModel().rows;
  const options = [{ value: "default", label: "Orden original" }];
  for (const column of table.getAllLeafColumns()) {
    if (!column.getCanSort() || typeof column.columnDef.header !== "string") continue;
    options.push({ value: `${column.id}:asc`, label: `${column.columnDef.header}: ascendente` });
    options.push({ value: `${column.id}:desc`, label: `${column.columnDef.header}: descendente` });
  }
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

  return (
    <div className="mb-3 flex min-w-0 flex-col gap-3">
      <ResponsiveSelect
        value={sorting ? `${sorting.id}:${sorting.desc ? "desc" : "asc"}` : "default"}
        aria-label={`Ordenar ${label}`}
        title={`Ordenar ${label}`}
        className="h-11"
        options={options}
        onValueChange={(value) => {
          if (value === "default") table.setSorting([]);
          else {
            const [id, direction] = value.split(":");
            table.setSorting([{ id: id!, desc: direction === "desc" }]);
          }
          table.setPageIndex(0);
        }}
      />
      {totals.length ? (
        <Item variant="muted" size="sm" role="group" aria-label="Totales filtrados">
          <dl className="flex w-full min-w-0 flex-wrap gap-x-4 gap-y-2">
            {totals.map((total) => (
              <div key={total.key} className="min-w-0 flex-[1_1_7rem]">
                <dt className="text-xs text-muted-foreground">{total.label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
                  {money.format(rows.reduce((sum, row) => sum + (total.include && !total.include(row.original) ? 0 : Math.round(Number(row.original[total.key] || 0) * 100)), 0) / 100)}
                </dd>
              </div>
            ))}
          </dl>
        </Item>
      ) : null}
    </div>
  );
}
