"use client";
// The cart (customer spec §9, design: Cart): every chosen item, grouped by shop in a card and within it by cut (the
// cut's photo, name and number, what was taken of it hanging off it), with live price and stock. Adding reserves
// nothing; a line that was sold meanwhile (or is held by someone at checkout) is marked and blocks the way on.
// Guests fill the cart freely; signing in is asked for only on the way to the checkout.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ScreenHead } from "@/components/customer/market-ui";
import { HoldBanner } from "@/components/customer/HoldClock";
import { CutGroup, groupByCut } from "@/components/CutGroup";
import { ShopMark } from "@/components/ShopMark";
import { useCartRows, type Row } from "@/components/customer/useCartRows";
import { EmptyState, ErrorState, Ltr, Skeleton, Stepper } from "@/components/ui";
import { cart } from "@/lib/cart";
import { coverOf, cutTitle, mediaUrl, orderWhat } from "@/lib/cut-helpers";
import { clipNo, parentPath, SLICE_MIN_G, SLICE_STEP_G, sliceCapG } from "@/lib/items";
import { he } from "@/lib/i18n/he";
import { useBreeds, useSession } from "@/lib/hooks";
import { money } from "@/lib/pricing";
import { track } from "@/lib/track";
import { useEffect, useRef } from "react";
import { useStagger } from "@/components/motion/useStagger";

export default function CartPage() {
  const breeds = useBreeds();
  const { user } = useSession();
  const router = useRouter();
  const { lines, cuts, error, load, groups, total, blocked } = useCartRows();
  const loaded = cuts !== null;
  const list = useStagger<HTMLDivElement>(loaded);
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
      {lines.length > 0 && <HoldBanner count={lines.length} signedIn={!!user} />}

      {lines.length === 0 ? (
        <EmptyState text={he.cart.empty}>
          <Link href="/" className="sr-btn">{he.cart.toMarket}</Link>
        </EmptyState>
      ) : error && !cuts ? <ErrorState dark onRetry={load} />
        : !cuts ? <div className="flex flex-col gap-3 pt-4">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
        : (
          <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
            <div ref={list} className="flex flex-1 flex-col gap-5 pt-4 pb-6">
              {groups.map(({ shop, butcherId, rows: shopRows }) => (
                <section key={butcherId} className="sr-card !gap-0 !border-line-gold">
                  <div className="flex items-center gap-2.5 pb-1">
                    {shop && <ShopMark shop={shop} size="sm" />}
                    <span className="font-display text-lg font-semibold">{shop?.name}</span>
                  </div>
                  <ul className="m-0 flex list-none flex-col p-0">
                    {groupByCut(shopRows, (r) => r.cut?.parent_id ?? r.line.parentId ?? String(r.line.parentCode)).map((g, n, all) => {
                      const c = g.rows[0].cut;
                      const code = c ? clipNo(c.parent_code) : clipNo(g.rows[0].line.parentCode);
                      return (
                        <CutGroup key={g.key} last={n === all.length - 1} title={c ? cutTitle(c, breeds) : g.rows[0].line.code}
                          code={he.flow.cutNo(code)} cover={c ? coverOf(c.parent_media?.length ? c.parent_media : c.cut_media) : undefined}
                          href={parentPath(c?.parent_id ?? g.rows[0].line.parentId ?? String(g.rows[0].line.parentCode))}
                          dim={g.rows.every((r) => r.problem)}>
                          {g.rows.map((r) => <CartRow key={r.line.itemId} row={r} />)}
                        </CutGroup>
                      );
                    })}
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

/** One line under its cut (design: Cart): its photo, what was chosen and the code, the price and "הסר". A sold line
 * greys out. A slice can be changed here in steps of 50 g. */
function CartRow({ row: { line, cut, price, problem } }: { row: Row }) {
  const cover = cut ? coverOf(cut.cut_media) : undefined;
  const href = parentPath(line.parentId ?? String(line.parentCode), line.code.replace(/^SOL-/, ""));
  const cap = cut ? sliceCapG(cut.weight_g ?? 0) : 0;
  const what = orderWhat({ mode: line.mode, requested_g: line.grams, slice_thickness_cm: line.thicknessCm, est_weight_g: cut?.weight_g ?? line.grams ?? 0 },
    cut ? { label: cut.label, steak_count: cut.steak_count } : null);
  return (
    <li className={clsx("sr-cartrow sr-cartrow--nested", problem && "sr-cartrow--sold")}>
      <Link href={href} className="block size-11 overflow-hidden rounded-lg bg-ink-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={line.code} />}
      </Link>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={clsx("sr-cartrow__title", problem && "text-stone line-through")}>{what}</span>
        {problem ? (
          <span className="sr-cartrow__warn" role="alert">{problem} · <span className="code !text-inherit">{line.code}</span></span>
        ) : (
          <span className="sr-cartrow__sub"><span className="code">{line.code}</span></span>
        )}
        {!problem && line.mode === "remainder_slice" && cap > SLICE_MIN_G ? (
          <div className="pt-1">
            <Stepper dark value={Math.min(line.grams ?? SLICE_MIN_G, cap)} min={SLICE_MIN_G} max={cap} step={SLICE_STEP_G} label={he.item.sliceMe}
              format={(v) => he.units.g(v)} onChange={(v) => cart.setGrams(line.itemId, v)} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-end">
        {!problem && <Ltr className="font-semibold">{line.mode === "remainder_slice" ? he.item.approx(money(price)) : money(price)}</Ltr>}
        <button type="button" onClick={() => cart.remove(line.itemId)}
          className={problem ? "sr-btn sr-btn--quiet !min-h-10 !px-3.5 !text-sm" : "min-h-11 text-[13px] font-medium text-stone"}>
          {he.cart.remove}
        </button>
      </div>
    </li>
  );
}
