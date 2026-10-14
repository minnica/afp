"use client";

import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { buildCategoryComparison, formatMoney, MONTH_NAMES } from "@/lib/analysisPresentation";

const compactMoney = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1 });

function comparisonConfig(previousLabel, currentLabel) {
  return { previous: { label: previousLabel, color: "var(--chart-1)" }, current: { label: currentLabel, color: "var(--chart-2)" } };
}

function ComparisonTooltip({ previousLabel, currentLabel, ...props }) {
  return (
    <ChartTooltipContent {...props} className="max-w-[calc(100vw-2rem)]" formatter={(value, name, item) => {
      const previous = item.dataKey === "previous";
      const statement = previous ? item.payload.prevIsStatement : item.payload.currIsStatement;
      return <div className="flex w-full items-start justify-between gap-4"><span className="min-w-0 flex-1 break-words text-muted-foreground">{previous ? previousLabel : currentLabel}{statement === false ? " · estimado" : ""}</span><span className="min-w-0 max-w-[55%] break-words text-right font-mono font-medium tabular-nums">{formatMoney(value)}</span></div>;
    }} />
  );
}

function Summary({ previous, current, previousLabel, currentLabel }) {
  const difference = current - previous;
  const percent = previous > 0 ? Math.abs(difference / previous * 100).toFixed(1) : null;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3">
        <div className="min-w-0"><dt className="text-sm text-muted-foreground">{previousLabel}</dt><dd className="break-words text-lg font-semibold tabular-nums">{formatMoney(previous)}</dd></div>
        <div className="min-w-0"><dt className="text-sm text-muted-foreground">{currentLabel}</dt><dd className="break-words text-lg font-semibold tabular-nums">{formatMoney(current)}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">{difference === 0 ? "El gasto es igual al mes anterior." : `${difference > 0 ? "Aumentó" : "Disminuyó"} ${formatMoney(Math.abs(difference))}${percent != null ? ` (${percent}%)` : ""} frente al mes anterior.`}</p>
    </div>
  );
}

function EmptyComparison({ title }) {
  return <Card><CardHeader><CardTitle><h2>{title}</h2></CardTitle></CardHeader><CardContent><Empty><EmptyDescription>No hay datos para comparar en este período. Puedes elegir otro mes.</EmptyDescription></Empty></CardContent></Card>;
}

