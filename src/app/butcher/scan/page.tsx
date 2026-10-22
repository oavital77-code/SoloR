"use client";
// S9 — a sale at the counter: the butcher types the number on the item's label (no scanning for now, 22.10.2026).
// A unit: its card and "נמכרה בחנות". A remainder: "כמה נשאר?" — what is left is weighed and typed, and that
// becomes the new balance; it replaces the old one, nothing is subtracted (§4.4, T10). "נמכרה כולה" when nothing is left.
import { useState } from "react";
import { useButcher } from "@/components/butcher/ButcherShell";
import { FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { WeightInput } from "@/components/butcher/flow/WeightInput";
import { Ltr } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { readSolorLabel } from "@/lib/barcode";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { linePrice } from "@/lib/items";
import { useBreeds } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutMedia, Item, Parent } from "@/lib/types";

type Found = Item & { cut_media: CutMedia[]; parent: Parent };

export default function ScanPage() {
  const { butcher } = useButcher();
  const breeds = useBreeds();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [item, setItem] = useState<Found | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function find(text: string) {
    setNote(null);
    const label = readSolorLabel(text)?.label;
    if (!label) return setNote(he.flow.notFound);
    const { data } = await supabaseBrowser().from("items").select("*, cut_media(*), parent:parents(*)")
      .eq("butcher_id", butcher.id).eq("label", label).neq("status", "draft")
      .order("published_at", { ascending: false }).limit(1).maybeSingle();   // clips come back: the latest with that number
    if (!data) return setNote(he.flow.notFound);
    setItem(data as Found);
    setLeft(null);
  }

  async function sell(sold_all: boolean, grams: number | null) {
    if (!item) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("store_sale", { p_item_id: item.id, p_new_weight_g: grams, p_sold_all: sold_all });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    toast(he.flow.stockUpdated, { tone: "success" });
    setItem(null);
    setTyped("");
  }

  const ppk = item ? item.price_per_kg_agorot ?? item.parent.price_per_kg_agorot : null;
  const cover = item ? coverOf(item.cut_media) : undefined;
  return (
    <FlowScreen title={he.flow.scanTitle} sub={he.flow.scanHint}
      footer={item ? (
        item.status !== "published" ? (
          <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => setItem(null)}>{he.flow.another}</button>
        ) : item.kind === "unit" ? (
          <button type="button" className="sr-cbtn sr-cbtn--new" disabled={busy} onClick={() => sell(false, null)}>{he.flow.soldInStore}</button>
        ) : (
          <>
            <button type="button" className="sr-cbtn sr-cbtn--new" disabled={busy || !left} onClick={() => sell(false, left)}>{he.flow.saveLeft}</button>
            <button type="button" className="sr-cbtn sr-cbtn--quiet" disabled={busy} onClick={() => sell(true, null)}>{he.flow.soldAll}</button>
          </>
        )
      ) : (
        <button type="button" className="sr-cbtn sr-cbtn--new" disabled={!typed.trim()} onClick={() => find(typed)}>{he.flow.find}</button>
      )}>
      {!item && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); find(typed); }}>
          <input className="sr-cinput ltr flex-1 !text-[28px]" inputMode="text" placeholder="523-1" aria-label={he.flow.typeLabel} autoFocus
            value={typed} onChange={(e) => setTyped(e.target.value)} />
        </form>
      )}
      {note && <p className="m-0 font-semibold text-sold" role="alert">{note}</p>}

      {item && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-ink-2 p-3 shadow-[var(--shadow-card)]">
            <span className="block size-20 shrink-0 overflow-hidden rounded-xl bg-ink-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 text-[15px] leading-5">
              <span className="ltr !block text-right font-[family-name:var(--font-plex-mono)] text-[24px] font-bold">{item.label}</span>
              <span className="block font-bold">{cutTitle(item.parent, breeds)}</span>
              <span className="text-stone">
                {item.kind === "unit"
                  ? <>{item.steak_count ? `${he.item.steaks(item.steak_count)} · ` : ""}<Ltr>{formatWeight(item.weight_g ?? 0)}</Ltr>{ppk ? <> · <Ltr>{money(linePrice({ weight_g: item.weight_g, price_per_kg_agorot: ppk }, "unit"))}</Ltr></> : null}</>
                  : he.flow.left(formatWeight(item.weight_g ?? 0))}
              </span>
            </span>
          </div>
          {item.status !== "published" && <p className="m-0 font-semibold text-sold">{he.flow.notLive}</p>}
          {item.status === "published" && item.kind === "remainder" && (
            <>
              <h2 className="m-0 text-[22px] font-black">{he.flow.howMuchLeft}</h2>
              <WeightInput grams={left} onChange={(g) => setLeft(g)} />
            </>
          )}
        </>
      )}

    </FlowScreen>
  );
}
