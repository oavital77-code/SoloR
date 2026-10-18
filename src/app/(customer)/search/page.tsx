"use client";
// Search (customer spec §8). Before searching: the field, the shops (by logo) and a compact filter panel.
// Once there is a word or a filter: the field and the active filters stay on top as removable chips, and the
// shops give way to a two-column grid of what can be bought now, best match first. Everything lives in the URL,
// so the search tab comes back exactly as it was left.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CutTile } from "@/components/customer/CutTile";
import { FilterSheet } from "@/components/customer/FilterSheet";
import { useCatalog } from "@/components/customer/useCatalog";
import { useHeldCuts } from "@/components/customer/useHeldCuts";
import { ShopMark } from "@/components/ShopMark";
import { Button, Chip, ErrorState, Skeleton, inputDarkClass } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { isReserved, rankFeed } from "@/lib/feed";
import {
  AGING_PRESETS, EMPTY_FILTER, activeFilterCount, filterFromParams, filterToParams, matchesFilter, type FeedFilter,
} from "@/lib/feed-filter";
import { useBreeds, useButchers } from "@/lib/hooks";
import { CUT_TYPES, ORIGINS, cutTypeLabel } from "@/lib/labels";
import { categoryCounts, isAvailable, searchScore, shopPath } from "@/lib/market";
import { useScrollMemory } from "@/lib/scroll";
import { track } from "@/lib/track";
import type { Breed, Butcher, Cut } from "@/lib/types";

let lastLogged: string | null = null;
/** the active filters as short keys, for measurement */
const chipsKey = (f: FeedFilter) => Object.entries(f).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && v !== false && v !== "").map(([k]) => k);

export default function SearchPage() {
  return <Suspense><SearchView /></Suspense>;
}

type ActiveChip = { key: string; label: string; next: FeedFilter };

