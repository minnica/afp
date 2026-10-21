"use client";

import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { expenseCents, getPersonalExpenseAmount, sumPersonalExpenses } from "@/lib/sharedExpenses";

const DAYS_PER_BATCH = 7;
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function dayLabel(date) {
  // Las fechas de gastos representan días calendario, sin conversión de zona horaria.
  const [year, month, day] = date.split("-").map(Number);
  return format(new Date(year, month - 1, day), "EEEE, d MMM yyyy", { locale: es });
}

export default function DailyExpenseCards({ expenses, isOnline, onEdit, onDelete }) {
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_BATCH);
  const days = useMemo(() => {
    const groups = new Map();
    for (const expense of expenses) {
      const date = String(expense.date).split("T")[0];
      if (!groups.has(date)) groups.set(date, { date, expenses: [], cents: 0, contributionCents: 0, pending: 0 });
      const group = groups.get(date);
      group.expenses.push(expense);
      group.cents += Math.round(Number(expense.amount || 0) * 100);
      group.contributionCents += expenseCents(expense.cashContributionAmount);
      if (expense._offlineStatus === "pending") group.pending += 1;
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses]);
  const totalCents = days.reduce((sum, day) => sum + day.cents, 0);

  if (!days.length) {
    return (
      <Empty className="daily-expenses-empty" role="status">
        <EmptyHeader>
          <EmptyTitle>Sin gastos para estos filtros</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="daily-expenses flex min-w-0 flex-col gap-4">
      {days.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm" role="status">
          <span className="text-muted-foreground">{expenses.length} gastos · {days.length} días</span>
          <div className="flex flex-col gap-1 text-right">
            <span>Total pagado <strong className="tabular-nums">{money.format(totalCents / 100)}</strong></span>
            {days.some(day => day.contributionCents > 0) ? <span>Tu parte <strong className="tabular-nums">{money.format(sumPersonalExpenses(expenses))}</strong></span> : null}
          </div>
        </div>
      ) : null}
      {days.slice(0, visibleDays).map((day) => (
        <Card key={day.date} className="pt-0" data-expense-day={day.date} role="region" aria-labelledby={`expense-day-${day.date}`}>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle><h3 id={`expense-day-${day.date}`} className="capitalize">{dayLabel(day.date)}</h3></CardTitle>
              <CardDescription>
                {day.expenses.length} {day.expenses.length === 1 ? "gasto" : "gastos"}
                {day.pending ? ` · incluye ${day.pending} ${day.pending === 1 ? "pendiente" : "pendientes"}` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Total pagado del día</span>
              <strong className="text-xl tabular-nums" data-day-total>{money.format(day.cents / 100)}</strong>
              {day.contributionCents > 0 ? <span className="text-sm">Tu parte <strong className="tabular-nums">{money.format((day.cents - day.contributionCents) / 100)}</strong></span> : null}
            </div>
          </CardHeader>
          <CardContent>
            <ItemGroup className="gap-0" aria-label={`Gastos del ${dayLabel(day.date)}`}>
              {day.expenses.map((expense, index) => (
                <Fragment key={expense.id}>
                  {index > 0 ? <ItemSeparator className="my-2" /> : null}
                  <Item role="listitem" className="min-w-0 px-0 py-2">
                    <ItemContent className="min-w-0 gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 flex-1 basis-32 break-words text-base font-medium">{expense.concept}</p>
                        <span className="max-w-full break-words text-base font-semibold tabular-nums">{money.format(Number(expense.amount || 0))}</span>
                      </div>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          {expense.category?.name ? <Badge variant="secondary">{expense.category.name}</Badge> : null}
                          {expense.reconciliationStatus === "PENDING" && <Badge variant="warning">Por conciliar</Badge>}
                          <span className="break-words text-sm text-muted-foreground">
                            {expense.paymentMethod === "CARD" ? `Tarjeta${expense.card ? ` · ${expense.card.name}` : ""}` : "Efectivo"}
                          </span>
                        </div>
                        {expense._offlineStatus !== "pending" ? (
                          <ItemActions className="shrink-0 gap-0">
                            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Editar gasto: ${expense.concept}`} disabled={!isOnline} onClick={() => onEdit(expense)}>
                              <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Eliminar gasto: ${expense.concept}`} disabled={!isOnline} onClick={() => onDelete(expense)}>
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} aria-hidden="true" />
                            </Button>
                          </ItemActions>
                        ) : null}
                      </div>
                      {Number(expense.cashContributionAmount) > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                          <span className="inline-flex items-center gap-1.5 text-success">
                            <Badge variant="success">Efectivo</Badge>
                            <span className="tabular-nums">{money.format(Number(expense.cashContributionAmount))}</span>
                          </span>
                          <span>Tu parte <strong className="tabular-nums">{money.format(getPersonalExpenseAmount(expense))}</strong></span>
                        </div>
                      ) : null}
                      {expense.notes ? <p className="break-words text-sm text-muted-foreground">{expense.notes}</p> : null}
                      {expense.person ? <p className="break-words text-sm text-muted-foreground">{expense.person.name}{expense.receivableAccount ? ` · ${expense.receivableAccount.concept}` : ""}</p> : null}
                      {expense.payableAccount ? <p className="break-words text-sm text-muted-foreground">Pagar: {expense.payableAccount.concept}</p> : null}
                      {expense.subscription ? <p className="break-words text-sm text-muted-foreground">{expense.subscription.name}</p> : null}
                      {expense._offlineStatus === "pending" ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline">Pendiente de sincronizar</Badge>
                          {expense._offlineError ? <p className="break-words text-sm text-muted-foreground">{expense._offlineError}</p> : null}
                        </div>
                      ) : null}
                    </ItemContent>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      ))}
      {days.length > DAYS_PER_BATCH ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground" role="status">{Math.min(visibleDays, days.length)} de {days.length} días</p>
          {visibleDays < days.length ? <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setVisibleDays((count) => count + DAYS_PER_BATCH)}>Ver más días</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

export function DailyExpenseCardsSkeleton() {
  return (
    <div className="daily-expenses flex flex-col gap-4" role="status" aria-label="Cargando gastos">
      <Card className="pt-0" aria-hidden="true">
        <CardHeader className="flex flex-col gap-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-32" />
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {[0, 1, 2].map((index) => <div key={index} className="flex flex-col gap-2"><Skeleton className="h-5 w-full" /><div className="flex items-center gap-2"><Skeleton className="h-4 flex-1" /><Skeleton className="h-11 w-22" /></div></div>)}
        </CardContent>
      </Card>
    </div>
  );
}
