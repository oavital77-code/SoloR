"use client";
// C6 — my orders, live status.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
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
      <header className="sticky top-0 z-20 flex items-center justify-between bg-ink/90 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <h1 className="text-2xl font-extrabold">{he.orders.title}</h1>
        <Link href="/profile" aria-label={he.nav.profile} className="grid size-11 place-items-center rounded-full bg-white/10"><UserRound className="size-5" /></Link>
      </header>
      {error && !rows ? <ErrorState dark onRetry={load} />
        : !rows ? <div className="flex flex-col gap-3 px-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : rows.length === 0 ? (
          <EmptyState text={he.orders.empty}><Link href="/"><Button variant="dark">{he.orders.toFeed}</Button></Link></EmptyState>
        ) : (
          <ul className="flex flex-col gap-3 px-4">
            {rows.map((o) => {
              const cover = coverOf(o.cuts.cut_media);
              const title = cutTitle(o.cuts, breeds);
              return (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 active:bg-white/10">
                    <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-ink-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${o.cuts.code}`} className="h-full w-full object-cover" loading="lazy" />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-extrabold">{title}</p>
                        <OrderStatusBadge status={o.status} dark />
                      </div>
                      <p className="text-sm text-white/75">{orderWhat(o)}</p>
                      <p className="text-sm"><Ltr className="font-bold">₪{formatAgorot(o.total_agorot)}</Ltr> · <span className="text-white/60">{formatDateTime(o.created_at)}</span></p>
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
