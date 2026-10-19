"use client";
// C6 — one purchase (design: Tracking): an order per shop, each with its own live timeline, lines and how it is received (spec §11).
// Delivery has its own last steps (out for delivery → delivered). Once ready, the butcher's photo of the order shows.
// A supplied weight outside ±5% shows the actual weight and the refund; a line the shop cancelled shows its credit.
// While a shop has not started preparing, the customer can cancel a single line or that shop's whole order.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { OrderTimeline } from "@/components/OrderTimeline";
import { ScreenHead } from "@/components/customer/market-ui";
import { ShopMark } from "@/components/ShopMark";
import { CHECKOUT_SELECT, normalizeCheckout, useMyOrdersRealtime, type CheckoutRow, type ItemRow, type ShopOrderRow } from "@/components/customer/useMyOrders";
import { useToast } from "@/components/Toast";
import { ConfirmDialog, ErrorState, Ltr, Spinner } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, formatDateTime, mediaUrl, orderWhat } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { orderStatusLabel } from "@/lib/labels";
import { formatWeight, money, weightOutcome } from "@/lib/pricing";
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
    <main className="min-h-dvh px-4 pb-12 text-start lg:mx-auto lg:w-full lg:max-w-[760px]">
      <ScreenHead title={he.orders.yours} back="/orders" backLabel={he.app.back}
        sub={<span className="code">#{k.checkout_number} · {formatDateTime(k.created_at)}</span>} />

      <div className="flex flex-col gap-[18px] pt-5">
        {k.orders.map((o) => (
          <ShopOrder key={o.id} order={o} events={events.filter((e) => e.order_id === o.id)} breeds={breeds}
            many={k.orders.length > 1}
            onCancelItem={(itemId) => setConfirm({ kind: "item", id: itemId })}
            onCancelOrder={() => setConfirm({ kind: "order", id: o.id })} />
        ))}
        <p className="sr-legal m-0">{he.cart.weightRules}</p>
      </div>

      <ConfirmDialog open={!!confirm} danger loading={busy}
        text={confirm?.kind === "item" ? he.orders.cancelItemConfirm : he.orders.cancelShopConfirm}
        confirmLabel={confirm?.kind === "item" ? he.orders.cancelItem : he.orders.cancel}
        onConfirm={run} onCancel={() => setConfirm(null)} />
    </main>
  );
}

/** One shop's part (design: Tracking): a card with the shop and where the order stands, the live timeline — the
 * butcher's photo of the prepared order under "ready" — the lines, the totals, and how it is received. */
