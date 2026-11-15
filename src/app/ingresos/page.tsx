import AppShell from "@/components/layout/AppShell";
import IngresosContent from "@/components/ingresos/IngresosContent";
import PageSkeleton from "@/components/layout/PageSkeleton";
import { Suspense } from "react";

export default function IngresosPage() {
  return (
    <AppShell>
      <Suspense fallback={<PageSkeleton />}>
        <IngresosContent />
      </Suspense>
    </AppShell>
  );
}
