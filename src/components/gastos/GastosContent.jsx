"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Filter, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
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
import { toast } from "sonner";
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

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthStartInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatExpenseDate(dateString) {
  return format(new Date(dateString), "d MMM yyyy", { locale: es });
}

function getPaymentMethodLabel(paymentMethod) {
  if (paymentMethod === "CARD") return "Tarjeta";
  return "Efectivo";
}

export default function GastosContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [date, setDate] = useState(getTodayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [cardId, setCardId] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  const [filterStartDate, setFilterStartDate] = useState(
    getMonthStartInputValue(),
  );
  const [filterEndDate, setFilterEndDate] = useState(getTodayInputValue());
  const [filterCategoryId, setFilterCategoryId] = useState("ALL");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("ALL");
  const [filterCardId, setFilterCardId] = useState("ALL");
  const [filterConcept, setFilterConcept] = useState("");

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState("");

  const [people, setPeople] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);

  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [personId, setPersonId] = useState("");
  const [receivableMode, setReceivableMode] = useState("CREATE");
  const [receivableAccountId, setReceivableAccountId] = useState("");
  const [payableAccountId, setPayableAccountId] = useState("NONE");

  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("CASH");
  const [editCardId, setEditCardId] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [expenseToDelete, setExpenseToDelete] = useState(null);

  async function loadInitialData(userId) {
    const [settingsResponse, cardsResponse, expensesResponse] =
      await Promise.all([
        fetch(`/api/settings?userId=${userId}`),
        fetch(`/api/cards?userId=${userId}`),
        fetch(buildExpensesUrl(userId)),
      ]);

    const settingsData = await settingsResponse.json();
    const cardsData = await cardsResponse.json();
    const expensesData = await expensesResponse.json();

    if (!settingsResponse.ok) {
      throw new Error(
        settingsData.error || "No se pudieron cargar categorías.",
      );
    }

    if (!cardsResponse.ok) {
      throw new Error(cardsData.error || "No se pudieron cargar tarjetas.");
    }

    if (!expensesResponse.ok) {
      throw new Error(expensesData.error || "No se pudieron cargar gastos.");
    }

    setCategories(settingsData.categories || []);
    setPeople(settingsData.people || []);
    setCards(cardsData.cards || []);
    setExpenses(expensesData.expenses || []);

    const receivablesResponse = await fetch(
      `/api/receivables?userId=${userId}`,
    );
    const receivablesData = await receivablesResponse.json();

    if (!receivablesResponse.ok) {
      throw new Error(
        receivablesData.error || "No se pudieron cargar cuentas por cobrar.",
      );
    }

    setReceivables(receivablesData.receivables || []);

    const payablesResponse = await fetch(`/api/payables?userId=${userId}`);
    const payablesData = await payablesResponse.json();

    if (!payablesResponse.ok) {
      throw new Error(
        payablesData.error || "No se pudieron cargar cuentas por pagar.",
      );
    }

    setPayables(payablesData.payables || []);
  }

  function buildExpensesUrl(userId) {
    const params = new URLSearchParams();

    params.set("userId", userId);

    if (filterStartDate) params.set("startDate", filterStartDate);
    if (filterEndDate) params.set("endDate", filterEndDate);
    if (filterCategoryId !== "ALL") params.set("categoryId", filterCategoryId);
    if (filterPaymentMethod !== "ALL")
      params.set("paymentMethod", filterPaymentMethod);
    if (filterCardId !== "ALL") params.set("cardId", filterCardId);
    if (filterConcept.trim()) params.set("concept", filterConcept.trim());

    return `/api/expenses?${params.toString()}`;
  }

  async function loadExpenses(userId) {
    const response = await fetch(buildExpensesUrl(userId));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar gastos.");
    }

    setExpenses(data.expenses || []);
  }

  async function loadReceivables(userId) {
    const response = await fetch(`/api/receivables?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "No se pudieron cargar cuentas por cobrar.",
      );
    }

    setReceivables(data.receivables || []);
  }

  async function loadPayables(userId) {
    const response = await fetch(`/api/payables?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar cuentas por pagar.");
    }

    setPayables(data.payables || []);
  }

  useEffect(() => {
    async function checkSession() {
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
        setIsCheckingSession(false);
      }
    }

    checkSession();
  }, [router]);

  async function createExpense() {
    if (!user) return;

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          date,
          paymentMethod,
          cardId,
          concept,
          amount,
          categoryId,
          notes,
          personId,
          receivableAccountId:
            payableAccountId === "NONE" && receivableMode === "EXISTING"
              ? receivableAccountId
              : null,
          payableAccountId:
            payableAccountId === "NONE" ? null : payableAccountId,
          createReceivable: Boolean(
            personId &&
            receivableMode === "CREATE" &&
            payableAccountId === "NONE",
          ),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el gasto.");
      }

      setConcept("");
      setAmount("");
      setNotes("");
      setShowMoreOptions(false);
      setPersonId("");
      setReceivableMode("CREATE");
      setReceivableAccountId("");
      setPayableAccountId("NONE");
      await loadExpenses(user.id);
      await loadReceivables(user.id);
      await loadPayables(user.id);
      toast.success("Gasto guardado exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el gasto.");
      toast.error(err.message || "No se pudo guardar el gasto.");
    } finally {
      setIsSaving(false);
    }
  }

  async function applyFilters() {
    if (!user) return;

    setError("");
    setIsFiltering(true);

    try {
      await loadExpenses(user.id);
    } catch (err) {
      setError(err.message || "No se pudieron aplicar filtros.");
    } finally {
      setIsFiltering(false);
    }
  }

  async function resetFilters() {
    if (!user) return;

    setFilterStartDate(getMonthStartInputValue());
    setFilterEndDate(getTodayInputValue());
    setFilterCategoryId("ALL");
    setFilterPaymentMethod("ALL");
    setFilterCardId("ALL");
    setFilterConcept("");

    setTimeout(() => {
      loadExpenses(user.id).catch((err) => {
        setError(err.message || "No se pudieron limpiar filtros.");
      });
    }, 0);
  }

  function toDateInputValue(dateString) {
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function startEditingExpense(expense) {
    setEditingExpenseId(expense.id);
    setEditDate(toDateInputValue(expense.date));
    setEditPaymentMethod(expense.paymentMethod);
    setEditCardId(expense.cardId || "");
    setEditConcept(expense.concept || "");
    setEditAmount(String(expense.amount || ""));
    setEditCategoryId(expense.categoryId || "");
    setEditNotes(expense.notes || "");
  }

  function cancelEditingExpense() {
    setEditingExpenseId("");
    setEditDate("");
    setEditPaymentMethod("CASH");
    setEditCardId("");
    setEditConcept("");
    setEditAmount("");
    setEditCategoryId("");
    setEditNotes("");
  }

  async function updateExpense() {
    if (!user || !editingExpenseId) return;

    setError("");
    setIsUpdating(true);

    try {
      const response = await fetch("/api/expenses", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingExpenseId,
          date: editDate,
          paymentMethod: editPaymentMethod,
          cardId: editCardId,
          concept: editConcept,
          amount: editAmount,
          categoryId: editCategoryId,
          notes: editNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el gasto.");
      }

      cancelEditingExpense();
      await loadExpenses(user.id);
      toast.success("Cambios guardados exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo actualizar el gasto.");
      toast.error(err.message || "No se pudo actualizar el gasto.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteExpense(expenseId) {
    if (!user) return;

    setError("");

    try {
      const response = await fetch(`/api/expenses?id=${expenseId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar el gasto.");
      }

      setExpenseToDelete(null);
      await loadExpenses(user.id);

      toast.success("Gasto eliminado exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar el gasto.");
      toast.error(err.message || "No se pudo eliminar el gasto.");
    }
  }

  const totalShown = useMemo(() => {
    return expenses.reduce((sum, expense) => {
      return sum + Number(expense.amount || 0);
    }, 0);
  }, [expenses]);

  if (isCheckingSession) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <Spinner className="size-8" />
      </main>
    );
  }

  return (
    <>
      <AlertDialog
        open={Boolean(expenseToDelete)}
        onOpenChange={(open) => {
          if (!open) setExpenseToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el gasto{" "}
              {expenseToDelete?.concept
                ? `"${expenseToDelete.concept}"`
                : "seleccionado"}{" "}
              por {formatMoney(expenseToDelete?.amount || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-800 text-white hover:bg-red-900 focus:ring-red-300"
              onClick={() => deleteExpense(expenseToDelete.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <main>
        <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 md:py-8">
          {error ? (
            <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Nuevo gasto
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 md:space-y-5">
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
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
                      <SelectItem value="CASH">Efectivo</SelectItem>
                      <SelectItem value="CARD">Tarjeta</SelectItem>
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
                        Aún no tienes tarjetas. Agrégalas en la pantalla
                        Tarjetas.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label>Concepto</Label>
                  <Input
                    value={concept}
                    placeholder="Ej. Tacos, Uber, Cine..."
                    onChange={(event) => setConcept(event.target.value)}
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
                    placeholder="Algún detalle adicional..."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-border bg-background/50 p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-sm font-medium"
                    onClick={() => setShowMoreOptions((current) => !current)}
                  >
                    <span>Más opciones</span>
                    <span className="text-muted-foreground">
                      {showMoreOptions ? "Ocultar" : "Mostrar"}
                    </span>
                  </button>

                  {showMoreOptions ? (
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Persona relacionada</Label>
                        <Select
                          value={personId || "NONE"}
                          onValueChange={(value) => {
                            const nextValue = value === "NONE" ? "" : value;
                            setPersonId(nextValue);

                            if (!nextValue) {
                              setReceivableMode("CREATE");
                              setReceivableAccountId("");
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona persona" />
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

                        {people.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Puedes agregar personas en Configuración.
                          </p>
                        ) : null}
                      </div>

                      {personId ? (
                        <>
                          <div className="space-y-2">
                            <Label>Cuenta por cobrar</Label>
                            <Select
                              value={receivableMode}
                              onValueChange={(value) => {
                                setReceivableMode(value);

                                if (value === "CREATE") {
                                  setReceivableAccountId("");
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona opción" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CREATE">
                                  Crear nueva automáticamente
                                </SelectItem>
                                <SelectItem value="EXISTING">
                                  Vincular a existente
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {receivableMode === "EXISTING" ? (
                            <div className="space-y-2">
                              <Label>Cuenta existente</Label>
                              <Select
                                value={receivableAccountId}
                                onValueChange={setReceivableAccountId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona cuenta por cobrar" />
                                </SelectTrigger>
                                <SelectContent>
                                  {receivables
                                    .filter(
                                      (item) => item.personId === personId,
                                    )
                                    .map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        {item.concept} · pendiente{" "}
                                        {formatMoney(item.pendingBalance)}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>

                              {receivables.filter(
                                (item) => item.personId === personId,
                              ).length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Esta persona no tiene cuentas por cobrar
                                  activas.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <Label>Cuenta por pagar relacionada</Label>
                            <Select
                              value={payableAccountId}
                              onValueChange={setPayableAccountId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona cuenta por pagar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NONE">
                                  Sin cuenta por pagar
                                </SelectItem>
                                {payables
                                  .filter((item) => {
                                    const pendingBalance = Number(
                                      item.pendingBalance || 0,
                                    );
                                    return (
                                      item.status === "ACTIVE" &&
                                      pendingBalance > 0
                                    );
                                  })
                                  .map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.person?.name} · {item.concept} ·
                                      pendiente{" "}
                                      {formatMoney(item.pendingBalance)}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={createExpense}
                  disabled={isSaving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isSaving ? "Guardando..." : "Guardar gasto"}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    Filtros
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Desde</Label>
                      <Input
                        type="date"
                        value={filterStartDate}
                        onChange={(event) =>
                          setFilterStartDate(event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Hasta</Label>
                      <Input
                        type="date"
                        value={filterEndDate}
                        onChange={(event) =>
                          setFilterEndDate(event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Categoría</Label>
                      <Select
                        value={filterCategoryId}
                        onValueChange={setFilterCategoryId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Todas</SelectItem>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Método</Label>
                      <Select
                        value={filterPaymentMethod}
                        onValueChange={setFilterPaymentMethod}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Todos</SelectItem>
                          <SelectItem value="CASH">Efectivo</SelectItem>
                          <SelectItem value="CARD">Tarjeta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tarjeta</Label>
                      <Select
                        value={filterCardId}
                        onValueChange={setFilterCardId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">Todas</SelectItem>
                          {cards.map((card) => (
                            <SelectItem key={card.id} value={card.id}>
                              {card.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Concepto</Label>
                      <Input
                        value={filterConcept}
                        placeholder="Buscar texto..."
                        onChange={(event) =>
                          setFilterConcept(event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={applyFilters}
                      disabled={isFiltering}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      {isFiltering ? "Filtrando..." : "Aplicar filtros"}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={resetFilters}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Limpiar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    Gastos filtrados
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="mb-4 rounded-xl border border-border bg-background/60 px-4 py-3">
                    <p className="text-sm text-muted-foreground text-center">
                      Total filtrado
                    </p>
                    <p className="text-2xl font-semibold text-center">
                      {formatMoney(totalShown)}
                    </p>
                  </div>

                  {expenses.length === 0 ? (
                    <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                      No hay gastos para estos filtros.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {expenses.map((expense) => (
                        <div
                          key={expense.id}
                          className="rounded-xl border border-border bg-background/60 px-4 py-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-semibold">
                                  {expense.concept}
                                </p>
                                <Badge variant="secondary">
                                  {expense.category?.name}
                                </Badge>
                              </div>

                              <p className="mt-1 text-sm text-muted-foreground">
                                {formatExpenseDate(expense.date)} ·{" "}
                                {getPaymentMethodLabel(expense.paymentMethod)}
                                {expense.card ? ` · ${expense.card.name}` : ""}
                              </p>

                              {expense.person ? (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Persona: {expense.person.name}
                                  {expense.receivableAccount
                                    ? ` · Por cobrar: ${expense.receivableAccount.concept}`
                                    : ""}
                                </p>
                              ) : null}

                              {expense.payableAccount ? (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Cuenta por pagar:{" "}
                                  {expense.payableAccount.concept}
                                </p>
                              ) : null}

                              {expense.notes ? (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {expense.notes}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                              <p className="text-lg font-semibold">
                                {formatMoney(expense.amount)}
                              </p>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => startEditingExpense(expense)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setExpenseToDelete(expense)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {editingExpenseId === expense.id ? (
                            <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
                              <div className="mb-4 flex items-center justify-between gap-4">
                                <p className="text-sm font-medium">
                                  Editar gasto
                                </p>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={cancelEditingExpense}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>Fecha</Label>
                                  <Input
                                    type="date"
                                    value={editDate}
                                    onChange={(event) =>
                                      setEditDate(event.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Método</Label>
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
                                      <SelectItem value="CASH">
                                        Efectivo
                                      </SelectItem>
                                      <SelectItem value="CARD">
                                        Tarjeta
                                      </SelectItem>
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
                                          <SelectItem
                                            key={card.id}
                                            value={card.id}
                                          >
                                            {card.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : null}

                                <div className="space-y-2">
                                  <Label>Concepto</Label>
                                  <Input
                                    value={editConcept}
                                    onChange={(event) =>
                                      setEditConcept(event.target.value)
                                    }
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Monto</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editAmount}
                                    onChange={(event) =>
                                      setEditAmount(event.target.value)
                                    }
                                  />
                                </div>

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

                                <div className="space-y-2 md:col-span-2">
                                  <Label>Notas</Label>
                                  <Textarea
                                    value={editNotes}
                                    onChange={(event) =>
                                      setEditNotes(event.target.value)
                                    }
                                  />
                                </div>
                              </div>

                              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <Button
                                  type="button"
                                  className="w-full sm:w-auto"
                                  onClick={updateExpense}
                                  disabled={isUpdating}
                                >
                                  {isUpdating
                                    ? "Guardando..."
                                    : "Guardar cambios"}
                                </Button>

                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="w-full sm:w-auto"
                                  onClick={cancelEditingExpense}
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
          </div>
        </section>
      </main>
    </>
  );
}
