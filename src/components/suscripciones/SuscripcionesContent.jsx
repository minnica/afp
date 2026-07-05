"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, PowerOff, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
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
import PageSkeleton from "@/components/layout/PageSkeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { TableCell, TableRow } from "@/components/ui/table";

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

function getCurrentMonthValue() {
  const today = new Date();
  return String(today.getMonth() + 1);
}

function getCurrentYearValue() {
  const today = new Date();
  return String(today.getFullYear());
}

function getFrequencyLabel(value) {
  const labels = {
    1: "Mensual",
    2: "Cada 2 meses",
    3: "Cada 3 meses",
    6: "Cada 6 meses",
    12: "Anual",
  };

  return labels[Number(value)] || "Mensual";
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
  const [frequencyMonths, setFrequencyMonths] = useState("1");
  const [startMonth, setStartMonth] = useState(getCurrentMonthValue());
  const [startYear, setStartYear] = useState(getCurrentYearValue());

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState("");
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("CARD");
  const [editCardId, setEditCardId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editChargeDay, setEditChargeDay] = useState("");
  const [editFrequencyMonths, setEditFrequencyMonths] = useState("1");
  const [editStartMonth, setEditStartMonth] = useState("");
  const [editStartYear, setEditStartYear] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [subscriptionToDelete, setSubscriptionToDelete] = useState(null);
  const [isToggling, setIsToggling] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [subscriptionToDeactivate, setSubscriptionToDeactivate] = useState(null);
  const [deactivatedAtInput, setDeactivatedAtInput] = useState("");

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

        await ensureUserSetup(session.user);

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
          frequencyMonths,
          startMonth,
          startYear,
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
      setFrequencyMonths("1");
      setStartMonth(getCurrentMonthValue());
      setStartYear(getCurrentYearValue());

      await loadSubscriptions(user.id);
      toast.success("Suscripción guardada exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo guardar la suscripción.");
      toast.error(err.message || "No se pudo guardar la suscripción.");
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
    setEditFrequencyMonths(String(subscription.frequencyMonths || 1));
    setEditStartMonth(
      String(subscription.startMonth || getCurrentMonthValue()),
    );
    setEditStartYear(String(subscription.startYear || getCurrentYearValue()));
    setEditDialogOpen(true);
  }

  function cancelEditingSubscription() {
    setEditDialogOpen(false);
    setEditingSubscriptionId("");
    setEditName("");
    setEditAmount("");
    setEditPaymentMethod("CARD");
    setEditCardId("");
    setEditCategoryId("");
    setEditChargeDay("");
    setEditFrequencyMonths("1");
    setEditStartMonth("");
    setEditStartYear("");
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
          frequencyMonths: editFrequencyMonths,
          startMonth: editStartMonth,
          startYear: editStartYear,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la suscripción.");
      }

      cancelEditingSubscription();
      await loadSubscriptions(user.id);
      toast.success("Cambios guardados exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo actualizar la suscripción.");
      toast.error(err.message || "No se pudo actualizar la suscripción.");
    } finally {
      setIsUpdating(false);
    }
  }

  function getTodayInputValue() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function openDeactivateDialog(subscription) {
    setSubscriptionToDeactivate(subscription);
    setDeactivatedAtInput(getTodayInputValue());
    setDeactivateDialogOpen(true);
  }

  async function confirmDeactivate() {
    if (!user || !subscriptionToDeactivate || isToggling) return;

    setIsToggling(true);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: subscriptionToDeactivate.id,
          toggleActive: true,
          isActive: false,
          deactivatedAt: deactivatedAtInput
            ? new Date(`${deactivatedAtInput}T12:00:00.000Z`).toISOString()
            : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo desactivar la suscripción.");
      }

      setDeactivateDialogOpen(false);
      setSubscriptionToDeactivate(null);
      await loadSubscriptions(user.id);
      toast.success("Suscripción desactivada.");
    } catch (err) {
      toast.error(err.message || "No se pudo desactivar la suscripción.");
    } finally {
      setIsToggling(false);
    }
  }

  async function reactivateSubscription(subscription) {
    if (!user || isToggling) return;

    setIsToggling(true);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: subscription.id,
          toggleActive: true,
          isActive: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo reactivar la suscripción.");
      }

      await loadSubscriptions(user.id);
      toast.success("Suscripción reactivada.");
    } catch (err) {
      toast.error(err.message || "No se pudo reactivar la suscripción.");
    } finally {
      setIsToggling(false);
    }
  }

  async function deleteSubscription(id) {
    if (!user) return;

    setError("");

    try {
      const response = await fetch(`/api/subscriptions?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      setSubscriptionToDelete(null);
      await loadSubscriptions(user.id);
      toast.success("Suscripción eliminada exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar la suscripción.");
      toast.error(err.message || "No se pudo eliminar la suscripción.");
    }
  }

  const subscriptionColumns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => (
          <span
            className={
              row.original.isActive === false
                ? "text-muted-foreground line-through"
                : "font-medium"
            }
          >
            {row.original.name}
          </span>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => (row.isActive === false ? "Inactiva" : "Activa"),
        header: "Estado",
        cell: ({ row }) =>
          row.original.isActive === false ? (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive"
            >
              Inactiva
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-500"
            >
              Activa
            </Badge>
          ),
      },
      {
        id: "category",
        accessorFn: (row) => row.category?.name ?? "",
        header: "Categoría",
        cell: ({ row }) =>
          row.original.category?.name ? (
            <Badge variant="secondary">{row.original.category.name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "paymentMethod",
        accessorFn: (row) =>
          getPaymentMethodLabel(row.paymentMethod) +
          (row.card ? ` · ${row.card.name}` : ""),
        header: "Método",
        cell: ({ row }) => (
          <span className="text-sm">
            {getPaymentMethodLabel(row.original.paymentMethod)}
            {row.original.card ? (
              <span className="text-muted-foreground">
                {" "}· {row.original.card.name}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "chargeDay",
        accessorFn: (row) => Number(row.chargeDay),
        header: "Día",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.chargeDay}</span>
        ),
      },
      {
        id: "frequency",
        accessorFn: (row) => getFrequencyLabel(row.frequencyMonths),
        header: "Frecuencia",
        cell: ({ row }) => (
          <span className="text-sm">
            {getFrequencyLabel(row.original.frequencyMonths)}
          </span>
        ),
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => (
          <span
            className={`whitespace-nowrap font-semibold tabular-nums${row.original.isActive === false ? " text-muted-foreground line-through" : ""}`}
          >
            {formatMoney(row.original.amount)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startEditingSubscription(row.original)}
              disabled={false}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={
                row.original.isActive === false
                  ? "Reactivar suscripción"
                  : "Desactivar suscripción"
              }
              onClick={() =>
                row.original.isActive === false
                  ? reactivateSubscription(row.original)
                  : openDeactivateDialog(row.original)
              }
              disabled={isToggling}
            >
              {row.original.isActive === false ? (
                <RotateCcw className="h-4 w-4 text-emerald-500" />
              ) : (
                <PowerOff className="h-4 w-4 text-destructive" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSubscriptionToDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isToggling],
  );

  if (isLoading) {
    return <PageSkeleton variant="form-table" />;
  }

  return (
    <>
      <AlertDialog
        open={Boolean(subscriptionToDelete)}
        onOpenChange={(open) => {
          if (!open) setSubscriptionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la suscripción{" "}
              {subscriptionToDelete?.name
                ? `"${subscriptionToDelete.name}"`
                : "seleccionada"}{" "}
              por {formatMoney(subscriptionToDelete?.amount || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-800 text-white hover:bg-red-900 focus:ring-red-300"
              onClick={() => deleteSubscription(subscriptionToDelete.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateDialogOpen(false);
            setSubscriptionToDeactivate(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desactivar suscripción</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            ¿Desde cuándo se desactivó{" "}
            <span className="font-medium text-foreground">
              {subscriptionToDeactivate?.name}
            </span>
            ? Los cobros con fecha posterior a este día no se contabilizarán.
          </p>

          <div className="space-y-2">
            <Label>Fecha de desactivación</Label>
            <Input
              type="date"
              value={deactivatedAtInput}
              onChange={(e) => setDeactivatedAtInput(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDeactivateDialogOpen(false);
                setSubscriptionToDeactivate(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeactivate}
              disabled={isToggling || !deactivatedAtInput}
            >
              {isToggling ? "Desactivando..." : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) cancelEditingSubscription();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar suscripción</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Monto</Label>
              <Input
                value={editAmount}
                type="number"
                min="0"
                step="0.01"
                onChange={(event) => setEditAmount(event.target.value)}
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
                <Select value={editCardId} onValueChange={setEditCardId}>
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
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
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
                value={editChargeDay}
                type="number"
                min="1"
                max="31"
                onChange={(event) => setEditChargeDay(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select
                value={editFrequencyMonths}
                onValueChange={setEditFrequencyMonths}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona frecuencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Mensual</SelectItem>
                  <SelectItem value="2">Cada 2 meses</SelectItem>
                  <SelectItem value="3">Cada 3 meses</SelectItem>
                  <SelectItem value="6">Cada 6 meses</SelectItem>
                  <SelectItem value="12">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mes de inicio</Label>
              <Select value={editStartMonth} onValueChange={setEditStartMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Enero</SelectItem>
                  <SelectItem value="2">Febrero</SelectItem>
                  <SelectItem value="3">Marzo</SelectItem>
                  <SelectItem value="4">Abril</SelectItem>
                  <SelectItem value="5">Mayo</SelectItem>
                  <SelectItem value="6">Junio</SelectItem>
                  <SelectItem value="7">Julio</SelectItem>
                  <SelectItem value="8">Agosto</SelectItem>
                  <SelectItem value="9">Septiembre</SelectItem>
                  <SelectItem value="10">Octubre</SelectItem>
                  <SelectItem value="11">Noviembre</SelectItem>
                  <SelectItem value="12">Diciembre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Año de inicio</Label>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={editStartYear}
                onChange={(event) => setEditStartYear(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelEditingSubscription}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={updateSubscription}
              disabled={isUpdating}
            >
              {isUpdating ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main>
        <section className="mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8">
          {error ? (
            <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid min-w-0 gap-5 xl:grid-cols-[420px_1fr]">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Nueva suscripción
                </CardTitle>
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

                <div className="space-y-2">
                  <Label>Frecuencia</Label>
                  <Select
                    value={frequencyMonths}
                    onValueChange={setFrequencyMonths}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Mensual</SelectItem>
                      <SelectItem value="2">Cada 2 meses</SelectItem>
                      <SelectItem value="3">Cada 3 meses</SelectItem>
                      <SelectItem value="6">Cada 6 meses</SelectItem>
                      <SelectItem value="12">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Mes de inicio</Label>
                    <Select value={startMonth} onValueChange={setStartMonth}>
                      <SelectTrigger>
                        <SelectValue placeholder="Mes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Enero</SelectItem>
                        <SelectItem value="2">Febrero</SelectItem>
                        <SelectItem value="3">Marzo</SelectItem>
                        <SelectItem value="4">Abril</SelectItem>
                        <SelectItem value="5">Mayo</SelectItem>
                        <SelectItem value="6">Junio</SelectItem>
                        <SelectItem value="7">Julio</SelectItem>
                        <SelectItem value="8">Agosto</SelectItem>
                        <SelectItem value="9">Septiembre</SelectItem>
                        <SelectItem value="10">Octubre</SelectItem>
                        <SelectItem value="11">Noviembre</SelectItem>
                        <SelectItem value="12">Diciembre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Año de inicio</Label>
                    <Input
                      type="number"
                      min="2000"
                      max="2100"
                      value={startYear}
                      onChange={(event) => setStartYear(event.target.value)}
                    />
                  </div>
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

            <div className="min-w-0">
              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    Suscripciones registradas
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <DataTable
                    columns={subscriptionColumns}
                    data={subscriptions}
                    filterGlobal
                    filterPlaceholder="Buscar suscripción..."
                    pageSize={10}
                    pageSizeOptions={[5, 10, 25, 50]}
                    footerRow={(table) => {
                      const rows = table.getFilteredRowModel().rows;
                      const total = rows
                        .filter((row) => row.original.isActive !== false)
                        .reduce(
                          (sum, row) =>
                            sum + Number(row.original.amount || 0),
                          0,
                        );
                      return (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-right text-sm font-medium text-muted-foreground"
                          >
                            Total activas
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            {formatMoney(total)}
                          </TableCell>
                          <TableCell />
                          <TableCell />
                        </TableRow>
                      );
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
