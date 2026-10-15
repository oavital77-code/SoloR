"use client";
// C6 — one purchase: an order per shop, each with its own live timeline, lines and pickup details.
// While a shop has not started preparing, the customer can cancel a single line or that shop's whole order.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderTimeline } from "@/components/OrderTimeline";
import { BackLink } from "@/components/customer/market-ui";
import { CHECKOUT_SELECT, normalizeCheckout, useMyOrdersRealtime, type CheckoutRow, type ItemRow, type ShopOrderRow } from "@/components/customer/useMyOrders";
import { useToast } from "@/components/Toast";
import { ConfirmDialog, ErrorState, Ltr, Spinner } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, formatDateTime, mediaUrl, orderWhat } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { OrderEvent } from "@/lib/types";

type Pending = { kind: "item"; id: string } | { kind: "order"; id: string };

export default function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const breeds = useBreeds();
  const toast = useToast();
  const [k, setK] = useState<CheckoutRow | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data, error } = await sb.from("checkouts").select(CHECKOUT_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return setError(true);
    const row = normalizeCheckout(data as CheckoutRow);
    const { data: ev } = await sb.from("order_events").select("*").in("order_id", row.orders.map((o) => o.id)).order("id");
    setK(row);
    setEvents((ev ?? []) as OrderEvent[]);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);
  useMyOrdersRealtime(load);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = confirm.kind === "item"
      ? await sb.rpc("cancel_order_item", { p_item_id: confirm.id, p_reason: null, p_restock: true })
      : await sb.rpc("cancel_order", { p_order_id: confirm.id, p_reason: null });
    setBusy(false);
    const kind = confirm.kind;
    setConfirm(null);
    if (error) toast(errorText(error), { tone: "error" });
    else toast(kind === "item" ? he.orders.itemCancelled : he.orders.cancelled, { tone: "success" });
    load();
  }

  if (error) return <div className="pt-20"><ErrorState dark text={he.orders.notFound} onRetry={() => { setError(false); load(); }} /></div>;
  if (!k) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  return (
    <main className="min-h-dvh pb-28">
      <header className="sticky top-0 z-20 bg-ink/90 px-5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <BackLink href="/orders" label={he.app.back} />
        <h1 className="mt-1 font-display text-3xl font-bold text-ivory"><Ltr>{he.orders.purchase(k.checkout_number)}</Ltr></h1>
        <p className="text-xs text-stone">{formatDateTime(k.created_at)}</p>
      </header>

      <div className="flex flex-col gap-10 px-5 pt-2">
        {k.orders.map((o) => (
          <ShopOrder key={o.id} order={o} events={events.filter((e) => e.order_id === o.id)} breeds={breeds}
            many={k.orders.length > 1}
            onCancelItem={(itemId) => setConfirm({ kind: "item", id: itemId })}
            onCancelOrder={() => setConfirm({ kind: "order", id: o.id })} />
        ))}

        <section className="border-t border-ivory/10 pt-5">
          <p className="eyebrow mb-2">{he.cart.weightRulesTitle}</p>
          <p className="text-xs leading-relaxed text-stone">{he.cart.weightRules}</p>
        </section>
      </div>

      <ConfirmDialog open={!!confirm} danger loading={busy}
        text={confirm?.kind === "item" ? he.orders.cancelItemConfirm : he.orders.cancelShopConfirm}
        confirmLabel={confirm?.kind === "item" ? he.orders.cancelItem : he.orders.cancel}
        onConfirm={run} onCancel={() => setConfirm(null)} />
    </main>
  );
}

