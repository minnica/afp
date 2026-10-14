import { Skeleton } from "@/components/ui/skeleton";

export default function AnalysisSkeleton() {
  return (
    <main className="analysis-page" aria-busy="true" aria-label="Cargando análisis">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:py-8">
        <Skeleton className="h-11 w-full md:w-56" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-96 w-full" />
      </section>
    </main>
  );
}
