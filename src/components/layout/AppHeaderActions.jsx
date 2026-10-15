"use client";

import { useRef, useState } from "react";
import { Notification03Icon, Target02Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { CardUsageWaiverProgress, CardUsageWaiverTabs } from "@/components/dashboard/DashboardPanels";
import ImportantNotices, { HiddenNoticesButton } from "@/components/dashboard/ImportantNotices";
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
  const { dashboard, refresh, today, usageHistoryPeriod, setUsageHistoryPeriod, noticePreferences } = data;
  const [usageView, setUsageView] = useState("current");
  const [noticeView, setNoticeView] = useState("active");
  const noticesScrollRef = useRef(null);
  const usageScrollRef = useRef(null);
  const notices = data.visibleNotices;
  const onOpenChange = (open) => { if (open) { setNoticeView("active"); refresh(); noticePreferences.refresh(); } };
  const onNoticeViewChange = (view) => {
    setNoticeView(view);
    if (noticesScrollRef.current) noticesScrollRef.current.scrollTop = 0;
  };
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
        contentTitle={noticeView === "hidden" ? "Ocultos este mes" : "Avisos importantes"}
        description={noticeView === "hidden" ? "Avisos ocultos solo durante este mes. Puedes volver a mostrarlos y regresar a los avisos importantes." : "Todos tus avisos de pagos, vencimientos y cortes."}
        icon={Notification03Icon}
        count={notices.length}
        disabled={disabled}
        onOpenChange={onOpenChange}
        scrollRef={noticesScrollRef}
        headerLeading={noticeView === "hidden" ? (
          <Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label="Volver a avisos importantes" onClick={() => onNoticeViewChange("active")}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
          </Button>
        ) : null}
        headerActions={noticeView === "active" && data.hiddenNotices.length > 0 ? <HiddenNoticesButton onClick={() => onNoticeViewChange("hidden")} /> : null}
        data-dashboard-notices-dialog
      >
        <DashboardStatus {...data} />
        {dashboard ? <ImportantNotices inDialog view={noticeView} onViewChange={onNoticeViewChange} /> : null}
      </HeaderDialog>
      <Tabs value={usageView} onValueChange={onUsageViewChange} className="gap-0">
        <HeaderDialog
          title="Consumo mínimo"
          description="Consulta cuánto falta y cuándo corta el período vigente de cada tarjeta. Toca una tarjeta para ver su desglose."
          icon={Target02Icon}
          disabled={disabled}
          onOpenChange={onUsageOpenChange}
          headerActions={<CardUsageWaiverTabs inHeader />}
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
