"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function FilterSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
      <Skeleton className="h-10 w-full sm:w-[180px]" />
      <Skeleton className="h-10 w-full sm:w-[160px]" />
      <Skeleton className="h-10 w-full sm:w-[180px]" />
      <Skeleton className="h-10 w-full sm:w-[200px]" />
      <Skeleton className="h-10 w-full sm:w-[150px]" />
    </div>
  );
}

function TableSkeleton({ rows = 8 }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="grid gap-4 border-b border-border bg-muted/30 px-4 py-3 md:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_72px]">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>

      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_72px]"
          >
            <Skeleton className="h-4 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormCardSkeleton() {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <Skeleton className="mx-auto h-5 w-32" />
      </CardHeader>

      <CardContent className="space-y-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}

        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

function SummaryGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="rounded-2xl border-border bg-card">
          <CardHeader className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-28" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function ChartGridSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="rounded-2xl border-border bg-card">
          <CardHeader>
            <Skeleton className="mx-auto h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[260px] w-full rounded-xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ListSkeleton({ cards = 5 }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-background/60 px-4 py-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="w-full space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PageSkeleton({ variant = "form-table" }) {
  if (variant === "dashboard") {
    return (
      <main>
        <section className="mx-auto flex w-full max-w-full flex-col px-4 py-8">
          <div className="space-y-6">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <Skeleton className="mx-auto h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <Skeleton className="mx-auto h-5 w-44" />
              </CardHeader>
              <CardContent>
                <FilterSkeleton />
                <div className="mt-6">
                  <TableSkeleton rows={5} />
                </div>
              </CardContent>
            </Card>
            <ChartGridSkeleton />
          </div>
        </section>
      </main>
    );
  }

  if (variant === "settings") {
    return (
      <main>
        <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 md:py-8">
          <div className="space-y-6">
            <SummaryGridSkeleton />
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-4">
                <FilterSkeleton />
                <ListSkeleton cards={6} />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  if (variant === "list") {
    return (
      <main>
        <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 md:py-8">
          <div className="space-y-6">
            <SummaryGridSkeleton />
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <Skeleton className="mx-auto h-5 w-44" />
              </CardHeader>
              <CardContent>
                <ListSkeleton />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8">
        <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_1fr]">
          <FormCardSkeleton />

          <div className="min-w-0 space-y-6">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <Skeleton className="mx-auto h-5 w-40" />
              </CardHeader>
              <CardContent className="space-y-4">
                <FilterSkeleton />
                <TableSkeleton />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

export { TableSkeleton };
