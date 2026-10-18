"use client";
// The cart (customer spec §9): every chosen cut, grouped by shop, with live price and stock. Adding reserves
// nothing; a line that was sold meanwhile (or is held by someone at checkout) is marked and blocks the way on.
// Guests fill the cart freely; signing in is asked for only on the way to the checkout.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { BackLink } from "@/components/customer/market-ui";
import { useCartRows, type Row } from "@/components/customer/useCartRows";
import { Button, EmptyState, ErrorState, Ltr, Skeleton, Stepper } from "@/components/ui";
import { cart } from "@/lib/cart";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { he } from "@/lib/i18n/he";
import { useBreeds, useSession } from "@/lib/hooks";
import { formatAgorot, formatWeight } from "@/lib/pricing";
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

  return (
    <main className="min-h-dvh px-4 pb-28">
      <header className="pt-3 pb-4">
        <BackLink onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} label={he.app.back} />
        <h1 className="mt-1 font-display text-3xl font-bold text-ivory">{he.cart.title}</h1>
        {lines.length > 0 && (
          <p className="mt-1 text-sm text-stone">
            {he.cart.items(lines.length)} {groups.length > 0 && he.cart.shopCount(groups.length)}
          </p>
        )}
      </header>

      {lines.length === 0 ? (
        <EmptyState text={he.cart.empty}>
          <Link href="/"><Button variant="dark">{he.cart.toMarket}</Button></Link>
        </EmptyState>
      ) : error && !cuts ? <ErrorState dark onRetry={load} />
        : !cuts ? <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : (
          <div className="flex flex-col gap-8">
            {groups.map(({ shop, butcherId, rows: shopRows }) => (
              <section key={butcherId} className="border-t border-ivory/10 pt-5">
                <p className="eyebrow">{shop?.name}</p>
                {shop && <p className="mt-1 text-xs text-stone">{he.checkout.pickup(shop.name, shop.address, shop.pickup_hours)}</p>}
                <ul className="mt-3 flex flex-col divide-y divide-ivory/10">
                  {shopRows.map((r) => <CartRow key={r.line.cutId} row={r} title={r.cut ? cutTitle(r.cut, breeds) : r.line.code} />)}
                </ul>
              </section>
            ))}

            <section className="border-t border-ivory/10 pt-5">
              {groups.length > 1 && <p className="mb-4 text-sm leading-relaxed text-stone">{he.cart.splitNote}</p>}
              <p className="text-sm text-stone">{he.cart.subtotal}</p>
              <p className="font-display text-3xl font-bold text-ivory"><Ltr>₪{formatAgorot(total)}</Ltr></p>
              {blocked && <p className="mt-3 text-sm text-[#e8a0a8]" role="alert">{he.cart.fixFirst}</p>}
              {!user && <p className="mt-3 text-sm text-stone">{he.cart.loginToPay}</p>}
              <Button size="lg" className="mt-4 w-full" disabled={blocked} onClick={proceed}>{he.cart.proceed}</Button>
              <Link href="/" className="mt-2 inline-block min-h-11 py-3 text-sm text-ivory/70 underline-offset-4 hover:underline">
                {he.cart.continueShopping}
              </Link>
            </section>
          </div>
        )}
    </main>
  );
}

function CartRow({ row: { line, cut, price, problem }, title }: { row: Row; title: string }) {
  const cover = cut ? coverOf(cut.cut_media) : undefined;
  const maxQty = Math.max(1, cut?.steaks_available ?? 1);
  return (
    <li className="flex flex-col items-center gap-2 py-4">
      <Link href={`/cut/${line.code}`} className="flex flex-col items-center gap-2">
        <div className={clsx("size-20 overflow-hidden rounded-md bg-ink-3", problem && "opacity-50 grayscale")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${line.code}`} className="h-full w-full object-cover" />}
        </div>
        <p className="font-display text-lg font-bold text-ivory">{title}</p>
      </Link>
      <p className="text-xs text-stone"><Ltr>{line.code}</Ltr></p>
      {line.mode === "steaks" && cut?.steak_weight_g ? (
        <div className="flex flex-col items-center gap-1">
          <Stepper dark value={Math.min(line.qty ?? 1, maxQty)} min={1} max={maxQty} label={he.cut.steaks}
            onChange={(v) => cart.setQty(line.cutId, v)} />
          <p className="text-sm text-stone">{he.cut.steaksSummary(line.qty ?? 1, cut.steak_weight_g, formatWeight(cut.steak_weight_g * (line.qty ?? 1)))}</p>
        </div>
      ) : (
        <p className="text-sm text-stone">{he.cut.whole}{cut?.weight_g ? <> · <Ltr>{formatWeight(cut.weight_g)}</Ltr></> : null}</p>
      )}
      <p className={clsx("font-display text-xl font-bold", problem ? "text-stone line-through" : "text-ivory")}>
        <Ltr>₪{formatAgorot(price)}</Ltr>
      </p>
      {problem && <p className="text-sm text-[#e8a0a8]" role="alert">{problem}</p>}
      <button type="button" onClick={() => cart.remove(line.cutId)} className="min-h-10 text-sm text-ivory/60 underline-offset-4 hover:underline">
        {he.cart.remove}
      </button>
    </li>
  );
}
