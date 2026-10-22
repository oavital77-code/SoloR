"use client";
// "בוויטרינה" (S0): every item on sale now, newest parent first — the photo, the label, steaks, weight (a remainder's
// balance), the price — and the parent it came from. A tap opens the parent's summary; an item can be taken off.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useButcher } from "./ButcherShell";
import { ConfirmDialog, EmptyState, ErrorState, Ltr, Skeleton } from "../ui";
import { useToast } from "../Toast";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { linePrice } from "@/lib/items";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutMedia, Item, Parent } from "@/lib/types";

type Row = Item & { cut_media: CutMedia[]; parent: Parent & { cut_media?: CutMedia[] } };

export function Showcase() {
  const { butcher, ordersVersion } = useButcher();
  const breeds = useBreeds();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("items").select("*, cut_media(*), parent:parents(*, cut_media(*))")
      .eq("butcher_id", butcher.id).eq("status", "published").order("published_at", { ascending: false }).limit(200);
    if (error) return setError(true);
    setError(false);
    setRows((data ?? []) as Row[]);
  }, [butcher.id]);
  useEffect(() => { load(); }, [load, ordersVersion]);
  useRefetchOnFocus(load);
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`showcase-${butcher.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `butcher_id=eq.${butcher.id}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [butcher.id, load]);

  async function withdraw() {
    if (!removing) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("withdraw_item", { p_item_id: removing.id });
    setBusy(false);
    setRemoving(null);
    if (error) return toast(errorText(error), { tone: "error" });
    toast(he.flow.removed, { tone: "success" });
    load();
  }

  if (error && !rows) return <ErrorState onRetry={load} />;
  if (!rows) return <div className="flex flex-col gap-3 px-4 pt-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  if (!rows.length) return <EmptyState text={he.flow.emptyShowcase} />;

  return (
    <>
      <ul className="m-0 grid list-none gap-2.5 px-4 pt-3 pb-4 lg:grid-cols-2">
        {rows.map((r) => {
          const cover = coverOf(r.cut_media) ?? coverOf(r.parent.cut_media ?? []);
          const ppk = r.price_per_kg_agorot ?? r.parent.price_per_kg_agorot;
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-ink-2 p-2 pe-3 shadow-[var(--shadow-card)]">
              <Link href={`/butcher/parent/${r.parent_id}/summary`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="block size-16 shrink-0 overflow-hidden rounded-xl bg-ink-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0 text-[15px] leading-5">
                  <span className="block truncate font-bold"><span className="code !text-[15px] text-ivory">{r.label}</span> · {cutTitle(r.parent, breeds) || he.flow.noTitle}</span>
                  <span className="text-stone">
                    {r.kind === "unit"
                      ? <>{r.steak_count ? `${he.item.steaks(r.steak_count)} · ` : ""}<Ltr>{formatWeight(r.weight_g ?? 0)}</Ltr>{ppk ? <> · <Ltr>{money(linePrice({ weight_g: r.weight_g, price_per_kg_agorot: ppk }, "unit"))}</Ltr></> : null}</>
                      : <>{he.flow.left(formatWeight(r.weight_g ?? 0))}{ppk ? <> · <Ltr>{money(ppk)}</Ltr> {he.item.perKg}</> : null}</>}
                  </span>
                </span>
              </Link>
              <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-stone" onClick={() => setRemoving(r)}>{he.flow.withdraw}</button>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog open={!!removing} text={removing ? he.flow.withdrawConfirm(removing.label ?? "") : ""} confirmLabel={he.flow.withdraw}
        onConfirm={withdraw} onCancel={() => setRemoving(null)} loading={busy} danger />
    </>
  );
}
