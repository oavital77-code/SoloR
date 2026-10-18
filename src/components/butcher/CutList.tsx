"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { useButcher } from "./ButcherShell";
import { Chip, ConfirmDialog, EmptyState, ErrorState, Ltr, Skeleton } from "../ui";
import { useToast } from "../Toast";
import { he } from "@/lib/i18n/he";
import { CUT_STATUS_LABEL } from "@/lib/labels";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { useBreeds, useRefetchOnFocus, safeStorage } from "@/lib/hooks";
import { errorText } from "@/lib/errors";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import { removeStorageObjects } from "@/lib/upload";
import type { CutStatus, CutWithMedia, OrderItemStatus } from "@/lib/types";

type Row = CutWithMedia & { order_items: { status: OrderItemStatus }[] };
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
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const setFilter = (f: CutStatus) => { setFilterState(f); safeStorage.set(FILTER_KEY, f); };

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser()
      .from("cuts").select("*, cut_media(*), order_items(status)")
      .eq("butcher_id", butcher.id)
      .is("archived_at", null)
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

  // a cut that never sold is deleted; one with order lines is only hidden, so its orders keep their cut
  async function remove() {
    if (!removing) return;
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("remove_cut", { p_cut_id: removing.id });
    setBusy(false);
    const cut = removing;
    setRemoving(null);
    if (error) return toast(errorText(error), { tone: "error" });
    if (data === "deleted") {
      removeStorageObjects(cut.cut_media.flatMap((m) => [m.storage_path, m.thumb_path, m.poster_path])).catch(() => {});
    }
    toast(data === "deleted" ? he.butcher.removed : he.butcher.archived, { tone: "success" });
    load();
  }

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
          <div className="flex flex-col gap-3 px-4 text-ivory">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : visible.length === 0 ? <EmptyState text={he.butcher.emptyCuts} />
        : (
          <ul className="grid gap-3 px-4 pb-8 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
            {visible.map((c) => <CutRow key={c.id} cut={c} title={cutTitle(c, breeds)} onRemove={() => setRemoving(c)} />)}
          </ul>
        )}

      <ConfirmDialog open={!!removing} danger loading={busy}
        text={removing?.order_items.length ? he.butcher.removeConfirmArchive : he.butcher.removeConfirm}
        confirmLabel={he.butcher.remove} onConfirm={remove} onCancel={() => setRemoving(null)} />
    </div>
  );
}

function CutRow({ cut, title, onRemove }: { cut: Row; title: string; onRemove: () => void }) {
  const cover = coverOf(cut.cut_media);
  // one line per order on this cut; cancelling an order cancels its lines
  const activeOrders = cut.order_items.filter((i) => i.status !== "cancelled").length;
  const stock = cut.status === "draft" ? null
    : cut.sale_mode === "whole" ? (cut.whole_available ? he.butcher.stockWhole : he.butcher.stockNone)
    : he.butcher.stockSteaks(cut.steaks_available, cut.steaks_total);
  const href = cut.status === "draft" ? `/butcher/cuts/${cut.id}/edit` : `/butcher/cuts/${cut.id}`;

  return (
    <li className="relative">
      <Link href={href} className="flex gap-3 rounded-2xl bg-ink-2 p-3 shadow-sm ring-1 ring-line active:bg-ink">
        <div className="size-24 shrink-0 overflow-hidden rounded-xl bg-ink-3">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} className="h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <Ltr className="text-sm font-bold text-stone">{cut.code}</Ltr>
            <StatusPill status={cut.status} />
          </div>
          <p className="truncate text-lg font-extrabold">{title || he.butcher.untitled}</p>
          <p className="text-sm text-stone">
            {cut.weight_g ? <Ltr>{formatWeight(cut.weight_g)}</Ltr> : "—"}
            {" · "}
            {cut.price_per_kg_agorot ? <Ltr>{money(cut.price_per_kg_agorot)}</Ltr> : "—"} {he.feed.perKg}
          </p>
          <p className="text-sm font-semibold text-ivory">
            {stock}{stock && " · "}{he.butcher.ordersCount(activeOrders)}
          </p>
        </div>
      </Link>
      {/* live cuts are taken off sale first ("הסר מהפרסום"), then they can be removed here */}
      {cut.status !== "published" && (
        <button type="button" onClick={onRemove}
          className="absolute bottom-2 end-2 min-h-10 rounded-full px-3 text-sm font-semibold text-red-700 active:bg-red-50">
          {he.butcher.remove}
        </button>
      )}
    </li>
  );
}

export function StatusPill({ status }: { status: CutStatus }) {
  return (
    <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold",
      status === "published" && "bg-emerald-100 text-emerald-800",
      status === "draft" && "bg-amber-100 text-amber-900",
      status === "sold_out" && "bg-ink-3 text-ivory",
      status === "withdrawn" && "bg-red-100 text-red-800")}>
      {CUT_STATUS_LABEL[status]}
    </span>
  );
}
