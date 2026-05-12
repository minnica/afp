"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CreditCard, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatDate(dateString) {
  return format(new Date(dateString), "d MMM yyyy", { locale: es });
}

function getStatusLabel(status) {
  const labels = {
    ACTIVE: "Activa",
    PAID_OFF: "Liquidada",
    CANCELLED: "Cancelada",
    ADJUSTED: "Ajustada",
  };

  return labels[status] || status;
}

export default function ComprasAMesesContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const [cardId, setCardId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(getTodayInputValue());
  const [concept, setConcept] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [months, setMonths] = useState("");
  const [manualMonthlyPayment, setManualMonthlyPayment] = useState("");
  const [initialPaymentsMade, setInitialPaymentsMade] = useState("0");
  const [personId, setPersonId] = useState("NONE");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadInitialData(userId) {
    const [settingsResponse, cardsResponse, purchasesResponse] =
      await Promise.all([
        fetch(`/api/settings?userId=${userId}`),
        fetch(`/api/cards?userId=${userId}`),
        fetch(`/api/installment-purchases?userId=${userId}`),
      ]);

    const settingsData = await settingsResponse.json();
    const cardsData = await cardsResponse.json();
    const purchasesData = await purchasesResponse.json();

    if (!settingsResponse.ok) {
      throw new Error(settingsData.error || "No se pudo cargar configuración.");
    }

    if (!cardsResponse.ok) {
      throw new Error(cardsData.error || "No se pudieron cargar tarjetas.");
    }

    if (!purchasesResponse.ok) {
      throw new Error(
        purchasesData.error || "No se pudieron cargar compras a meses.",
      );
    }

    setCards(cardsData.cards || []);
    setCategories(settingsData.categories || []);
    setPeople(settingsData.people || []);
    setPurchases(purchasesData.purchases || []);
  }

  async function loadPurchases(userId) {
    const response = await fetch(`/api/installment-purchases?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar compras a meses.");
    }

    setPurchases(data.purchases || []);
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

  async function createPurchase() {
    if (!user) return;

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/installment-purchases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          cardId,
          purchaseDate,
          concept,
          totalAmount,
          months,
          manualMonthlyPayment,
          initialPaymentsMade,
          personId: personId === "NONE" ? null : personId,
          categoryId,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar la compra.");
      }

      setCardId("");
      setPurchaseDate(getTodayInputValue());
      setConcept("");
      setTotalAmount("");
      setMonths("");
      setManualMonthlyPayment("");
      setInitialPaymentsMade("0");
      setPersonId("NONE");
      setCategoryId("");
      setNotes("");

      await loadPurchases(user.id);
    } catch (err) {
      setError(err.message || "No se pudo guardar la compra.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deletePurchase(id) {
    if (!user) return;

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar esta compra a meses?",
    );

    if (!confirmed) return;

    setError("");

    try {
      const response = await fetch(`/api/installment-purchases?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      await loadPurchases(user.id);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la compra.");
    }
  }

  const activePurchases = useMemo(() => {
    return purchases.filter((purchase) => purchase.status === "ACTIVE");
  }, [purchases]);

  const paidOffPurchases = useMemo(() => {
    return purchases.filter((purchase) => purchase.status === "PAID_OFF");
  }, [purchases]);

  const summary = useMemo(() => {
    return activePurchases.reduce(
      (acc, purchase) => {
        acc.monthly += Number(purchase.monthlyPaymentUsed || 0);
        acc.pending += Number(purchase.remainingBalance || 0);
        return acc;
      },
      {
        monthly: 0,
        pending: 0,
      },
    );
  }, [activePurchases]);

  const calculatedMonthlyPayment = useMemo(() => {
    const numericTotal = Number(totalAmount || 0);
    const numericMonths = Number(months || 0);

    if (!numericTotal || !numericMonths) return 0;

    return numericTotal / numericMonths;
  }, [totalAmount, months]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          Cargando compras a meses...
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
            Compras a meses
          </h1>
          <p className="mt-2 text-muted-foreground">
            Controla compras diferidas, mensualidades y saldos pendientes.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="Mensualidades activas"
            value={formatMoney(summary.monthly)}
          />
          <SummaryCard
            title="Saldo pendiente"
            value={formatMoney(summary.pending)}
          />
          <SummaryCard title="Compras activas" value={activePurchases.length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Nueva compra</CardTitle>
              <CardDescription>
                Si seleccionas persona, se creará una cuenta por cobrar
                automática.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
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
              </div>

              <div className="space-y-2">
                <Label>Fecha de compra</Label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Concepto</Label>
                <Input
                  value={concept}
                  placeholder="Ej. Celular, laptop, consola..."
                  onChange={(event) => setConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Monto total</Label>
                <Input
                  value={totalAmount}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setTotalAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Número de meses</Label>
                <Input
                  value={months}
                  type="number"
                  min="1"
                  placeholder="Ej. 12"
                  onChange={(event) => setMonths(event.target.value)}
                />
              </div>

              <div className="rounded-xl border border-border bg-background/50 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Pago mensual calculado
                </p>
                <p className="text-xl font-semibold">
                  {formatMoney(calculatedMonthlyPayment)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Pago mensual manual opcional</Label>
                <Input
                  value={manualMonthlyPayment}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Opcional"
                  onChange={(event) =>
                    setManualMonthlyPayment(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Pagos ya realizados</Label>
                <Input
                  value={initialPaymentsMade}
                  type="number"
                  min="0"
                  placeholder="0"
                  onChange={(event) =>
                    setInitialPaymentsMade(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Persona, si aplica</Label>
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin persona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sin persona</SelectItem>
                    {people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {personId !== "NONE" ? (
                  <p className="text-xs text-muted-foreground">
                    Se creará una cuenta por cobrar por el monto total.
                  </p>
                ) : null}
              </div>

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
                <Label>Notas opcional</Label>
                <Textarea
                  value={notes}
                  placeholder="Detalles adicionales..."
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={createPurchase}
                disabled={isSaving}
              >
                <Plus className="mr-2 h-4 w-4" />
                {isSaving ? "Guardando..." : "Guardar compra"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle>Compras registradas</CardTitle>
              <CardDescription>
                Consulta compras activas, liquidadas y saldos pendientes.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Tabs defaultValue="active" className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="active">
                    Activas ({activePurchases.length})
                  </TabsTrigger>
                  <TabsTrigger value="paid">
                    Liquidadas ({paidOffPurchases.length})
                  </TabsTrigger>
                  <TabsTrigger value="all">
                    Todas ({purchases.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                  <PurchasesList
                    items={activePurchases}
                    onDelete={deletePurchase}
                  />
                </TabsContent>

                <TabsContent value="paid">
                  <PurchasesList
                    items={paidOffPurchases}
                    onDelete={deletePurchase}
                  />
                </TabsContent>

                <TabsContent value="all">
                  <PurchasesList items={purchases} onDelete={deletePurchase} />
                </TabsContent>
              </Tabs>

              <Separator className="my-6" />

              <p className="text-sm text-muted-foreground">
                Estas mensualidades se integrarán después al cálculo de tarjetas
                y Dashboard.
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

function PurchasesList({ items, onDelete }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        No hay compras para mostrar.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((purchase) => (
        <div
          key={purchase.id}
          className="rounded-xl border border-border bg-background/60 px-4 py-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{purchase.concept}</p>
                <Badge variant="secondary">
                  {getStatusLabel(purchase.status)}
                </Badge>
                <Badge variant="outline">{purchase.category?.name}</Badge>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(purchase.purchaseDate)} · {purchase.card?.name}
              </p>

              {purchase.person ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Persona: {purchase.person.name}
                </p>
              ) : null}

              {purchase.notes ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {purchase.notes}
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(purchase.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="font-medium">{formatMoney(purchase.totalAmount)}</p>
            </div>

            <div>
              <p className="text-muted-foreground">Mensualidad</p>
              <p className="font-medium">
                {formatMoney(purchase.monthlyPaymentUsed)}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Mes actual</p>
              <p className="font-medium">
                {purchase.currentMonth}/{purchase.months}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Pendiente</p>
              <p className="font-medium">
                {formatMoney(purchase.remainingBalance)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
