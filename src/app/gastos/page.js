export default function GastosPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8">
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">AFP</p>
          <h1 className="text-3xl font-semibold tracking-tight">Gastos</h1>
          <p className="mt-2 text-muted-foreground">
            Aquí registrarás tus gastos diarios rápidamente.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium">Formulario de gasto</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            En la siguiente fase construiremos el login y después este formulario.
          </p>
        </div>
      </section>
    </main>
  );
}