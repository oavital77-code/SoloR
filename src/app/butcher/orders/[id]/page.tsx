"use client";
// B5 — order screen for the butcher: every line to pick and pack, customer phone, timeline, one big next-step button.
// A single line can be cancelled with a reason (and the meat returned to stock or not); so can the whole order.
// While packing, the butcher records each line's actual weight (the ±5% rule decides any refund) and can photograph
// the prepared order — the customer sees the photo once it is ready (customer spec §11).
// Delivery orders show where they go and when (delivery is off in the pilot).
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useButcher } from "@/components/butcher/ButcherShell";
import { BUTCHER_ORDER_SELECT, orderWhat, sortedItems, type ButcherItemRow, type ButcherOrderRow } from "@/components/butcher/OrderList";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderTimeline } from "@/components/OrderTimeline";
import { useToast } from "@/components/Toast";
import { BottomSheet, Button, Chip, ErrorState, Ltr, Spinner, Toggle, inputClass } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, formatDateTime, mediaUrl } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { clsx } from "clsx";
import { formatWeight, money } from "@/lib/pricing";
import { MEDIA_BUCKET } from "@/lib/cut-helpers";
import { prepareImage, removeStorageObjects } from "@/lib/upload";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { OrderEvent, OrderStatus } from "@/lib/types";

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { new: "preparing", preparing: "ready", ready: "completed" };

