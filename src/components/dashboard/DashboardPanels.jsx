"use client";

import Link from "next/link";
import { AlertTriangle, Bell, CalendarClock, ChevronRight, Scissors } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { formatPaymentDeadline } from "@/lib/cardPaymentPresentation";
import { DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NOTICE_DESTINATIONS = {
  CARD_PAYMENT: { href: "/tarjetas", label: "Tarjetas" },
  CUT_CYCLE: { href: "/tarjetas", label: "Tarjetas" },
  CUT_CYCLE_UPCOMING: { href: "/tarjetas", label: "Tarjetas" },
  RECEIVABLE: { href: "/ingresos", label: "Ingresos" },
  CASH_SUBSCRIPTION: { href: "/gastos", label: "Gastos" },
  PAYABLE: { href: "/gastos", label: "Gastos" },
};

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

export function ImportantNoticesCard({ notices, today, inDialog = false, embedded = false, renderNoticeActions, emptyDescription = "No tienes avisos importantes por ahora." }) {
  const content = notices.length === 0 ? (
    <Empty>
      <EmptyDescription>{emptyDescription}</EmptyDescription>
    </Empty>
  ) : (
    <div className="grid gap-3">
      {notices.map((notice) => {
        const Icon = getNoticeIcon(notice.group);
        const destination = NOTICE_DESTINATIONS[notice.type];
        const actions = renderNoticeActions?.(notice);

        const alert = (
          <Alert key={notice.id} className={cn(getNoticeAlertClass(notice.group), destination && "min-h-11 transition-colors hover:border-current motion-reduce:transition-none")}>
            <Icon aria-hidden="true" />
            <AlertTitle className="flex items-start justify-between gap-3">
              <span className="min-w-0">{notice.title}</span>
              {destination ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            </AlertTitle>
            <AlertDescription className={cn(actions && "min-h-11 pr-12")}>
              <div className="flex flex-col gap-1">
                {notice.description.split("\n").filter(Boolean).map((line, index) => {
                  const separator = line.indexOf(":");
                  const label = line.slice(0, separator);
                  const value = ["Vencido", "Vence", "Corte"].includes(label)
                    ? formatPaymentDeadline(notice.date, today)
                    : line.slice(separator + 1).trim();
                  return (
                    <div key={index}>
                      {separator === -1 ? line : (
                        <><strong className="font-semibold">{label}:</strong>{" "}{value}</>
                      )}
                    </div>
                  );
                })}
              </div>
            </AlertDescription>
          </Alert>
        );

        if (!destination) return alert;

        const link = (
          <Link
            key={notice.id}
            href={destination.href}
            aria-label={`${notice.title}. Ir a ${destination.label}`}
            className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {alert}
          </Link>
        );

        const noticeLink = inDialog ? <DialogClose asChild>{link}</DialogClose> : link;
        return <div key={notice.id} className="relative">{noticeLink}{actions}</div>;
      })}
    </div>
  );

  if (inDialog || embedded) return content;

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold uppercase text-center">Avisos importantes</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
