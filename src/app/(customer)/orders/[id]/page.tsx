"use client";
// C6 — one purchase: an order per shop, each with its own live timeline, lines and how it is received (spec §11).
// Delivery has its own last steps (out for delivery → delivered). Once ready, the butcher's photo of the order shows.
// A supplied weight outside ±5% shows the actual weight and the refund; a line the shop cancelled shows its credit.
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
import { orderStatusLabel } from "@/lib/labels";
import { formatAgorot, formatWeight, weightOutcome } from "@/lib/pricing";
import { isolateTimes } from "@/lib/hours";
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
      <header className="bg-ink/90 px-5 pt-2 pb-3 backdrop-blur">
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
        <OrderStatusBadge status={o.status} method={o.receive_method} dark />
        <p className="font-display text-xl text-ivory">{orderStatusLabel(o.status, o.receive_method)}</p>
      </div>

      {o.status === "ready" && (
        <div className="animate-fade-in rounded-xl bg-ivory p-4 font-display text-xl font-bold text-ink" role="status">
          {o.receive_method === "delivery" ? he.orders.outForDelivery(shop?.name ?? "") : shop ? he.orders.readyAt(shop.name) : he.orders.readyBanner}
        </div>
      )}

      {/* the prepared order, only once it is ready or on its way (spec §11) */}
      {(o.status === "ready" || o.status === "completed") && o.ready_photo_path && (
        <figure className="overflow-hidden rounded-2xl ring-1 ring-gold/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(o.ready_photo_path)} alt={he.orders.readyPhoto} className="aspect-[4/3] w-full object-cover" />
          <figcaption className="bg-ink-2 px-3 py-2 text-sm text-ivory/80">{he.orders.readyPhoto} · <span className="text-stone">{he.orders.readyPhotoBy}</span></figcaption>
        </figure>
      )}

      <div className="border-y border-ivory/10 py-5">
        <OrderTimeline status={o.status} events={events} method={o.receive_method} dark />
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
      <Totals order={o} />

      {o.customer_note && (
        <div>
          <p className="eyebrow mb-1.5">{he.orders.note}</p>
          <p className="whitespace-pre-line text-ivory/85">{o.customer_note}</p>
        </div>
      )}

      {o.receive_method === "delivery" && o.delivery_address ? (
        <div>
          <p className="eyebrow mb-2">{he.orders.deliveryDetails}</p>
          <p className="text-[15px] text-ivory/85">{o.delivery_address.name} · <Ltr>{o.delivery_address.phone}</Ltr></p>
          <p className="text-[15px] text-ivory/80">{o.delivery_address.street}, {o.delivery_address.city}</p>
          {o.delivery_address.notes && <p className="text-sm text-stone">{o.delivery_address.notes}</p>}
          <p className="mt-1 text-sm text-stone">
            {he.orders.window}: {o.delivery_window ? isolateTimes(o.delivery_window) : he.checkout.pendingCoordination}
          </p>
          {shop && <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="mt-1 inline-block min-h-10 py-2.5 text-sm text-gold"><Ltr>{shop.phone}</Ltr></a>}
        </div>
      ) : shop && (
        <div>
          <p className="eyebrow mb-2">{he.orders.pickupDetails}</p>
          <p className="text-[15px] text-ivory/80">{shop.address}</p>
          {shop.pickup_hours && <p className="text-sm text-stone">{isolateTimes(shop.pickup_hours)}</p>}
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
      {cancelled && <p className="text-sm font-semibold text-gold">{he.orders.credit(`₪${formatAgorot(i.total_agorot)}`)}</p>}
      {!cancelled && <Supplied item={i} />}
      {canCancel && (
        <button type="button" onClick={onCancel} className="min-h-10 text-xs text-ivory/60 underline-offset-4 hover:underline">
          {he.orders.cancelItem}
        </button>
      )}
    </li>
  );
}

/** The supplied weight, only when it is outside ±5% (spec §11): the actual weight and the refund and its state. */
function Supplied({ item: i }: { item: ItemRow }) {
  if (!i.delivered_weight_g) return null;
  const out = weightOutcome(i.est_weight_g, i.delivered_weight_g, i.price_per_kg_agorot);
  if (out.kind === "within") return null;
  const refund = i.refund_agorot ?? (out.kind === "under" ? out.refund : 0);
  return (
    <div className="flex flex-col items-center gap-0.5 text-sm">
      <p className="text-ivory/80">{he.orders.supplied(formatWeight(i.delivered_weight_g), formatWeight(i.est_weight_g))}</p>
      {out.kind === "under" ? (
        <p className="font-semibold text-gold">
          {he.orders.refund(`₪${formatAgorot(refund)}`)} · {he.orders.refundStatus[i.refund_status ?? "pending"]}
        </p>
      ) : <p className="text-stone">{he.orders.overWeight}</p>}
    </div>
  );
}

/** What this shop's part costs now: its live lines, delivery, and what is coming back (credits and refunds). */
function Totals({ order: o }: { order: ShopOrderRow }) {
  const credits = o.order_items.reduce((s, i) => s + (i.status === "cancelled" ? i.total_agorot : (i.refund_agorot ?? 0)), 0);
  if (o.status === "cancelled" && !credits) return null;
  return (
    <dl className="mx-auto flex w-full max-w-xs flex-col gap-1 text-sm">
      {o.status !== "cancelled" && (
        <div className="flex justify-between"><dt className="text-stone">{he.orders.total}</dt><dd><Ltr className="font-semibold text-ivory">₪{formatAgorot(o.total_agorot)}</Ltr></dd></div>
      )}
      {o.delivery_fee_agorot > 0 && (
        <div className="flex justify-between"><dt className="text-stone">{he.orders.deliveryFee}</dt><dd><Ltr className="text-ivory">₪{formatAgorot(o.delivery_fee_agorot)}</Ltr></dd></div>
      )}
      {credits > 0 && (
        <div className="flex justify-between"><dt className="text-stone">{he.orders.credits}</dt><dd><Ltr className="font-semibold text-gold">₪{formatAgorot(credits)}</Ltr></dd></div>
      )}
    </dl>
  );
}
