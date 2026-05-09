"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Plus, RefreshCcw, Trash2 } from "lucide-react";
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

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Cargando tarjetas...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">AFP</p>
          <h1 className="text-3xl font-semibold tracking-tight">Tarjetas</h1>
          <p className="text-muted-foreground">
            Registra tus tarjetas y controla sus ciclos reales de corte y pago.
          </p>
        </div>

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
                  <CardTitle>Nueva tarjeta</CardTitle>
                  <CardDescription>
                    Usa nombres simples como BBVA, HSBC 1, HSBC 2, Nu o
                    Santander.
                  </CardDescription>
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
                  <CardTitle>Tarjetas registradas</CardTitle>
                  <CardDescription>
                    Después generaremos ciclos mensuales para calcular pagos por
                    corte.
                  </CardDescription>
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
                          className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/60 px-4 py-4"
                        >
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

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteCard(card.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                  <CardTitle>Ciclos mensuales</CardTitle>
                  <CardDescription>
                    Genera ciclos del mes anterior, actual y siguiente usando
                    los días habituales.
                  </CardDescription>
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
                  <div className="space-y-8">
                    {Object.entries(cyclesByMonth).map(
                      ([monthKey, monthCycles]) => (
                        <div key={monthKey}>
                          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                            {monthKey}
                          </h3>

                          <div className="overflow-hidden rounded-xl border border-border">
                            <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:grid">
                              <div>Tarjeta</div>
                              <div>Inicio</div>
                              <div>Corte</div>
                              <div>Límite pago</div>
                              <div>Estado</div>
                            </div>

                            <div className="divide-y divide-border">
                              {monthCycles.map((cycle) => (
                                <div
                                  key={cycle.id}
                                  className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] md:gap-4"
                                >
                                  <div className="font-medium">
                                    {cycle.card.name}
                                  </div>
                                  <div className="text-muted-foreground">
                                    {formatDate(cycle.startDate)}
                                  </div>
                                  <div>{formatCompactDate(cycle.cutDate)}</div>
                                  <div>{formatCompactDate(cycle.dueDate)}</div>
                                  <div>
                                    <Badge variant="secondary">
                                      {getStatusLabel(cycle.status)}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}

                <Separator className="my-6" />

                <p className="text-sm text-muted-foreground">
                  Más adelante podrás editar fechas reales si el banco mueve el
                  corte o límite por 1 o 2 días.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}
