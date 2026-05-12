"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Pencil, Plus, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function getPaymentMethodLabel(paymentMethod) {
  if (paymentMethod === "CARD") return "Tarjeta";
  return "Efectivo";
}

export default function SuscripcionesContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [cardId, setCardId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [chargeDay, setChargeDay] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingSubscriptionId, setEditingSubscriptionId] = useState("");
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("CARD");
  const [editCardId, setEditCardId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editChargeDay, setEditChargeDay] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  async function loadInitialData(userId) {
    const [settingsResponse, cardsResponse, subscriptionsResponse] =
      await Promise.all([
        fetch(`/api/settings?userId=${userId}`),
        fetch(`/api/cards?userId=${userId}`),
        fetch(`/api/subscriptions?userId=${userId}`),
      ]);

    const settingsData = await settingsResponse.json();
    const cardsData = await cardsResponse.json();
    const subscriptionsData = await subscriptionsResponse.json();

    if (!settingsResponse.ok) {
      throw new Error(
        settingsData.error || "No se pudieron cargar categorías.",
      );
    }

    if (!cardsResponse.ok) {
      throw new Error(cardsData.error || "No se pudieron cargar tarjetas.");
    }

    if (!subscriptionsResponse.ok) {
      throw new Error(
        subscriptionsData.error || "No se pudieron cargar suscripciones.",
      );
    }

    setCategories(settingsData.categories || []);
    setCards(cardsData.cards || []);
    setSubscriptions(subscriptionsData.subscriptions || []);
  }

  async function loadSubscriptions(userId) {
    const response = await fetch(`/api/subscriptions?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar suscripciones.");
    }

    setSubscriptions(data.subscriptions || []);
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

        await loadInitialData(session.user.id);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createSubscription() {
    if (!user) return;

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          name,
          amount,
          paymentMethod,
          cardId,
          categoryId,
          chargeDay,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar la suscripción.");
      }

      setName("");
      setAmount("");
      setPaymentMethod("CARD");
      setCardId("");
      setCategoryId("");
      setChargeDay("");

      await loadSubscriptions(user.id);
    } catch (err) {
      setError(err.message || "No se pudo guardar la suscripción.");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingSubscription(subscription) {
    setEditingSubscriptionId(subscription.id);
    setEditName(subscription.name || "");
    setEditAmount(String(subscription.amount || ""));
    setEditPaymentMethod(subscription.paymentMethod || "CARD");
    setEditCardId(subscription.cardId || "");
    setEditCategoryId(subscription.categoryId || "");
    setEditChargeDay(String(subscription.chargeDay || ""));
  }

  function cancelEditingSubscription() {
    setEditingSubscriptionId("");
    setEditName("");
    setEditAmount("");
    setEditPaymentMethod("CARD");
    setEditCardId("");
    setEditCategoryId("");
    setEditChargeDay("");
  }

  async function updateSubscription() {
    if (!user || !editingSubscriptionId) return;

    setError("");
    setIsUpdating(true);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingSubscriptionId,
          name: editName,
          amount: editAmount,
          paymentMethod: editPaymentMethod,
          cardId: editCardId,
          categoryId: editCategoryId,
          chargeDay: editChargeDay,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la suscripción.");
      }

      cancelEditingSubscription();
      await loadSubscriptions(user.id);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la suscripción.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteSubscription(id) {
    if (!user) return;

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar esta suscripción?",
    );

    if (!confirmed) return;

    setError("");

    try {
      const response = await fetch(`/api/subscriptions?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      await loadSubscriptions(user.id);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la suscripción.");
    }
  }

  const totalMonthly = useMemo(() => {
    return subscriptions.reduce((sum, subscription) => {
      return sum + Number(subscription.amount || 0);
    }, 0);
  }, [subscriptions]);

  const cardSubscriptions = useMemo(() => {
    return subscriptions.filter(
      (subscription) => subscription.paymentMethod === "CARD",
    );
  }, [subscriptions]);

  const cashSubscriptions = useMemo(() => {
    return subscriptions.filter(
      (subscription) => subscription.paymentMethod === "CASH",
    );
  }, [subscriptions]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          Cargando suscripciones...
        </p>
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">AFP</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Suscripciones
          </h1>
          <p className="mt-2 text-muted-foreground">
            Registra cargos mensuales fijos.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="Total mensual"
            value={formatMoney(totalMonthly)}
          />
          <SummaryCard title="Con tarjeta" value={cardSubscriptions.length} />
          <SummaryCard title="En efectivo" value={cashSubscriptions.length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Nueva suscripción</CardTitle>
              <CardDescription>
                Todas las suscripciones se consideran mensuales y activas.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={name}
                  placeholder="Ej. Netflix, Spotify, iCloud..."
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Monto</Label>
                <Input
                  value={amount}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => {
                    setPaymentMethod(value);

                    if (value === "CASH") {
                      setCardId("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CARD">Tarjeta</SelectItem>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "CARD" ? (
                <div className="space-y-2">
                  <Label>Tarjeta</Label>
                  <Select value={cardId} onValueChange={setCardId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tarjeta" />
                    </SelectTrigger>
                    <SelectContent>
                      {cards.map((card) => (
                        <SelectItem key={card.id} value={card.id}>
                          {card.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {cards.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aún no tienes tarjetas. Agrégalas en Tarjetas.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Día de cobro</Label>
                <Input
                  value={chargeDay}
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ej. 15"
                  onChange={(event) => setChargeDay(event.target.value)}
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={createSubscription}
                disabled={isSaving}
              >
                <Plus className="mr-2 h-4 w-4" />
                {isSaving ? "Guardando..." : "Guardar suscripción"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Suscripciones registradas</CardTitle>
              <CardDescription>
                Cargos mensuales fijos que se sumarán al gasto mensual.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {subscriptions.length === 0 ? (
                <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                  Aún no hay suscripciones registradas.
                </p>
              ) : (
                <div className="grid gap-3">
                  {subscriptions.map((subscription) => (
                    <div
                      key={subscription.id}
                      className="rounded-xl border border-border bg-background/60 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{subscription.name}</p>
                            <Badge variant="secondary">
                              {subscription.category?.name}
                            </Badge>
                          </div>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {getPaymentMethodLabel(subscription.paymentMethod)}
                            {subscription.card
                              ? ` · ${subscription.card.name}`
                              : ""}
                          </p>

                          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Día de cobro: {subscription.chargeDay}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <p className="font-semibold">
                            {formatMoney(subscription.amount)}
                          </p>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              startEditingSubscription(subscription)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteSubscription(subscription.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {editingSubscriptionId === subscription.id ? (
                        <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <p className="text-sm font-medium">
                              Editar suscripción
                            </p>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={cancelEditingSubscription}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Nombre</Label>
                              <Input
                                value={editName}
                                onChange={(event) =>
                                  setEditName(event.target.value)
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Monto</Label>
                              <Input
                                value={editAmount}
                                type="number"
                                min="0"
                                step="0.01"
                                onChange={(event) =>
                                  setEditAmount(event.target.value)
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Método de pago</Label>
                              <Select
                                value={editPaymentMethod}
                                onValueChange={(value) => {
                                  setEditPaymentMethod(value);

                                  if (value === "CASH") {
                                    setEditCardId("");
                                  }
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona método" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CARD">Tarjeta</SelectItem>
                                  <SelectItem value="CASH">Efectivo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {editPaymentMethod === "CARD" ? (
                              <div className="space-y-2">
                                <Label>Tarjeta</Label>
                                <Select
                                  value={editCardId}
                                  onValueChange={setEditCardId}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona tarjeta" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {cards.map((card) => (
                                      <SelectItem key={card.id} value={card.id}>
                                        {card.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}

                            <div className="space-y-2">
                              <Label>Categoría</Label>
                              <Select
                                value={editCategoryId}
                                onValueChange={setEditCategoryId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                  {categories.map((category) => (
                                    <SelectItem
                                      key={category.id}
                                      value={category.id}
                                    >
                                      {category.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Día de cobro</Label>
                              <Input
                                value={editChargeDay}
                                type="number"
                                min="1"
                                max="31"
                                onChange={(event) =>
                                  setEditChargeDay(event.target.value)
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <Button
                              type="button"
                              onClick={updateSubscription}
                              disabled={isUpdating}
                            >
                              {isUpdating ? "Guardando..." : "Guardar cambios"}
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              onClick={cancelEditingSubscription}
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

              <Separator className="my-6" />

              <p className="text-sm text-muted-foreground">
                Más adelante estas suscripciones se integrarán al Dashboard y a
                los ciclos de tarjeta.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ title, value }) {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
