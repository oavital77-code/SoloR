"use client";
// Shop page (review stage 1): only this shop's cuts and stock, with its own Reels / Search / Categories
// entries and a clear BACK TO MARKET.
import { use } from "react";
import Link from "next/link";
import { ChevronRight, Clock, LayoutGrid, MapPin, Phone, Search } from "lucide-react";
import { CutTile } from "@/components/customer/CutTile";
import { useCatalog } from "@/components/customer/useCatalog";
import { EmptyState, ErrorState, Ltr, Skeleton } from "@/components/ui";
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
  const q = `?b=${encodeURIComponent(slug)}`;

  if (butchers.length > 0 && !shop) {
    return <div className="pt-20"><ErrorState dark text={he.market.shopNotFound} /><BackToMarket /></div>;
  }

  return (
    <main className="min-h-dvh pb-24">
      <div className="px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"><BackToMarket /></div>

      {!shop ? (
        <div className="flex flex-col gap-3 p-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>
      ) : (
        <header className="px-4 pt-2">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold leading-tight">{shop.name}</h1>
            {shop.is_test && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300">{he.market.testBadge}</span>}
          </div>
          {shop.description && <p className="mt-1 text-white/70">{shop.description}</p>}
          <div className="mt-3 flex flex-col gap-1.5 text-sm text-white/70">
            <a className="flex min-h-9 items-center gap-2 underline-offset-4 hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`}>
              <MapPin className="size-4 text-brand" aria-hidden />{[shop.address, shop.city].filter(Boolean).join(", ")}
            </a>
            {shop.pickup_hours && <p className="flex items-center gap-2"><Clock className="size-4" aria-hidden />{shop.pickup_hours}</p>}
            <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="flex min-h-9 items-center gap-2"><Phone className="size-4" aria-hidden /><Ltr>{shop.phone}</Ltr></a>
          </div>
        </header>
      )}

      <nav className="mx-4 mt-4 grid grid-cols-3 gap-2">
        <Link href={`/discover${q}`} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-brand font-bold">
          <span className="flex items-center gap-1.5 text-xs font-extrabold" dir="ltr"><span className="animate-live size-2 rounded-full bg-white" />LIVE</span>
          <span dir="ltr">{he.market.discover}</span>
        </Link>
        <Link href={`/search${q}`} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-white/10 font-bold ring-1 ring-white/10">
          <Search className="size-5" aria-hidden />{he.market.search}
        </Link>
        <Link href={`/categories${q}`} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-white/10 font-bold ring-1 ring-white/10">
          <LayoutGrid className="size-5" aria-hidden />{he.market.categories}
        </Link>
      </nav>

      <section className="mt-6 px-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-extrabold">{he.market.available}</h2>
          <span className="text-sm text-white/50">{he.market.newestFirst}</span>
        </div>
        {error && !cuts ? <ErrorState dark onRetry={reload} />
          : !cuts ? <div className="mt-3 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4]" />)}</div>
          : available.length === 0 ? <EmptyState text={he.market.shopEmpty} />
          : (
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {available.map((c) => <CutTile key={c.id} cut={c} breeds={breeds} now={now} />)}
            </ul>
          )}
      </section>
    </main>
  );
}

function BackToMarket() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-extrabold tracking-wide">
      <ChevronRight className="size-4" aria-hidden /><span dir="ltr">BACK TO MARKET</span>
    </Link>
  );
}