export default function ButcherOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ordersVersion, butcher } = useButcher();
  const breeds = useBreeds();
  const toast = useToast();
  const [order, setOrder] = useState<ButcherOrderRow | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState<{ item?: ButcherItemRow } | null>(null);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: o, error }, { data: ev }] = await Promise.all([
      sb.from("orders").select(BUTCHER_ORDER_SELECT).eq("id", id).maybeSingle(),
      sb.from("order_events").select("*").eq("order_id", id).order("id"),
    ]);
    if (error || !o) return setError(true);
    setOrder(o as ButcherOrderRow);
    setEvents((ev ?? []) as OrderEvent[]);
  }, [id]);

  useEffect(() => { load(); }, [load, ordersVersion]);
  useRefetchOnFocus(load);

  async function advance() {
    if (!order) return;
    const to = NEXT[order.status];
    if (!to) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("advance_order", { p_order_id: order.id, p_to_status: to });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    load();
  }

  if (error) return <ErrorState text={he.orders.notFound} onRetry={() => { setError(false); load(); }} />;
  if (!order) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  const items = sortedItems(order);
  const next = NEXT[order.status];
  const canCancel = !["completed", "cancelled"].includes(order.status);

  return (
    <main className="flex min-h-dvh flex-col lg:mx-auto lg:w-full lg:max-w-[760px]">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-ink/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Link href="/butcher?tab=orders" className="flex min-h-11 items-center px-2 text-sm font-semibold text-stone">{he.app.back}</Link>
        <h1 className="flex-1 font-display text-2xl font-bold"><span className="code !text-2xl !text-ivory">#{order.order_number}</span></h1>
        <OrderStatusBadge status={order.status} method={order.receive_method} />
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <section className="rounded-2xl bg-ink-2 p-3 shadow-[var(--shadow-card)]">
          <h2 className="mb-2 px-1 font-extrabold">{he.butcherOrders.items} · {he.butcherOrders.itemsCount(items.filter((i) => i.status === "active").length)}</h2>
          <ul className="flex flex-col divide-y divide-line">
            {items.map((i) => (
              <ItemRow key={i.id} item={i} title={cutTitle(i.cuts, breeds)}
                onCancel={canCancel && i.status === "active" ? () => setCancel({ item: i }) : undefined}
                canWeigh={canCancel && i.status === "active"} onWeighed={load} />
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
          <p className="text-2xl font-extrabold"><Ltr>{money(order.total_agorot)}</Ltr></p>
          <p className="mt-1 text-sm text-stone">{formatDateTime(order.created_at)}</p>
          {order.customer_note && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="text-sm font-bold text-amber-900">{he.butcherOrders.note}</p>
              <p className="whitespace-pre-line">{order.customer_note}</p>
            </div>
          )}
          {order.status === "cancelled" && order.cancel_reason && (
            <p className="mt-3 text-sm text-stone">{he.orders.reason}: {order.cancel_reason}</p>
          )}
        </section>

        {order.receive_method === "delivery" && order.delivery_address && (
          <section className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
            <p className="text-sm text-stone">{he.butcherOrders.delivery}</p>
            <p className="text-lg font-bold">{order.delivery_address.name} · <Ltr>{order.delivery_address.phone}</Ltr></p>
            <p>{order.delivery_address.street}, {order.delivery_address.city}</p>
            {order.delivery_address.notes && <p className="text-sm text-stone">{order.delivery_address.notes}</p>}
            <p className="mt-1 text-sm font-semibold">{order.delivery_window ?? he.butcherOrders.pendingCoordination}</p>
          </section>
        )}

        {order.status !== "cancelled" && butcher && (
          <ReadyPhoto orderId={order.id} butcherId={butcher.id} path={order.ready_photo_path} onDone={load} />
        )}

        {order.profiles && (
          <section className="flex items-center justify-between rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
            <div>
              <p className="text-sm text-stone">{he.butcherOrders.customer}</p>
              <p className="text-lg font-bold">{order.profiles.full_name}</p>
              <Ltr className="text-stone">{order.profiles.phone}</Ltr>
            </div>
            <a href={`tel:${order.profiles.phone.replace(/-/g, "")}`} className="flex min-h-12 items-center gap-2 rounded-2xl bg-success px-4 font-bold text-white">
              {he.butcherOrders.call}
            </a>
          </section>
        )}

        <section className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 font-extrabold">{he.orders.timeline}</h2>
          <OrderTimeline status={order.status} events={events} method={order.receive_method} />
        </section>
      </div>

      {(next || canCancel) && (
        <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-ink-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {next && (
            // the counter's one big button per step (design: Counter): bordeaux to start, ink when it is ready, green on hand-over
            <button type="button" disabled={busy} onClick={advance}
              className={clsx("sr-cbtn", order.status === "new" && "sr-cbtn--new", order.status === "ready" && "sr-cbtn--ready")}>
              {busy && <Spinner />}
              {(order.receive_method === "delivery" ? he.butcherOrders.deliveryActions : he.butcherOrders.actions)[order.status as "new" | "preparing" | "ready"]}
            </button>
          )}
          {canCancel && (
            <Button variant="ghost" className="text-red-700" onClick={() => setCancel({})}>{he.butcherOrders.cancel}</Button>
          )}
        </footer>
      )}

      <CancelSheet open={!!cancel} orderId={order.id} item={cancel?.item} title={cancel?.item ? cutTitle(cancel.item.cuts, breeds) : null}
        key={cancel?.item?.id ?? "order"} onClose={() => setCancel(null)} onDone={() => { setCancel(null); load(); }} />
    </main>
  );
}

function ItemRow({ item: i, title, onCancel, canWeigh, onWeighed }: {
  item: ButcherItemRow; title: string; onCancel?: () => void; canWeigh: boolean; onWeighed: () => void;
}) {
  const cover = coverOf(i.cuts.cut_media);
  const cancelled = i.status === "cancelled";
  return (
    <li className="flex gap-3 py-3">
      <Link href={`/butcher/cuts/${i.cuts.id}`} className={clsx("size-16 shrink-0 overflow-hidden rounded-xl bg-ink-3", cancelled && "opacity-40 grayscale")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${i.cuts.code}`} className="h-full w-full object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={clsx("text-lg font-extrabold leading-tight", cancelled && "text-stone line-through")}>{orderWhat(i)}</p>
        <p className="text-sm text-stone">{title} · <Ltr>{i.cuts.code}</Ltr> · <Ltr>{money(i.total_agorot)}</Ltr></p>
        {cancelled && (
          <p className="text-sm font-semibold text-red-700">
            {he.butcherOrders.lineCancelled}{i.cancel_reason && ` · ${i.cancel_reason}`}
          </p>
        )}
        {i.refund_agorot ? <p className="text-sm font-semibold text-amber-800">{he.butcherOrders.refundDue(money(i.refund_agorot))}</p> : null}
        {canWeigh && <WeightInput item={i} onDone={onWeighed} />}
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="min-h-11 shrink-0 self-center px-1 text-sm font-semibold text-red-700">
          {he.butcherOrders.cancelItem}
        </button>
      )}
    </li>
  );
}

function CancelSheet({ open, orderId, item, title, onClose, onDone }: {
  open: boolean; orderId: string; item?: ButcherItemRow; title: string | null; onClose: () => void; onDone: () => void;
}) {
  const [restock, setRestock] = useState(true);
  const toast = useToast();
  const reasons = he.butcherOrders.cancelReasons;
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const isOther = reason === reasons[reasons.length - 1];
  const finalReason = isOther ? other.trim() && `${reason}: ${other.trim()}` : reason;

  async function submit() {
    if (!finalReason) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = item
      ? await sb.rpc("cancel_order_item", { p_item_id: item.id, p_reason: finalReason, p_restock: restock })
      : await sb.rpc("cancel_order", { p_order_id: orderId, p_reason: finalReason });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    toast(item ? he.butcherOrders.itemCancelled : he.orders.cancelled, { tone: "success" });
    onDone();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={item ? he.butcherOrders.cancelItemTitle : he.butcherOrders.cancelReason}>
      <div className="flex flex-col gap-3">
        {item && title && <p className="font-bold">{orderWhat(item)} · {title}</p>}
        {item && <p className="text-sm font-semibold text-stone">{he.butcherOrders.cancelReason}</p>}
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => <Chip key={r} selected={reason === r} onClick={() => setReason(r)} className="min-h-12 text-lg">{r}</Chip>)}
        </div>
        {isOther && (
          <input className={inputClass} placeholder={he.butcherOrders.cancelOtherPlaceholder} value={other}
            onChange={(e) => setOther(e.target.value)} aria-label={he.butcherOrders.cancelOtherPlaceholder} autoFocus />
        )}
        {item && (
          <div>
            <Toggle label={he.butcherOrders.restock} checked={restock} onChange={setRestock} />
            <p className="text-sm text-stone">{he.butcherOrders.restockHint}</p>
          </div>
        )}
        <Button size="lg" variant="danger" loading={busy} disabled={!finalReason} onClick={submit}>
          {item ? he.butcherOrders.cancelItem : he.butcherOrders.cancelConfirm}
        </Button>
      </div>
    </BottomSheet>
  );
}

/** The weight actually supplied for one line (grams). The server applies the ±5% rule. */
function WeightInput({ item: i, onDone }: { item: ButcherItemRow; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(i.delivered_weight_g ? String(i.delivered_weight_g) : "");
  const [busy, setBusy] = useState(false);
  const grams = Number(value);
  const changed = value !== (i.delivered_weight_g ? String(i.delivered_weight_g) : "");
  async function save() {
    if (!grams || busy) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("record_item_weight", { p_item_id: i.id, p_weight_g: Math.round(grams) });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    toast(he.butcherOrders.weightSaved, { tone: "success" });
    onDone();
  }
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`w-${i.id}`}>{he.butcherOrders.weighed}</label>
        <input id={`w-${i.id}`} inputMode="numeric" dir="ltr" placeholder={he.butcherOrders.weighed}
          className="min-h-11 w-32 rounded-xl bg-ink px-3 text-base ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
          value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 5))} />
        <Button size="md" variant="secondary" loading={busy} disabled={!grams || !changed} onClick={save}>{he.butcherOrders.saveWeight}</Button>
      </div>
      <p className="text-xs text-stone">{he.butcherOrders.weighedHint(formatWeight(i.est_weight_g))}</p>
    </div>
  );
}

/** A photo of the prepared order, kept in the shop's folder; replacing it removes the old file. */
function ReadyPhoto({ orderId, butcherId, path, onDone }: { orderId: string; butcherId: string; path: string | null; onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { full } = await prepareImage(file);
      const sb = supabaseBrowser();
      const next = `${butcherId}/orders/${orderId}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(MEDIA_BUCKET).upload(next, full, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await sb.rpc("set_ready_photo", { p_order_id: orderId, p_path: next });
      if (error) { await removeStorageObjects([next]); throw error; }
      await removeStorageObjects([path]);
      toast(he.butcherOrders.photoSaved, { tone: "success" });
      onDone();
    } catch (e) {
      toast(errorText(e as { message?: string }), { tone: "error" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
      <h2 className="font-extrabold">{he.butcherOrders.readyPhoto}</h2>
      <p className="mb-3 text-sm text-stone">{he.butcherOrders.readyPhotoHint}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {path && <img src={mediaUrl(path)} alt={he.butcherOrders.readyPhoto} className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" />}
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <Button variant="secondary" className="w-full" loading={busy} onClick={() => input.current?.click()}>
        {path ? he.butcherOrders.replacePhoto : he.butcherOrders.takePhoto}
      </Button>
    </section>
  );
}
