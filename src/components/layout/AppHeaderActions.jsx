"use client";

import { useRef, useState } from "react";
import { Notification03Icon, Target02Icon } from "@hugeicons/core-free-icons";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CardUsageWaiverProgress, CardUsageWaiverTabs, ImportantNoticesCard } from "@/components/dashboard/DashboardPanels";
import { HeaderDialog } from "@/components/ui/header-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

function DashboardStatus({ isLoading, error, dashboard, retry }) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Cargando información">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>{error}{dashboard ? " Se muestra la última información cargada." : ""}</p>
        <Button type="button" variant="outline" className="h-11" onClick={retry}>Reintentar</Button>
      </AlertDescription>
    </Alert>
  );
}

export default function AppHeaderActions({ disabled = false }) {
  const data = useDashboard();
  const { dashboard, refresh, today, usageHistoryPeriod, setUsageHistoryPeriod } = data;
  const [usageView, setUsageView] = useState("current");
  const usageScrollRef = useRef(null);
  const notices = dashboard?.importantNotices || [];
  const onOpenChange = (open) => { if (open) refresh(); };
  const onUsageOpenChange = (open) => {
    if (open) {
      setUsageView("current");
      refresh();
    }
  };
  const onUsageViewChange = (view) => {
    setUsageView(view);
    if (usageScrollRef.current) usageScrollRef.current.scrollTop = 0;
  };

  return (
    <div data-slot="app-header-actions" className="ml-auto flex shrink-0 items-center gap-1">
      <HeaderDialog
        title="Avisos importantes"
        description="Todos tus avisos de pagos, vencimientos y cortes."
        icon={Notification03Icon}
        count={notices.length}
        disabled={disabled}
        onOpenChange={onOpenChange}
        data-dashboard-notices-dialog
      >
        <DashboardStatus {...data} />
        {dashboard ? <ImportantNoticesCard notices={notices} today={today} inDialog /> : null}
      </HeaderDialog>
      <Tabs value={usageView} onValueChange={onUsageViewChange} className="gap-0">
        <HeaderDialog
          title="Consumo mínimo"
          description="Consulta cuánto falta y cuándo corta el período vigente de cada tarjeta. Toca una tarjeta para ver su desglose."
          icon={Target02Icon}
          disabled={disabled}
          onOpenChange={onUsageOpenChange}
          headerContent={<CardUsageWaiverTabs />}
          scrollRef={usageScrollRef}
          data-dashboard-usage-dialog
        >
          <DashboardStatus {...data} />
          {dashboard ? (
            <CardUsageWaiverProgress
              currentItems={dashboard.cardUsageWaiversCurrent || []}
              historyItems={dashboard.cardUsageWaiverHistory || []}
              today={today}
              historyPeriod={usageHistoryPeriod}
              onHistoryPeriodChange={setUsageHistoryPeriod}
              inDialog
              externalTabs
            />
          ) : null}
        </HeaderDialog>
      </Tabs>
    </div>
  );
}
