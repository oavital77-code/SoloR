"use client";
// Order confirmation (customer spec §11, design: Confirmed): reached only after the (prototype) payment succeeded — it reads the
// purchase from the server, so a failed attempt never shows here as an order. Every shop's part with how it is
// received, every line, the total, and the way on to tracking the order.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { groupByCut } from "@/components/CutGroup";
import { CHECKOUT_SELECT, normalizeCheckout, type CheckoutRow, lineCode, lineCut, lineCutNo, lineParentId, lineHref, lineMedia } from "@/components/customer/useMyOrders";
import { IconCheck, IconStore, IconTruck } from "@/components/icons";
import { ShopMark } from "@/components/ShopMark";
import { ErrorState, Ltr } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { cutTitle, orderWhat } from "@/lib/cut-helpers";
import { isolateTimes } from "@/lib/hours";
import { useBreeds } from "@/lib/hooks";
import { money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PageLoader } from "@/components/motion/Steak";

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
  if (!k) return <PageLoader />;

  return (
    <main className="relative min-h-dvh pb-12 lg:mx-auto lg:w-full lg:max-w-[760px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] [background:radial-gradient(90%_60%_at_50%_0%,rgb(201_169_110/0.18),transparent_70%)]" aria-hidden />
      <section className="relative flex flex-col items-center gap-3.5 px-6 pt-16 pb-7 text-center">
        <span aria-hidden className="grid size-[88px] place-items-center rounded-full text-gold shadow-[inset_0_0_0_2px_var(--gold),0_0_0_10px_var(--gold-soft)]">
          <IconCheck className="!size-11 [stroke-width:1.6]" />
        </span>
        <h1 className="m-0 font-display text-[36px] font-bold leading-[42px]">{he.confirmation.title}</h1>
        <span className="text-[15px] text-stone">{he.confirmation.numberLabel} <span className="code !text-[15px] !text-ivory">#{k.checkout_number}</span></span>
        <p className="m-0 max-w-[300px] text-[15px] leading-[22px]">{he.confirmation.next}</p>
        {k.is_demo && <span className="sr-proto">{he.confirmation.demo}</span>}
      </section>

      <div className="relative flex flex-col gap-3.5 px-4 text-start">
        {k.orders.map((o) => {
          const shop = o.butchers;
          const a = o.delivery_address;
          const items = o.order_items.filter((i) => i.status === "active");
          return (
            <section key={o.id} className="sr-card !border-line-gold">
              <div className="flex items-center gap-2.5">
                {shop && <ShopMark shop={shop} size="sm" />}
                <span className="flex-1 font-display text-lg font-semibold">{shop?.name}</span>
                <Ltr>{money(o.total_agorot)}</Ltr>
              </div>
              <div className="flex items-start gap-2 text-sm">
                {o.receive_method === "delivery" ? <IconTruck className="text-gold" /> : <IconStore className="text-gold" />}
                <span>
                  {o.receive_method === "delivery" ? he.checkout.deliveryLabel : he.confirmation.pickupCounter}
                  {" · "}{items.map((i) => `${cutTitle(lineCut(i), breeds).split(" · ")[0]}, ${orderWhat(i, i.items)}`).join(" · ")}
                </span>
              </div>
              <p className="m-0 text-xs leading-relaxed text-stone">
                {o.receive_method === "delivery" && a
                  ? <>{he.confirmation.deliveryTo(a.name, a.street, a.city)} · {o.delivery_window ? isolateTimes(o.delivery_window) : he.checkout.pendingCoordination}</>
                  : shop ? he.checkout.pickup(shop.name, shop.address, shop.pickup_hours) : null}
              </p>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {groupByCut(items, lineParentId).map((g) => (
                  <li key={g.key} className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-ivory">{cutTitle(lineCut(g.rows[0]), breeds)} · {lineCutNo(g.rows[0])}</span>
                    <ul className="m-0 ms-3 flex list-none flex-col gap-1 border-s-2 border-dashed border-stone/40 p-0 ps-3">
                      {g.rows.map((i) => (
                        <li key={i.id} className="sr-rowline !text-sm">
                          <span className="min-w-0 text-ivory/85">{orderWhat(i, i.items)} · <span className="code">{lineCode(i)}</span></span>
                          <Ltr className="shrink-0">{money(i.total_agorot)}</Ltr>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {o.delivery_fee_agorot > 0 && (
                  <li className="sr-rowline !text-sm text-stone"><span>{he.checkout.deliveryFee}</span><Ltr>{money(o.delivery_fee_agorot)}</Ltr></li>
                )}
              </ul>
            </section>
          );
        })}
        <div className="sr-rowline px-1 !text-lg !font-bold"><span>{he.checkout.total}</span><Ltr>{money(k.total_agorot)}</Ltr></div>
        <Link href={`/orders/${k.id}`} className="sr-btn sr-btn--block mt-2.5">{he.confirmation.toOrder}</Link>
        <Link href="/" className="sr-link self-center">{he.confirmation.toFeed}</Link>
      </div>
    </main>
  );
}
