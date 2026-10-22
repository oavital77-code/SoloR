"use client";
// S4 — the units board, the centre of the split: a card for every unit (photo, "523-1", steaks, grams, price, live
// or not done yet), "➕ יחידת מכירה חדשה" (a new number, its label, then S5), "🏁 סיימתי — השארית לוויטרינה"
// (S7) and, when nothing is left, "אין שארית — הכל חולק" (S8).
import { Suspense, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { ScreenLabel } from "@/components/butcher/flow/LabelOutput";
import { useParent, type FlowItem } from "@/components/butcher/flow/useParent";
import { Ltr } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { linePrice } from "@/lib/items";
import { useBreeds } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Item, Parent } from "@/lib/types";

function UnitsBoard({ id }: { id: string }) {
  const { parent, items, state, reload } = useParent(id);
  const breeds = useBreeds();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<Item | null>(null);

  const live = params.get("live");
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (!live || told.current === live) return;
    told.current = live;
    toast(he.flow.isLive(live), { tone: "success" });
    router.replace(`/butcher/parent/${id}/units`);
  }, [live, id, router, toast]);

  async function newUnit() {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("new_unit", { p_parent_id: id });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    setLabel(data as Item);
  }

  if (state !== "ok" || !parent) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const units = items.filter((i) => i.kind === "unit");
  const remainder = items.find((i) => i.kind === "remainder");
  return (
    <FlowScreen title={`${he.flow.cutNo(parent.code ?? "")} · ${cutTitle(parent, breeds) || he.flow.noTitle}`}
      sub={<Link href={`/butcher/parent/${id}/details`} className="underline">{he.flow.editDetails}</Link>}
      footer={
        <>
          <button type="button" className="sr-cbtn sr-cbtn--new" disabled={busy || remainder?.status === "published"} onClick={newUnit}>{he.flow.newUnit}</button>
          <Link href={`/butcher/parent/${id}/remainder`} className="sr-cbtn sr-cbtn--ready">{he.flow.doneRemainder}</Link>
          {!remainder && units.length > 0 && (
            <Link href={`/butcher/parent/${id}/summary`} className="flex min-h-11 items-center justify-center text-sm font-semibold text-stone underline">{he.flow.noRemainder}</Link>
          )}
        </>
      }>
      {units.length === 0 ? <p className="m-0 mt-6 text-center text-stone">{he.flow.unitsEmpty}</p> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {units.map((u) => <UnitCard key={u.id} item={u} parent={parent} />)}
        </ul>
      )}
      <ScreenLabel label={label?.label ?? null} onDone={() => { const it = label; setLabel(null); if (it) router.push(`/butcher/item/${it.id}/weigh`); }} />
    </FlowScreen>
  );
}

function UnitCard({ item, parent }: { item: FlowItem; parent: Parent }) {
  const cover = coverOf(item.cut_media);
  const ppk = item.price_per_kg_agorot ?? parent.price_per_kg_agorot;
  const done = item.status !== "draft";
  const href = done ? `/butcher/parent/${parent.id}/summary` : item.weight_g ? `/butcher/item/${item.id}/photo` : `/butcher/item/${item.id}/weigh`;
  return (
    <li>
      <Link href={href} className={clsx("flex min-h-[84px] items-center gap-3 rounded-2xl bg-ink-2 p-2 pe-3 shadow-[var(--shadow-card)]", !done && "border-2 border-dashed border-[var(--status-prep)]")}>
        <span className="block size-16 shrink-0 overflow-hidden rounded-xl bg-ink-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0 flex-1 text-[15px] leading-5">
          <span className="ltr block font-[family-name:var(--font-plex-mono)] text-[20px] font-bold">{item.label}</span>
          <span className="text-stone">
            {[item.steak_count && he.item.steaks(item.steak_count), item.weight_g && formatWeight(item.weight_g)].filter(Boolean).join(" · ")}
            {item.weight_g && ppk ? <> · <Ltr className="font-bold text-ivory">{money(linePrice({ weight_g: item.weight_g, price_per_kg_agorot: ppk }, "unit"))}</Ltr></> : null}
          </span>
        </span>
        {done
          ? <span className="inline-flex shrink-0 items-center gap-1 font-bold text-[var(--status-ready)]"><IconCheck className="size-5" />{item.status === "published" ? he.flow.live : he.item.soldOut}</span>
          : <span className="shrink-0 font-bold text-[var(--status-prep)]">{he.flow.notDone}</span>}
      </Link>
    </li>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><UnitsBoard id={id} /></Suspense>;
}
