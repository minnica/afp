"use client";


import AnalysisError from "@/components/analisis/AnalysisError";
import AnalysisSkeleton from "@/components/analisis/AnalysisSkeleton";
import MonthSelector from "@/components/analisis/MonthSelector";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalysis } from "@/hooks/use-analysis";
import dynamic from "next/dynamic";
import { useId, useState } from "react";

function ChartLoading() {
  return <Skeleton className="h-80 w-full" role="status" aria-label="Cargando comparativo" />;
}
const WeeklyComparison = dynamic(() => import("./AnalysisCharts").then((module) => module.WeeklyComparison), { loading: ChartLoading });
const CardComparison = dynamic(() => import("./AnalysisCharts").then((module) => module.CardComparison), { loading: ChartLoading });
const CategoryComparison = dynamic(() => import("./AnalysisCharts").then((module) => module.CategoryComparison), { loading: ChartLoading });

function AnalysisViews({ dashboard, today }: { dashboard: import("@/lib/uiTypes").Dashboard; today: Date }) {
  const monthId = useId();
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [categoryId, setCategoryId] = useState("all");
  const year = today.getFullYear();
  return (
    <Tabs defaultValue="weeks" className="gap-5" data-analysis-views>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <FieldGroup className="md:max-w-56">
          <Field><FieldLabel htmlFor={monthId}>Mes a comparar</FieldLabel><MonthSelector id={monthId} value={monthIndex} onChange={setMonthIndex} year={year} label="Mes de análisis" /></Field>
        </FieldGroup>
        <TabsList variant="line" className="h-11 w-full md:w-fit" aria-label="Comparativos de gastos">
          <TabsTrigger value="weeks" className="min-h-11">Semanas</TabsTrigger>
          <TabsTrigger value="cards" className="min-h-11">Tarjetas</TabsTrigger>
          <TabsTrigger value="categories" className="min-h-11">Categorías</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="weeks" className="min-w-0">
        <WeeklyComparison comparison={categoryId === "all" ? dashboard.weeklyComparisonByMonth?.[monthIndex] : dashboard.weeklyComparisonByCategoryAndMonth?.[categoryId]?.[monthIndex]} categories={dashboard.categories || []} categoryId={categoryId} onCategoryChange={setCategoryId} />
      </TabsContent>
      <TabsContent value="cards" className="min-w-0"><CardComparison comparison={dashboard.cardMonthlyComparisonByMonth?.[monthIndex]} /></TabsContent>
      <TabsContent value="categories" className="min-w-0"><CategoryComparison key={monthIndex} byMonth={dashboard.categoryBreakdownByMonth || {}} monthIndex={monthIndex} year={year} /></TabsContent>
    </Tabs>
  );
}

export default function AnalysisContent() {
  const { dashboard, isLoading, error, retry, today } = useAnalysis();
  if (isLoading) return <AnalysisSkeleton />;
  return (
    <main className="analysis-page">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 md:gap-6 md:py-8">
        {error ? <AnalysisError error={error} retry={retry} /> : null}
        {dashboard ? <AnalysisViews dashboard={dashboard} today={today} /> : null}
      </section>
    </main>
  );
}
