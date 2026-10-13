"use client";

import { useCreationDraft } from "@/hooks/use-creation-draft";
import { useIsMobile } from "@/hooks/use-mobile";

import CreateRecordSurface, { useCreateDialogMode } from "@/components/ui/create-record-surface";

import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { PaymentMethodSelector } from "@/components/ui/payment-method-selector";

import { SearchableSelect } from "@/components/ui/searchable-select";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, PowerOff, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";
import { toast } from "@/components/ui/sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogDescription,
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
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const mobileNavigation = useIsMobile();
  const compactEntry = useCreateDialogMode();
  const [createError, setCreateError] = useState(null);

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

  useCreationDraft({
    name: "suscripciones",
    userId: user?.id,
    enabled: mobileNavigation,
    values: { name, amount, paymentMethod, cardId, categoryId, chargeDay, frequencyMonths, startMonth, startYear },
    setters: { name: setName, amount: setAmount, paymentMethod: setPaymentMethod, cardId: setCardId, categoryId: setCategoryId, chargeDay: setChargeDay, frequencyMonths: setFrequencyMonths, startMonth: setStartMonth, startYear: setStartYear },
  });

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
    if (!user || isSaving) return false;

    setCreateError(null);
    setError("");
    setIsSaving(true);

    let saved = false;
    const toastOptions = compactEntry ? { position: "top-center" } : undefined;
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

      saved = true;
      setName("");
      setAmount("");
      setChargeDay("");

      await loadSubscriptions(user.id);
      toast.success("Suscripción guardada exitosamente.", toastOptions);
      return true;
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        toast.success("Suscripción guardada exitosamente.", toastOptions);
        return true;
      }
      setCreateError({ message: err.message || "No se pudo guardar la suscripción." });
      return false;
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
            <Button aria-label="Editar"
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
            <Button aria-label="Eliminar"
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
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
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
              variant="destructive"
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
        <DialogContent onCloseAutoFocus={restoreFocus} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desactivar suscripción</DialogTitle>
            <DialogDescription className="sr-only">Revisa la información antes de confirmar los cambios.</DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            ¿Desde cuándo se desactivó{" "}
            <span className="font-medium text-foreground">
              {subscriptionToDeactivate?.name}
            </span>
            ? Los cobros con fecha posterior a este día no se contabilizarán.
          </p>

          <div className="space-y-2">
            <Label htmlFor="subscription-deactivation-date">Fecha de desactivación</Label>
            <DatePicker
              id="subscription-deactivation-date"
              aria-label="Fecha de desactivación"
              value={deactivatedAtInput}
              onChange={setDeactivatedAtInput}
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
        <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar suscripción</DialogTitle>
            <DialogDescription className="sr-only">Actualiza los datos y guarda los cambios.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="suscripciones-field-1">Nombre</Label>
              <Input
                id="suscripciones-field-1"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="suscripciones-field-2">Monto</Label>
              <Input
                id="suscripciones-field-2"
                value={editAmount}
                type="number"
                formatNumber
                min="0"
                step="0.01"
                onChange={(event) => setEditAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label id="suscripciones-field-3-label">Método de pago</Label>
              <PaymentMethodSelector
                value={editPaymentMethod}
                onValueChange={value => {
                  setEditPaymentMethod(value);
                  if (value === "CASH") {
                    setEditCardId("");
                  }
                }}
                id="suscripciones-field-3"
              />
            </div>

            {editPaymentMethod === "CARD" ? (
              <div className="space-y-2">
                <Label htmlFor="suscripciones-field-4">Tarjeta</Label>
                <ResponsiveSelect
                  value={editCardId}
                  onValueChange={setEditCardId}
                  id="suscripciones-field-4"
                  title="Seleccionar tarjeta"
                  placeholder="Selecciona tarjeta"
                  options={cards.map(card => ({
                    value: String(card.id),
                    label: String(card.name)
                  }))}
                  searchable="auto"
                  searchPlaceholder="Buscar tarjeta…"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="suscripciones-field-5">Categoría</Label>
              <SearchableSelect
                value={editCategoryId}
                onValueChange={setEditCategoryId}
                id="suscripciones-field-5"
                title="Seleccionar categoría"
                placeholder="Selecciona categoría"
                searchPlaceholder="Buscar categoría…"
                options={categories.map(item => ({
                  value: item.id,
                  label: item.name
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="suscripciones-field-6">Día de cobro</Label>
              <Input
                id="suscripciones-field-6"
                value={editChargeDay}
                type="number"
                min="1"
                max="31"
                onChange={(event) => setEditChargeDay(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="suscripciones-field-7">Frecuencia</Label>
              <ResponsiveSelect
                value={editFrequencyMonths}
                onValueChange={setEditFrequencyMonths}
                id="suscripciones-field-7"
                title="Seleccionar frecuencia"
                placeholder="Selecciona frecuencia"
                options={[{
                  value: "1",
                  label: "Mensual"
                }, {
                  value: "2",
                  label: "Cada 2 meses"
                }, {
                  value: "3",
                  label: "Cada 3 meses"
                }, {
                  value: "6",
                  label: "Cada 6 meses"
                }, {
                  value: "12",
                  label: "Anual"
                }]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="suscripciones-field-8">Mes de inicio</Label>
              <ResponsiveSelect
                value={editStartMonth}
                onValueChange={setEditStartMonth}
                id="suscripciones-field-8"
                title="Seleccionar mes"
                placeholder="Mes"
                options={[{
                  value: "1",
                  label: "Enero"
                }, {
                  value: "2",
                  label: "Febrero"
                }, {
                  value: "3",
                  label: "Marzo"
                }, {
                  value: "4",
                  label: "Abril"
                }, {
                  value: "5",
                  label: "Mayo"
                }, {
                  value: "6",
                  label: "Junio"
                }, {
                  value: "7",
                  label: "Julio"
                }, {
                  value: "8",
                  label: "Agosto"
                }, {
                  value: "9",
                  label: "Septiembre"
                }, {
                  value: "10",
                  label: "Octubre"
                }, {
                  value: "11",
                  label: "Noviembre"
                }, {
                  value: "12",
                  label: "Diciembre"
                }]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="suscripciones-field-9">Año de inicio</Label>
              <Input
                id="suscripciones-field-9"
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

      <main onClickCapture={captureFocus}>
        <section className={`mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8 ${compactEntry ? "pb-28!" : ""}`}>
          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className={`grid min-w-0 gap-5 ${compactEntry ? "" : "xl:grid-cols-[420px_1fr]"}`}>
            <CreateRecordSurface
              compact={compactEntry}
              title="Nueva suscripción"
              saveLabel="Guardar suscripción"
              error={createError}
              isSaving={isSaving}
              onSubmit={createSubscription}
            >
              <div className="space-y-2">
                <Label htmlFor="suscripciones-field-10">Nombre</Label>
                <Input
                  id="suscripciones-field-10"
                  value={name}
                  placeholder="Ej. Netflix, Spotify, iCloud..."
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="suscripciones-field-11">Monto</Label>
                <Input
                  id="suscripciones-field-11"
                  value={amount}
                  type="number"
                  formatNumber
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label id="suscripciones-field-12-label">Método de pago</Label>
                <PaymentMethodSelector
                  value={paymentMethod}
                  onValueChange={value => {
                    setPaymentMethod(value);
                    if (value === "CASH") {
                      setCardId("");
                    }
                  }}
                  id="suscripciones-field-12"
                />
              </div>

              {paymentMethod === "CARD" ? (
                <div className="space-y-2">
                  <Label htmlFor="suscripciones-field-13">Tarjeta</Label>
                  <ResponsiveSelect
                    value={cardId}
                    onValueChange={setCardId}
                    id="suscripciones-field-13"
                    title="Seleccionar tarjeta"
                    placeholder="Selecciona tarjeta"
                    options={cards.map(card => ({
                      value: String(card.id),
                      label: String(card.name)
                    }))}
                    searchable="auto"
                    searchPlaceholder="Buscar tarjeta…"
                  />

                  {cards.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aún no tienes tarjetas. Agrégalas en Tarjetas.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="suscripciones-field-14">Categoría</Label>
                <SearchableSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  id="suscripciones-field-14"
                  title="Seleccionar categoría"
                  placeholder="Selecciona categoría"
                  searchPlaceholder="Buscar categoría…"
                  options={categories.map(item => ({
                    value: item.id,
                    label: item.name
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="suscripciones-field-15">Día de cobro</Label>
                <Input
                  id="suscripciones-field-15"
                  value={chargeDay}
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ej. 15"
                  onChange={(event) => setChargeDay(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="suscripciones-field-16">Frecuencia</Label>
                <ResponsiveSelect
                  value={frequencyMonths}
                  onValueChange={setFrequencyMonths}
                  id="suscripciones-field-16"
                  title="Seleccionar frecuencia"
                  placeholder="Selecciona frecuencia"
                  options={[{
                    value: "1",
                    label: "Mensual"
                  }, {
                    value: "2",
                    label: "Cada 2 meses"
                  }, {
                    value: "3",
                    label: "Cada 3 meses"
                  }, {
                    value: "6",
                    label: "Cada 6 meses"
                  }, {
                    value: "12",
                    label: "Anual"
                  }]}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="suscripciones-field-17">Mes de inicio</Label>
                  <ResponsiveSelect
                    value={startMonth}
                    onValueChange={setStartMonth}
                    id="suscripciones-field-17"
                    title="Seleccionar mes"
                    placeholder="Mes"
                    options={[{
                      value: "1",
                      label: "Enero"
                    }, {
                      value: "2",
                      label: "Febrero"
                    }, {
                      value: "3",
                      label: "Marzo"
                    }, {
                      value: "4",
                      label: "Abril"
                    }, {
                      value: "5",
                      label: "Mayo"
                    }, {
                      value: "6",
                      label: "Junio"
                    }, {
                      value: "7",
                      label: "Julio"
                    }, {
                      value: "8",
                      label: "Agosto"
                    }, {
                      value: "9",
                      label: "Septiembre"
                    }, {
                      value: "10",
                      label: "Octubre"
                    }, {
                      value: "11",
                      label: "Noviembre"
                    }, {
                      value: "12",
                      label: "Diciembre"
                    }]}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="suscripciones-field-18">Año de inicio</Label>
                  <Input
                    id="suscripciones-field-18"
                    type="number"
                    min="2000"
                    max="2100"
                    value={startYear}
                    onChange={(event) => setStartYear(event.target.value)}
                  />
                </div>
              </div>
            </CreateRecordSurface>

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
