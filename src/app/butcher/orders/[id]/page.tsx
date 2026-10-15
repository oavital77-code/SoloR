"use client";
// B5 — order screen for the butcher: details, customer phone, timeline, one big next-step button, cancel with reason.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useButcher } from "@/components/butcher/ButcherShell";
import { BUTCHER_ORDER_SELECT, orderWhat, type ButcherOrderRow } from "@/components/butcher/OrderList";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderTimeline } from "@/components/OrderTimeline";
import { useToast } from "@/components/Toast";
import { BottomSheet, Button, Chip, ErrorState, Ltr, Spinner, inputClass } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, formatDateTime, mediaUrl } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { OrderEvent, OrderStatus } from "@/lib/types";

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { new: "preparing", preparing: "ready", ready: "completed" };

export default function ButcherOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ordersVersion } = useButcher();
  const breeds = useBreeds();
  const toast = useToast();
  const [order, setOrder] = useState<ButcherOrderRow | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

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

  const cover = coverOf(order.cuts.cut_media);
  const title = cutTitle(order.cuts, breeds);
  const next = NEXT[order.status];
  const canCancel = !["completed", "cancelled"].includes(order.status);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Link href="/butcher?tab=orders" className="flex min-h-11 items-center px-2 text-sm font-semibold text-neutral-600">{he.app.back}</Link>
        <h1 className="flex-1 text-2xl font-extrabold"><Ltr>#{order.order_number}</Ltr></h1>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <Link href={`/butcher/cuts/${order.cut_id}`} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
          <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-neutral-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${order.cuts.code}`} className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <p className="text-lg font-extrabold">{title}</p>
            <Ltr className="text-sm text-neutral-500">{order.cuts.code}</Ltr>
          </div>
        </Link>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
          <p className="text-xl font-extrabold">{orderWhat(order)}</p>
          <p className="mt-1 text-2xl font-extrabold"><Ltr>₪{formatAgorot(order.total_agorot)}</Ltr></p>
          <p className="mt-1 text-sm text-neutral-500">{formatDateTime(order.created_at)}</p>
          {order.customer_note && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="text-sm font-bold text-amber-900">{he.butcherOrders.note}</p>
              <p className="whitespace-pre-line">{order.customer_note}</p>
            </div>
          )}
          {order.status === "cancelled" && order.cancel_reason && (
            <p className="mt-3 text-sm text-neutral-600">{he.orders.reason}: {order.cancel_reason}</p>
          )}
        </section>

        {order.profiles && (
          <section className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
            <div>
              <p className="text-sm text-neutral-500">{he.butcherOrders.customer}</p>
              <p className="text-lg font-bold">{order.profiles.full_name}</p>
              <Ltr className="text-neutral-600">{order.profiles.phone}</Ltr>
            </div>
            <a href={`tel:${order.profiles.phone.replace(/-/g, "")}`} className="flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-4 font-bold text-white">
              {he.butcherOrders.call}
            </a>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
          <h2 className="mb-3 font-extrabold">{he.orders.timeline}</h2>
          <OrderTimeline status={order.status} events={events} />
        </section>
      </div>

      {(next || canCancel) && (
        <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {next && (
            <Button size="xl" loading={busy} onClick={advance}>
              {he.butcherOrders.actions[order.status as "new" | "preparing" | "ready"]}
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" className="text-red-700" onClick={() => setCancelOpen(true)}>{he.butcherOrders.cancel}</Button>
          )}
        </footer>
      )}

      <CancelSheet open={cancelOpen} orderId={order.id} onClose={() => setCancelOpen(false)} onDone={() => { setCancelOpen(false); load(); }} />
    </main>
  );
}

function CancelSheet({ open, orderId, onClose, onDone }: { open: boolean; orderId: string; onClose: () => void; onDone: () => void }) {
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
    const { error } = await supabaseBrowser().rpc("cancel_order", { p_order_id: orderId, p_reason: finalReason });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    toast(he.orders.cancelled, { tone: "success" });
    onDone();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={he.butcherOrders.cancelReason}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => <Chip key={r} selected={reason === r} onClick={() => setReason(r)} className="min-h-12 text-lg">{r}</Chip>)}
        </div>
        {isOther && (
          <input className={inputClass} placeholder={he.butcherOrders.cancelOtherPlaceholder} value={other}
            onChange={(e) => setOther(e.target.value)} aria-label={he.butcherOrders.cancelOtherPlaceholder} autoFocus />
        )}
        <Button size="lg" variant="danger" loading={busy} disabled={!finalReason} onClick={submit}>{he.butcherOrders.cancelConfirm}</Button>
      </div>
    </BottomSheet>
  );
}
