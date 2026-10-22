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
import { money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order, OrderStatus } from "@/lib/types";
import { lineCode, lineCut, lineMedia, ORDER_ITEMS_EMBED, type ItemRow } from "../customer/useMyOrders";

/** An order line with its item and that item's parent (the same shape the customer side reads). */
export type ButcherItemRow = ItemRow;
/** A shop order with all its lines (stage 2: one order per shop per purchase). */
export type ButcherOrderRow = Order & {
  order_items: ButcherItemRow[];
  profiles: { full_name: string; phone: string } | null;
};

export const BUTCHER_ORDER_SELECT = `*, ${ORDER_ITEMS_EMBED}, profiles(full_name, phone)`;

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
          <ul className="grid items-start gap-4 px-4 pb-8 lg:grid-cols-2 xl:grid-cols-3">
            {rows.map((o) => <OrderCard key={o.id} order={o} breeds={breeds} now={now} />)}
          </ul>
        )}
    </div>
  );
}


/** One order at the counter (design: Counter): a white card whose edge is the status colour, the status chip and
 * the number, who and how it is received, what was bought and its codes. New orders glow bordeaux. */
function OrderCard({ order: o, breeds, now }: { order: ButcherOrderRow; breeds: ReturnType<typeof useBreeds>; now: number }) {
  const items = sortedItems(o);
  const active = items.filter((i) => i.status === "active");
  const shown = active.length ? active : items;
  const cover = shown[0] ? coverOf(lineMedia(shown[0])) : undefined;
  const edge = o.status === "preparing" ? "sr-ocard--prep" : o.status === "ready" ? "sr-ocard--ready"
    : o.status === "new" ? "" : "!border-s-line";
  return (
    <li>
      <Link href={`/butcher/orders/${o.id}`}
        className={clsx("sr-ocard active:opacity-90", edge, o.status === "new" && "shadow-[0_0_0_3px_rgb(163_18_42/0.18),var(--shadow-card)]")}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <OrderStatusBadge status={o.status} method={o.receive_method} />
            <span className="text-sm text-stone">{timeAgo(o.created_at, now)}</span>
          </span>
          <span className="code !text-[15px] !text-ivory">#{o.order_number}</span>
        </div>
        <div className="flex gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xl font-bold leading-7">
              {o.profiles?.full_name ?? "—"} · {o.receive_method === "delivery" ? he.checkout.deliveryLabel : he.butcherOrders.pickupShort}
            </span>
            {shown.map((i) => (
              <span key={i.id} className={clsx("text-[17px]", i.status === "cancelled" && "text-stone line-through")}>
                {cutTitle(lineCut(i), breeds).split(" · ")[0]} · {orderWhat(i, i.items)} <span className="code !text-sm">{lineCode(i)}</span>
              </span>
            ))}
            <Ltr className="text-sm font-semibold text-stone">{money(o.total_agorot)}</Ltr>
          </div>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="size-16 shrink-0 rounded-xl object-cover" loading="lazy" />
          )}
        </div>
      </Link>
    </li>
  );
}
