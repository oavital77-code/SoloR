"use client";
// S7 — the remainder (or the whole cut, when it was not split): its label is the parent's code alone ("523"), then
// the same weigh → photo → confirm as a unit (S5, S6). One remainder per parent.
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { ScreenLabel } from "@/components/butcher/flow/LabelOutput";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { errorText } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Item } from "@/lib/types";

export default function RemainderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<Item | null>(null);
  const [failed, setFailed] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    supabaseBrowser().rpc("create_remainder", { p_parent_id: id }).then(({ data, error }) => {
      if (error) { toast(errorText(error), { tone: "error" }); return setFailed(true); }
      const it = data as Item;
      if (it.status !== "draft") return router.replace(`/butcher/parent/${id}/summary`);
      if (it.weight_g) return router.replace(`/butcher/item/${it.id}/photo`);
      setItem(it);
    });
  }, [id, router, toast]);

  if (failed) return <FlowLoading state="error" />;
  if (!item) return <FlowLoading state="loading" />;
  return (
    <FlowScreen title={he.flow.remainderTitle(item.label)} back={`/butcher/parent/${id}`}>
      <ScreenLabel label={item.label} onDone={() => router.replace(`/butcher/item/${item.id}/weigh`)} />
    </FlowScreen>
  );
}
