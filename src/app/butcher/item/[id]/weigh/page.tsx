"use client";
// T6 — a tray's steaks and weight (BUTCHER_FLOW_v2): the steaks on a stepper (as the previous tray by default; the
// customer sees it), the weight of all of them together typed on the pad, and the sum live. "המשך לצילום" once there
// is a weight; "בטל מגש" drops it — it has no number yet, so none is lost (R3).
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { WeightInput } from "@/components/butcher/flow/WeightInput";
import { useItem } from "@/components/butcher/flow/useParent";
import { ConfirmDialog, Ltr, Stepper } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { errorText } from "@/lib/errors";
import { linePrice } from "@/lib/items";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function WeighPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { item, parent, state, reload } = useItem(id);
  const router = useRouter();
  const toast = useToast();
  const [grams, setGrams] = useState<number | null>(null);
  const [steaks, setSteaks] = useState(2);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!item || ready) return;
    if (item.status !== "draft" || item.kind !== "unit") { router.replace(`/butcher/parent/${item.parent_id}`); return; }
    setGrams(item.weight_g || null);
    setSteaks(item.steak_count ?? 2);
    setReady(true);
  }, [item, ready, router]);

  if (state !== "ok" || !item || !parent || !ready) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const back = `/butcher/parent/${parent.id}/units`;
  const ppk = item.price_per_kg_agorot ?? parent.price_per_kg_agorot;

  async function next() {
    if (!grams || !item) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from("items")
      .update({ weight_g: grams, weight_source: "manual", steak_count: steaks }).eq("id", item.id);
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    router.push(`/butcher/item/${item.id}/photo`);
  }

  async function cancel() {
    setCancelling(false);
    const { error } = await supabaseBrowser().rpc("cancel_unit", { p_item_id: id });
    if (error) return toast(errorText(error), { tone: "error" });
    router.replace(back);
  }

  return (
    <FlowScreen title={he.flow.unitTitle(item.label)} sub={he.flow.cutNo(parent.code ?? "")} back={back}
      footer={
        <>
          <div className="flex items-baseline justify-between text-[17px]" aria-live="polite">
            <span className="text-stone">{grams && ppk ? <Ltr>{he.flow.sum(formatWeight(grams), money(ppk))}</Ltr> : ppk ? "" : he.flow.noPrice}</span>
            {grams && ppk ? <Ltr className="text-[24px] font-black">{money(linePrice({ weight_g: grams, price_per_kg_agorot: ppk }, "unit"))}</Ltr> : null}
          </div>
          <button type="button" className="sr-cbtn sr-cbtn--new" disabled={!grams || busy} onClick={next}>{he.flow.toPhoto}</button>
          <button type="button" className="min-h-11 text-sm font-semibold text-stone underline" onClick={() => setCancelling(true)}>{he.flow.cancelUnit}</button>
        </>
      }>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink-2 p-3 shadow-[var(--shadow-card)]">
        <span className="text-[17px] font-bold">{he.flow.steaks}</span>
        <Stepper size="lg" value={steaks} min={1} max={40} onChange={setSteaks} label={he.flow.steaks} />
      </div>
      <WeightInput grams={grams} onChange={(g) => setGrams(g)} />
      <ConfirmDialog open={cancelling} text={he.flow.cancelUnitConfirm} confirmLabel={he.flow.cancelUnit} danger
        onConfirm={cancel} onCancel={() => setCancelling(false)} />
    </FlowScreen>
  );
}