function ShopOrder({ order: o, events, breeds, many, onCancelItem, onCancelOrder }: {
  order: ShopOrderRow; events: OrderEvent[]; breeds: ReturnType<typeof useBreeds>; many: boolean;
  onCancelItem: (id: string) => void; onCancelOrder: () => void;
}) {
  const shop = o.butchers;
  const open = o.status === "new";
  const activeCount = o.order_items.filter((i) => i.status === "active").length;
  return (
    <section className="flex flex-col gap-5 border-t border-ivory/10 pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col items-center gap-1.5">
        {shop && <p className="eyebrow">{shop.name}</p>}
        {many && <p className="text-xs text-stone"><Ltr>{he.orders.shopOrder(o.order_number)}</Ltr></p>}
        <OrderStatusBadge status={o.status} dark />
        <p className="font-display text-xl text-ivory">{ORDER_STATUS_LABEL[o.status]}</p>
      </div>

      {o.status === "ready" && (
        <div className="animate-fade-in rounded-xl bg-ivory p-4 font-display text-xl font-bold text-ink" role="status">
          {shop ? he.orders.readyAt(shop.name) : he.orders.readyBanner}
        </div>
      )}

      <div className="border-y border-ivory/10 py-5">
        <OrderTimeline status={o.status} events={events} dark />
        {o.status === "cancelled" && o.cancelled_by && (
          <p className="text-sm text-stone">
            {he.orders.cancelledBy(o.cancelled_by)}{o.cancel_reason && `  ·  ${he.orders.reason}: ${o.cancel_reason}`}
          </p>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-ivory/10">
        {o.order_items.map((i) => (
          <ItemLine key={i.id} item={i} title={cutTitle(i.cuts, breeds)}
            canCancel={open && i.status === "active"} onCancel={() => onCancelItem(i.id)} />
        ))}
      </ul>
      {o.status !== "cancelled" && (
        <p className="text-sm text-stone">{he.orders.total}: <Ltr className="font-semibold text-ivory">₪{formatAgorot(o.total_agorot)}</Ltr></p>
      )}

      {o.customer_note && (
        <div>
          <p className="eyebrow mb-1.5">{he.orders.note}</p>
          <p className="whitespace-pre-line text-ivory/85">{o.customer_note}</p>
        </div>
      )}

      {shop && (
        <div>
          <p className="eyebrow mb-2">{he.orders.pickupDetails}</p>
          <p className="text-[15px] text-ivory/80">{shop.address}</p>
          {shop.pickup_hours && <p className="text-sm text-stone">{shop.pickup_hours}</p>}
          <div className="mt-1 flex justify-center gap-6 text-sm">
            <a className="min-h-10 py-2.5 text-gold underline-offset-4 hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`}>{he.market.navigate}</a>
            <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="min-h-10 py-2.5 text-gold"><Ltr>{shop.phone}</Ltr></a>
          </div>
        </div>
      )}

      {open && activeCount > 0 && (
        <div className="flex flex-col items-center gap-1">
          <button type="button" onClick={onCancelOrder} className="min-h-11 text-sm text-[#e8a0a8] underline-offset-4 hover:underline">
            {many ? he.orders.cancelShop : he.orders.cancel}
          </button>
          <p className="text-xs text-stone">{he.orders.canCancelUntil}</p>
        </div>
      )}
    </section>
  );
}

function ItemLine({ item: i, title, canCancel, onCancel }: { item: ItemRow; title: string; canCancel: boolean; onCancel: () => void }) {
  const cover = coverOf(i.cuts.cut_media);
  const cancelled = i.status === "cancelled";
  return (
    <li className="flex flex-col items-center gap-1.5 py-4">
      <Link href={`/cut/${i.cuts.code}`} className="flex flex-col items-center gap-1.5">
        <div className={clsx("size-16 overflow-hidden rounded-md bg-ink-3", cancelled && "opacity-40 grayscale")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${i.cuts.code}`} className="h-full w-full object-cover" />}
        </div>
        <p className={clsx("font-display text-lg font-bold", cancelled ? "text-stone line-through" : "text-ivory")}>{title}</p>
      </Link>
      <p className="text-sm text-stone">{orderWhat(i)}  ·  <Ltr>{i.cuts.code}</Ltr></p>
      <p className={clsx("font-semibold", cancelled ? "text-stone line-through" : "text-ivory")}><Ltr>₪{formatAgorot(i.total_agorot)}</Ltr></p>
      {cancelled && i.cancelled_by && (
        <p className="text-xs text-[#e8a0a8]">{he.orders.itemCancelledBy(i.cancelled_by)}{i.cancel_reason && `  ·  ${i.cancel_reason}`}</p>
      )}
      {canCancel && (
        <button type="button" onClick={onCancel} className="min-h-10 text-xs text-ivory/60 underline-offset-4 hover:underline">
          {he.orders.cancelItem}
        </button>
      )}
    </li>
  );
}
