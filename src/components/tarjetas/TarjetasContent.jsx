"use client";
import AutomaticRecordingLink from "@/components/configuracion/AutomaticRecordingLink";

import { financialFetch as apiFetch } from "@/lib/financialClient";
import { useDashboard } from "@/components/dashboard/DashboardProvider";

import CreateRecordSurface from "@/components/ui/create-record-surface";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Empty, EmptyDescription } from "@/components/ui/empty";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CreditCard,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

import { toast } from "@/components/ui/sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Item, ItemGroup, ItemMedia } from "@/components/ui/item";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import CyclesDataTable from "@/components/tarjetas/CyclesDataTable";
import PageSkeleton from "@/components/layout/PageSkeleton";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function TarjetasContent() {
  const { refresh: refreshDashboard } = useDashboard();
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const [createError, setCreateError] = useState(null);

  const [user, setUser] = useState(null);
  const [cards, setCards] = useState([]);
  const cardsRequest = useRef(null);
  const [cycles, setCycles] = useState([]);

  const [name, setName] = useState("");
  const [usualCutDay, setUsualCutDay] = useState("");
  const [usualDueDay, setUsualDueDay] = useState("");
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [cardToDelete, setCardToDelete] = useState(null);
  const [cycleToUnmark, setCycleToUnmark] = useState(null);
  const [error, setError] = useState("");

  const [editingCardId, setEditingCardId] = useState("");
  const [editCardName, setEditCardName] = useState("");
  const [editUsualCutDay, setEditUsualCutDay] = useState("");
  const [editUsualDueDay, setEditUsualDueDay] = useState("");
  const [editCardNotes, setEditCardNotes] = useState("");
  const [isUpdatingCard, setIsUpdatingCard] = useState(false);

  const loadCards = useCallback(async (userId, { mutationCompleted = false, errorMode } = {}) => {
    cardsRequest.current?.abort();
    const controller = new AbortController();
    cardsRequest.current = controller;
    try {
      const response = await apiFetch(`/api/cards?userId=${userId}`, { mutationCompleted, expectedUserId: userId, errorMode, signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar las tarjetas.");
      setCards(data.cards || []);
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    }
  }, []);

  async function loadCycles(userId, { mutationCompleted = false } = {}) {
    const response = await apiFetch(`/api/card-cycles?userId=${userId}`, { mutationCompleted });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar los ciclos.");
    setCycles(data.cycles || []);
  }

  async function loadCycleBreakdown(cycleId) {
    if (!user) return null;

    const response = await apiFetch(
      `/api/card-cycles?userId=${user.id}&cycleId=${cycleId}&includeBreakdown=true`,
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar el desglose.");
    }

    return data.cycle || null;
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

        await Promise.all([loadCards(session.user.id), loadCycles(session.user.id)]);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
    return () => cardsRequest.current?.abort();
  }, [router, loadCards]);

  async function createCard() {
    if (!user || isSaving) return false;
    setCreateError(null);
    setError("");
    setIsSaving(true);
    let saved = false;
    try {
      const response = await apiFetch("/api/cards", {
        method: "POST", expectedUserId: user?.id,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name, usualCutDay, usualDueDay, notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear la tarjeta.");
      saved = true;
      setName("");
      setUsualCutDay("");
      setUsualDueDay("");
      setNotes("");
      await Promise.all([loadCards(user.id, { mutationCompleted: true }), loadCycles(user.id, { mutationCompleted: true })]);
      toast.success("Tarjeta guardada exitosamente.");
      return true;
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        toast.success("Tarjeta guardada exitosamente.");
        return true;
      }
      setCreateError({ message: err.message || "No se pudo crear la tarjeta." });
      return false;
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
      const response = await apiFetch("/api/cards", {
        method: "PATCH", expectedUserId: user?.id,
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
      await Promise.all([loadCards(user.id, { mutationCompleted: true }), loadCycles(user.id, { mutationCompleted: true })]);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la tarjeta.");
    } finally {
      setIsUpdatingCard(false);
    }
  }

  async function deleteCard(id) {
    if (!user) return;
    setError("");
    try {
      const response = await apiFetch(`/api/cards?id=${id}`, { method: "DELETE", expectedUserId: user?.id });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar la tarjeta.");
      await Promise.all([loadCards(user.id, { mutationCompleted: true }), loadCycles(user.id, { mutationCompleted: true })]);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la tarjeta.");
    }
  }

  async function saveCycleChange(cycleId, fields) {
    if (!user) throw new Error("Inicia sesión para continuar.");
    setError("");
    const response = await apiFetch("/api/card-cycles", {
      method: "PATCH", expectedUserId: user.id,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cycleId, ...fields }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar el ciclo.");
    // El PATCH ya fue confirmado: actualizar el estado visible incluso si falla el GET.
    setCycles((previous) => previous.map((cycle) => cycle.id === cycleId ? { ...cycle, ...data.cycle } : cycle));
    // Retira o actualiza el aviso del encabezado con una lectura posterior al PATCH.
    await refreshDashboard({ force: true });
    try {
      await Promise.all([loadCycles(user.id, { mutationCompleted: true }), loadCards(user.id, { mutationCompleted: true })]);
    } catch {
      setError("El cambio se guardó, pero no se pudo actualizar el listado. Recarga para consultar los cálculos.");
    }
  }

  function updateCycleDates(cycleId, dates) {
    return saveCycleChange(cycleId, { action: "UPDATE_DATES", ...dates });
  }

  function updateStatementAmount(cycleId, statementAmount) {
    return saveCycleChange(cycleId, { action: "UPDATE_STATEMENT", statementAmount });
  }

  function markCycleAsPaid(cycleId, payment) {
    return saveCycleChange(cycleId, { action: "MARK_AS_PAID", ...payment });
  }

  function updatePostCutCredit(cycleId, credit) {
    return saveCycleChange(cycleId, { action: "UPDATE_POST_CUT_CREDIT", ...credit });
  }

  async function unmarkCycleAsPaid(cycleId) {
    if (!user) return;
    setError("");
    try {
      const response = await apiFetch("/api/card-cycles", {
        method: "PATCH", expectedUserId: user?.id,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cycleId, action: "UNMARK_AS_PAID" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo deshacer el pago.");
      await refreshDashboard({ force: true });
      await Promise.all([loadCycles(user.id, { mutationCompleted: true }), loadCards(user.id, { mutationCompleted: true })]);
    } catch (err) {
      setError(err.message || "No se pudo deshacer el pago.");
    }
  }

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
    return <PageSkeleton variant="form-table" />;
  }

  const cardCreateForm = (
    <CreateRecordSurface
      compact={false}
      title="Nueva tarjeta"
      saveLabel="Guardar tarjeta"
      error={createError}
      isSaving={isSaving}
      onSubmit={createCard}
    >
      <div className="space-y-2">
        <Label htmlFor="tarjetas-field-1">Nombre de tarjeta</Label>
        <Input
          id="tarjetas-field-1"
          value={name}
          placeholder="Ej. HSBC 1"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tarjetas-field-2">Día de corte habitual</Label>
          <Input
            id="tarjetas-field-2"
            value={usualCutDay}
            type="number"
            min="1"
            max="31"
            placeholder="Ej. 12"
            onChange={(e) => setUsualCutDay(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tarjetas-field-3">Día límite habitual</Label>
          <Input
            id="tarjetas-field-3"
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
        <Label htmlFor="tarjetas-field-4">Notas opcional</Label>
        <Input
          id="tarjetas-field-4"
          value={notes}
          placeholder="Ej. Se usa para compras grandes"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </CreateRecordSurface>
  );

  return (
    <main onClickCapture={captureFocus}>
      <AlertDialog
        open={Boolean(cycleToUnmark)}
        onOpenChange={(open) => { if (!open) setCycleToUnmark(null); }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deshacer el pago de este ciclo?</AlertDialogTitle>
            <AlertDialogDescription>Se retirará el total pagado registrado y se recalculará el saldo. Un estado de cuenta de cero seguirá sin importe por pagar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => unmarkCycleAsPaid(cycleToUnmark)}>
              Deshacer pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(cardToDelete)}
        onOpenChange={(open) => { if (!open) setCardToDelete(null); }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta tarjeta?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará la tarjeta seleccionada. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteCard(cardToDelete.id)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className="mx-auto flex w-full max-w-7xl flex-col px-4 py-5 md:py-8">
        <AutomaticRecordingLink payments />
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="rounded-none bg-transparent py-0 ring-0 [--card-spacing:0px] md:rounded-xl md:bg-card md:py-4 md:ring-1 md:[--card-spacing:--spacing(4)]">
          <CardHeader className="mb-3 flex flex-row flex-wrap items-center justify-between gap-2 md:mb-0">
            <CardTitle className="text-base font-semibold md:text-lg">
              Ciclos mensuales
            </CardTitle>
            <Button variant="ghost" asChild className="min-h-11">
              <Link href="/credito-y-deuda">Ver saldos de crédito</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <CyclesDataTable
              cycles={cyclesByMonthIndex[Number(activeMonthTab)] || []}
              month={activeMonthTab}
              onMonthChange={setActiveMonthTab}
              monthOptions={MONTH_NAMES.map((monthName, monthIndex) => ({ value: String(monthIndex), label: `${monthName} ${currentYear}`, shortLabel: `${monthName.slice(0, 3)} ${currentYear}` }))}
              updateCycleDates={updateCycleDates}
              updateStatementAmount={updateStatementAmount}
              markCycleAsPaid={markCycleAsPaid}
              updatePostCutCredit={updatePostCutCredit}
              unmarkCycleAsPaid={setCycleToUnmark}
              loadCycleBreakdown={loadCycleBreakdown}
            />
          </CardContent>
        </Card>

        <Collapsible className="mt-6" data-card-administration>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="group h-11 gap-2 md:h-9">
              Administrar tarjetas
              <ChevronDown data-icon="inline-end" className="group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
              {cardCreateForm}

              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-center text-lg font-semibold uppercase">
                    Tarjetas registradas
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  {cards.length === 0 ? (
                    <Empty>
                      <EmptyDescription>
                        Aún no hay tarjetas registradas.
                      </EmptyDescription>
                    </Empty>
                  ) : (
                    <ItemGroup>
                      {cards.map((card) => (
                        <Item
                          key={card.id}
                          variant="outline"
                          role="listitem"
                          className="block"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <ItemMedia variant="icon">
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                              </ItemMedia>

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
                              <Button aria-label="Editar"
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => startEditingCard(card)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <Button aria-label="Eliminar"
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setCardToDelete(card)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {editingCardId === card.id ? (
                            <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
                              <div className="mb-4 flex items-center justify-between gap-4">
                                <p className="text-sm font-medium">Editar tarjeta</p>

                                <Button aria-label="Cancelar edición"
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
                                  <Label htmlFor="tarjetas-field-5">Nombre</Label>
                                  <Input
                                    id="tarjetas-field-5"
                                    value={editCardName}
                                    onChange={(e) => setEditCardName(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="tarjetas-field-6">Día de corte habitual</Label>
                                  <Input
                                    id="tarjetas-field-6"
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editUsualCutDay}
                                    onChange={(e) => setEditUsualCutDay(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="tarjetas-field-7">Día límite habitual</Label>
                                  <Input
                                    id="tarjetas-field-7"
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={editUsualDueDay}
                                    onChange={(e) => setEditUsualDueDay(e.target.value)}
                                  />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                  <Label htmlFor="tarjetas-field-8">Notas</Label>
                                  <Input
                                    id="tarjetas-field-8"
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
                        </Item>
                      ))}
                    </ItemGroup>
                  )}
                </CardContent>
              </Card>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </main>
  );
}
