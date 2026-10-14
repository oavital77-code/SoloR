"use client";
// MARKETPLACE — entry screen. Hierarchy: what's live now (real meat) → one search → categories → shops → grid.
import Link from "next/link";
import { ChevronLeft, Gavel, LogIn, Store, UserRound } from "lucide-react";
import { CutTile } from "@/components/customer/CutTile";
import { CategoryChips, LiveStories, SearchLink, SectionHeader } from "@/components/customer/market-ui";
import { useCatalog } from "@/components/customer/useCatalog";
import { Logo } from "@/components/Logo";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { useBreeds, useButchers, useNow, useSession } from "@/lib/hooks";
import { isAvailable, shopPath } from "@/lib/market";
import type { Butcher, CutWithMedia } from "@/lib/types";

export default function MarketPage() {
  const breeds = useBreeds();
  const butchers = useButchers();
  const { user } = useSession();
  const now = useNow(60000);
  const { cuts, error, reload } = useCatalog();
  const available = (cuts ?? []).filter(isAvailable);
  const shops = [...butchers].sort((a, b) => Number(a.is_test) - Number(b.is_test) || a.name.localeCompare(b.name, "he"));
  const heroCover = available.map((c) => coverOf(c.cut_media)).find(Boolean);

  return (
    <main className="min-h-dvh pb-28">
      {/* sticky header: brand + account, and the one search */}
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
      </header>

      {error && !cuts ? <ErrorState dark onRetry={reload} /> : (
        <>
          {/* live now */}
          {(!cuts || available.length > 0) && (
            <section className="mt-2">
              <SectionHeader title={he.market.liveNow} live href="/discover" linkLabel={he.market.watchLive} />
              {!cuts
                ? <div className="flex gap-3 px-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="size-[71px] shrink-0 rounded-full" />)}</div>
                : <LiveStories cuts={available.slice(0, 12)} breeds={breeds} />}
            </section>
          )}

          {/* Discover hero — a real photo, not decoration */}
          <Link href="/discover" className="relative mx-4 mt-5 flex h-36 flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark p-4 shadow-lg shadow-brand/20">
            {heroCover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(heroCover.thumb_path ?? heroCover.storage_path)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden />
            <span className="absolute top-3 start-3 flex items-center gap-1.5 rounded-lg bg-live px-2 py-1 text-xs font-extrabold" dir="ltr">
              <span className="animate-live size-2 rounded-full bg-white" aria-hidden /> LIVE
            </span>
            <span className="relative flex items-end justify-between">
              <span>
                <span className="block text-2xl font-extrabold" dir="ltr">{he.market.discover}</span>
                <span className="block text-sm text-white/85">{cuts ? he.market.liveCount(available.length) : he.market.discoverSub}</span>
              </span>
              <span className="grid size-11 place-items-center rounded-full bg-white text-neutral-900"><ChevronLeft className="size-5" aria-hidden /></span>
            </span>
          </Link>

          {/* categories */}
          {cuts && available.length > 0 && (
            <section className="mt-6">
              <SectionHeader title={he.market.categories} href="/categories" />
              <CategoryChips cuts={available} hrefFor={(k) => `/search?cat=${k}`} />
            </section>
          )}

          {/* shops */}
          <section className="mt-6">
            <SectionHeader title={he.market.shops} />
            <ul className="mt-1 flex flex-col gap-2.5 px-4">
              {shops.length === 0
                ? [0, 1].map((i) => <li key={i}><Skeleton className="h-[76px]" /></li>)
                : shops.map((b) => <ShopRow key={b.id} shop={b} cuts={available.filter((c) => c.butcher_id === b.id)} loading={!cuts} />)}
            </ul>
          </section>

          {/* available now */}
          <section className="mt-6">
            <SectionHeader title={he.market.available} href={available.length > 6 ? "/search" : undefined} />
            {!cuts ? (
              <div className="mt-1 grid grid-cols-2 gap-3 px-4">{[0, 1].map((i) => <Skeleton key={i} className="aspect-[3/4]" />)}</div>
            ) : available.length === 0 ? (
              <EmptyState text={he.feed.empty} />
            ) : (
              <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-5 px-4">
                {available.slice(0, 6).map((c) => (
                  <CutTile key={c.id} cut={c} breeds={breeds} shop={butchers.find((b) => b.id === c.butcher_id)} now={now} />
                ))}
              </ul>
            )}
          </section>

          {/* coming soon — present, but quiet */}
          <div className="mx-4 mt-8 flex min-h-14 items-center justify-between rounded-2xl border border-dashed border-white/15 px-4 text-white/45" aria-disabled>
            <span className="flex items-center gap-2.5"><Gavel className="size-5" aria-hidden /><span className="font-bold" dir="ltr">{he.market.auctions}</span></span>
            <span className="rounded-full bg-white/[0.08] px-3 py-1 text-xs font-bold">{he.market.soon}</span>
          </div>
        </>
      )}
    </main>
  );
}

function ShopRow({ shop, cuts, loading }: { shop: Butcher; cuts: CutWithMedia[]; loading: boolean }) {
  const thumbs = cuts.map((c) => coverOf(c.cut_media)).filter(Boolean).slice(0, 3);
  return (
    <li>
      <Link href={shopPath(shop)} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/10 transition-colors active:bg-white/10">
        <div className="grid size-[52px] shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand/80 to-brand-dark text-xl font-extrabold">
          {shop.name.trim().charAt(0) || <Store className="size-6" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-extrabold">{shop.name}</p>
            {shop.is_test && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">{he.market.testBadge}</span>}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-white/60">
            {cuts.length > 0 && <span className="animate-live size-1.5 rounded-full bg-live" aria-hidden />}
            {loading ? "…" : he.market.liveCount(cuts.length)}{shop.city && ` · ${shop.city}`}
          </p>
        </div>
        {thumbs.length > 0 && (
          <div className="flex shrink-0 -space-x-3 rtl:space-x-reverse" aria-hidden>
            {thumbs.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={t!.id} src={mediaUrl(t!.thumb_path ?? t!.storage_path)} alt="" className="size-9 rounded-full border-2 border-ink object-cover" />
            ))}
          </div>
        )}
        <ChevronLeft className="size-5 shrink-0 text-white/30" aria-hidden />
      </Link>
    </li>
  );
}
