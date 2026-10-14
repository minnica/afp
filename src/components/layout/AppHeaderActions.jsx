"use client";

import { Notification03Icon, Target02Icon } from "@hugeicons/core-free-icons";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CardUsageWaiverProgress, ImportantNoticesCard } from "@/components/dashboard/DashboardPanels";
import { HeaderDialog } from "@/components/ui/header-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { dashboard, refresh, today, usageMonth, setUsageMonth, usageSort, setUsageSort } = data;
  const notices = dashboard?.importantNotices || [];
  const onOpenChange = (open) => { if (open) refresh(); };

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
        {dashboard ? <ImportantNoticesCard notices={notices} inDialog /> : null}
      </HeaderDialog>
      <HeaderDialog
        title="Consumo mínimo"
        description="Consulta el consumo, la meta y el faltante para exentar la comisión de tus tarjetas."
        icon={Target02Icon}
        disabled={disabled}
        onOpenChange={onOpenChange}
        data-dashboard-usage-dialog
      >
        <DashboardStatus {...data} />
        {dashboard ? (
          <CardUsageWaiverProgress
            cardUsageWaiversByMonth={dashboard.cardUsageWaiversByMonth || {}}
            currentMonthIndex={today.getMonth()}
            selectedMonthIndex={usageMonth}
            onMonthChange={setUsageMonth}
            sortDirection={usageSort}
            onSortChange={setUsageSort}
            inDialog
          />
        ) : null}
      </HeaderDialog>
    </div>
  );
}
