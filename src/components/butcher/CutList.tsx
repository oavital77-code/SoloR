"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { useButcher } from "./ButcherShell";
import { Chip, EmptyState, ErrorState, Ltr, Skeleton } from "../ui";
import { he } from "@/lib/i18n/he";
import { CUT_STATUS_LABEL } from "@/lib/labels";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { useBreeds, useRefetchOnFocus, safeStorage } from "@/lib/hooks";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutStatus, CutWithMedia, OrderStatus } from "@/lib/types";

type Row = CutWithMedia & { orders: { status: OrderStatus }[] };
const FILTERS: CutStatus[] = ["draft", "published", "sold_out", "withdrawn"];
const FILTER_KEY = "solor.butcher.cutFilter";

export function CutList() {
  const { butcher, ordersVersion } = useButcher();
  const breeds = useBreeds();
  const [filter, setFilterState] = useState<CutStatus>("published");
  useEffect(() => { setFilterState(safeStorage.get<CutStatus>(FILTER_KEY, "published")); }, []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<CutStatus, number>>>({});

  const setFilter = (f: CutStatus) => { setFilterState(f); safeStorage.set(FILTER_KEY, f); };

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser()
      .from("cuts").select("*, cut_media(*), orders(status)")
      .eq("butcher_id", butcher.id)
      .order("updated_at", { ascending: false });
    if (error) return setError(true);
    setError(false);
    const all = (data ?? []) as Row[];
    setRows(all);
    const c: Partial<Record<CutStatus, number>> = {};
    all.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    setCounts(c);
  }, [butcher.id]);

  useEffect(() => { load(); }, [load, ordersVersion]);
  useRefetchOnFocus(load);

  const visible = rows?.filter((r) => r.status === filter) ?? [];

  return (
    <div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((f) => (
          <Chip key={f} selected={filter === f} onClick={() => setFilter(f)} className="shrink-0">
            {he.butcher.filters[f]}{counts[f] ? <span className="ms-1.5 opacity-70"><Ltr>{counts[f]}</Ltr></span> : null}
          </Chip>
        ))}
      </div>

      {error ? <ErrorState onRetry={load} />
        : !rows ? (
          <div className="flex flex-col gap-3 px-4 text-neutral-900">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : visible.length === 0 ? <EmptyState text={he.butcher.emptyCuts} />
        : (
          <ul className="flex flex-col gap-3 px-4 pb-8">
            {visible.map((c) => <CutRow key={c.id} cut={c} title={cutTitle(c, breeds)} />)}
          </ul>
        )}
    </div>
  );
}

function CutRow({ cut, title }: { cut: Row; title: string }) {
  const cover = coverOf(cut.cut_media);
  const activeOrders = cut.orders.filter((o) => o.status !== "cancelled").length;
  const stock = cut.status === "draft" ? null
    : cut.sale_mode === "whole" ? (cut.whole_available ? he.butcher.stockWhole : he.butcher.stockNone)
    : he.butcher.stockSteaks(cut.steaks_available, cut.steaks_total);
  const href = cut.status === "draft" ? `/butcher/cuts/${cut.id}/edit` : `/butcher/cuts/${cut.id}`;

  return (
    <li>
      <Link href={href} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-200 active:bg-neutral-50">
        <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-neutral-200">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} className="h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <Ltr className="text-sm font-bold text-neutral-500">{cut.code}</Ltr>
            <StatusPill status={cut.status} />
          </div>
          <p className="truncate text-lg font-extrabold">{title || he.butcher.untitled}</p>
          <p className="text-sm text-neutral-600">
            {cut.weight_g ? <Ltr>{formatWeight(cut.weight_g)}</Ltr> : "—"}
            {" · "}
            {cut.price_per_kg_agorot ? <Ltr>₪{formatAgorot(cut.price_per_kg_agorot)}</Ltr> : "—"} {he.feed.perKg}
          </p>
          <p className="text-sm font-semibold text-neutral-800">
            {stock}{stock && " · "}{he.butcher.ordersCount(activeOrders)}
          </p>
        </div>
      </Link>
    </li>
  );
}

export function StatusPill({ status }: { status: CutStatus }) {
  return (
    <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold",
      status === "published" && "bg-emerald-100 text-emerald-800",
      status === "draft" && "bg-amber-100 text-amber-900",
      status === "sold_out" && "bg-neutral-200 text-neutral-700",
      status === "withdrawn" && "bg-red-100 text-red-800")}>
      {CUT_STATUS_LABEL[status]}
    </span>
  );
}
