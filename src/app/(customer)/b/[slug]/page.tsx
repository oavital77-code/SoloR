"use client";
// Shop page: only this shop's cuts and stock. Real-photo cover, quick actions (navigate / call),
// one scoped search, its reels, category chips and the grid — with a clear BACK TO MARKET.
import { use } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Navigation, Phone } from "lucide-react";
import { CutTile } from "@/components/customer/CutTile";
import { CategoryChips, SearchLink, SectionHeader } from "@/components/customer/market-ui";
import { useCatalog } from "@/components/customer/useCatalog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
import { isAvailable } from "@/lib/market";

export default function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const butchers = useButchers();
  const breeds = useBreeds();
  const now = useNow(60000);
  const shop = butchers.find((b) => b.slug === slug) ?? null;
  const { cuts, error, reload } = useCatalog(shop?.id ?? null, !!shop);
  const available = (cuts ?? []).filter(isAvailable);
  const cover = available.map((c) => coverOf(c.cut_media)).find(Boolean);
  const scope = `b=${encodeURIComponent(slug)}`;

  if (butchers.length > 0 && !shop) {
    return <div className="pt-20"><ErrorState dark text={he.market.shopNotFound} /><div className="text-center"><BackToMarket /></div></div>;
  }

  return (
    <main className="min-h-dvh pb-28">
      {/* cover */}
      <div className="relative h-56 overflow-hidden bg-gradient-to-br from-brand-dark to-ink">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(cover.storage_path)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-black/30" aria-hidden />
        <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))]"><BackToMarket /></div>
        <div className="absolute inset-x-4 bottom-3">
          {!shop ? <Skeleton className="h-8 w-2/3" /> : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-[28px] font-extrabold leading-tight drop-shadow">{shop.name}</h1>
                {shop.is_test && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300">{he.market.testBadge}</span>}
              </div>
              <p className="text-sm text-white/80">
                {cuts ? he.market.shopCuts(available.length) : "…"}{shop.city && ` · ${shop.city}`}
              </p>
            </>
          )}
        </div>
      </div>

      {shop && (
        <div className="px-4">
          {shop.description && <p className="mt-1 text-[15px] leading-relaxed text-white/75">{shop.description}</p>}
          {/* quick actions */}
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            <a className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-4 text-sm font-semibold ring-1 ring-white/10" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([shop.address, shop.city].filter(Boolean).join(", "))}`}>
              <Navigation className="size-4" aria-hidden />{he.market.navigate}
            </a>
            <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-4 text-sm font-semibold ring-1 ring-white/10">
              <Phone className="size-4" aria-hidden />{he.market.call}
            </a>
            {shop.pickup_hours && (
              <span className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-white/60">
                <Clock className="size-4" aria-hidden />{shop.pickup_hours}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-white/45">{shop.address}</p>
        </div>
      )}

      <div className="mt-4 px-4">
        <SearchLink href={`/search?${scope}`} placeholder={shop ? he.market.searchIn(shop.name) : he.market.searchPlaceholder} />
      </div>

      <Link href={`/discover?${scope}`} className="mx-4 mt-3 flex min-h-14 items-center justify-between rounded-2xl bg-brand px-4 font-extrabold shadow-lg shadow-brand/20">
        <span className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 rounded-md bg-black/25 px-1.5 py-0.5 text-[11px]" dir="ltr"><span className="animate-live size-1.5 rounded-full bg-white" />LIVE</span>
          {he.market.watchShopLive}
        </span>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>

      {cuts && available.length > 0 && (
        <div className="mt-5"><CategoryChips cuts={available} hrefFor={(k) => `/search?${scope}&cat=${k}`} /></div>
      )}

      <section className="mt-5">
        <SectionHeader title={he.market.available} />
        {error && !cuts ? <ErrorState dark onRetry={reload} />
          : !cuts ? <div className="mt-1 grid grid-cols-2 gap-3 px-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4]" />)}</div>
          : available.length === 0 ? <EmptyState text={he.market.shopEmpty} />
          : (
            <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-5 px-4">
              {available.map((c) => <CutTile key={c.id} cut={c} breeds={breeds} now={now} />)}
            </ul>
          )}
      </section>
    </main>
  );
}

function BackToMarket() {
  return (
    <Link href="/" className="inline-flex min-h-10 items-center gap-1 rounded-full bg-black/45 px-3 text-xs font-extrabold tracking-wide backdrop-blur">
      <ChevronRight className="size-4" aria-hidden /><span dir="ltr">BACK TO MARKET</span>
    </Link>
  );
}