function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const breeds = useBreeds();
  const butchers = useButchers();
  const { cuts, error, reload } = useCatalog();
  const filter = useMemo(() => filterFromParams(new URLSearchParams(params.toString())), [params]);
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [sheet, setSheet] = useState(false);

  const go = (f: FeedFilter, q: string) => {
    const sp = filterToParams(f, q);
    router.replace(`/search${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };
  const setFilter = (f: FeedFilter) => go(f, query);

  // typing goes to the URL after a short pause (back button, sharing, the tab remembering it)
  useEffect(() => {
    if (query.trim() === urlQuery.trim()) return;
    const t = window.setTimeout(() => go(filter, query), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const shopOf = (id: string) => butchers.find((b) => b.id === id);
  const onSale = useMemo(() => (cuts ?? []).filter(isAvailable), [cuts]);
  // a cut held at someone's checkout is not offered in search (spec §13)
  const held = useHeldCuts(useMemo(() => onSale.map((c) => c.id), [onSale]));
  const available = useMemo(() => onSale.filter((c) => !isReserved(c, held.get(c.id))), [onSale, held]);
  const searching = urlQuery.trim() !== "" || activeFilterCount(filter) > 0;

  const results = useMemo(() => {
    const scored = rankFeed(available)
      .filter((c) => matchesFilter(c, filter))
      .map((c) => ({ c, s: searchScore(c, urlQuery, breeds, shopOf(c.butcher_id)) }))
      .filter((x) => x.s > 0);
    // best match first; equal matches keep the feed order (newest first)
    return scored.map((x, i) => ({ ...x, i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, filter, urlQuery, breeds, butchers]);

  useScrollMemory(`search?${params.toString()}`, cuts !== null);

  // measurement (§15): each distinct search once, with what it found
  const searchKey = params.toString();
  useEffect(() => {
    if (!searching || cuts === null || searchKey === lastLogged) return;
    lastLogged = searchKey;
    track("search_submit", { query: urlQuery.trim(), filters: chipsKey(filter), results_count: results.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, cuts === null]);
  const chips = activeChips(filter, breeds);

  return (
    <main className="min-h-dvh px-4 pb-24">
      <header className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 bg-ink/95 px-4 pt-3 pb-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <input
            type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go(filter, query); }}
            placeholder={he.market.searchPlaceholder} aria-label={he.market.search}
            className={inputDarkClass + " min-h-12 flex-1"}
          />
          <button type="button" onClick={() => setSheet(true)} className="min-h-11 shrink-0 text-sm text-ivory/80">
            {he.search.filters}{chips.length > 0 && <span className="ms-1 text-gold">({chips.length})</span>}
          </button>
        </div>
        {searching && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {chips.map((c) => (
              <Chip dark key={c.key} selected onClick={() => setFilter(c.next)} className="shrink-0" aria-label={he.search.remove(c.label)}>
                {c.label} <span aria-hidden className="ms-1 opacity-70">×</span>
              </Chip>
            ))}
            <button type="button" onClick={() => { setQuery(""); go(EMPTY_FILTER, ""); }}
              className="min-h-10 shrink-0 px-2 text-sm text-ivory/60 underline-offset-4 hover:underline">
              {he.search.clearAll}
            </button>
          </div>
        )}
      </header>

      {error && !cuts ? <ErrorState dark onRetry={reload} />
        : !searching ? (
          <>
            <Shops butchers={butchers} />
            <QuickFilters filter={filter} onChange={setFilter} cuts={available} types={categoryCounts(available).filter((t) => t.count > 0).map((t) => t.key)}
              onMore={() => setSheet(true)} />
          </>
        )
        : !cuts ? <div className="mt-2 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
        : results.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-display text-xl font-bold text-ivory">{he.search.noResults}</p>
            {chips.length > 0 && (
              <>
                <p className="mt-2 text-sm text-stone">{he.search.removeHint}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {chips.map((c) => (
                    <Chip dark key={c.key} onClick={() => setFilter(c.next)} aria-label={he.search.remove(c.label)}>
                      {c.label} <span aria-hidden className="ms-1 opacity-70">×</span>
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="mb-4 text-[13px] tracking-wide text-stone">{he.search.results(results.length)}</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-7">
              {results.map((c, i) => (
                <CutTile key={c.id} cut={c} breeds={breeds} shop={shopOf(c.butcher_id)}
                  onOpen={() => track("search_result_click", { cut_id: c.id, position: i + 1 })} />
              ))}
            </ul>
          </>
        )}

      <FilterSheet open={sheet} onClose={() => setSheet(false)} value={filter} onApply={setFilter}
        cuts={available.filter((c) => searchScore(c, urlQuery, breeds, shopOf(c.butcher_id)) > 0)} breeds={breeds} />
    </main>
  );
}

/** The shops, by logo. TODO(spec 18.4–18.5): only the shops serving the customer's area, once areas exist. */
function Shops({ butchers }: { butchers: Butcher[] }) {
  const active = butchers.filter((b) => b.status !== "inactive");
  if (!active.length) return null;
  return (
    <section className="mt-4">
      <h2 className="eyebrow mb-3">{he.search.shops}</h2>
      <ul className="no-scrollbar -mx-4 flex justify-center gap-5 overflow-x-auto px-4">
        {active.map((b) => (
          <li key={b.id}>
            <Link href={shopPath(b)} className="flex w-20 flex-col items-center gap-2">
              <ShopMark shop={b} className="size-16 text-2xl" />
              <span className="line-clamp-2 text-center text-xs leading-tight text-ivory/80">{b.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The compact panel of the empty search: cut types, aging ranges and whole / steaks as chips — several can be
 * chosen together (any of the chosen types, any of the chosen ranges) — then "show N cuts"; the rest in the sheet.
 */
function QuickFilters({ filter, onChange, types, cuts, onMore }: {
  filter: FeedFilter; onChange: (f: FeedFilter) => void; types: string[]; cuts: Cut[]; onMore: () => void;
}) {
  const [draft, setDraft] = useState<FeedFilter>(filter);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count = cuts.filter((c) => matchesFilter(c, draft)).length;
  const chosen = activeFilterCount(draft) > 0;
  const row = "flex flex-wrap justify-center gap-2";
  return (
    <section className="mt-8 flex flex-col gap-4 border-t border-ivory/10 pt-6">
      <h2 className="eyebrow">{he.search.filters}</h2>
      <p className="-mt-2 text-xs text-stone">{he.search.multiHint}</p>
      {types.length > 0 && (
        <div className={row}>
          {CUT_TYPES.filter((t) => types.includes(t.key)).map((t) => (
            <Chip dark key={t.key} className="shrink-0" selected={draft.cutTypes.includes(t.key)}
              onClick={() => setDraft({ ...draft, cutTypes: toggle(draft.cutTypes, t.key) })}>{t.label}</Chip>
          ))}
        </div>
      )}
      <div className={row}>
        {AGING_PRESETS.map((a) => (
          <Chip dark key={a.key} className="shrink-0" selected={draft.aging.includes(a.key)}
            onClick={() => setDraft({ ...draft, aging: toggle(draft.aging, a.key) })}>
            {he.filter.agingPreset[a.key]}
          </Chip>
        ))}
      </div>
      <div className={row}>
        <Chip dark className="shrink-0" selected={draft.canWhole} onClick={() => setDraft({ ...draft, canWhole: !draft.canWhole })}>{he.filter.whole}</Chip>
        <Chip dark className="shrink-0" selected={draft.canSteaks} onClick={() => setDraft({ ...draft, canSteaks: !draft.canSteaks })}>{he.filter.steaks}</Chip>
        <button type="button" onClick={onMore} className="min-h-10 shrink-0 px-2 text-sm text-gold underline-offset-4 hover:underline">
          {he.filter.more}
        </button>
      </div>
      {chosen && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex animate-fade-in gap-2 pt-2">
          <Button size="lg" className="flex-[2] rounded-full" disabled={count === 0} onClick={() => onChange(draft)}>{he.filter.show(count)}</Button>
          <Button size="lg" variant="dark" className="flex-1 rounded-full bg-ink" onClick={() => setDraft(EMPTY_FILTER)}>{he.filter.clearAll}</Button>
        </div>
      )}
    </section>
  );
}

/** Every active filter value as a chip that removes just that value. */
function activeChips(f: FeedFilter, breeds: Breed[]): ActiveChip[] {
  const out: ActiveChip[] = [];
  f.cutTypes.forEach((t) => out.push({ key: `t-${t}`, label: cutTypeLabel(t), next: { ...f, cutTypes: f.cutTypes.filter((x) => x !== t) } }));
  f.aging.forEach((a) => out.push({ key: `age-${a}`, label: he.filter.agingPreset[a] ?? a, next: { ...f, aging: f.aging.filter((x) => x !== a) } }));
  if (f.canWhole) out.push({ key: "whole", label: he.filter.whole, next: { ...f, canWhole: false } });
  if (f.canSteaks) out.push({ key: "steaks", label: he.filter.steaks, next: { ...f, canSteaks: false } });
  if (f.priceMin != null || f.priceMax != null) {
    const lo = (f.priceMin ?? 0) / 100;
    const label = f.priceMax == null ? `₪${lo}+ ${he.feed.perKg}` : `₪${lo}–₪${f.priceMax / 100} ${he.feed.perKg}`;
    out.push({ key: "price", label, next: { ...f, priceMin: null, priceMax: null } });
  }
  f.breeds.forEach((b) => out.push({
    key: `br-${b}`, label: b === "other" ? he.filter.other : breeds.find((x) => x.key === b)?.label_he ?? b,
    next: { ...f, breeds: f.breeds.filter((x) => x !== b) },
  }));
  f.origins.forEach((o) => out.push({
    key: `o-${o}`, label: ORIGINS.find((x) => x.key === o)?.label ?? o, next: { ...f, origins: f.origins.filter((x) => x !== o) },
  }));
  return out;
}
