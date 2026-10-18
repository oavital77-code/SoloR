"use client";
// Shop page: only this shop's cuts and stock. Name, a few quiet text actions (navigate / call / reels),
// one scoped search, category filter and the cuts — with a clear way back to the market.
import { use } from "react";
import Link from "next/link";
import { CutPost } from "@/components/CutPost";
import { BackLink, CategoryChips, SearchLink, SectionHeader } from "@/components/customer/market-ui";
import { useCatalog } from "@/components/customer/useCatalog";
import { useLiveFeed } from "@/components/customer/useLiveFeed";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
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
  const { items, pending, showNew } = useLiveFeed(cuts);
  const scope = `b=${encodeURIComponent(slug)}`;

  if (butchers.length > 0 && !shop) {
    return <div className="pt-20"><ErrorState dark text={he.market.shopNotFound} /><div className="text-center"><BackToMarket /></div></div>;
  }

  return (
    <main className="min-h-dvh pb-28">
      <header className="px-5 pt-3 pb-2">
        <BackToMarket />
        {!shop ? <Skeleton className="mt-4 h-9 w-2/3" /> : (
          <div className="mt-4">
            <p className="eyebrow">{[shop.city, shop.is_test ? he.market.testBadge : null].filter(Boolean).join("  ·  ") || he.market.shops}</p>
            <h1 className="mt-2 font-display text-[36px] font-bold leading-[1.05] text-ivory">{shop.name}</h1>
            <p className="mt-2 text-sm text-stone">{cuts ? he.market.shopCuts(available.length) : "…"}</p>
          </div>
        )}
      </header>

      {shop && (
        <div className="px-5">
          {shop.description && <p className="mt-2 font-display text-[17px] leading-relaxed text-ivory/80">{shop.description}</p>}
          <div className="mt-4 border-y border-ivory/10 py-3 text-sm">
            <p className="text-ivory/80">{shop.address}{shop.pickup_hours && `  ·  ${shop.pickup_hours}`}</p>
            <div className="mt-1 flex flex-wrap justify-center gap-x-6">
              <a className={action} target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([shop.address, shop.city].filter(Boolean).join(", "))}`}>
                {he.market.navigate}
              </a>
              <a href={`tel:${shop.phone.replace(/-/g, "")}`} className={action}>{he.market.call}</a>
                          </div>
          </div>
        </div>
      )}

      <div className="mt-5 px-4">
        <SearchLink href={`/search?${scope}`} placeholder={shop ? he.market.searchIn(shop.name) : he.market.searchPlaceholder} />
      </div>

      {cuts && available.length > 0 && (
        <div className="mt-5"><CategoryChips cuts={available} hrefFor={(k) => `/search?${scope}&cat=${k}`} /></div>
      )}

      <section className="mt-5">
        <SectionHeader title={he.market.available} />
        {error && !cuts ? <ErrorState dark onRetry={reload} />
          : !cuts ? <div className="mt-2 px-4"><Skeleton className="aspect-[4/5]" /></div>
          : items.length === 0 && pending === 0 ? <EmptyState text={he.market.shopEmpty} />
          : (
            <>
              {pending > 0 && (
                <div className="mt-3 text-center">
                  <button type="button" onClick={showNew} className="rounded-full bg-ivory px-4 py-2 text-sm font-semibold text-ink">
                    {he.feed.newPosts(pending)}
                  </button>
                </div>
              )}
              <ul className="mt-4 flex flex-col gap-14 px-4">
                {items.map(({ cut, gone }, i) => (
                  <li key={cut.id}><CutPost cut={cut} media={cut.cut_media} breeds={breeds} shop={shop} now={now} gone={gone} eager={i === 0} /></li>
                ))}
              </ul>
            </>
          )}
      </section>
    </main>
  );
}

const action = "min-h-10 py-2.5 text-gold underline-offset-4 hover:underline";

function BackToMarket() {
  return <BackLink href="/" label={he.market.backToMarket} />;
}
