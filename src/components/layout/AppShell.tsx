"use client";

import type * as React from "react";

import AppHeader from "@/components/layout/AppHeader";
import AppSidebar from "@/components/layout/AppSidebar";
import {
SidebarInset,
SidebarProvider,
} from "@/components/ui/sidebar";

export default function AppShell({ children }: React.PropsWithChildren) {
  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset className="min-w-0">
        <AppHeader />

        <div className="min-h-[calc(100dvh-3rem)] bg-background text-foreground md:min-h-[calc(100dvh-3.5rem)]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
