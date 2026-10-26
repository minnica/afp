"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import CaptureReview from "@/components/configuracion/CaptureReview";
import PageSkeleton from "@/components/layout/PageSkeleton";

export default function AutomaticRecordingContent() {
  const [user, setUser] = useState(null);
  const router = useRouter(), params = useSearchParams();
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!data.user) router.replace("/");
      else setUser(data.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) { setUser(session?.user || null); if (!session?.user) router.replace("/"); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [router]);
  if (!user) return <PageSkeleton />;
  return <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 md:py-8">
    <CaptureReview key={user.id} userId={user.id} initialTab={params.get("tipo")} initialCardId={params.get("tarjeta")} />
  </main>;
}
