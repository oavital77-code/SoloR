"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { useButcher } from "./ButcherShell";
import { Chip, EmptyState, ErrorState, Ltr, Skeleton } from "../ui";
import { OrderStatusBadge } from "../OrderStatusBadge";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl, orderWhat, timeAgo } from "@/lib/cut-helpers";
export { orderWhat };
import { useBreeds, useNow, useRefetchOnFocus } from "@/lib/hooks";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Cut, CutMedia, Order, OrderStatus } from "@/lib/types";

export type ButcherOrderRow = Order & {
  cuts: Pick<Cut, "code" | "cut_type" | "breed_key" | "breed_other" | "steak_weight_g"> & { cut_media: CutMedia[] };
  profiles: { full_name: string; phone: string } | null;
};

export const BUTCHER_ORDER_SELECT =
  "*, cuts(code, cut_type, breed_key, breed_other, steak_weight_g, cut_media(*)), profiles(full_name, phone)";

const ACTIVE: OrderStatus[] = ["new", "preparing", "ready"];

export function OrderList() {
  const { butcher, ordersVersion } = useButcher();
  const breeds = useBreeds();
  const now = useNow();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [rows, setRows] = useState<ButcherOrderRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const q = supabaseBrowser().from("orders").select(BUTCHER_ORDER_SELECT).eq("butcher_id", butcher.id);
    const { data, error } = tab === "active"
      ? await q.in("status", ACTIVE).order("created_at", { ascending: false })
      : await q.in("status", ["completed", "cancelled"]).order("updated_at", { ascending: false }).limit(100);
    if (error) return setError(true);
    setError(false);
    const list = (data ?? []) as ButcherOrderRow[];
    // active orders: oldest first, so nothing waits at the bottom (review); new ones are highlighted
    if (tab === "active") list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    setRows(list);
  }, [butcher.id, tab]);

  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { load(); }, [ordersVersion, load]);
  useRefetchOnFocus(load);

  return (
    <div>
      <div className="flex gap-2 px-4 py-3">
        <Chip selected={tab === "active"} onClick={() => setTab("active")}>{he.butcherOrders.active}</Chip>
        <Chip selected={tab === "history"} onClick={() => setTab("history")}>{he.butcherOrders.history}</Chip>
      </div>
      {error ? <ErrorState onRetry={load} />
        : !rows ? <div className="flex flex-col gap-3 px-4">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : rows.length === 0 ? <EmptyState text={tab === "active" ? he.butcherOrders.empty : he.butcherOrders.emptyHistory} />
        : (
          <ul className="flex flex-col gap-3 px-4 pb-8">
            {rows.map((o) => <OrderCard key={o.id} order={o} title={cutTitle(o.cuts, breeds)} now={now} />)}
          </ul>
        )}
    </div>
  );
}


function OrderCard({ order: o, title, now }: { order: ButcherOrderRow; title: string; now: number }) {
  const cover = coverOf(o.cuts.cut_media);
  return (
    <li>
      <Link
        href={`/butcher/orders/${o.id}`}
        className={clsx(
          "flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 active:bg-neutral-50",
          o.status === "new" ? "ring-2 ring-brand" : "ring-neutral-200",
        )}
      >
        <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-neutral-200">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${o.cuts.code}`} className="h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className={clsx("text-lg", o.status === "new" ? "font-extrabold" : "font-bold")}>
              <Ltr>#{o.order_number}</Ltr>
            </span>
            <OrderStatusBadge status={o.status} />
          </div>
          <p className="text-sm text-neutral-500">{timeAgo(o.created_at, now)} · <Ltr>{o.cuts.code}</Ltr></p>
          <p className="font-semibold">{orderWhat(o)}</p>
          <p className="text-sm">
            <Ltr className="font-bold">₪{formatAgorot(o.total_agorot)}</Ltr>
            {o.profiles && <> · {o.profiles.full_name}</>}
          </p>
        </div>
      </Link>
    </li>
  );
}
