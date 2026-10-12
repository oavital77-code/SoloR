"use client";
// C6 — order screen: live 4-step timeline, pickup details, cancel (only while "new").
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderTimeline } from "@/components/OrderTimeline";
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
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-ink/90 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Link href="/orders" aria-label={he.app.back} className="grid size-11 place-items-center"><ChevronRight className="size-6" /></Link>
        <h1 className="flex-1 text-2xl font-extrabold"><Ltr>#{order.order_number}</Ltr></h1>
        <OrderStatusBadge status={order.status} dark />
      </header>

      <div className="flex flex-col gap-4 px-4 pt-2">
        {order.status === "ready" && (
          <div className="animate-fade-in rounded-2xl bg-emerald-500 p-4 text-center text-xl font-extrabold text-white shadow-lg" role="status">
            {he.orders.readyBanner}
          </div>
        )}
        <p className="text-lg font-bold">{ORDER_STATUS_LABEL[order.status]}</p>

        <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <OrderTimeline status={order.status} events={events} dark />
          {order.status === "cancelled" && order.cancelled_by && (
            <p className="text-sm text-white/70">
              {he.orders.cancelledBy(order.cancelled_by)}{order.cancel_reason && ` · ${he.orders.reason}: ${order.cancel_reason}`}
            </p>
          )}
        </section>

        <section className="flex gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-ink-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${order.cuts.code}`} className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <p className="font-extrabold">{title}</p>
            <p className="text-sm text-white/75">{orderWhat(order)}</p>
            <p className="text-xl font-extrabold"><Ltr>₪{formatAgorot(order.total_agorot)}</Ltr></p>
            <Link href={`/cut/${order.cuts.code}`} className="text-sm font-semibold text-white/70 underline underline-offset-4">{he.orders.toCut}</Link>
          </div>
        </section>

        {order.customer_note && (
          <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <p className="text-sm text-white/60">{he.orders.note}</p>
            <p className="whitespace-pre-line">{order.customer_note}</p>
          </section>
        )}

        {butcher && (
          <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <h2 className="mb-2 font-extrabold">{he.orders.pickupDetails}</h2>
            <p className="font-bold">{butcher.name}</p>
            <a className="flex min-h-11 items-center gap-2 text-white/80 underline underline-offset-4" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(butcher.address)}`}>
              <MapPin className="size-4 text-brand" />{butcher.address}
            </a>
            {butcher.pickup_hours && <p className="text-sm text-white/60">{butcher.pickup_hours}</p>}
            <a href={`tel:${butcher.phone.replace(/-/g, "")}`} className="text-sm text-white/70"><Ltr>{butcher.phone}</Ltr></a>
          </section>
        )}

        {order.status === "new" && (
          <Button variant="dark" className="text-red-300!" onClick={() => setConfirm(true)}>{he.orders.cancel}</Button>
        )}
      </div>

      <ConfirmDialog open={confirm} danger loading={busy} text={he.orders.cancelConfirm} confirmLabel={he.orders.cancel}
        onConfirm={cancel} onCancel={() => setConfirm(false)} />
    </main>
  );
}
