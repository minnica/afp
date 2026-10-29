"use client";
import type { Notice } from "@/lib/uiTypes";


import type * as React from "react";

import { getNoticeCategory, NoticeCategoryBadge, NoticeUrgencyBadge } from "@/components/dashboard/NoticeCategory";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogClose } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { formatPaymentDeadline } from "@/lib/cardPaymentPresentation";
import { cn } from "@/lib/utils";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

const NOTICE_DESTINATIONS: Record<string, { href: string; label: string }> = {
  CARD_PAYMENT: { href: "/tarjetas", label: "Tarjetas" },
  CUT_CYCLE: { href: "/tarjetas", label: "Tarjetas" },
  CUT_CYCLE_UPCOMING: { href: "/tarjetas", label: "Tarjetas" },
  RECEIVABLE: { href: "/ingresos", label: "Ingresos" },
  CASH_SUBSCRIPTION: { href: "/gastos", label: "Gastos" },
  CARD_SUBSCRIPTION: { href: "/gastos", label: "Gastos" },
  PAYABLE: { href: "/gastos", label: "Gastos" },
};

export { default as CardUsageWaiverProgress,CardUsageWaiverTabs } from "./CardUsageWaiverProgress";

export function ImportantNoticesCard({ notices, today, inDialog = false, embedded = false, renderNoticeActions, emptyDescription = "No tienes avisos importantes por ahora." }: { notices: Notice[]; today: Date; inDialog?: boolean; embedded?: boolean; renderNoticeActions?: (notice: Notice) => React.ReactNode; emptyDescription?: string }) {
  const content = notices.length === 0 ? (
    <Empty>
      <EmptyDescription>{emptyDescription}</EmptyDescription>
    </Empty>
  ) : (
    <div className="grid gap-3">
      {notices.map((notice) => {
        const category = getNoticeCategory(notice.type);
        const destination = NOTICE_DESTINATIONS[notice.type];
        const actions = renderNoticeActions?.(notice);

        const alert = (
          <Alert key={notice.id} variant="notice" data-notice-category={category.key} data-notice-type={notice.type}
            className={cn("gap-2 px-3 py-3", destination && "min-h-11 transition-colors hover:border-notice-category/60 motion-reduce:transition-none")}>
            <AlertTitle className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <NoticeCategoryBadge type={notice.type} />
                <NoticeUrgencyBadge group={notice.group} />
                {destination ? <HugeiconsIcon icon={ArrowRight01Icon} className="ml-auto shrink-0" data-notice-link aria-hidden="true" /> : null}
              </div>
              <span className="min-w-0 break-words">{notice.title}</span>
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
