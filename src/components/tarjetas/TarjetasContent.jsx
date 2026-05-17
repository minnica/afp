"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";

function formatDate(dateString) {
  return format(new Date(dateString), "d MMMM yyyy", { locale: es });
}

function getRelativeBadge(dateString) {
  const today = new Date();
  const target = new Date(dateString);

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const targetUtc = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );

  const diffDays = Math.round((targetUtc - todayUtc) / 86400000);

  if (diffDays === 0) return "Hoy";
  if (diffDays > 0) return `+${diffDays}`;
  return `${diffDays}`;
}

function formatCompactDate(dateString) {
  const date = new Date(dateString);
  const dateText = format(date, "d MMMM", { locale: es });
  const badge = getRelativeBadge(dateString);

  return `${dateText} [${badge}]`;
}

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatShortDate(dateString) {
  if (!dateString) return "-";

  return format(new Date(dateString), "d MMM", { locale: es });
}

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toDateInputValue(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStatusLabel(status) {
  const labels = {
    OPEN: "Abierto",
    CUT: "Cortado",
    PAYMENT_PENDING: "Pendiente",
    PAID: "Pagado",
    OVERDUE: "Vencido",
  };

  return labels[status] || status;
}

function BreakdownSection({
  title,
  items,
  emptyText,
  getPrimary,
  getSecondary,
  getAmount,
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <h5 className="mb-3 text-sm font-medium">{title}</h5>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-background/60 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {getPrimary(item)}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {getSecondary(item)}
                  </p>
                </div>

                <p className="shrink-0 text-sm font-semibold">
                  {formatMoney(getAmount(item))}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CycleActionForms({
  cycle,
  editingCycleDatesId,
  editCycleStartDate,
  setEditCycleStartDate,
  editCycleCutDate,
  setEditCycleCutDate,
  editCycleDueDate,
  setEditCycleDueDate,
  cancelEditingCycleDates,
  updateCycleDates,
  isUpdatingCycleDates,
  editingStatementCycleId,
  statementAmount,
  setStatementAmount,
  updateStatementAmount,
  payingCycleId,
  paidAt,
  setPaidAt,
  paidAmount,
  setPaidAmount,
  markCycleAsPaid,
}) {
  return (
    <>
      {editingCycleDatesId === cycle.id ? (
        <div className="rounded-xl border border-border bg-background/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="text-xs font-medium">Editar fechas reales</p>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={cancelEditingCycleDates}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input
                type="date"
                value={editCycleStartDate}
                onChange={(event) => setEditCycleStartDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Corte</Label>
              <Input
                type="date"
                value={editCycleCutDate}
                onChange={(event) => setEditCycleCutDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Límite pago</Label>
              <Input
                type="date"
                value={editCycleDueDate}
                onChange={(event) => setEditCycleDueDate(event.target.value)}
              />
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => updateCycleDates(cycle.id)}
              disabled={isUpdatingCycleDates}
            >
              {isUpdatingCycleDates ? "Guardando..." : "Guardar fechas"}
            </Button>
          </div>
        </div>
      ) : null}

      {editingStatementCycleId === cycle.id ? (
        <div className="rounded-xl border border-border bg-background/70 p-3">
          <Label>Monto estado de cuenta</Label>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={statementAmount}
              placeholder="0.00"
              onChange={(event) => setStatementAmount(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => updateStatementAmount(cycle.id)}
            >
              Guardar
            </Button>
          </div>
        </div>
      ) : null}

      {payingCycleId === cycle.id ? (
        <div className="rounded-xl border border-border bg-background/70 p-3">
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Fecha de pago</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Monto pagado</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                placeholder="0.00"
                onChange={(event) => setPaidAmount(event.target.value)}
              />
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => markCycleAsPaid(cycle.id)}
            >
              Confirmar pago
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CycleBreakdown({ cycle }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
      <h4 className="mb-4 text-sm font-medium">Desglose del cálculo</h4>

      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownSection
          title={`Gastos (${formatMoney(cycle.expensesAmount)})`}
          items={cycle.includedExpenses || []}
          emptyText="No hay gastos diarios en este ciclo."
          getPrimary={(item) => item.concept}
          getSecondary={(item) =>
            `${formatShortDate(item.date)}${
              item.categoryName ? ` · ${item.categoryName}` : ""
            }`
          }
          getAmount={(item) => item.amount}
        />

        <BreakdownSection
          title={`Suscripciones (${formatMoney(cycle.subscriptionsAmount)})`}
          items={cycle.includedSubscriptions || []}
          emptyText="No hay suscripciones en este ciclo."
          getPrimary={(item) => item.name}
          getSecondary={(item) =>
            `${formatShortDate(item.chargeDate)}${
              item.categoryName ? ` · ${item.categoryName}` : ""
            }`
          }
          getAmount={(item) => item.amount}
        />

        <BreakdownSection
          title={`Compras a meses (${formatMoney(cycle.purchasesAmount)})`}
          items={cycle.includedPurchases || []}
          emptyText="No hay mensualidades en este ciclo."
          getPrimary={(item) => item.concept}
          getSecondary={(item) =>
            `${formatShortDate(item.purchaseDate)} · mes ${
              item.currentMonth || "-"
            }/${item.months}${item.categoryName ? ` · ${item.categoryName}` : ""}`
          }
          getAmount={(item) => item.amount}
        />
      </div>
    </div>
  );
}

export default function TarjetasContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [cards, setCards] = useState([]);
  const [cycles, setCycles] = useState([]);

  const [name, setName] = useState("");
  const [usualCutDay, setUsualCutDay] = useState("");
  const [usualDueDay, setUsualDueDay] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingCycles, setIsGeneratingCycles] = useState(false);
  const [error, setError] = useState("");

  const [editingStatementCycleId, setEditingStatementCycleId] = useState("");
  const [statementAmount, setStatementAmount] = useState("");

  const [payingCycleId, setPayingCycleId] = useState("");
  const [paidAt, setPaidAt] = useState(getTodayInputValue());
  const [paidAmount, setPaidAmount] = useState("");

  const [expandedCycleId, setExpandedCycleId] = useState("");

  const [editingCardId, setEditingCardId] = useState("");
  const [editCardName, setEditCardName] = useState("");
  const [editUsualCutDay, setEditUsualCutDay] = useState("");
  const [editUsualDueDay, setEditUsualDueDay] = useState("");
  const [editCardNotes, setEditCardNotes] = useState("");
  const [isUpdatingCard, setIsUpdatingCard] = useState(false);

  const [editingCycleDatesId, setEditingCycleDatesId] = useState("");
  const [editCycleStartDate, setEditCycleStartDate] = useState("");
  const [editCycleCutDate, setEditCycleCutDate] = useState("");
  const [editCycleDueDate, setEditCycleDueDate] = useState("");
  const [isUpdatingCycleDates, setIsUpdatingCycleDates] = useState(false);

  async function loadCards(userId) {
    const response = await fetch(`/api/cards?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar las tarjetas.");
    }

    setCards(data.cards || []);
  }

  async function loadCycles(userId) {
    const response = await fetch(`/api/card-cycles?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar los ciclos.");
    }

    setCycles(data.cycles || []);
  }

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        setUser(session.user);

        await fetch("/api/setup-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: session.user.id,
            email: session.user.email,
          }),
        });

        await Promise.all([
          loadCards(session.user.id),
          loadCycles(session.user.id),
        ]);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createCard() {
    if (!user) return;

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          name,
          usualCutDay,
          usualDueDay,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la tarjeta.");
      }

      setName("");
      setUsualCutDay("");
      setUsualDueDay("");
      setNotes("");

      await Promise.all([loadCards(user.id), loadCycles(user.id)]);
    } catch (err) {
      setError(err.message || "No se pudo crear la tarjeta.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingCard(card) {
    setEditingCardId(card.id);
    setEditCardName(card.name || "");
    setEditUsualCutDay(String(card.usualCutDay || ""));
    setEditUsualDueDay(String(card.usualDueDay || ""));
    setEditCardNotes(card.notes || "");
  }

  function cancelEditingCard() {
    setEditingCardId("");
    setEditCardName("");
    setEditUsualCutDay("");
    setEditUsualDueDay("");
    setEditCardNotes("");
  }

  async function updateCard() {
    if (!user || !editingCardId) return;

    setError("");
    setIsUpdatingCard(true);

    try {
      const response = await fetch("/api/cards", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingCardId,
          name: editCardName,
          usualCutDay: editUsualCutDay,
          usualDueDay: editUsualDueDay,
          notes: editCardNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la tarjeta.");
      }

      cancelEditingCard();

      await Promise.all([loadCards(user.id), loadCycles(user.id)]);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la tarjeta.");
    } finally {
      setIsUpdatingCard(false);
    }
  }

  async function deleteCard(id) {
    if (!user) return;

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar esta tarjeta?",
    );

    if (!confirmed) return;

    setError("");

    try {
      const response = await fetch(`/api/cards?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar la tarjeta.");
      }

      await Promise.all([loadCards(user.id), loadCycles(user.id)]);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la tarjeta.");
    }
  }

  function startEditingCycleDates(cycle) {
    setEditingCycleDatesId(cycle.id);
    setEditCycleStartDate(toDateInputValue(cycle.startDate));
    setEditCycleCutDate(toDateInputValue(cycle.cutDate));
    setEditCycleDueDate(toDateInputValue(cycle.dueDate));
  }

  function cancelEditingCycleDates() {
    setEditingCycleDatesId("");
    setEditCycleStartDate("");
    setEditCycleCutDate("");
    setEditCycleDueDate("");
  }

  async function updateCycleDates(cycleId) {
    if (!user) return;

    setError("");
    setIsUpdatingCycleDates(true);

    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: cycleId,
          action: "UPDATE_DATES",
          startDate: editCycleStartDate,
          cutDate: editCycleCutDate,
          dueDate: editCycleDueDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudieron actualizar las fechas.");
      }

      cancelEditingCycleDates();
      await loadCycles(user.id);
    } catch (err) {
      setError(err.message || "No se pudieron actualizar las fechas.");
    } finally {
      setIsUpdatingCycleDates(false);
    }
  }

  async function updateStatementAmount(cycleId) {
    if (!user) return;

    setError("");

    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: cycleId,
          action: "UPDATE_STATEMENT",
          statementAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo guardar el estado de cuenta.",
        );
      }

      setEditingStatementCycleId("");
      setStatementAmount("");

      await loadCycles(user.id);
    } catch (err) {
      setError(err.message || "No se pudo guardar el estado de cuenta.");
    }
  }

  async function markCycleAsPaid(cycleId) {
    if (!user) return;

    setError("");

    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: cycleId,
          action: "MARK_AS_PAID",
          paidAt,
          paidAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo marcar como pagado.");
      }

      setPayingCycleId("");
      setPaidAt(getTodayInputValue());
      setPaidAmount("");

      await loadCycles(user.id);
    } catch (err) {
      setError(err.message || "No se pudo marcar como pagado.");
    }
  }

  async function generateCycles() {
    if (!user) return;

    setError("");
    setIsGeneratingCycles(true);

    try {
      const response = await fetch("/api/card-cycles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudieron generar los ciclos.");
      }

      setCycles(data.cycles || []);
    } catch (err) {
      setError(err.message || "No se pudieron generar los ciclos.");
    } finally {
      setIsGeneratingCycles(false);
    }
  }

  async function unmarkCycleAsPaid(cycleId) {
    if (!user) return;

    const confirmed = window.confirm(
      "¿Seguro que quieres deshacer el pago de este ciclo?",
    );

    if (!confirmed) return;

    setError("");

    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: cycleId,
          action: "UNMARK_AS_PAID",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo deshacer el pago.");
      }

      await loadCycles(user.id);
    } catch (err) {
      setError(err.message || "No se pudo deshacer el pago.");
    }
  }

  const totalCards = useMemo(() => cards.length, [cards]);

  const cyclesByMonth = useMemo(() => {
    const grouped = {};

    for (const cycle of cycles) {
      const key = `${cycle.year}-${String(cycle.month).padStart(2, "0")}`;

      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push(cycle);
    }

    return grouped;
  }, [cycles]);

  const currentCycleMonthKey = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
  }, []);

  const cycleMonthTabs = useMemo(() => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonthIndex = currentDate.getMonth();

    return Object.entries(cyclesByMonth)
      .map(([monthKey, monthCycles]) => {
        const [year, month] = monthKey.split("-").map(Number);
        const monthIndex = month - 1;

        const diffMonths =
          (year - currentYear) * 12 + (monthIndex - currentMonthIndex);

        let label = format(
          new Date(Date.UTC(year, monthIndex, 1)),
          "MMMM yyyy",
          { locale: es },
        );

        if (diffMonths === 0) label = "Mes actual";
        if (diffMonths === -1) label = "Mes anterior";
        if (diffMonths === 1) label = "Mes siguiente";

        const title = format(
          new Date(Date.UTC(year, monthIndex, 1)),
          "MMMM yyyy",
          { locale: es },
        );

        return {
          monthKey,
          monthCycles: [...monthCycles].sort((a, b) => {
            return (
              new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
            );
          }),
          label,
          title,
          diffMonths,
        };
      })
      .sort((a, b) => {
        const priority = {
          "-1": 0,
          0: 1,
          1: 2,
        };

        const aPriority = priority[a.diffMonths] ?? 99;
        const bPriority = priority[b.diffMonths] ?? 99;

        if (aPriority !== bPriority) return aPriority - bPriority;

        return a.monthKey.localeCompare(b.monthKey);
      });
  }, [cyclesByMonth]);

  const defaultCycleMonthTab =
    cycleMonthTabs.find((item) => item.monthKey === currentCycleMonthKey)
      ?.monthKey ||
    cycleMonthTabs[0]?.monthKey ||
    "";

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <Spinner className="size-8" />
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 md:py-8">
        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Tarjetas registradas</CardDescription>
              <CardTitle className="text-3xl">{totalCards}</CardTitle>
            </CardHeader>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader className="pb-2">
              <CardDescription>Ciclos generados</CardDescription>
              <CardTitle className="text-3xl">{cycles.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="cards" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="cards">Tarjetas</TabsTrigger>
            <TabsTrigger value="cycles">Ciclos mensuales</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    Nueva tarjeta
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Nombre de tarjeta</Label>
                    <Input
                      value={name}
                      placeholder="Ej. HSBC 1"
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Día de corte habitual</Label>
                      <Input
                        value={usualCutDay}
                        type="number"
                        min="1"
                        max="31"
                        placeholder="Ej. 12"
                        onChange={(event) => setUsualCutDay(event.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Día límite habitual</Label>
                      <Input
                        value={usualDueDay}
                        type="number"
                        min="1"
                        max="31"
                        placeholder="Ej. 2"
                        onChange={(event) => setUsualDueDay(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas opcional</Label>
                    <Input
                      value={notes}
                      placeholder="Ej. Se usa para compras grandes"
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={createCard}
                    disabled={isSaving}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {isSaving ? "Guardando..." : "Agregar tarjeta"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    Tarjetas registradas
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  {cards.length === 0 ? (
                    <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                      Aún no hay tarjetas registradas.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {cards.map((card) => (
                        <div
                          key={card.id}
                          className="rounded-xl border border-border bg-background/60 px-4 py-4"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="mt-1 rounded-lg border border-border bg-muted p-2">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium">{card.name}</p>
                                  <Badge variant="secondary">Activa</Badge>
                                </div>

                                <p className="mt-1 text-sm text-muted-foreground">
                                  Corte día {card.usualCutDay} · Límite día{" "}
                                  {card.usualDueDay}
                                </p>

                                {card.notes ? (
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {card.notes}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => startEditingCard(card)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteCard(card.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {editingCardId === card.id ? (
                            <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
                              <div className="mb-4 flex items-center justify-between gap-4">
                                <p className="text-sm font-medium">
                                  Editar tarjeta
                                </p>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={cancelEditingCard}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2 md:col-span-2">
                                  <Label>Nombre</Label>
                                  <Input
                                    value={editCardName}
                                    onChange={(event) =>
                                      setEditCardName(event.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Día de corte habitual</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editUsualCutDay}
                                    onChange={(event) =>
                                      setEditUsualCutDay(event.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Día límite habitual</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editUsualDueDay}
                                    onChange={(event) =>
                                      setEditUsualDueDay(event.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                  <Label>Notas</Label>
                                  <Input
                                    value={editCardNotes}
                                    onChange={(event) =>
                                      setEditCardNotes(event.target.value)
                                    }
                                  />
                                </div>
                              </div>

                              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <Button
                                  type="button"
                                  onClick={updateCard}
                                  disabled={isUpdatingCard}
                                >
                                  {isUpdatingCard
                                    ? "Guardando..."
                                    : "Guardar cambios"}
                                </Button>

                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={cancelEditingCard}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cycles">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    Ciclos mensuales
                  </CardTitle>
                </div>

                <Button
                  type="button"
                  onClick={generateCycles}
                  disabled={isGeneratingCycles || cards.length === 0}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {isGeneratingCycles ? "Generando..." : "Generar ciclos"}
                </Button>
              </CardHeader>

              <CardContent>
                {cycles.length === 0 ? (
                  <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                    Aún no hay ciclos generados. Agrega tarjetas y presiona
                    “Generar ciclos”.
                  </p>
                ) : (
                  <Tabs defaultValue={defaultCycleMonthTab} className="w-full">
                    <TabsList className="mb-6 flex w-full justify-start overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {cycleMonthTabs.map((monthGroup) => (
                        <TabsTrigger
                          key={monthGroup.monthKey}
                          value={monthGroup.monthKey}
                          className="shrink-0 whitespace-nowrap"
                        >
                          {monthGroup.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {cycleMonthTabs.map((monthGroup) => (
                      <TabsContent
                        key={monthGroup.monthKey}
                        value={monthGroup.monthKey}
                      >
                        <div>
                          <h3 className="mb-3 text-sm font-medium capitalize text-muted-foreground">
                            {monthGroup.title}
                          </h3>

                          <div className="overflow-hidden rounded-xl border border-border">
                            <div className="hidden grid-cols-[1.1fr_1fr_1fr_1fr_1fr_1fr_1fr_1.4fr] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:grid">
                              <div>Tarjeta</div>
                              <div>Corte</div>
                              <div>Límite</div>
                              <div>Calculado</div>
                              <div>Estado cuenta</div>
                              <div>Diferencia</div>
                              <div>Estado</div>
                              <div>Acciones</div>
                            </div>

                            <div className="divide-y divide-border">
                              {monthGroup.monthCycles.map((cycle) => (
                                <div
                                  key={cycle.id}
                                  className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.1fr_1fr_1fr_1fr_1fr_1fr_1fr_1.4fr] md:gap-4"
                                >
                                  <div className="font-medium">
                                    {cycle.card.name}
                                  </div>

                                  <div>{formatCompactDate(cycle.cutDate)}</div>

                                  <div>{formatCompactDate(cycle.dueDate)}</div>

                                  <div className="font-medium">
                                    {formatMoney(cycle.calculatedAmount)}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      G: {formatMoney(cycle.expensesAmount)} ·
                                      S:{" "}
                                      {formatMoney(cycle.subscriptionsAmount)} ·
                                      MSI: {formatMoney(cycle.purchasesAmount)}
                                    </p>
                                  </div>

                                  <div>
                                    {cycle.statementAmount
                                      ? formatMoney(cycle.statementAmount)
                                      : "-"}
                                  </div>

                                  <div
                                    className={
                                      cycle.difference === null ||
                                      cycle.difference === undefined
                                        ? "text-muted-foreground"
                                        : Math.abs(
                                              Number(cycle.difference || 0),
                                            ) > 10
                                          ? "text-red-400"
                                          : "text-emerald-400"
                                    }
                                  >
                                    {cycle.difference === null ||
                                    cycle.difference === undefined
                                      ? "-"
                                      : formatMoney(cycle.difference)}
                                  </div>

                                  <div>
                                    <Badge variant="secondary">
                                      {getStatusLabel(cycle.status)}
                                    </Badge>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() =>
                                          startEditingCycleDates(cycle)
                                        }
                                      >
                                        <CalendarClock className="mr-2 h-4 w-4" />
                                        Fechas
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                          setEditingStatementCycleId(cycle.id);
                                          setStatementAmount(
                                            cycle.statementAmount
                                              ? String(cycle.statementAmount)
                                              : "",
                                          );
                                        }}
                                      >
                                        <FileText className="mr-2 h-4 w-4" />
                                        Estado cuenta
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                          setPayingCycleId(cycle.id);
                                          setPaidAt(getTodayInputValue());
                                          setPaidAmount(
                                            cycle.statementAmount
                                              ? String(cycle.statementAmount)
                                              : "",
                                          );
                                        }}
                                      >
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Pagar
                                      </Button>

                                      {cycle.status === "PAID" ? (
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          size="sm"
                                          onClick={() =>
                                            unmarkCycleAsPaid(cycle.id)
                                          }
                                        >
                                          Deshacer pago
                                        </Button>
                                      ) : null}

                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                          setExpandedCycleId((current) =>
                                            current === cycle.id
                                              ? ""
                                              : cycle.id,
                                          );
                                        }}
                                      >
                                        {expandedCycleId === cycle.id
                                          ? "Ocultar desglose"
                                          : "Ver desglose"}
                                      </Button>
                                    </div>

                                    <CycleActionForms
                                      cycle={cycle}
                                      editingCycleDatesId={editingCycleDatesId}
                                      editCycleStartDate={editCycleStartDate}
                                      setEditCycleStartDate={
                                        setEditCycleStartDate
                                      }
                                      editCycleCutDate={editCycleCutDate}
                                      setEditCycleCutDate={setEditCycleCutDate}
                                      editCycleDueDate={editCycleDueDate}
                                      setEditCycleDueDate={setEditCycleDueDate}
                                      cancelEditingCycleDates={
                                        cancelEditingCycleDates
                                      }
                                      updateCycleDates={updateCycleDates}
                                      isUpdatingCycleDates={
                                        isUpdatingCycleDates
                                      }
                                      editingStatementCycleId={
                                        editingStatementCycleId
                                      }
                                      statementAmount={statementAmount}
                                      setStatementAmount={setStatementAmount}
                                      updateStatementAmount={
                                        updateStatementAmount
                                      }
                                      payingCycleId={payingCycleId}
                                      paidAt={paidAt}
                                      setPaidAt={setPaidAt}
                                      paidAmount={paidAmount}
                                      setPaidAmount={setPaidAmount}
                                      markCycleAsPaid={markCycleAsPaid}
                                    />

                                    {cycle.statementAmount ? (
                                      <p className="text-xs text-muted-foreground">
                                        Estado cuenta:{" "}
                                        {formatMoney(cycle.statementAmount)}
                                      </p>
                                    ) : null}

                                    {cycle.paidAmount ? (
                                      <p className="text-xs text-muted-foreground">
                                        Pagado: {formatMoney(cycle.paidAmount)}
                                      </p>
                                    ) : null}
                                  </div>

                                  {expandedCycleId === cycle.id ? (
                                    <div className="md:col-span-8">
                                      <CycleBreakdown cycle={cycle} />
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}
