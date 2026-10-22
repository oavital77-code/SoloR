"use client";
// "בוויטרינה" (S0): what is on sale now, one card per cut, newest first (as in the feed): the block — or the cut
// itself — with its trays hanging off it, each with its number, steaks, weight and price. A tap opens the cut's
// summary; 🗑 takes a tray or the block off the showcase (not while ordered), or the whole cut.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useButcher } from "./ButcherShell";
import { EmptyState, ErrorState, Ltr, Skeleton } from "../ui";
import { RemoveItem, RemoveParent } from "./flow/RemoveParent";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { clipNo, linePrice } from "@/lib/items";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutMedia, Item, Parent } from "@/lib/types";

type Row = Item & { cut_media: CutMedia[]; parent: Parent & { cut_media?: CutMedia[] } };

export function Showcase() {
  const { butcher, ordersVersion } = useButcher();
  const breeds = useBreeds();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

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

  if (error && !rows) return <ErrorState onRetry={load} />;
  if (!rows) return <div className="flex flex-col gap-3 px-4 pt-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  if (!rows.length) return <EmptyState text={he.flow.emptyShowcase} />;

  // one card per cut (founders 22.10.2026: as in the feed): the block, or the cut itself, with its trays under it
  const groups: { parent: Row["parent"]; block: Row | null; trays: Row[] }[] = [];
  for (const r of rows) {
    let g = groups.find((x) => x.parent.id === r.parent_id);
    if (!g) groups.push(g = { parent: r.parent, block: null, trays: [] });
    if (r.kind === "remainder") g.block = r; else g.trays.push(r);
  }
  for (const g of groups) g.trays.sort((x, y) => (x.unit_no ?? 0) - (y.unit_no ?? 0));
  const ppkOf = (r: Row) => r.price_per_kg_agorot ?? r.parent.price_per_kg_agorot;

  return (
    <ul className="m-0 grid list-none grid-cols-1 items-start gap-2.5 px-4 pt-3 pb-4 lg:grid-cols-2">
      {groups.map(({ parent, block, trays }) => {
        const cover = (block && coverOf(block.cut_media)) ?? coverOf(parent.cut_media ?? []) ?? coverOf(trays[0]?.cut_media ?? []);
        const code = clipNo(parent.code);
        return (
          <li key={parent.id} className="flex flex-col gap-2 rounded-2xl bg-ink-2 p-2 pe-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <Link href={`/butcher/parent/${parent.id}/summary`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="block size-16 shrink-0 overflow-hidden rounded-xl bg-ink-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0 text-[15px] leading-5">
                  <span className="block truncate font-bold"><span className="code !text-[15px] text-ivory">{code}</span> · {cutTitle(parent, breeds) || he.flow.noTitle}</span>
                  <span className="text-stone">
                    {block
                      ? <>{he.item.remainder} · {he.flow.left(formatWeight(block.weight_g ?? 0))}{ppkOf(block) ? <> · <Ltr>{money(ppkOf(block)!)}</Ltr> {he.item.perKg}</> : null}</>
                      : he.flow.onlyTrays}
                  </span>
                </span>
              </Link>
              {block
                ? <RemoveItem itemId={block.id} label={block.label} onRemoved={load} className="!size-11 !bg-transparent !shadow-none" />
                : <RemoveParent parentId={parent.id} code={parent.code} onRemoved={load} className="!size-11 !bg-transparent !shadow-none" />}
            </div>
            {trays.length > 0 && (
              <ul className="m-0 ms-6 flex list-none flex-col gap-1.5 border-s-2 border-dashed border-stone/40 p-0 ps-3">
                {trays.map((t) => {
                  const tc = coverOf(t.cut_media);
                  const ppk = ppkOf(t);
                  return (
                    <li key={t.id} className="flex items-center gap-2.5">
                      <span className="block size-11 shrink-0 overflow-hidden rounded-lg bg-ink-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {tc && <img src={mediaUrl(tc.thumb_path ?? tc.storage_path)} alt="" className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1 text-[14px] leading-[18px]">
                        <span className="block truncate font-bold"><span className="code !text-[14px] text-ivory">{t.label}</span>{t.steak_count ? ` · ${he.item.steaks(t.steak_count)}` : ""}</span>
                        <span className="text-stone"><Ltr>{formatWeight(t.weight_g ?? 0)}</Ltr>{ppk ? <> · <Ltr>{money(linePrice({ weight_g: t.weight_g, price_per_kg_agorot: ppk }, "unit"))}</Ltr></> : null}</span>
                      </span>
                      <RemoveItem itemId={t.id} label={t.label} onRemoved={load} className="!size-11 !bg-transparent !shadow-none" />
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