function ShopOrder({ order: o, events, breeds, many, onCancelItem, onCancelOrder }: {
  order: ShopOrderRow; events: OrderEvent[]; breeds: ReturnType<typeof useBreeds>; many: boolean;
  onCancelItem: (id: string) => void; onCancelOrder: () => void;
}) {
  const shop = o.butchers;
  const open = o.status === "new";
  const activeCount = o.order_items.filter((i) => i.status === "active").length;
  const tone = o.status === "ready" || o.status === "completed" ? "text-success" : o.status === "cancelled" ? "text-stone" : "text-gold";
  const photo = (o.status === "ready" || o.status === "completed") && o.ready_photo_path ? (
    <figure className="relative m-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(o.ready_photo_path)} alt={he.orders.readyPhoto} className="block aspect-[4/3] w-full rounded-xl object-cover" />
      <figcaption className="mt-1.5 text-xs text-stone">{he.orders.readyPhotoBy}</figcaption>
    </figure>
  ) : null;
  return (
    <section className="sr-card !gap-4 !border-line-gold">
      <div className="flex items-center gap-2.5">
        {shop && <ShopMark shop={shop} size="sm" />}
        <div className="min-w-0 flex-1">
          <span className="font-display text-lg font-semibold">{shop?.name}</span>
          {many && <span className="code ms-2"> #{o.order_number}</span>}
        </div>
        <span className={clsx("text-[13px] font-semibold", tone)}>{orderStatusLabel(o.status, o.receive_method)}</span>
      </div>

      <OrderTimeline status={o.status} events={events} method={o.receive_method} dark now={photo} />
      {o.status === "completed" && photo}
      {o.status === "cancelled" && o.cancelled_by && (
        <p className="m-0 text-sm text-stone">
          {he.orders.cancelledBy(o.cancelled_by)}{o.cancel_reason && `  ·  ${he.orders.reason}: ${o.cancel_reason}`}
        </p>
      )}

      <ul className="m-0 flex list-none flex-col border-t border-line p-0">
        {o.order_items.map((i, n) => (
          <ItemLine key={i.id} item={i} title={cutTitle(i.cuts, breeds)} last={n === o.order_items.length - 1}
            canCancel={open && i.status === "active"} onCancel={() => onCancelItem(i.id)} />
        ))}
      </ul>
      <Totals order={o} />

      {o.customer_note && (
        <div className="flex flex-col gap-1">
          <span className="sr-eyebrow">{he.orders.note}</span>
          <p className="m-0 whitespace-pre-line text-ivory/85">{o.customer_note}</p>
        </div>
      )}

      {o.receive_method === "delivery" && o.delivery_address ? (
        <div className="flex flex-col gap-1">
          <span className="sr-eyebrow">{he.orders.deliveryDetails}</span>
          <p className="m-0 text-[15px] text-ivory/85">{o.delivery_address.name} · <Ltr>{o.delivery_address.phone}</Ltr></p>
          <p className="m-0 text-[15px] text-ivory/80">{o.delivery_address.street}, {o.delivery_address.city}</p>
          {o.delivery_address.notes && <p className="m-0 text-sm text-stone">{o.delivery_address.notes}</p>}
          <p className="m-0 text-sm text-stone">
            {he.orders.window}: {o.delivery_window ? isolateTimes(o.delivery_window) : he.checkout.pendingCoordination}
          </p>
          {shop && <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="min-h-10 self-start py-2.5 text-sm font-semibold text-gold"><Ltr>{shop.phone}</Ltr></a>}
        </div>
      ) : shop && (
        <div className="flex flex-col gap-1">
          <span className="sr-eyebrow">{he.orders.pickupDetails}</span>
          <p className="m-0 text-[15px] text-ivory/80">{shop.address}</p>
          {shop.pickup_hours && <p className="m-0 text-sm text-stone">{isolateTimes(shop.pickup_hours)}</p>}
          <div className="flex gap-6 text-sm">
            <a className="sr-link min-h-10" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`}>{he.market.navigate}</a>
            <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="min-h-10 py-2.5 font-semibold text-gold"><Ltr>{shop.phone}</Ltr></a>
          </div>
        </div>
      )}

      {open && activeCount > 0 && (
        <div className="flex flex-col items-start gap-0.5">
          <button type="button" onClick={onCancelOrder} className="min-h-11 text-sm text-sold underline-offset-4 hover:underline">
            {many ? he.orders.cancelShop : he.orders.cancel}
          </button>
          <p className="m-0 text-xs text-stone">{he.orders.canCancelUntil}</p>
        </div>
      )}
    </section>
  );
}

function ItemLine({ item: i, title, canCancel, onCancel, last }: { item: ItemRow; title: string; canCancel: boolean; onCancel: () => void; last: boolean }) {
  const cover = coverOf(i.cuts.cut_media);
  const cancelled = i.status === "cancelled";
  return (
    <li className={clsx("sr-cartrow !items-start", cancelled && "sr-cartrow--sold", last && "!border-b-0")}>
      <Link href={`/cut/${i.cuts.code}`} className="block size-16 overflow-hidden rounded-lg bg-ink-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${i.cuts.code}`} />}
      </Link>
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/cut/${i.cuts.code}`} className={clsx("sr-cartrow__title", cancelled && "text-stone line-through")}>{title}</Link>
        <span className="sr-cartrow__sub">{orderWhat(i)} · <span className="code">{i.cuts.code}</span></span>
        {cancelled && i.cancelled_by && (
          <span className="sr-cartrow__warn">{he.orders.itemCancelledBy(i.cancelled_by)}{i.cancel_reason && `  ·  ${i.cancel_reason}`}</span>
        )}
        {cancelled && <span className="text-[13px] font-semibold text-gold">{he.orders.credit(money(i.total_agorot))}</span>}
        {!cancelled && <Supplied item={i} />}
        {canCancel && (
          <button type="button" onClick={onCancel} className="min-h-10 self-start text-xs text-stone underline-offset-4 hover:underline">
            {he.orders.cancelItem}
          </button>
        )}
      </div>
      <Ltr className={clsx("font-semibold", cancelled && "text-stone line-through")}>{money(i.total_agorot)}</Ltr>
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
    <div className="mt-1 flex flex-col gap-1 rounded-xl bg-gold-soft px-3 py-2.5 text-sm">
      <p className="m-0">{he.orders.supplied(formatWeight(i.delivered_weight_g), formatWeight(i.est_weight_g))}</p>
      {out.kind === "under" ? (
        <p className="m-0 font-semibold text-gold">
          {he.orders.refund(money(refund))} · {he.orders.refundStatus[i.refund_status ?? "pending"]}
        </p>
      ) : <p className="m-0 text-stone">{he.orders.overWeight}</p>}
    </div>
  );
}

/** What this shop's part costs now: its live lines, delivery, and what is coming back (credits and refunds). */
function Totals({ order: o }: { order: ShopOrderRow }) {
  const credits = o.order_items.reduce((s, i) => s + (i.status === "cancelled" ? i.total_agorot : (i.refund_agorot ?? 0)), 0);
  if (o.status === "cancelled" && !credits) return null;
  return (
    <dl className="m-0 flex w-full flex-col gap-1.5 text-sm">
      {o.status !== "cancelled" && (
        <div className="flex justify-between"><dt className="text-stone">{he.orders.total}</dt><dd><Ltr className="font-semibold text-ivory">{money(o.total_agorot)}</Ltr></dd></div>
      )}
      {o.delivery_fee_agorot > 0 && (
        <div className="flex justify-between"><dt className="text-stone">{he.orders.deliveryFee}</dt><dd><Ltr className="text-ivory">{money(o.delivery_fee_agorot)}</Ltr></dd></div>
      )}
      {credits > 0 && (
        <div className="flex justify-between"><dt className="text-stone">{he.orders.credits}</dt><dd><Ltr className="font-semibold text-gold">{money(credits)}</Ltr></dd></div>
      )}
    </dl>
  );
}
