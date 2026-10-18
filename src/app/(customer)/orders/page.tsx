"use client";
// C6 — my orders: one row per purchase, with each shop's status live. Spec §12 splits it in two:
// "ההזמנות שלי" (still open) and "היסטוריה" (?view=history: every shop's part collected or cancelled).
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { CHECKOUT_SELECT, normalizeCheckout, useMyOrdersRealtime, type CheckoutRow } from "@/components/customer/useMyOrders";
import { Button, EmptyState, ErrorState, Ltr, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, formatDateTime, mediaUrl } from "@/lib/cut-helpers";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";

const finished = (k: CheckoutRow) => k.orders.every((o) => o.status === "completed" || o.status === "cancelled");

export default function MyOrdersPage() {
  return <Suspense><MyOrders /></Suspense>;
}

function MyOrders() {
  const history = useSearchParams().get("view") === "history";
  const breeds = useBreeds();
  const [rows, setRows] = useState<CheckoutRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("checkouts").select(CHECKOUT_SELECT)
      .order("created_at", { ascending: false }).limit(50);
    if (error) return setError(true);
    setError(false);
    setRows(((data ?? []) as CheckoutRow[]).map(normalizeCheckout).filter((k) => finished(k) === history));
  }, [history]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);
  useMyOrdersRealtime(load);

  return (
    <main className="min-h-dvh pb-24">
      <header className="flex flex-col items-center bg-ink/90 px-4 pt-4 pb-3 backdrop-blur">
        <h1 className="font-display text-3xl font-bold text-ivory">{history ? he.nav.history : he.orders.title}</h1>
        <Link href={history ? "/orders" : "/orders?view=history"} className="min-h-10 py-2.5 text-sm text-ivory/70 underline-offset-4 hover:underline">
          {history ? he.orders.title : he.nav.history}
        </Link>
      </header>
      {error && !rows ? <ErrorState dark onRetry={load} />
        : !rows ? <div className="flex flex-col gap-3 px-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : rows.length === 0 ? (
          <EmptyState text={history ? he.orders.emptyHistory : he.orders.empty}><Link href="/"><Button variant="dark">{he.cart.toMarket}</Button></Link></EmptyState>
        ) : (
          <ul className="mx-4 divide-y divide-ivory/10 border-y border-ivory/10">
            {rows.map((k) => {
              const items = k.orders.flatMap((o) => o.order_items);
              const live = k.orders.filter((o) => o.status !== "cancelled");
              const total = live.length ? live.reduce((s, o) => s + o.total_agorot, 0) : k.total_agorot;
              const first = items[0];
              return (
                <li key={k.id}>
                  <Link href={`/orders/${k.id}`} className="flex flex-col items-center gap-2 py-5 active:bg-ivory/[0.03]">
                    <div className="flex justify-center gap-1.5">
                      {items.slice(0, 3).map((i) => {
                        const cover = coverOf(i.cuts.cut_media);
                        return (
                          <div key={i.id} className="size-16 overflow-hidden rounded-md bg-ink-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${cutTitle(i.cuts, breeds)} ${i.cuts.code}`} className="h-full w-full object-cover" loading="lazy" />}
                          </div>
                        );
                      })}
                    </div>
                    <p className="font-display text-lg font-bold text-ivory">
                      {first ? cutTitle(first.cuts, breeds) : ""}{items.length > 1 && <span className="text-sm font-medium text-stone"> {he.orders.moreItems(items.length - 1)}</span>}
                    </p>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                      {k.orders.map((o) => (
                        <span key={o.id} className="flex items-center gap-1.5 text-xs text-stone">
                          {k.orders.length > 1 && o.butchers?.name}
                          <OrderStatusBadge status={o.status} dark />
                        </span>
                      ))}
                    </div>
                    <p className="text-sm">
                      <Ltr className="font-semibold text-ivory">₪{formatAgorot(total)}</Ltr>  ·  <span className="text-stone"><Ltr>#{k.checkout_number}</Ltr>  ·  {formatDateTime(k.created_at)}</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </main>
  );
}
