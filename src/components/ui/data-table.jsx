"use client";

import { ResponsiveSelect } from "@/components/ui/responsive-select";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { cn } from "@/lib/utils";

function SortIcon({ isSorted }) {
  if (isSorted === "asc")
    return <ChevronUp className="ml-1 inline h-3.5 w-3.5" />;
  if (isSorted === "desc")
    return <ChevronDown className="ml-1 inline h-3.5 w-3.5" />;
  return <ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
}

export function DataTable({
  columns,
  data,
  filterColumn,
  filterGlobal = false,
  globalFilterFn = "includesString",
  filterPlaceholder = "Filtrar...",
  pageSize = 10,
  pageSizeOptions,
  toolbarStart,
  footerRow,
  renderMobileRow,
  mobileToolbar,
  mobileListLabel = "Registros",
}) {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const columnFilterValue = filterColumn
    ? (table.getColumn(filterColumn)?.getFilterValue() ?? "")
    : "";

  const showFilter = filterGlobal || filterColumn;

  return (
    <div className="space-y-3">
      {showFilter || pageSizeOptions || toolbarStart ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn("flex flex-wrap items-center gap-2", renderMobileRow && "w-full md:w-auto")}>
            {toolbarStart}

            {showFilter ? (
              <Input
                aria-label={filterPlaceholder}
                placeholder={filterPlaceholder}
                value={filterGlobal ? globalFilter : columnFilterValue}
                onChange={(e) => {
                  if (filterGlobal) {
                    setGlobalFilter(e.target.value);
                  } else {
                    table
                      .getColumn(filterColumn)
                      ?.setFilterValue(e.target.value);
                  }
                }}
                className={cn("max-w-sm", renderMobileRow && "h-11 text-base md:h-7 md:text-xs")}
              />
            ) : null}
          </div>

          {pageSizeOptions ? (
            <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", renderMobileRow && "hidden md:flex")}>
              <span className="text-xs">Mostrar</span>
              <ResponsiveSelect
                value={String(table.getState().pagination.pageSize)}
                onValueChange={value => {
                  table.setPageSize(Number(value));
                  table.setPageIndex(0);
                }}
                aria-label="Registros por página"
                className="h-9 w-[70px] text-xs"
                title="Registros por página"
                placeholder="Selecciona una opción"
                options={pageSizeOptions.map(size => ({
                  value: String(size),
                  label: String(size)
                }))}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {renderMobileRow ? (
        <div className="md:hidden">
          {mobileToolbar?.(table)}
          {table.getRowModel().rows.length ? (
            <ItemGroup className="gap-0" aria-label={mobileListLabel}>
              {table.getRowModel().rows.map((row, index) => (
                <Fragment key={row.id}>
                  {index > 0 ? <ItemSeparator className="my-0" /> : null}
                  {renderMobileRow(row)}
                </Fragment>
              ))}
            </ItemGroup>
          ) : (
            <Empty className="py-8">
              <EmptyDescription>Sin resultados.</EmptyDescription>
            </Empty>
          )}
        </div>
      ) : null}

      <div className={cn("overflow-x-auto rounded-xl border border-border", renderMobileRow && "hidden md:block")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-muted/40 hover:bg-muted/40"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : header.column.getCanSort() ? "none" : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortIcon isSorted={header.column.getIsSorted()} />
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  <Empty className="py-4">
                    <EmptyDescription>Sin resultados.</EmptyDescription>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>

          {footerRow ? <TableFooter>{footerRow(table)}</TableFooter> : null}
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} registro(s)
          {table.getPageCount() > 1
            ? ` · página ${table.getState().pagination.pageIndex + 1} de ${table.getPageCount()}`
            : null}
        </span>

        {renderMobileRow && pageSizeOptions ? (
          <div className="flex items-center gap-2 md:hidden">
            <span className="text-xs">Mostrar</span>
            <ResponsiveSelect
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => { table.setPageSize(Number(value)); table.setPageIndex(0); }}
              aria-label="Registros por página"
              className="h-11 w-[70px] text-sm"
              title="Registros por página"
              options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
            />
          </div>
        ) : null}

        {table.getPageCount() > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={renderMobileRow ? "h-11 px-3 md:h-6 md:px-2" : undefined}
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={renderMobileRow ? "h-11 px-3 md:h-6 md:px-2" : undefined}
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
