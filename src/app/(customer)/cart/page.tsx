"use client";
// The cart (customer spec §9, design: Cart): every chosen cut, grouped by shop in a card, with live price and stock. Adding reserves
// nothing; a line that was sold meanwhile (or is held by someone at checkout) is marked and blocks the way on.
// Guests fill the cart freely; signing in is asked for only on the way to the checkout.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ScreenHead } from "@/components/customer/market-ui";
import { ShopMark } from "@/components/ShopMark";
import { useCartRows, type Row } from "@/components/customer/useCartRows";
import { EmptyState, ErrorState, Ltr, Skeleton, Stepper } from "@/components/ui";
import { cart } from "@/lib/cart";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { he } from "@/lib/i18n/he";
import { useBreeds, useSession } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { track } from "@/lib/track";
import { useEffect, useRef } from "react";

export default function CartPage() {
  const breeds = useBreeds();
  const { user } = useSession();
  const router = useRouter();
  const { lines, cuts, error, load, groups, total, blocked } = useCartRows();
  const loaded = cuts !== null;
  const logged = useRef(false);
  useEffect(() => {
    if (!loaded || logged.current) return;
    logged.current = true;
    track("cart_view", { items_count: lines.length, total });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function proceed() {
    router.push(user ? "/checkout" : `/login?next=${encodeURIComponent("/checkout")}`);
  }

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));

  return (
    <main className="flex min-h-dvh flex-col px-4 text-start lg:mx-auto lg:w-full lg:max-w-[1040px] lg:px-8">
      <ScreenHead title={he.cart.yours} back={back} backLabel={he.app.back} />

      {lines.length === 0 ? (
        <EmptyState text={he.cart.empty}>
          <Link href="/" className="sr-btn">{he.cart.toMarket}</Link>
        </EmptyState>
      ) : error && !cuts ? <ErrorState dark onRetry={load} />
        : !cuts ? <div className="flex flex-col gap-3 pt-4">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
        : (
          <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
            <div className="flex flex-1 flex-col gap-5 pt-4 pb-6">
              {groups.map(({ shop, butcherId, rows: shopRows }) => (
                <section key={butcherId} className="sr-card !gap-0 !border-line-gold">
                  <div className="flex items-center gap-2.5 pb-1">
                    {shop && <ShopMark shop={shop} size="sm" />}
                    <span className="font-display text-lg font-semibold">{shop?.name}</span>
                  </div>
                  <ul className="flex flex-col">
                    {shopRows.map((r, i) => (
                      <CartRow key={r.line.cutId} row={r} last={i === shopRows.length - 1} title={r.cut ? cutTitle(r.cut, breeds) : r.line.code} />
                    ))}
                  </ul>
                </section>
              ))}
              {groups.length > 1 && <p className="sr-legal m-0">{he.cart.splitNote}</p>}
              <Link href="/" className="sr-link self-start">{he.cart.continueShopping}</Link>
            </div>

            <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 rounded-t-[28px] border-t border-line-gold bg-ink-2 px-4 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:top-24 lg:bottom-auto lg:mx-0 lg:mt-4 lg:rounded-[28px] lg:border lg:pb-4">
              <div className="sr-rowline !text-[17px]">
                <span className="font-semibold">{he.cart.subtotal}</span>
                <Ltr className="text-xl font-bold">{money(total)}</Ltr>
              </div>
              {blocked && <p className="m-0 text-[13px] font-semibold text-sold" role="alert">{he.cart.fixFirst}</p>}
              {!user && <p className="m-0 text-[13px] text-stone">{he.cart.loginToPay}</p>}
              <button type="button" className="sr-btn sr-btn--block" disabled={blocked} onClick={proceed}>{he.cart.proceed}</button>
            </div>
          </div>
        )}
    </main>
  );
}

/** One line (design: Cart): photo, cut, what was chosen and the code, the price and "הסר". A sold line greys out. */
function CartRow({ row: { line, cut, price, problem }, title, last }: { row: Row; title: string; last: boolean }) {
  const cover = cut ? coverOf(cut.cut_media) : undefined;
  const maxQty = Math.max(1, cut?.steaks_available ?? 1);
  return (
    <li className={clsx("sr-cartrow", problem && "sr-cartrow--sold", last && "!border-b-0")}>
      <Link href={`/cut/${line.code}`} className="block size-16 overflow-hidden rounded-lg bg-ink-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${line.code}`} />}
      </Link>
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/cut/${line.code}`} className={clsx("sr-cartrow__title", problem && "text-stone line-through")}>{title}</Link>
        {problem ? (
          <span className="sr-cartrow__warn" role="alert">{problem} · <span className="code !text-inherit">{line.code}</span></span>
        ) : (
          <span className="sr-cartrow__sub">
            {line.mode === "steaks" && cut?.steak_weight_g
              ? he.cut.steaksSummary(line.qty ?? 1, cut.steak_weight_g, formatWeight(cut.steak_weight_g * (line.qty ?? 1)))
              : <>{he.cut.whole}{cut?.weight_g ? <> · <Ltr>{formatWeight(cut.weight_g)}</Ltr></> : null}</>}
            {" · "}<span className="code">{line.code}</span>
          </span>
        )}
        {!problem && line.mode === "steaks" && cut?.steak_weight_g && maxQty > 1 ? (
          <div className="pt-1">
            <Stepper dark value={Math.min(line.qty ?? 1, maxQty)} min={1} max={maxQty} label={he.cut.steaks}
              onChange={(v) => cart.setQty(line.cutId, v)} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-end">
        {!problem && <Ltr className="font-semibold">{money(price)}</Ltr>}
        <button type="button" onClick={() => cart.remove(line.cutId)}
          className={problem ? "sr-btn sr-btn--quiet !min-h-10 !px-3.5 !text-sm" : "min-h-11 text-[13px] font-medium text-stone"}>
          {he.cart.remove}
        </button>
      </div>
    </li>
  );
}
