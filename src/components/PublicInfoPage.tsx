
import Link from "next/link";
import type * as React from "react";

export default function PublicInfoPage({ title, intro, children }: React.PropsWithChildren<{ title: string; intro: string }>) {
  return <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-16">
    <nav aria-label="Navegación pública" className="mb-12 flex flex-wrap items-center justify-between gap-4 text-sm">
      <Link href="/acerca" className="text-lg font-semibold tracking-tight">AFP</Link>
      <div className="flex gap-5"><Link href="/privacidad" className="text-muted-foreground hover:text-foreground">Privacidad</Link><Link href="/login" className="underline underline-offset-4">Entrar</Link></div>
    </nav>
    <main>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{intro}</p>
      <div className="mt-10 space-y-8 text-base leading-7 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p+p]:mt-4 [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div>
    </main>
    <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">AFP · Administración de finanzas personales</footer>
  </div>;
}
