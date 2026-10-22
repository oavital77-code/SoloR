"use client";
// T8 — the block (BUTCHER_FLOW_v2 §3): for "גוש", the whole cut at the weight entered with the details; for
// "גם וגם", "🏁 סיימתי לחתוך" — what is left is weighed again (Q3) and goes live as one block (Q4), or nothing was
// left. The block is labelled with the clip's number alone ("15") and shows the parent's photos. The preview is the
// customer's card; "✅ אשר והעלה" puts it live.
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useButcher } from "@/components/butcher/ButcherShell";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { ItemPreviewCard } from "@/components/butcher/flow/ItemPreviewCard";
import { WeightInput } from "@/components/butcher/flow/WeightInput";
import { useParent, type FlowItem } from "@/components/butcher/flow/useParent";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { itemMissing } from "@/lib/cut-helpers";
import { clipNo } from "@/lib/items";
import { errorText } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function BlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { parent, media, items, state, reload } = useParent(id);
  const { butcher } = useButcher();
  const router = useRouter();
  const toast = useToast();
  const [grams, setGrams] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const block = items.find((i) => i.kind === "remainder");
  useEffect(() => {
    if (!parent || grams !== undefined) return;
    if (parent.sale_mode === "steaks" || (block && block.status !== "draft")) { router.replace(`/butcher/parent/${id}/summary`); return; }
    setGrams(parent.sale_mode === "block" ? parent.weight_g : null);
  }, [parent, block, grams, id, router]);

  if (state !== "ok" || !parent || grams === undefined) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const whole = parent.sale_mode === "block";
  const drafts = items.filter((i) => i.kind === "unit" && i.status === "draft").length;
  const preview: FlowItem = {
    id: `${id}-block`, parent_id: id, butcher_id: parent.butcher_id, kind: "remainder", unit_no: null, label: clipNo(parent.code),
    steak_count: null, weight_g: grams, price_per_kg_agorot: null, weight_source: "manual", status: "draft", published_at: null,
    sold_out_at: null, created_at: parent.created_at, updated_at: parent.updated_at, cut_media: media,
  };
  const missing = itemMissing(preview, parent, media.filter((m) => m.type === "photo").length);
  const parentGaps = missing.filter((m) => !["photos", "weight_g"].includes(m));

  async function publish(weight: number) {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("publish_block", { p_parent_id: id, p_weight_g: weight });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    if (weight) toast(he.flow.blockLive(parent?.code ?? ""), { tone: "success" });
    router.replace(`/butcher/parent/${id}/summary`);
  }

  return (
    <FlowScreen parent={parent} title={whole ? he.flow.blockTitle(parent.code ?? "") : he.flow.doneCutting} sub={whole ? undefined : he.flow.leftHint}
      back={whole ? `/butcher/parent/${id}/details` : `/butcher/parent/${id}/units`}
      footer={
        <>
          {drafts > 0 && <p className="m-0 text-sm font-semibold text-sold" role="alert">{he.flow.hasDrafts(drafts)}</p>}
          {grams && missing.length > 0 && (
            <p className="m-0 text-sm font-semibold text-sold" role="alert">
              {he.flow.missingBefore} {missing.map((m) => he.missingFields[m] ?? m).join(", ")}
            </p>
          )}
          {parentGaps.length > 0 && <Link href={`/butcher/parent/${id}/details`} className="sr-cbtn sr-cbtn--quiet">{he.flow.fillDetails}</Link>}
          {missing.includes("photos") && <Link href={`/butcher/parent/${id}/photos`} className="sr-cbtn sr-cbtn--quiet">{he.flow.parentPhotosTitle}</Link>}
          <button type="button" className="sr-cbtn sr-cbtn--ready" disabled={busy || !grams || missing.length > 0 || drafts > 0}
            onClick={() => grams && publish(grams)}>{busy ? he.flow.publishing : he.flow.confirmUpload}</button>
          {!whole && (
            <button type="button" className="min-h-11 text-sm font-semibold text-stone underline" disabled={busy || drafts > 0}
              onClick={() => publish(0)}>{he.flow.nothingLeft}</button>
          )}
        </>
      }>
      <WeightInput grams={grams} label={whole ? he.flow.blockWeight : he.flow.leftWeight} onChange={(g) => setGrams(g)} />
      {grams ? <ItemPreviewCard item={preview} parent={parent} shop={butcher} /> : null}
    </FlowScreen>
  );
}
