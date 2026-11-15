import AppShell from "@/components/layout/AppShell";
import TarjetasContent from "@/components/tarjetas/TarjetasContent";
import PageSkeleton from "@/components/layout/PageSkeleton";
import { Suspense } from "react";

export default function TarjetasPage() {
  return (
    <AppShell>
      <Suspense fallback={<PageSkeleton variant="form-table" />}>
        <TarjetasContent />
      </Suspense>
    </AppShell>
  );
}
