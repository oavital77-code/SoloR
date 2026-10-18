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
import type { Cut, CutMedia, Order, OrderItem, OrderStatus } from "@/lib/types";

export type ButcherItemRow = OrderItem & {
  cuts: Pick<Cut, "id" | "code" | "cut_type" | "breed_key" | "breed_other" | "steak_weight_g"> & { cut_media: CutMedia[] };
};
/** A shop order with all its lines (stage 2: one order per shop per purchase). */
export type ButcherOrderRow = Order & {
  order_items: ButcherItemRow[];
  profiles: { full_name: string; phone: string } | null;
};

export const BUTCHER_ORDER_SELECT =
  "*, order_items(*, cuts(id, code, cut_type, breed_key, breed_other, steak_weight_g, cut_media(*))), profiles(full_name, phone)";

/** Active lines first, then in the order they were bought. */
export function sortedItems(o: ButcherOrderRow): ButcherItemRow[] {
  return [...o.order_items].sort((a, b) =>
    Number(a.status === "cancelled") - Number(b.status === "cancelled") || a.created_at.localeCompare(b.created_at));
}

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
            {rows.map((o) => <OrderCard key={o.id} order={o} breeds={breeds} now={now} />)}
          </ul>
        )}
    </div>
  );
}


function OrderCard({ order: o, breeds, now }: { order: ButcherOrderRow; breeds: ReturnType<typeof useBreeds>; now: number }) {
  const items = sortedItems(o);
  const active = items.filter((i) => i.status === "active");
  const first = (active[0] ?? items[0])?.cuts;
  const title = first ? cutTitle(first, breeds) : "";
  const cover = first ? coverOf(first.cut_media) : undefined;
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
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${first?.code}`} className="h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className={clsx("text-lg", o.status === "new" ? "font-extrabold" : "font-bold")}>
              <Ltr>#{o.order_number}</Ltr>
            </span>
            <OrderStatusBadge status={o.status} method={o.receive_method} />
          </div>
          <p className="text-sm text-neutral-500">{timeAgo(o.created_at, now)} · {he.butcherOrders.itemsCount(active.length || items.length)}</p>
          <p className="font-semibold">
            {title}{items.length > 1 && <span className="font-normal text-neutral-500"> {he.orders.moreItems(items.length - 1)}</span>}
          </p>
          <p className="text-sm">
            <Ltr className="font-bold">₪{formatAgorot(o.total_agorot)}</Ltr>
            {o.profiles && <> · {o.profiles.full_name}</>}
          </p>
        </div>
      </Link>
    </li>
  );
}
