"use client";

import { AlertTriangle, Bell, CalendarClock, Scissors } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";

export { default as CardUsageWaiverProgress, CardUsageWaiverTabs } from "./CardUsageWaiverProgress";

function getNoticeAlertClass(group) {
  const classes = {
    overdue: "border-red-500/60 bg-red-500/15 text-red-400 dark:text-red-300",
    today:
      "border-orange-500/60 bg-orange-500/15 text-orange-400 dark:text-orange-300",
    upcoming:
      "border-amber-500/50 bg-amber-500/12 text-amber-500 dark:text-amber-400",
    cut: "border-blue-500/25 bg-blue-500/8 text-blue-500 dark:text-blue-400",
  };

  return classes[group] || "border-border bg-muted/30";
}

function getNoticeIcon(group) {
  if (group === "overdue") return AlertTriangle;
  if (group === "today") return CalendarClock;
  if (group === "cut") return Scissors;
  return Bell;
}

export function ImportantNoticesCard({ notices, inDialog = false }) {
  const content = notices.length === 0 ? (
    <Empty>
      <EmptyDescription>No tienes avisos importantes por ahora.</EmptyDescription>
    </Empty>
  ) : (
    <div className="grid gap-3">
      {notices.map((notice) => {
        const Icon = getNoticeIcon(notice.group);

        return (
          <Alert key={notice.id} className={getNoticeAlertClass(notice.group)}>
            <Icon aria-hidden="true" />
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription>{notice.description}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );

  if (inDialog) return content;

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold uppercase text-center">Avisos importantes</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
