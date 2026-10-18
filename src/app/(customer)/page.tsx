"use client";
// Home = the feed (customer spec §4): every available cut from every shop as a post, newest first (rankFeed).
// Live without jumping: new posts wait behind a pill, sold ones keep their place with a stamp (useLiveFeed).
// Rendered in pages as the customer scrolls; pull down at the top to refresh; an honest end of the feed.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CutPost } from "@/components/CutPost";
import { useCatalog } from "@/components/customer/useCatalog";
import { useLiveFeed } from "@/components/customer/useLiveFeed";
import { ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
import { shopPath } from "@/lib/market";
import { useScrollMemory } from "@/lib/scroll";
import type { Butcher } from "@/lib/types";

const PAGE = 8;
const LIMIT_KEY = "solor.feed.limit";
const PULL = 70;

export default function FeedPage() {
  const breeds = useBreeds();
  const butchers = useButchers();
  const now = useNow(60000);
  const { cuts, error, reload } = useCatalog();
  const live = useLiveFeed(cuts);
  const { pending, showNew, ready } = live;
  // only shops that are active (spec §4.1); before the shop list loads, everything shows
  const items = live.items.filter(({ cut }) => butchers.find((b) => b.id === cut.butcher_id)?.status !== "inactive");

  // how far the customer got is kept for the session, so "back" lands on the same post
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    try { setLimit(Math.max(PAGE, Number(window.sessionStorage.getItem(LIMIT_KEY)) || PAGE)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.sessionStorage.setItem(LIMIT_KEY, String(limit)); } catch { /* ignore */ }
  }, [limit]);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "1200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, limit]);

  useScrollMemory("feed", ready);

  const refresh = () => { showNew(); reload(); };
  const takeNew = () => { showNew(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const pull = usePullToRefresh(refresh);
  const shopOf = (id: string) => butchers.find((b) => b.id === id);

  if (error && !cuts) return <main className="min-h-dvh pt-10"><ErrorState dark onRetry={reload} /></main>;

  return (
    <main className="min-h-dvh pt-2 pb-28">
      {pull > 0 && (
        <p className="pb-2 text-center text-xs text-stone" style={{ opacity: Math.min(1, pull / PULL) }} aria-live="polite">
          {pull >= PULL ? he.feed.refreshing : he.feed.pullToRefresh}
        </p>
      )}

      {pending > 0 && (
        <button type="button" onClick={takeNew}
          className="animate-toast-in fixed top-[calc(4.25rem+env(safe-area-inset-top))] left-1/2 z-30 -translate-x-1/2 rounded-full bg-ivory px-4 py-2 text-sm font-semibold text-ink shadow-lg shadow-black/40">
          {he.feed.newPosts(pending)}
        </button>
      )}

      {!ready ? (
        <div className="flex flex-col gap-4 px-4">{[0, 1].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
      ) : items.length === 0 ? (
        <FeedEnd title={he.feed.emptyToday} butchers={butchers} />
      ) : (
        <>
          <ul className="flex flex-col divide-y-[10px] divide-black">
            {items.slice(0, limit).map(({ cut, gone }, i) => (
              <li key={cut.id} className="pt-4 first:pt-1">
                <CutPost cut={cut} media={cut.cut_media} breeds={breeds} shop={shopOf(cut.butcher_id)} now={now} gone={gone} eager={i === 0} />
              </li>
            ))}
          </ul>
          {items.length > limit ? <div ref={sentinel} className="h-10" aria-hidden />
            : <FeedEnd title={he.feed.end} hint={he.feed.endHint} butchers={butchers} />}
        </>
      )}
    </main>
  );
}

/** End of the feed (and the empty feed): say so, and offer the shops' pages (spec §2.2, §4.4). */
function FeedEnd({ title, hint, butchers }: { title: string; hint?: string; butchers: Butcher[] }) {
  return (
    <section className="mt-6 border-t-[10px] border-black px-4 pt-8 text-center">
      <p className="font-display text-xl font-bold text-ivory">{title}</p>
      {hint && <p className="mt-1 text-sm text-stone">{hint}</p>}
      {butchers.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-1">
          {butchers.map((b) => (
            <li key={b.id}><Link href={shopPath(b)} className="inline-block min-h-10 py-2.5 text-sm text-gold underline-offset-4 hover:underline">{b.name}</Link></li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pull down at the very top to refresh. The browser's own pull-to-reload is held back while the feed is up. */
function usePullToRefresh(onRefresh: () => void) {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const latest = useRef(0);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    const down = (e: TouchEvent) => { start.current = window.scrollY <= 0 ? e.touches[0].clientY : null; };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      latest.current = Math.max(0, Math.min(PULL * 1.4, (e.touches[0].clientY - start.current) / 2));
      setPull(latest.current);
    };
    const up = () => {
      if (latest.current >= PULL) cb.current();
      start.current = null; latest.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      root.style.overscrollBehaviorY = prev;
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, []);
  return pull;
}