export function WeeklyComparison({ comparison, categories, categoryId, onCategoryChange }) {
  const categorySelectId = useId();
  const rows = (comparison?.weeks || []).map((week) => ({ name: week.label, previous: week.prevTotal, current: week.currTotal }));
  const hasData = rows.some((row) => row.previous > 0 || row.current > 0);
  return (
    <Card data-weekly-comparison>
      <CardHeader>
        <CardTitle><h2>Gastos por semana</h2></CardTitle>
        <CardDescription>{comparison ? `${comparison.prevMonthLabel} vs ${comparison.currMonthLabel}` : "Compara el gasto de cada semana con el mes anterior."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="md:max-w-72"><Field><FieldLabel htmlFor={categorySelectId}>Categoría</FieldLabel><SearchableSelect id={categorySelectId} value={categoryId} onValueChange={onCategoryChange} aria-label="Categoría del comparativo semanal" title="Categoría del comparativo semanal" className="h-11 md:h-9" options={[{ value: "all", label: "Todas las categorías", pinned: true }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} /></Field></FieldGroup>
        {comparison ? <Summary previous={comparison.prevMonthTotal} current={comparison.currMonthTotal} previousLabel={comparison.prevMonthLabel} currentLabel={comparison.currMonthLabel} /> : null}
        {hasData ? (
          <ChartContainer config={comparisonConfig(comparison.prevMonthLabel, comparison.currMonthLabel)} className="h-72 w-full aspect-auto">
            <BarChart accessibilityLayer data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => compactMoney.format(value)} width={52} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <ChartTooltip cursor={false} content={<ComparisonTooltip previousLabel={comparison.prevMonthLabel} currentLabel={comparison.currMonthLabel} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="previous" fill="var(--color-previous)" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
              <Bar dataKey="current" fill="var(--color-current)" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        ) : <Empty className="py-4"><EmptyDescription>No hay gastos para comparar con esta selección. Puedes cambiar el mes o la categoría.</EmptyDescription></Empty>}
      </CardContent>
    </Card>
  );
}

function CategoryTick({ x, y, payload }) {
  const name = String(payload.value);
  return <text x={x - 5} y={y} dy={4} textAnchor="end" fill="var(--muted-foreground)" fontSize={12}><title>{name}</title>{name.length > 15 ? `${name.slice(0, 14)}…` : name}</text>;
}

function HorizontalComparison({ rows, previousLabel, currentLabel, id }) {
  return (
    <div id={id} className="w-full">
    <ChartContainer config={comparisonConfig(previousLabel, currentLabel)} className="w-full aspect-auto" style={{ height: Math.max(rows.length * 64 + 64, 220) }}>
      <BarChart accessibilityLayer layout="vertical" data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 0 }} barCategoryGap="22%" barGap={3}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={105} tick={<CategoryTick />} interval={0} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value) => compactMoney.format(value)} minTickGap={24} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <ChartTooltip cursor={false} content={<ComparisonTooltip previousLabel={previousLabel} currentLabel={currentLabel} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
        <Bar dataKey="previous" fill="var(--color-previous)" radius={[0, 3, 3, 0]} maxBarSize={14} isAnimationActive={false} />
        <Bar dataKey="current" fill="var(--color-current)" radius={[0, 3, 3, 0]} maxBarSize={14} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
    </div>
  );
}

export function CardComparison({ comparison }) {
  const rows = (comparison?.data || []).map((card) => ({ name: card.cardName, previous: card.prevAmount, current: card.currAmount, prevIsStatement: card.prevIsStatement, currIsStatement: card.currIsStatement })).sort((a, b) => b.current - a.current);
  if (!rows.length) return <EmptyComparison title="Pagos por tarjeta" />;
  return (
    <Card data-card-comparison>
      <CardHeader><CardTitle><h2>Pagos por tarjeta</h2></CardTitle><CardDescription>{comparison.prevMonthLabel} vs {comparison.currMonthLabel} · meses de corte</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4"><HorizontalComparison rows={rows} previousLabel={comparison.prevMonthLabel} currentLabel={comparison.currMonthLabel} /><p className="text-sm text-muted-foreground">Se usa el estado de cuenta cuando está registrado. Los demás importes son estimados.</p></CardContent>
    </Card>
  );
}

export function CategoryComparison({ byMonth, monthIndex, year }) {
  const [showAll, setShowAll] = useState(false);
  const chartId = useId();
  const rows = buildCategoryComparison(byMonth, monthIndex);
  const displayedRows = showAll ? rows : rows.slice(0, 5);
  const previousLabel = `${MONTH_NAMES[(monthIndex + 11) % 12]} ${monthIndex === 0 ? year - 1 : year}`;
  const currentLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
  if (!rows.length) return <EmptyComparison title="Gastos por categoría" />;
  return (
    <Card data-category-comparison>
      <CardHeader><CardTitle><h2>Gastos por categoría</h2></CardTitle><CardDescription>{showAll || rows.length <= 5 ? "Todas las categorías" : "Las cinco categorías con mayor gasto este mes"}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <HorizontalComparison id={chartId} rows={displayedRows} previousLabel={previousLabel} currentLabel={currentLabel} />
        {rows.length > 5 ? <Button variant="outline" className="h-11 w-full md:w-fit" aria-expanded={showAll} aria-controls={chartId} onClick={() => setShowAll((value) => !value)}>{showAll ? "Mostrar las cinco principales" : `Ver todas las categorías (${rows.length})`}</Button> : null}
      </CardContent>
    </Card>
  );
}
