"use client";
// C2 — live feed (Reels style) with realtime updates, filters and a feed/grid toggle.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Rows3, SlidersHorizontal, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { FeedCard } from "@/components/customer/FeedCard";
import { FilterSheet } from "@/components/customer/FilterSheet";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, ErrorState, Ltr, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { canBuySteaks, canBuyWhole, coverOf, cutTitle, isNew, mediaUrl, SOLD_OUT_TAIL_MS } from "@/lib/cut-helpers";
import {
  EMPTY_FILTER, FILTER_STORAGE_KEY, activeFilterCount, matchesFilter, sanitizeFilter, type FeedFilter,
} from "@/lib/feed-filter";
import { safeStorage, useBreeds, useButchers, useNow, useRefetchOnFocus } from "@/lib/hooks";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Cut, CutWithMedia } from "@/lib/types";

const VIEW_KEY = "solor.feed.view";
const FEED_SELECT = "*, cut_media(*)";

function sortFeed(list: CutWithMedia[], now: number): CutWithMedia[] {
  const live = list.filter((c) => c.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const sold = list.filter((c) => c.status === "sold_out" && c.sold_out_at && now - new Date(c.sold_out_at).getTime() < SOLD_OUT_TAIL_MS)
    .sort((a, b) => (b.sold_out_at ?? "").localeCompare(a.sold_out_at ?? ""));
  return [...live, ...sold];
}

export default function FeedPage() {
  const breeds = useBreeds();
  const butchers = useButchers();
  const toast = useToast();
  const now = useNow(60000);
  const [cuts, setCuts] = useState<CutWithMedia[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilterState] = useState<FeedFilter>(EMPTY_FILTER);
  const [view, setViewState] = useState<"feed" | "grid">("feed");
  const [filterOpen, setFilterOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [pill, setPill] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idsRef = useRef<Set<string>>(new Set());
  const filterRef = useRef(filter);
  const breedsRef = useRef(breeds);
  breedsRef.current = breeds;

  // restore persisted filter + view
  useEffect(() => {
    const f = sanitizeFilter(safeStorage.get(FILTER_STORAGE_KEY, EMPTY_FILTER));
    setFilterState(f);
    filterRef.current = f;
    setViewState(safeStorage.get<"feed" | "grid">(VIEW_KEY, "feed") === "grid" ? "grid" : "feed");
  }, []);
  const setFilter = (f: FeedFilter) => { setFilterState(f); filterRef.current = f; safeStorage.set(FILTER_STORAGE_KEY, f); };
  const setView = (v: "feed" | "grid") => { setViewState(v); safeStorage.set(VIEW_KEY, v); };

  const load = useCallback(async () => {
    const since = new Date(Date.now() - SOLD_OUT_TAIL_MS).toISOString();
    const { data, error } = await supabaseBrowser()
      .from("cuts").select(FEED_SELECT)
      .or(`status.eq.published,and(status.eq.sold_out,sold_out_at.gt.${since})`)
      .order("published_at", { ascending: false })
      .limit(100);
    if (error) { setError(true); return; }
    setError(false);
    const list = (data ?? []) as CutWithMedia[];
    idsRef.current = new Set(list.map((c) => c.id));
    setCuts(list);
  }, []);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  const scrollTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setPill(false);
  }, []);

  // realtime: new cuts, stock changes, sold out, withdrawn
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel("feed-cuts")
      .on("postgres_changes", { event: "*", schema: "public", table: "cuts" }, async (payload) => {
        if (payload.eventType === "DELETE") return;
        const row = payload.new as Cut;
        const known = idsRef.current.has(row.id);

        if (row.status !== "published" && row.status !== "sold_out") {
          // withdrawn (or reverted to draft) → leaves the feed
          idsRef.current.delete(row.id);
          setCuts((cs) => cs?.filter((c) => c.id !== row.id) ?? cs);
          return;
        }
        if (known) {
          setCuts((cs) => cs?.map((c) => (c.id === row.id ? { ...c, ...row } : c)) ?? cs);
          return;
        }
        if (row.status !== "published") return;
        // a newly published cut: fetch it with its media
        idsRef.current.add(row.id);
        const { data } = await sb.from("cuts").select(FEED_SELECT).eq("id", row.id).maybeSingle();
        if (!data) { idsRef.current.delete(row.id); return; }
        const cut = data as CutWithMedia;
        setCuts((cs) => (cs ? [cut, ...cs.filter((c) => c.id !== cut.id)] : [cut]));
        setFresh((s) => new Set(s).add(cut.id));
        if (matchesFilter(cut, filterRef.current)) {
          const title = cutTitle(cut, breedsRef.current);
          toast(he.feed.newCutToast(title), { tone: "live", duration: 7000, action: { label: he.feed.show, onClick: scrollTop } });
          if ((scrollRef.current?.scrollTop ?? 0) > 50) setPill(true);
        }
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [toast, scrollTop]);

  const all = useMemo(() => (cuts ? sortFeed(cuts, now) : []), [cuts, now]);
  const visible = useMemo(() => all.filter((c) => matchesFilter(c, filter)), [all, filter]);
  const nFilters = activeFilterCount(filter);
  const shopName = butchers[0]?.name;

  return (
    <main className="relative h-dvh">
      {/* top overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg bg-live px-2 py-1 text-xs font-extrabold tracking-wider">
            <span className="animate-live size-2 rounded-full bg-white" aria-hidden />
            <span dir="ltr">{he.feed.live}</span>
          </span>
          <span className="min-w-0 flex-1 truncate font-bold drop-shadow">{shopName}</span>
          <button type="button" onClick={() => setFilterOpen(true)} aria-label={he.feed.filter}
            className="relative flex min-h-11 items-center gap-1.5 rounded-full bg-black/45 px-3 font-semibold backdrop-blur">
            <SlidersHorizontal className="size-4" /> {he.feed.filter}
            {nFilters > 0 && <span className="ltr grid size-5 place-items-center rounded-full bg-brand text-xs">{nFilters}</span>}
          </button>
          <button type="button" onClick={() => setView(view === "feed" ? "grid" : "feed")}
            aria-label={view === "feed" ? he.feed.viewGrid : he.feed.viewFeed}
            className="grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur">
            {view === "feed" ? <LayoutGrid className="size-5" /> : <Rows3 className="size-5" />}
          </button>
          <Link href="/profile" aria-label={he.nav.profile} className="grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur">
            <UserRound className="size-5" />
          </Link>
        </div>
      </div>

      {pill && (
        <button type="button" onClick={scrollTop}
          className="animate-toast-in absolute inset-x-0 mx-auto w-fit top-[calc(4.25rem+env(safe-area-inset-top))] z-30 rounded-full bg-live px-4 py-2 font-extrabold shadow-lg">
          {he.feed.newCutPill}
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => { if (pill && e.currentTarget.scrollTop < 50) setPill(false); }}
        className={clsx("no-scrollbar h-full overflow-y-auto", view === "feed" && "snap-y snap-mandatory")}
      >
        {error && !cuts ? (
          <div className="pt-24"><ErrorState dark onRetry={load} /></div>
        ) : !cuts ? (
          <FeedSkeleton />
        ) : all.length === 0 ? (
          <div className="grid h-full place-items-center"><EmptyState text={he.feed.empty} /></div>
        ) : visible.length === 0 ? (
          <div className="grid h-full place-items-center">
            <EmptyState text={he.feed.emptyFiltered}>
              <Button variant="dark" onClick={() => setFilter(EMPTY_FILTER)}>{he.feed.clearFilter}</Button>
            </EmptyState>
          </div>
        ) : view === "feed" ? (
          visible.map((c, i) => (
            <div key={c.id} className="h-full">
              <FeedCard cut={c} breeds={breeds} muted={muted} onToggleMute={() => setMuted((m) => !m)} fresh={fresh.has(c.id)} eager={i === 0} now={now} />
            </div>
          ))
        ) : (
          <ul className="grid grid-cols-2 gap-2 px-2 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-24">
            {visible.map((c) => <GridItem key={c.id} cut={c} title={cutTitle(c, breeds)} now={now} />)}
          </ul>
        )}
      </div>

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} value={filter} onApply={setFilter} cuts={all} breeds={breeds} />
    </main>
  );
}

function GridItem({ cut, title, now }: { cut: CutWithMedia; title: string; now: number }) {
  const cover = coverOf(cut.cut_media);
  const soldOut = cut.status !== "published";
  const inner = (
    <>
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-ink-3">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} loading="lazy"
            className={clsx("h-full w-full object-cover", soldOut && "grayscale")} />
        )}
        {soldOut && <span className="absolute inset-0 grid place-items-center bg-black/55 text-2xl font-extrabold">{he.feed.soldOut}</span>}
        {!soldOut && isNew(cut, now) && <span className="absolute top-2 start-2 rounded-full bg-live px-2 py-0.5 text-xs font-extrabold">{he.feed.newBadge}</span>}
        {!soldOut && (
          <span className="absolute bottom-2 start-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold">
            {canBuySteaks(cut) ? he.feed.steaksLeft(cut.steaks_available) : canBuyWhole(cut) ? he.feed.wholeAvailable : ""}
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate font-bold leading-tight">{title}</p>
      <p className="text-sm text-white/70">
        {cut.weight_g && <Ltr>{formatWeight(cut.weight_g)}</Ltr>} · {cut.price_per_kg_agorot && <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr>}
      </p>
    </>
  );
  return <li>{soldOut ? <div className="opacity-70">{inner}</div> : <Link href={`/cut/${cut.code}`}>{inner}</Link>}</li>;
}

function FeedSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-3 p-4 pb-24 text-white">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
