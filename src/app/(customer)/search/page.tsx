"use client";
// Search (customer spec §8, design: Search). Before searching: the title, the field, the filters as chips and the shops.
// Once there is a word or a filter: the field and the active filters stay on top as removable chips, and the
// shops give way to what can be bought now as posts like the feed's, best match first. Everything lives in the URL,
// so the search tab comes back exactly as it was left.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CutPost } from "@/components/CutPost";
import { FilterSheet } from "@/components/customer/FilterSheet";
import { useCatalog } from "@/components/customer/useCatalog";
import { useHeldCuts } from "@/components/customer/useHeldCuts";
import { ShopMark } from "@/components/ShopMark";
import { Chip, ErrorState, Skeleton } from "@/components/ui";
import { IconClose, IconSearch } from "@/components/icons";
import { he } from "@/lib/i18n/he";
import { isReserved, rankFeed } from "@/lib/feed";
import {
  AGING_PRESETS, EMPTY_FILTER, activeFilterCount, filterFromParams, filterToParams, matchesFilter, type FeedFilter,
} from "@/lib/feed-filter";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
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
  const now = useNow(60000);
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

  const field = (
    <label className="sr-searchfield">
      <IconSearch />
      <input
        type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") go(filter, query); }}
        placeholder={he.search.placeholder} aria-label={he.market.search}
      />
    </label>
  );

  return (
    <main className="min-h-dvh px-4 pb-24 text-start lg:px-8">
      {!searching ? (
        <div className="flex flex-col gap-5 pt-4 lg:mx-auto lg:max-w-[760px] lg:pt-8">
          <h1 className="sr-screen-title">{he.market.search}</h1>
          {field}
          {error && !cuts ? <ErrorState dark onRetry={reload} /> : (
            <QuickFilters filter={filter} onChange={setFilter} cuts={available}
              types={categoryCounts(available).filter((t) => t.count > 0).map((t) => t.key)}
              shops={<Shops butchers={butchers} />} onMore={() => setSheet(true)} />
          )}
        </div>
      ) : (
        <>
          <header className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 bg-ink/95 px-4 pt-3 pb-3 backdrop-blur lg:-mx-8 lg:px-8">
            <div className="flex items-center gap-2.5">
              <div className="flex-1">{field}</div>
              <button type="button" onClick={() => setSheet(true)} className="sr-fchip" aria-pressed={chips.length > 0}>
                {he.search.filters}{chips.length > 0 && <span className="ltr">{chips.length}</span>}
              </button>
            </div>
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              {chips.map((c) => (
                <Chip dark key={c.key} selected onClick={() => setFilter(c.next)} aria-label={he.search.remove(c.label)}>
                  {c.label} <IconClose className="!size-4" />
                </Chip>
              ))}
              <button type="button" onClick={() => { setQuery(""); go(EMPTY_FILTER, ""); }}
                className="min-h-11 shrink-0 px-2 text-sm text-stone underline-offset-4 hover:underline">
                {he.search.clearAll}
              </button>
            </div>
          </header>

          {error && !cuts ? <ErrorState dark onRetry={reload} />
            : !cuts ? <div className="mx-auto mt-2 flex max-w-[660px] flex-col gap-5">{[0, 1].map((i) => <Skeleton key={i} className="h-[560px] rounded-[22px]" />)}</div>
            : results.length === 0 ? (
              <div className="py-14 text-center">
                <p className="font-display text-xl font-bold text-ivory">{he.search.noResults}</p>
                {chips.length > 0 && (
                  <>
                    <p className="mt-2 text-sm text-stone">{he.search.removeHint}</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      {chips.map((c) => (
                        <Chip dark key={c.key} onClick={() => setFilter(c.next)} aria-label={he.search.remove(c.label)}>
                          {c.label} <IconClose className="!size-4" />
                        </Chip>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="mx-auto max-w-[660px]">
                  <p className="mb-4 text-[13px] tracking-wide text-stone">{he.search.results(results.length)}</p>
                  {/* the same social posts as the feed (design: V3); a tap on any link in a post counts as opening it */}
                  <ul className="-mx-1 m-0 flex list-none flex-col gap-5 p-0 lg:mx-0">
                    {results.map((c, i) => (
                      <li key={c.id} onClickCapture={(e) => {
                        if ((e.target as HTMLElement).closest("a")) track("search_result_click", { cut_id: c.id, position: i + 1 });
                      }}>
                        <CutPost cut={c} media={c.cut_media} breeds={breeds} shop={shopOf(c.butcher_id)} now={now} source="search" eager={i === 0} />
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
        </>
      )}

      <FilterSheet open={sheet} onClose={() => setSheet(false)} value={filter} onApply={setFilter}
        cuts={available.filter((c) => searchScore(c, urlQuery, breeds, shopOf(c.butcher_id)) > 0)} breeds={breeds} />
    </main>
  );
}

/** The shops, by mark (design: Search). TODO(spec 18.4–18.5): only the shops serving the customer's area, once areas exist. */
function Shops({ butchers }: { butchers: Butcher[] }) {
  const active = butchers.filter((b) => b.status !== "inactive");
  if (!active.length) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <span className="sr-eyebrow">{he.search.shops}</span>
      <ul className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4">
        {active.map((b) => (
          <li key={b.id}>
            <Link href={shopPath(b)} className="flex w-[72px] flex-col items-center gap-1.5">
              <ShopMark shop={b} className="!size-14 !text-[24px]" />
              <span className="line-clamp-2 text-center text-[13px] font-medium leading-tight">{b.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The empty search (design: Search): cut types, aging and whole / steaks as chips under their eyebrows — several
 * can be chosen together (any of the chosen types, any of the chosen ranges) — the shops, and, once something is
 * chosen, a bar above the tabs with "נקה הכל" and "הצג N נתחים". The rest of the filters are in the sheet.
 */
function QuickFilters({ filter, onChange, types, cuts, shops, onMore }: {
  filter: FeedFilter; onChange: (f: FeedFilter) => void; types: string[]; cuts: Cut[]; shops: React.ReactNode; onMore: () => void;
}) {
  const [draft, setDraft] = useState<FeedFilter>(filter);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count = cuts.filter((c) => matchesFilter(c, draft)).length;
  const chosen = activeFilterCount(draft) > 0;
  const section = (title: string, body: React.ReactNode) => (
    <section className="flex flex-col gap-2.5">
      <span className="sr-eyebrow">{title}</span>
      <div className="sr-chips">{body}</div>
    </section>
  );
  return (
    <>
      {types.length > 0 && section(he.filter.cutType, CUT_TYPES.filter((t) => types.includes(t.key)).map((t) => (
        <Chip dark key={t.key} selected={draft.cutTypes.includes(t.key)}
          onClick={() => setDraft({ ...draft, cutTypes: toggle(draft.cutTypes, t.key) })}>{t.label}</Chip>
      )))}
      {section(he.filter.aging, AGING_PRESETS.map((a) => (
        <Chip dark key={a.key} selected={draft.aging.includes(a.key)}
          onClick={() => setDraft({ ...draft, aging: toggle(draft.aging, a.key) })}>
          {he.filter.agingPreset[a.key]}
        </Chip>
      )))}
      {section(he.search.howToBuy, <>
        <Chip dark selected={draft.canWhole} onClick={() => setDraft({ ...draft, canWhole: !draft.canWhole })}>{he.filter.whole}</Chip>
        <Chip dark selected={draft.canSteaks} onClick={() => setDraft({ ...draft, canSteaks: !draft.canSteaks })}>{he.filter.steaks}</Chip>
      </>)}
      <p className="-mt-2 m-0 text-xs text-stone">{he.search.multiHint} · <button type="button" onClick={onMore} className="sr-link !text-xs">{he.filter.more}</button></p>
      {shops}
      {chosen && (
        <>
          <div className="h-16" />
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[480px] animate-fade-in items-center gap-2.5 border-t border-line bg-ink px-4 py-3 lg:bottom-0 lg:max-w-[760px] lg:rounded-t-3xl lg:border-x">
            <button type="button" className="sr-btn sr-btn--ghost" onClick={() => setDraft(EMPTY_FILTER)}>{he.filter.clearAll}</button>
            <button type="button" className="sr-btn flex-1" disabled={count === 0} onClick={() => onChange(draft)}>{he.filter.show(count)}</button>
          </div>
        </>
      )}
    </>
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
