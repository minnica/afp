"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import CyclesDataTable from "@/components/tarjetas/CyclesDataTable";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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

  const [editingCardId, setEditingCardId] = useState("");
  const [editCardName, setEditCardName] = useState("");
  const [editUsualCutDay, setEditUsualCutDay] = useState("");
  const [editUsualDueDay, setEditUsualDueDay] = useState("");
  const [editCardNotes, setEditCardNotes] = useState("");
  const [isUpdatingCard, setIsUpdatingCard] = useState(false);

  async function loadCards(userId) {
    const response = await fetch(`/api/cards?userId=${userId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar las tarjetas.");
    setCards(data.cards || []);
  }

  async function loadCycles(userId) {
    const response = await fetch(`/api/card-cycles?userId=${userId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar los ciclos.");
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session.user.id, email: session.user.email }),
        });

        await Promise.all([loadCards(session.user.id), loadCycles(session.user.id)]);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name, usualCutDay, usualDueDay, notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear la tarjeta.");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCardId,
          name: editCardName,
          usualCutDay: editUsualCutDay,
          usualDueDay: editUsualDueDay,
          notes: editCardNotes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la tarjeta.");
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
    const confirmed = window.confirm("¿Seguro que quieres eliminar esta tarjeta?");
    if (!confirmed) return;
    setError("");
    try {
      const response = await fetch(`/api/cards?id=${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar la tarjeta.");
      await Promise.all([loadCards(user.id), loadCycles(user.id)]);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la tarjeta.");
    }
  }

  async function updateCycleDates(cycleId, { startDate, cutDate, dueDate }) {
    if (!user) return;
    setError("");
    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cycleId,
          action: "UPDATE_DATES",
          startDate,
          cutDate,
          dueDate,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron actualizar las fechas.");
      await loadCycles(user.id);
    } catch (err) {
      setError(err.message || "No se pudieron actualizar las fechas.");
    }
  }

  async function updateStatementAmount(cycleId, amount) {
    if (!user) return;
    setError("");
    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cycleId, action: "UPDATE_STATEMENT", statementAmount: amount }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo guardar el estado de cuenta.");
      await loadCycles(user.id);
    } catch (err) {
      setError(err.message || "No se pudo guardar el estado de cuenta.");
    }
  }

  async function markCycleAsPaid(cycleId, { paidAt, paidAmount }) {
    if (!user) return;
    setError("");
    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cycleId, action: "MARK_AS_PAID", paidAt, paidAmount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo marcar como pagado.");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron generar los ciclos.");
      setCycles(data.cycles || []);
    } catch (err) {
      setError(err.message || "No se pudieron generar los ciclos.");
    } finally {
      setIsGeneratingCycles(false);
    }
  }

  async function unmarkCycleAsPaid(cycleId) {
    if (!user) return;
    const confirmed = window.confirm("¿Seguro que quieres deshacer el pago de este ciclo?");
    if (!confirmed) return;
    setError("");
    try {
      const response = await fetch("/api/card-cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cycleId, action: "UNMARK_AS_PAID" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo deshacer el pago.");
      await loadCycles(user.id);
    } catch (err) {
      setError(err.message || "No se pudo deshacer el pago.");
    }
  }

  const totalCards = useMemo(() => cards.length, [cards]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const [activeMonthTab, setActiveMonthTab] = useState(
    String(new Date().getMonth()),
  );

  const cyclesByMonthIndex = useMemo(() => {
    const grouped = {};
    for (const cycle of cycles) {
      if (cycle.year !== currentYear) continue;
      const monthIndex = cycle.month - 1;
      if (!grouped[monthIndex]) grouped[monthIndex] = [];
      grouped[monthIndex].push(cycle);
    }
    for (const monthIndex of Object.keys(grouped)) {
      grouped[monthIndex].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    }
    return grouped;
  }, [cycles, currentYear]);

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <Spinner className="size-8" />
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-7xl flex-col px-4 py-5 md:py-8">
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

        <Tabs defaultValue="cycles" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="cards">Tarjetas</TabsTrigger>
            <TabsTrigger value="cycles">Ciclos mensuales</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-center text-lg font-semibold uppercase">
                    Nueva tarjeta
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Nombre de tarjeta</Label>
                    <Input
                      value={name}
                      placeholder="Ej. HSBC 1"
                      onChange={(e) => setName(e.target.value)}
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
                        onChange={(e) => setUsualCutDay(e.target.value)}
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
                        onChange={(e) => setUsualDueDay(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas opcional</Label>
                    <Input
                      value={notes}
                      placeholder="Ej. Se usa para compras grandes"
                      onChange={(e) => setNotes(e.target.value)}
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
                  <CardTitle className="text-center text-lg font-semibold uppercase">
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
                                  Corte día {card.usualCutDay} · Límite día {card.usualDueDay}
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
                                <p className="text-sm font-medium">Editar tarjeta</p>

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
                                    onChange={(e) => setEditCardName(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Día de corte habitual</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editUsualCutDay}
                                    onChange={(e) => setEditUsualCutDay(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Día límite habitual</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editUsualDueDay}
                                    onChange={(e) => setEditUsualDueDay(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                  <Label>Notas</Label>
                                  <Input
                                    value={editCardNotes}
                                    onChange={(e) => setEditCardNotes(e.target.value)}
                                  />
                                </div>
                              </div>

                              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <Button
                                  type="button"
                                  onClick={updateCard}
                                  disabled={isUpdatingCard}
                                >
                                  {isUpdatingCard ? "Guardando..." : "Guardar cambios"}
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
                  <CardTitle className="text-center text-lg font-semibold uppercase">
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
                    Aún no hay ciclos generados. Agrega tarjetas y presiona "Generar ciclos".
                  </p>
                ) : (
                  <Tabs value={activeMonthTab} onValueChange={setActiveMonthTab}>
                    <TabsList className="mb-6 h-auto flex-wrap">
                      {MONTH_NAMES.map((name, monthIndex) => (
                        <TabsTrigger key={monthIndex} value={String(monthIndex)}>
                          {name}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {MONTH_NAMES.map((name, monthIndex) => (
                      <TabsContent key={monthIndex} value={String(monthIndex)}>
                        <h3 className="mb-4 text-sm font-medium capitalize text-muted-foreground">
                          {name} {currentYear}
                        </h3>
                        <CyclesDataTable
                          cycles={cyclesByMonthIndex[monthIndex] || []}
                          updateCycleDates={updateCycleDates}
                          updateStatementAmount={updateStatementAmount}
                          markCycleAsPaid={markCycleAsPaid}
                          unmarkCycleAsPaid={unmarkCycleAsPaid}
                        />
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
