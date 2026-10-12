"use client";
// Entering the wizard creates the draft in the DB immediately (SPEC B3), then continues at /edit.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useButcher } from "@/components/butcher/ButcherShell";
import { ErrorState, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function NewCutPage() {
  const { butcher } = useButcher();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState(false);

  const create = async () => {
    setError(false);
    const { data, error } = await supabaseBrowser().from("cuts").insert({ butcher_id: butcher.id }).select("id").single();
    if (error || !data) return setError(true);
    router.replace(`/butcher/cuts/${data.id}/edit?step=1`);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return error ? <ErrorState onRetry={create} /> : <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
}
