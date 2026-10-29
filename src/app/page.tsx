"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { MOBILE_QUERY } from "@/hooks/use-mobile";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(window.matchMedia(MOBILE_QUERY).matches ? "/gastos" : "/dashboard");
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-6" aria-label="Abriendo AFP" />
    </main>
  );
}
