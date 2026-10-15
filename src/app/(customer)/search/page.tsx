"use client";
// Search — across the market (results tagged with their shop) or inside one shop (`?b=<slug>`).
// Shows only stock that can be bought now; keeps all the existing filters. `?cat=<cut_type>` narrows by category.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CutTile } from "@/components/customer/CutTile";
import { BackLink, CategoryChips } from "@/components/customer/market-ui";
import { FilterSheet } from "@/components/customer/FilterSheet";
import { useCatalog } from "@/components/customer/useCatalog";
import { Button, EmptyState, ErrorState, Skeleton, inputDarkClass } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { EMPTY_FILTER, activeFilterCount, matchesFilter, type FeedFilter } from "@/lib/feed-filter";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
import { isAvailable, matchesQuery, shopPath } from "@/lib/market";
import type { CutType } from "@/lib/types";

export default function SearchPage() {
  return <Suspense><SearchView /></Suspense>;
}

function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get("b");
  const cat = params.get("cat") as CutType | null;
  const breeds = useBreeds();
  const butchers = useButchers();
  const now = useNow(60000);
  const shop = slug ? butchers.find((b) => b.slug === slug) ?? null : null;
  const { cuts, error, reload } = useCatalog(shop?.id ?? null, !slug || !!shop);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  // keep the query in the URL (back button / sharing) without spamming history
  useEffect(() => {
    const t = window.setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (query.trim()) sp.set("q", query.trim()); else sp.delete("q");
      router.replace(`/search${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const shopOf = (id: string) => butchers.find((b) => b.id === id);
  const available = useMemo(() => (cuts ?? []).filter(isAvailable), [cuts]);
  const results = useMemo(
    () => available.filter((c) =>
      (!cat || c.cut_type === cat)
      && matchesFilter(c, filter)
      && matchesQuery(c, query, breeds, shopOf(c.butcher_id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [available, cat, filter, query, breeds, butchers],
  );

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value); else sp.delete(key);
    router.replace(`/search${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };
  const nFilters = activeFilterCount(filter);

  return (
    <main className="min-h-dvh px-4 pb-24">
      <header className="sticky top-0 z-20 -mx-4 bg-ink/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-center gap-6">
          <BackLink href={shop ? shopPath(shop) : "/"} label={shop ? he.market.backToShop : he.market.backToMarket} />
          <button type="button" onClick={() => setFilterOpen(true)} className="min-h-11 text-sm text-ivory/80">
            {he.feed.filter}{nFilters > 0 && <span className="ltr ms-1.5 text-gold">({nFilters})</span>}
          </button>
        </div>
        <input
          type="search" autoFocus enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={shop ? he.market.searchIn(shop.name) : he.market.searchPlaceholder}
          aria-label={he.market.search} className={inputDarkClass + " mt-1 min-h-12"}
        />
        {shop && (
          <p className="mt-2 text-sm text-stone">
            {he.market.inShop(shop.name)}
            <button type="button" onClick={() => setParam("b", null)} className="ms-3 min-h-9 text-gold underline-offset-4 hover:underline">
              {he.market.inMarket}
            </button>
          </p>
        )}
        <div className="-mx-4 mt-3">
          <CategoryChips
            cuts={available.filter((c) => matchesQuery(c, query, breeds, shopOf(c.butcher_id)))}
            active={cat} onSelect={(k) => setParam("cat", k)}
          />
        </div>
      </header>

      {error && !cuts ? <ErrorState dark onRetry={reload} />
        : !cuts ? <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4]" />)}</div>
        : results.length === 0 ? (
          <EmptyState text={he.market.noResults}>
            <p className="text-sm text-stone">{he.market.noResultsHint}</p>
            {nFilters > 0 && <Button variant="dark" onClick={() => setFilter(EMPTY_FILTER)}>{he.feed.clearFilter}</Button>}
          </EmptyState>
        ) : (
          <>
            <p className="mb-4 text-[13px] tracking-wide text-stone">{he.market.results(results.length)}  ·  {he.market.newestFirst}</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-7">
              {results.map((c) => <CutTile key={c.id} cut={c} breeds={breeds} shop={shop ? null : shopOf(c.butcher_id)} now={now} />)}
            </ul>
          </>
        )}

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} value={filter} onApply={setFilter}
        cuts={available.filter((c) => (!cat || c.cut_type === cat) && matchesQuery(c, query, breeds, shopOf(c.butcher_id)))} breeds={breeds} />
    </main>
  );
}
