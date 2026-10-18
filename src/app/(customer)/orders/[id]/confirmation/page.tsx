"use client";
// Order confirmation (customer spec §11): reached only after the (prototype) payment succeeded — it reads the
// purchase from the server, so a failed attempt never shows here as an order. Every shop's part with how it is
// received, every line, the total, and the way on to tracking the order.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CHECKOUT_SELECT, normalizeCheckout, type CheckoutRow } from "@/components/customer/useMyOrders";
import { Button, ErrorState, Ltr, Spinner } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { cutTitle, orderWhat } from "@/lib/cut-helpers";
import { isolateTimes } from "@/lib/hours";
import { useBreeds } from "@/lib/hooks";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const breeds = useBreeds();
  const [k, setK] = useState<CheckoutRow | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("checkouts").select(CHECKOUT_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return setError(true);
    setK(normalizeCheckout(data as CheckoutRow));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="pt-20"><ErrorState dark text={he.confirmation.notFound} onRetry={() => { setError(false); load(); }} /></div>;
  if (!k) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  return (
    <main className="min-h-dvh px-5 pt-8 pb-28 text-center">
      <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-gold/15 ring-1 ring-gold/50">
        <svg viewBox="0 0 24 24" className="size-8 fill-none stroke-gold stroke-2"><path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <h1 className="mt-4 font-display text-3xl font-bold text-ivory">{he.confirmation.title}</h1>
      <p className="mt-1 text-stone"><Ltr>{he.confirmation.number(k.checkout_number)}</Ltr></p>
      {k.is_demo && (
        <p className="mx-auto mt-4 inline-block rounded-full px-4 py-1.5 text-sm font-semibold text-gold ring-1 ring-gold/40">{he.confirmation.demo}</p>
      )}

      <div className="mt-8 flex flex-col gap-6 text-start">
        {k.orders.map((o) => {
          const shop = o.butchers;
          const a = o.delivery_address;
          return (
            <section key={o.id} className="rounded-2xl bg-ivory/[0.03] p-4 ring-1 ring-ivory/10">
              <p className="text-center font-display text-lg font-bold text-ivory">
                {o.receive_method === "delivery" ? he.confirmation.deliveryFrom(shop?.name ?? "") : he.confirmation.pickupAt(shop?.name ?? "")}
              </p>
              <p className="mt-1 text-center text-xs leading-relaxed text-stone">
                {o.receive_method === "delivery" && a
                  ? <>{he.confirmation.deliveryTo(a.name, a.street, a.city)} · {o.delivery_window ? isolateTimes(o.delivery_window) : he.checkout.pendingCoordination}</>
                  : shop ? he.checkout.pickup(shop.name, shop.address, shop.pickup_hours) : null}
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-ivory/10 text-[15px]">
                {o.order_items.filter((i) => i.status === "active").map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 text-ivory/90">
                      {cutTitle(i.cuts, breeds)} <span className="text-xs text-stone">· {orderWhat(i)} · <Ltr>{i.cuts.code}</Ltr></span>
                    </span>
                    <Ltr className="shrink-0 text-ivory">₪{formatAgorot(i.total_agorot)}</Ltr>
                  </li>
                ))}
                {o.delivery_fee_agorot > 0 && (
                  <li className="flex justify-between py-2 text-stone">
                    <span>{he.checkout.deliveryFee}</span><Ltr>₪{formatAgorot(o.delivery_fee_agorot)}</Ltr>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-stone">{he.checkout.total}</p>
      <p className="font-display text-3xl font-bold text-ivory"><Ltr>₪{formatAgorot(k.total_agorot)}</Ltr></p>
      <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-ivory/70">{he.confirmation.next}</p>

      <div className="mt-6 flex flex-col gap-2">
        <Link href={`/orders/${k.id}`}><Button size="lg" className="w-full">{he.confirmation.toOrder}</Button></Link>
        <Link href="/" className="min-h-11 py-3 text-sm text-ivory/70 underline-offset-4 hover:underline">{he.confirmation.toFeed}</Link>
      </div>
    </main>
  );
}
