import { Suspense } from "react";
import AppShell from "@/components/layout/AppShell";
import PageSkeleton from "@/components/layout/PageSkeleton";
import AutomaticRecordingContent from "@/components/configuracion/AutomaticRecordingContent";

export default function AutomaticRecordingPage() {
  return <AppShell><Suspense fallback={<PageSkeleton />}><AutomaticRecordingContent /></Suspense></AppShell>;
}
