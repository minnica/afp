"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function SettingsContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [categories, setCategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [incomeTypes, setIncomeTypes] = useState([]);

  const [categoryName, setCategoryName] = useState("");
  const [personName, setPersonName] = useState("");
  const [personNotes, setPersonNotes] = useState("");
  const [incomeTypeName, setIncomeTypeName] = useState("");

  const [error, setError] = useState("");

  async function loadSettings(userId) {
    const response = await fetch(`/api/settings?userId=${userId}`);

    if (!response.ok) {
      throw new Error("No se pudo cargar configuración.");
    }

    const data = await response.json();

    setCategories(data.categories || []);
    setPeople(data.people || []);
    setIncomeTypes(data.incomeTypes || []);
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

        await loadSettings(session.user.id);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createItem(type) {
    if (!user) return;

    setError("");
    setIsSaving(true);

    try {
      let payload = {
        userId: user.id,
        type,
      };

      if (type === "category") {
        payload.name = categoryName;
      }

      if (type === "person") {
        payload.name = personName;
        payload.notes = personNotes;
      }

      if (type === "incomeType") {
        payload.name = incomeTypeName;
      }

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar.");
      }

      if (type === "category") setCategoryName("");
      if (type === "person") {
        setPersonName("");
        setPersonNotes("");
      }
      if (type === "incomeType") setIncomeTypeName("");

      await loadSettings(user.id);
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteItem(type, id) {
    if (!user) return;

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar este registro?",
    );

    if (!confirmed) return;

    setError("");

    try {
      const response = await fetch(`/api/settings?type=${type}&id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      await loadSettings(user.id);
    } catch (err) {
      setError(err.message || "No se pudo eliminar.");
    }
  }

  const totals = useMemo(
    () => ({
      categories: categories.length,
      people: people.length,
      incomeTypes: incomeTypes.length,
    }),
    [categories, people, incomeTypes],
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          Cargando configuración...
        </p>
      </main>
    );
  }

  return (
    <main>
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">AFP</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Configuración
          </h1>
          <p className="text-muted-foreground">
            Administra catálogos simples para gastos, ingresos y cuentas por
            cobrar.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard title="Categorías" value={totals.categories} />
          <SummaryCard title="Personas" value={totals.people} />
          <SummaryCard title="Tipos de ingreso" value={totals.incomeTypes} />
        </div>

        <Tabs defaultValue="categories" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="categories">Categorías</TabsTrigger>
            <TabsTrigger value="people">Personas</TabsTrigger>
            <TabsTrigger value="incomeTypes">Tipos de ingreso</TabsTrigger>
          </TabsList>

          <TabsContent value="categories">
            <CatalogCard
              title="Categorías"
              description="Se usan en gastos diarios, compras a meses y suscripciones."
              inputLabel="Nueva categoría"
              inputValue={categoryName}
              inputPlaceholder="Ej. Gasolina"
              onInputChange={setCategoryName}
              onCreate={() => createItem("category")}
              isSaving={isSaving}
              items={categories}
              onDelete={(id) => deleteItem("category", id)}
            />
          </TabsContent>

          <TabsContent value="people">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle>Personas</CardTitle>
                <CardDescription>
                  Se usan para cuentas por cobrar, compras a meses por otra
                  persona y pagos recibidos.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input
                      value={personName}
                      placeholder="Ej. Luis"
                      onChange={(event) => setPersonName(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notas opcional</Label>
                    <Input
                      value={personNotes}
                      placeholder="Ej. Cuñado, amigo, familiar..."
                      onChange={(event) => setPersonNotes(event.target.value)}
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => createItem("person")}
                    disabled={isSaving}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar
                  </Button>
                </div>

                <Separator />

                <ItemList
                  items={people}
                  type="person"
                  emptyText="Aún no hay personas registradas."
                  onDelete={(id) => deleteItem("person", id)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incomeTypes">
            <CatalogCard
              title="Tipos de ingreso"
              description="Se usan para clasificar nómina, pagos recibidos, reembolsos e ingresos extra."
              inputLabel="Nuevo tipo de ingreso"
              inputValue={incomeTypeName}
              inputPlaceholder="Ej. Bono"
              onInputChange={setIncomeTypeName}
              onCreate={() => createItem("incomeType")}
              isSaving={isSaving}
              items={incomeTypes}
              onDelete={(id) => deleteItem("incomeType", id)}
            />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

function SummaryCard({ title, value }) {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function CatalogCard({
  title,
  description,
  inputLabel,
  inputValue,
  inputPlaceholder,
  onInputChange,
  onCreate,
  isSaving,
  items,
  onDelete,
}) {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label>{inputLabel}</Label>
            <Input
              value={inputValue}
              placeholder={inputPlaceholder}
              onChange={(event) => onInputChange(event.target.value)}
            />
          </div>

          <Button type="button" onClick={onCreate} disabled={isSaving}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar
          </Button>
        </div>

        <Separator />

        <ItemList
          items={items}
          type={title}
          emptyText={`Aún no hay ${title.toLowerCase()} registradas.`}
          onDelete={onDelete}
        />
      </CardContent>
    </Card>
  );
}

function ItemList({ items, emptyText, onDelete }) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/60 px-4 py-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{item.name}</p>
              <Badge variant="secondary">Activo</Badge>
            </div>

            {item.notes ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {item.notes}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
