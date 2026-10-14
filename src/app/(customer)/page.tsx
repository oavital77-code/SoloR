"use client";
// MARKETPLACE — the entry screen (review stage 1): shops to choose from, and clear entries to
// Discover/Reels, Categories and Search. Open to guests.
import Link from "next/link";
import { Gavel, LayoutGrid, LogIn, Search, Store, UserRound } from "lucide-react";
import { CutTile } from "@/components/customer/CutTile";
import { useCatalog } from "@/components/customer/useCatalog";
import { Logo } from "@/components/Logo";
import { ErrorState, Skeleton } from "@/components/ui";
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

  // real shops first, test shops last
  const shops = [...butchers].sort((a, b) => Number(a.is_test) - Number(b.is_test) || a.name.localeCompare(b.name, "he"));

  return (
    <main className="min-h-dvh pb-24">
      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <Logo className="text-3xl" />
          <p className="text-xs font-extrabold tracking-[0.25em] text-white/50" dir="ltr">{he.market.title}</p>
        </div>
        <Link href={user ? "/profile" : "/login"} aria-label={user ? he.nav.profile : he.nav.login}
          className="flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-3 text-sm font-semibold">
          {user ? <UserRound className="size-5" /> : <><LogIn className="size-4" />{he.nav.login}</>}
        </Link>
      </header>

      <p className="px-4 pt-3 text-white/70">{he.market.subtitle}</p>

      <Link href="/search" className="mx-4 mt-4 flex min-h-14 items-center gap-3 rounded-2xl bg-white/10 px-4 text-white/60 ring-1 ring-white/10">
        <Search className="size-5" aria-hidden /> {he.market.searchPlaceholder}
      </Link>

      <nav className="mx-4 mt-4 grid grid-cols-2 gap-3" aria-label={he.market.title}>
        <Link href="/discover" className="relative col-span-2 flex min-h-24 flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark p-4">
          <span className="absolute top-3 start-3 flex items-center gap-1.5 rounded-lg bg-black/30 px-2 py-1 text-xs font-extrabold" dir="ltr">
            <span className="animate-live size-2 rounded-full bg-white" aria-hidden /> LIVE
          </span>
          <span className="text-2xl font-extrabold" dir="ltr">{he.market.discover}</span>
          <span className="text-sm text-white/80">{he.market.discoverSub}</span>
        </Link>
        <EntryTile href="/categories" icon={<LayoutGrid className="size-6" />} title={he.market.categories} sub={he.market.categoriesSub} />
        <EntryTile href="/search" icon={<Search className="size-6" />} title={he.market.search} sub={he.market.searchSub} />
        <div className="col-span-2 flex min-h-16 items-center justify-between rounded-2xl bg-white/5 px-4 text-white/45 ring-1 ring-white/10" aria-disabled>
          <span className="flex items-center gap-3"><Gavel className="size-5" aria-hidden /><span className="font-bold" dir="ltr">{he.market.auctions}</span></span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{he.market.soon}</span>
        </div>
      </nav>

      <section className="mt-7">
        <h2 className="px-4 text-xl font-extrabold">{he.market.shops}</h2>
        {error && !cuts ? <ErrorState dark onRetry={reload} /> : (
          <ul className="mt-3 flex flex-col gap-3 px-4">
            {shops.length === 0
              ? [0, 1].map((i) => <li key={i}><Skeleton className="h-24" /></li>)
              : shops.map((b) => <ShopCard key={b.id} shop={b} cuts={available.filter((c) => c.butcher_id === b.id)} loading={!cuts} />)}
          </ul>
        )}
      </section>

      {available.length > 0 && (
        <section className="mt-7">
          <div className="flex items-baseline justify-between px-4">
            <h2 className="text-xl font-extrabold">{he.market.available}</h2>
            <Link href="/search" className="text-sm font-semibold text-white/60 underline underline-offset-4">{he.market.search}</Link>
          </div>
          <ul className="no-scrollbar mt-3 grid auto-cols-[42%] grid-flow-col gap-3 overflow-x-auto px-4">
            {available.slice(0, 10).map((c) => (
              <CutTile key={c.id} cut={c} breeds={breeds} shop={butchers.find((b) => b.id === c.butcher_id)} now={now} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function EntryTile({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} className="flex min-h-24 flex-col justify-between rounded-3xl bg-white/10 p-4 ring-1 ring-white/10 active:bg-white/15">
      <span className="text-white/80">{icon}</span>
      <span>
        <span className="block text-lg font-extrabold">{title}</span>
        <span className="block text-sm text-white/60">{sub}</span>
      </span>
    </Link>
  );
}

function ShopCard({ shop, cuts, loading }: { shop: Butcher; cuts: CutWithMedia[]; loading: boolean }) {
  const cover = cuts.map((c) => coverOf(c.cut_media)).find(Boolean);
  return (
    <li>
      <Link href={shopPath(shop)} className="flex gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 active:bg-white/10">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-3">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={shop.name} className="h-full w-full object-cover" loading="lazy" />
          ) : <Store className="size-8 text-white/30" aria-hidden />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-extrabold">{shop.name}</p>
            {shop.is_test && <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300">{he.market.testBadge}</span>}
          </div>
          <p className="truncate text-sm text-white/60">{[shop.city, shop.address].filter(Boolean).join(" · ")}</p>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {cuts.length > 0 && <span className="animate-live size-2 rounded-full bg-live" aria-hidden />}
            {loading ? "…" : he.market.liveCount(cuts.length)}
          </p>
        </div>
      </Link>
    </li>
  );
}
