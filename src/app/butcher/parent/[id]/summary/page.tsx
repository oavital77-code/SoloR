"use client";
// T9 — the parent's summary and closing: the trays, the block and the total value, every item with its state, the
// video with "פרסם את הסרטון לפיד" (on by default, R12), the sum of the weights as information only, and "סיום".
// Closing waits for drafts (they are finished or cancelled first).
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { useParent } from "@/components/butcher/flow/useParent";
import { Ltr, Toggle } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { linePrice } from "@/lib/items";
import { CUT_STATUS_LABEL } from "@/lib/labels";
import { useBreeds } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { parent, media, items, state, reload } = useParent(id);
  const breeds = useBreeds();
  const router = useRouter();
  const toast = useToast();
  const [video, setVideo] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (parent && video == null) setVideo(parent.video_published); }, [parent, video]);

  if (state !== "ok" || !parent) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const units = items.filter((i) => i.kind === "unit");
  const rest = items.find((i) => i.kind === "remainder");
  const ppkOf = (i: (typeof items)[number]) => i.price_per_kg_agorot ?? parent.price_per_kg_agorot ?? 0;
  const value = items.filter((i) => i.status !== "withdrawn" && i.weight_g)
    .reduce((s, i) => s + linePrice({ weight_g: i.weight_g, price_per_kg_agorot: ppkOf(i) }, "unit"), 0);
  const weights = items.reduce((s, i) => s + (i.weight_g ?? 0), 0);
  const drafts = items.filter((i) => i.status === "draft");

  async function finish() {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("close_parent", { p_parent_id: id, p_video_published: video ?? true });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    router.replace("/butcher");
  }

  async function toggleVideo(on: boolean) {
    setVideo(on);
    if (parent?.status === "closed") {
      const { error } = await supabaseBrowser().from("parents").update({ video_published: on }).eq("id", id);
      if (error) toast(errorText(error), { tone: "error" });
    }
  }

  return (
    <FlowScreen title={he.flow.summaryTitle(parent.code ?? "")} sub={cutTitle(parent, breeds) || he.flow.noTitle} back="/butcher"
      footer={
        <>
          {drafts.length > 0 && <p className="m-0 text-sm font-semibold text-sold">{he.flow.hasDrafts(drafts.length)}</p>}
          {parent.status !== "closed" && parent.sale_mode !== "block" && <Link href={`/butcher/parent/${id}/units`} className="sr-cbtn sr-cbtn--quiet">{he.flow.backToUnits}</Link>}
          <button type="button" className="sr-cbtn sr-cbtn--new" disabled={busy || drafts.length > 0} onClick={finish}>{he.flow.finish}</button>
        </>
      }>
      <p className="m-0 text-[17px] font-bold">
        {he.flow.summaryLine(units.length, rest?.weight_g ? formatWeight(rest.weight_g) : null, money(value))}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((i) => {
          const cover = coverOf(i.cut_media) ?? coverOf(media);
          return (
            <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-ink-2 p-2 pe-3 shadow-[var(--shadow-card)]">
              <span className="block size-14 shrink-0 overflow-hidden rounded-xl bg-ink-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="h-full w-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1 text-[15px] leading-5">
                <span className="ltr !block text-right font-[family-name:var(--font-plex-mono)] text-[18px] font-bold">{i.label ?? he.flow.draftTray}</span>
                <span className="text-stone">
                  {[i.kind === "unit" ? (i.steak_count && he.item.steaks(i.steak_count)) : he.item.remainder, i.weight_g && formatWeight(i.weight_g)].filter(Boolean).join(" · ")}
                  {i.weight_g ? <> · <Ltr>{money(linePrice({ weight_g: i.weight_g, price_per_kg_agorot: ppkOf(i) }, "unit"))}</Ltr></> : null}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold">{CUT_STATUS_LABEL[i.status]}</span>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-2">
        <span className="sr-clabel">{he.flow.video}</span>
        {parent.video_path ? (
          <>
            <video src={mediaUrl(parent.video_path)} poster={mediaUrl(parent.video_poster_path)} controls playsInline preload="metadata"
              className="max-h-72 w-full rounded-2xl bg-black" />
            <Toggle label={he.flow.publishVideo} checked={video ?? true} onChange={toggleVideo} />
          </>
        ) : <p className="m-0 text-sm text-stone">{he.flow.noVideo}</p>}
      </section>
      <p className="m-0 text-sm text-stone">{he.flow.weightsSum(formatWeight(weights))}</p>
    </FlowScreen>
  );
}
