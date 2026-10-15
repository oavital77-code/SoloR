"use client";
// C6 — my orders, live status.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { MY_ORDER_SELECT, useMyOrdersRealtime, type MyOrderRow } from "@/components/customer/useMyOrders";
import { Button, EmptyState, ErrorState, Ltr, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, formatDateTime, mediaUrl, orderWhat } from "@/lib/cut-helpers";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";


export default function MyOrdersPage() {
  const breeds = useBreeds();
  const [rows, setRows] = useState<MyOrderRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("orders").select(MY_ORDER_SELECT).order("created_at", { ascending: false }).limit(100);
    if (error) return setError(true);
    setError(false);
    setRows((data ?? []) as MyOrderRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);
  useMyOrdersRealtime(useCallback((o: Order) => {
    setRows((rs) => {
      if (!rs) return rs;
      if (!rs.some((r) => r.id === o.id)) { load(); return rs; }
      return rs.map((r) => (r.id === o.id ? { ...r, ...o } : r));
    });
  }, [load]));

  return (
    <main className="min-h-dvh pb-24">
      <header className="sticky top-0 z-20 flex flex-col items-center bg-ink/90 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <h1 className="font-display text-3xl font-bold text-ivory">{he.orders.title}</h1>
        <Link href="/profile" className="min-h-10 py-2.5 text-sm text-ivory/75">{he.nav.profile}</Link>
      </header>
      {error && !rows ? <ErrorState dark onRetry={load} />
        : !rows ? <div className="flex flex-col gap-3 px-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : rows.length === 0 ? (
          <EmptyState text={he.orders.empty}><Link href="/"><Button variant="dark">{he.orders.toFeed}</Button></Link></EmptyState>
        ) : (
          <ul className="mx-4 divide-y divide-ivory/10 border-y border-ivory/10">
            {rows.map((o) => {
              const cover = coverOf(o.cuts.cut_media);
              const title = cutTitle(o.cuts, breeds);
              return (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex flex-col items-center gap-2 py-5 active:bg-ivory/[0.03]">
                    <div className="size-20 shrink-0 overflow-hidden rounded-md bg-ink-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${o.cuts.code}`} className="h-full w-full object-cover" loading="lazy" />}
                    </div>
                    <div className="flex min-w-0 flex-col items-center gap-0.5">
                      <div className="flex flex-col items-center gap-1">
                        <p className="truncate font-display text-lg font-bold text-ivory">{title}</p>
                        <OrderStatusBadge status={o.status} dark />
                      </div>
                      <p className="text-sm text-stone">{orderWhat(o)}</p>
                      <p className="text-sm"><Ltr className="font-semibold text-ivory">₪{formatAgorot(o.total_agorot)}</Ltr>  ·  <span className="text-stone">{formatDateTime(o.created_at)}</span></p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
    </main>
  );
}
