import type { PrismaClient, GoogleCalendarConnection } from '@prisma/client';
import type { CalendarData, CalendarEvent } from './types';
import { getCyclePaymentState } from "@/lib/calculations/cardCyclePayments";
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";
import { buildSubscriptionCharges } from "@/lib/subscriptionCharges";
import { preferences, CALENDAR_TIME_ZONE } from "@/lib/calendar/config";
import { calendarEventLabel } from "@/lib/calendar/palette";

export function bankDate(value: Date | string | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : null; }
export function mexicoDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addDays(day: string, count: number) { return new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10); }
function dayInMonth(month: string, day: number) {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${String(Math.min(Number(day), new Date(Date.UTC(year!, number!, 0)).getUTCDate())).padStart(2, "0")}`;
}
function monthsBetween(from: string, to: string) {
  const months = []; const date = new Date(`${from.slice(0, 7)}-01T12:00:00Z`);
  while (bankDate(date)! <= to) { months.push(bankDate(date)!.slice(0, 7)); date.setUTCMonth(date.getUTCMonth() + 1); }
  return months;
}

// Agenda independiente del filtro de avisos cercanos del Dashboard. No escribe ciclos.
export function buildCalendarEvents(data: CalendarData, rawPreferences: unknown, now = new Date()) {
  const settings = preferences(rawPreferences), today = mexicoDay(now);
  const from = addDays(today, -90), to = addDays(today, 120), events: CalendarEvent[] = [];
  const months = monthsBetween(from, to);
  const add = (event: Omit<CalendarEvent, 'date'> & { date: string | null }) => {
    if (!settings.types.includes(event.type) || !event.date || event.date > to) return;
    if (event.date < from && (event.settled || !["cardPayments", "payables"].includes(event.type))) return;
    events.push({ ...event, date: event.date, overdue: !event.settled && !event.informational && event.date < today });
  };
  const cycles = new Map(data.cycles.map(cycle => [`${cycle.cardId}:${cycle.year}-${String(cycle.month).padStart(2, "0")}`, cycle]));
  for (const card of data.cards) {
    const candidates = new Map<string, StoredOrProjectedCycle>(data.cycles.filter(cycle => cycle.cardId === card.id).map(cycle => [`${cycle.year}-${String(cycle.month).padStart(2, "0")}`, cycle]));
    // El mes anterior puede tener vencimiento dentro del intervalo mostrado.
    for (const month of monthsBetween(addDays(`${from.slice(0, 7)}-01`, -1), to)) {
      if (candidates.has(month)) continue;
      const cutDate = dayInMonth(month, card.usualCutDay);
      // No inventar obligaciones pasadas cuando nunca se registró ese ciclo.
      if (cutDate < today) continue;
      let dueDate = dayInMonth(month, card.usualDueDay);
      if (dueDate <= cutDate) {
        const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1);
        dueDate = dayInMonth(bankDate(date)!.slice(0, 7), card.usualDueDay);
      }
      candidates.set(month, { cardId: card.id, cutDate, dueDate, projected: true });
    }
    for (const [month, cycle] of candidates) {
      const state = getCyclePaymentState(cycle);
      // dueDate existe incluso en ciclos generados: requiere confirmación manual.
      // Cero es un importe capturado; un pago por sí solo no confirma las fechas.
      const reviewed = !cycle.projected && Boolean(cycle.datesConfirmedAt && cycle.dueDate)
        && cycle.statementAmount !== null && cycle.statementAmount !== undefined;
      const note = cycle.projected ? "Fecha prevista según los días habituales de la tarjeta. Confírmala con el banco."
        : "Fecha del ciclo registrada en AFP. Actualízala en AFP si el banco la modifica.";
      add({ key: `card:${card.id}:${month}:cut`, type: "cuts", date: bankDate(cycle.cutDate),
        title: `${reviewed ? "Corte revisado" : "Corte"} · ${card.name}`,
        detail: reviewed ? "Fechas reales y monto del estado de cuenta registrados en AFP. Consulta el evento de pago para ver el saldo pendiente."
          : `${note}\nPara marcar el corte como revisado, guarda las fechas reales y el monto del estado de cuenta en AFP.`,
        route: "/tarjetas", settled: false, informational: true, reviewed });
      add({ key: `card:${card.id}:${month}:payment`, type: "cardPayments", date: bankDate(cycle.dueDate),
        title: `${state.isSettled ? "Pagado" : state.paymentStatus === "PARTIALLY_PAID" ? "Pago parcial" : "Pago"} · ${card.name}`,
        detail: `${note}\n${state.isSettled ? "Sin saldo pendiente en este corte." : state.pendingAmount === null ? "Importe del estado de cuenta por confirmar." : "Saldo pendiente del estado de cuenta, después de pagos y devoluciones aplicadas."}`,
        amount: state.pendingAmount, route: "/tarjetas", settled: state.isSettled,
        partial: state.paymentStatus === "PARTIALLY_PAID" });
    }
  }
  for (const month of months) {
    for (const charge of buildSubscriptionCharges({ subscriptions: data.subscriptions, cycles: [...cycles.values()], month, today: to })) {
      if (charge.status === "SKIPPED") continue;
      const settled = ["CONFIRMED", "VERIFIED"].includes(charge.status);
      add({ key: `subscription:${charge.subscriptionId}:${month}`, type: "subscriptions", date: charge.date,
        title: `${settled ? "Cobrado" : "Suscripción"} · ${charge.name}`,
        detail: settled ? "Cobro registrado o respaldado por estado de cuenta en AFP." : "Cobro previsto de suscripción. Confirma el movimiento en AFP cuando se realice.",
        amount: charge.confirmedAmount ?? charge.amount, route: "/gastos", settled });
    }
    for (const account of data.receivables) {
      const incomes = account.incomes.filter(income => bankDate(income.date)! <= today);
      const state = getDebtAccountState(account, incomes);
      if (state.status === "CANCELLED") continue;
      const expectedCents = Math.round(Number(account.expectedMonthlyPayment || 0) * 100);
      // Las cuentas liquidadas no siguen proyectando cobros futuros.
      const days = [...new Set(account.expectedChargeDays)].sort((a, b) => a - b);
      const nextMonth = addDays(dayInMonth(month, 31), 1).slice(0, 7);
      const seenDates = new Set();
      for (const [index, day] of days.entries()) {
        const date = dayInMonth(month, day);
        // En febrero, por ejemplo, los días 30 y 31 son una sola fecha.
        if (seenDates.has(date)) continue;
        seenDates.add(date);
        if (date < bankDate(account.originDate)! || (state.status === "PAID_OFF" && date > today)) continue;
        const nextDate = days.slice(index + 1).map(day => dayInMonth(month, day)).find(candidate => candidate > date)
          || dayInMonth(nextMonth, days[0]!);
        // Un abono pertenece al intervalo de una fecha, nunca a todo el mes.
        // El límite exclusivo evita reutilizarlo para el siguiente cobro.
        const paidCents = incomes.filter(income => bankDate(income.date)! >= date && bankDate(income.date)! < nextDate)
          .reduce((sum, income) => sum + Math.round(Number(income.amount) * 100), 0);
        const settled = state.status === "PAID_OFF" || (expectedCents > 0 && paidCents >= expectedCents);
        const partial = !settled && paidCents > 0;
        add({ key: `receivable:${account.id}:${month}:${index}`, type: "receivables", date,
          title: `${settled ? "Cobrado" : partial ? "Cobro parcial" : "Cobrar"} · ${account.person?.name || account.concept}`,
          detail: `${account.concept}\n${settled ? "Cobro cubierto o cuenta liquidada en AFP." : "Fecha de cobro prevista. Solo se consideran ingresos registrados desde esta fecha y antes de la siguiente fecha de cobro, hasta hoy."}`,
          amount: settled ? 0 : expectedCents > 0 ? Math.min(Math.max(0, expectedCents - paidCents) / 100, state.pendingBalance) : state.pendingBalance,
          route: "/cuentas-por-cobrar", settled, partial });
      }
    }
  }
  for (const account of data.payables) {
    const state = getDebtAccountState(account, account.dailyExpenses);
    if (state.status === "CANCELLED" || !account.expectedDate) continue;
    const settled = state.status === "PAID_OFF";
    const partial = !settled && state.paidAmount > 0;
    add({ key: `payable:${account.id}`, type: "payables", date: bankDate(account.expectedDate),
      title: `${settled ? "Pagado" : partial ? "Pago parcial" : "Pagar"} · ${account.person?.name || account.concept}`, detail: account.concept,
      amount: Math.max(0, state.pendingBalance), route: "/cuentas-por-pagar", settled, partial });
  }
  return { from, to, today, events: events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key)) };
}

export function googleEvent(event: CalendarEvent, connection: Pick<GoogleCalendarConnection, 'id' | 'preferences'>, origin: string) {
  const settings = preferences(connection.preferences);
  const amount = settings.showAmounts && event.amount !== null && event.amount !== undefined
    ? `\nImporte: ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(event.amount)}` : "";
  const url = `${origin}${event.route}`;
  return {
    summary: event.title,
    description: `${event.detail}${amount}\n\nGestiona este registro en AFP: ${url}`,
    start: { date: event.date }, end: { date: addDays(event.date, 1) },
    transparency: "transparent", visibility: "private",
    // La etiqueta usa el color propio de AFP, sin aproximarlo a la paleta antigua.
    eventLabelId: calendarEventLabel(event).id,
    reminders: { useDefault: false, overrides: settings.reminders && !event.settled && !event.informational
      ? [{ method: "popup", minutes: 1440 }] : [] },
    source: { title: "AFP", url },
    extendedProperties: { private: { afpConnection: connection.id, afpSource: event.key } },
  };
}

export async function loadCalendarData(db: PrismaClient, userId: string) {
  // Un snapshot consistente evita combinar un pago nuevo con el saldo anterior.
  return db.$transaction(async tx => {
    const [cards, cycles, subscriptions, receivables, payables] = await Promise.all([
      tx.card.findMany({ where: { userId } }), tx.cardCycle.findMany({ where: { userId } }),
      tx.subscription.findMany({ where: { userId }, include: { charges: true, dailyExpenses: { include: { subscriptionCharge: true } } } }),
      tx.receivableAccount.findMany({ where: { userId }, include: { person: true, incomes: true } }),
      tx.payableAccount.findMany({ where: { userId }, include: { person: true, dailyExpenses: true } }),
    ]);
    return { cards, cycles, subscriptions, receivables, payables };
  }, { isolationLevel: "RepeatableRead" });
}

type StoredOrProjectedCycle = (CalendarData['cycles'][number] & { projected?: false }) | { cardId: string; cutDate: string; dueDate: string; projected: true; datesConfirmedAt?: never; statementAmount?: never };
