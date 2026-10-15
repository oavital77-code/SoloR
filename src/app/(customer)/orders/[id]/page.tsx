"use client";
// C6 — order screen: live 4-step timeline, pickup details, cancel (only while "new").
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderTimeline } from "@/components/OrderTimeline";
import { BackLink } from "@/components/customer/market-ui";
import { MY_ORDER_SELECT, useMyOrdersRealtime, type MyOrderRow } from "@/components/customer/useMyOrders";
import { useToast } from "@/components/Toast";
import { Button, ConfirmDialog, ErrorState, Ltr, Spinner } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl, orderWhat } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { useBreeds, useButchers, useRefetchOnFocus } from "@/lib/hooks";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order, OrderEvent } from "@/lib/types";

export default function MyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const breeds = useBreeds();
  const butchers = useButchers();
  const toast = useToast();
  const [order, setOrder] = useState<MyOrderRow | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: o, error }, { data: ev }] = await Promise.all([
      sb.from("orders").select(MY_ORDER_SELECT).eq("id", id).maybeSingle(),
      sb.from("order_events").select("*").eq("order_id", id).order("id"),
    ]);
    if (error || !o) return setError(true);
    setOrder(o as MyOrderRow);
    setEvents((ev ?? []) as OrderEvent[]);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);
  // status changed live → reload to get the real event timestamps
  useMyOrdersRealtime(useCallback((o: Order) => { if (o.id === id) load(); }, [id, load]));

  async function cancel() {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("cancel_order", { p_order_id: id, p_reason: null });
    setBusy(false);
    setConfirm(false);
    if (error) { toast(errorText(error), { tone: "error" }); return load(); }
    toast(he.orders.cancelled, { tone: "success" });
    load();
  }

  if (error) return <div className="pt-20"><ErrorState dark text={he.orders.notFound} onRetry={() => { setError(false); load(); }} /></div>;
  if (!order) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  const butcher = butchers.find((b) => b.id === order.butcher_id);
  const cover = coverOf(order.cuts.cut_media);
  const title = cutTitle(order.cuts, breeds);

  return (
    <main className="min-h-dvh pb-28">
      <header className="sticky top-0 z-20 bg-ink/90 px-5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <BackLink href="/orders" label={he.app.back} />
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="font-display text-3xl font-bold text-ivory"><Ltr>#{order.order_number}</Ltr></h1>
          <OrderStatusBadge status={order.status} dark />
        </div>
      </header>

      <div className="flex flex-col gap-6 px-5 pt-2">
        {order.status === "ready" && (
          <div className="animate-fade-in rounded-xl bg-ivory p-4 text-center font-display text-xl font-bold text-ink" role="status">
            {he.orders.readyBanner}
          </div>
        )}
        <p className="font-display text-xl text-ivory">{ORDER_STATUS_LABEL[order.status]}</p>

        <section className="border-y border-ivory/10 py-5">
          <OrderTimeline status={order.status} events={events} dark />
          {order.status === "cancelled" && order.cancelled_by && (
            <p className="text-sm text-stone">
              {he.orders.cancelledBy(order.cancelled_by)}{order.cancel_reason && ` · ${he.orders.reason}: ${order.cancel_reason}`}
            </p>
          )}
        </section>

        <section className="flex gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-md bg-ink-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${order.cuts.code}`} className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <p className="font-display text-lg font-bold text-ivory">{title}</p>
            <p className="text-sm text-stone">{orderWhat(order)}</p>
            <p className="font-display text-xl font-bold text-ivory"><Ltr>₪{formatAgorot(order.total_agorot)}</Ltr></p>
            <Link href={`/cut/${order.cuts.code}`} className="min-h-9 py-1 text-sm text-gold underline-offset-4 hover:underline">{he.orders.toCut}</Link>
          </div>
        </section>

        {order.customer_note && (
          <section>
            <p className="eyebrow mb-1.5">{he.orders.note}</p>
            <p className="whitespace-pre-line">{order.customer_note}</p>
          </section>
        )}

        {butcher && (
          <section className="border-t border-ivory/10 pt-5">
            <h2 className="eyebrow mb-2">{he.orders.pickupDetails}</h2>
            <p className="font-display text-xl font-bold text-ivory">{butcher.name}</p>
            <p className="mt-1 text-[15px] text-ivory/80">{butcher.address}</p>
            {butcher.pickup_hours && <p className="text-sm text-stone">{butcher.pickup_hours}</p>}
            <div className="mt-1 flex gap-6 text-sm">
              <a className="min-h-10 py-2.5 text-gold underline-offset-4 hover:underline" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(butcher.address)}`}>{he.market.navigate}</a>
              <a href={`tel:${butcher.phone.replace(/-/g, "")}`} className="min-h-10 py-2.5 text-gold"><Ltr>{butcher.phone}</Ltr></a>
            </div>
          </section>
        )}

        {order.status === "new" && (
          <Button variant="dark" className="text-[#e8a0a8]!" onClick={() => setConfirm(true)}>{he.orders.cancel}</Button>
        )}
      </div>

      <ConfirmDialog open={confirm} danger loading={busy} text={he.orders.cancelConfirm} confirmLabel={he.orders.cancel}
        onConfirm={cancel} onCancel={() => setConfirm(false)} />
    </main>
  );
}
