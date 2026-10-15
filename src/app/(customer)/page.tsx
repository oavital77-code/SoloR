"use client";
// MARKETPLACE — entry screen. One job: show what can be bought now, with as little chrome as possible.
// Order: search → category shortcuts → the cuts themselves → shops → (quiet) Auctions soon.
// Every cut appears once on this screen; Discover lives in the tab bar and in one link.
import Link from "next/link";
import { ChevronLeft, Gavel, LogIn, Store, UserRound } from "lucide-react";
import { CutTile } from "@/components/customer/CutTile";
import { CategoryChips, SearchLink } from "@/components/customer/market-ui";
import { useCatalog } from "@/components/customer/useCatalog";
import { Logo } from "@/components/Logo";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { useBreeds, useButchers, useNow, useSession } from "@/lib/hooks";
import { categoryCounts, isAvailable, shopPath } from "@/lib/market";
import type { Butcher } from "@/lib/types";

const GRID_LIMIT = 8;

export default function MarketPage() {
  const breeds = useBreeds();
  const butchers = useButchers();
  const { user } = useSession();
  const now = useNow(60000);
  const { cuts, error, reload } = useCatalog();
  const available = (cuts ?? []).filter(isAvailable);
  const shops = [...butchers].sort((a, b) => Number(a.is_test) - Number(b.is_test) || a.name.localeCompare(b.name, "he"));
  const showCategories = categoryCounts(available).filter((c) => c.count > 0).length >= 2;
  const countFor = (b: Butcher) => available.filter((c) => c.butcher_id === b.id).length;

  return (
    <main className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 bg-ink/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <Logo className="text-2xl" />
            <span className="text-[10px] font-extrabold tracking-[0.3em] text-white/40" dir="ltr">{he.market.title}</span>
          </div>
          <Link href={user ? "/profile" : "/login"} aria-label={user ? he.nav.profile : he.nav.login}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-sm font-semibold ring-1 ring-white/10">
            {user ? <UserRound className="size-5" /> : <><LogIn className="size-4" />{he.nav.login}</>}
          </Link>
        </div>
        <div className="mt-3"><SearchLink href="/search" placeholder={he.market.searchPlaceholder} /></div>
        {showCategories && (
          <div className="-mx-4 mt-3"><CategoryChips cuts={available} hrefFor={(k) => `/search?cat=${k}`} /></div>
        )}
      </header>

      {error && !cuts ? <ErrorState dark onRetry={reload} /> : (
        <>
          {/* the product: what can be bought right now */}
          <section className="mt-2">
            <div className="flex items-center justify-between px-4">
              <h1 className="text-xl font-extrabold">{he.market.available}</h1>
              <Link href="/discover" className="flex min-h-10 items-center gap-1.5 rounded-full bg-live/15 px-3 text-sm font-bold text-[#ff6b7f]">
                <span className="animate-live size-2 rounded-full bg-live" aria-hidden />{he.market.watchLive}
              </Link>
            </div>
            {!cuts ? (
              <div className="mt-3 grid grid-cols-2 gap-3 px-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4]" />)}</div>
            ) : available.length === 0 ? (
              <EmptyState text={he.feed.empty} />
            ) : (
              <>
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 px-4">
                  {available.slice(0, GRID_LIMIT).map((c) => (
                    <CutTile key={c.id} cut={c} breeds={breeds} shop={butchers.find((b) => b.id === c.butcher_id)} now={now} />
                  ))}
                </ul>
                {available.length > GRID_LIMIT && (
                  <Link href="/search" className="mx-4 mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-white/[0.08] font-bold ring-1 ring-white/10">
                    {he.market.allCuts(available.length)}
                  </Link>
                )}
              </>
            )}
          </section>

          {/* shops — text only, no repeated photos */}
          <section className="mt-8 px-4">
            <h2 className="text-lg font-extrabold">{he.market.shops}</h2>
            <ul className="mt-2 divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
              {shops.length === 0
                ? [0, 1].map((i) => <li key={i} className="p-3"><Skeleton className="h-11" /></li>)
                : shops.map((b) => {
                  const n = countFor(b);
                  return (
                    <li key={b.id}>
                      <Link href={shopPath(b)} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-white/[0.06]">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-white/70"><Store className="size-5" aria-hidden /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-bold">{b.name}</span>
                            {b.is_test && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">{he.market.testBadge}</span>}
                          </span>
                          <span className="block truncate text-sm text-white/55">
                            {cuts ? he.market.liveCount(n) : "…"}{b.city && ` · ${b.city}`}
                          </span>
                        </span>
                        <ChevronLeft className="size-5 shrink-0 text-white/30" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>

          <p className="mx-4 mt-8 flex items-center justify-center gap-2 text-sm text-white/35" aria-disabled>
            <Gavel className="size-4" aria-hidden /><span dir="ltr">{he.market.auctions}</span> · {he.market.soon}
          </p>
        </>
      )}
    </main>
  );
}
