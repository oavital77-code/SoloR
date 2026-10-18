"use client";
// Home = the feed (customer spec §4): every available cut from every shop as a post, newest first (rankFeed).
// Live without jumping: new posts wait behind a pill; a sold cut is stamped only for whoever is looking at it or had
// stopped on it (useLiveFeed); a cut held at someone's checkout shows "שוריין" until it is free again (useHeldCuts).
// Rendered in pages as the customer scrolls; pull down at the top to refresh; an honest end of the feed.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CutPost } from "@/components/CutPost";
import { useCatalog } from "@/components/customer/useCatalog";
import { useHeldCuts } from "@/components/customer/useHeldCuts";
import { useLiveFeed } from "@/components/customer/useLiveFeed";
import { ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { isReserved } from "@/lib/feed";
import { israelClock } from "@/lib/hours";
import { useBreeds, useButchers, useNow, useSession } from "@/lib/hooks";
import { shopPath } from "@/lib/market";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { useScrollMemory } from "@/lib/scroll";
import { track } from "@/lib/track";
import type { Butcher } from "@/lib/types";

const PAGE = 8;
const LIMIT_KEY = "solor.feed.limit";
const PULL = 70;

export default function FeedPage() {
  const breeds = useBreeds();
  const butchers = useButchers();
  const now = useNow(60000);
  const { cuts, error, reload } = useCatalog();
  const { user, profile } = useSession();
  // the shared demo account's name is not a person's: greet without it
  const firstName = user?.email?.endsWith("@solor.example") ? null : profile?.full_name.trim().split(/\s+/)[0];
  const live = useLiveFeed(cuts);
  const { pending, waiting, showNew, ready } = live;
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
  const held = useHeldCuts(items.slice(0, limit).filter((i) => !i.gone).map((i) => i.cut.id));

  const refresh = () => { showNew(); reload(); };
  const takeNew = () => { track("new_posts_pill_click", { count: pending }); showNew(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const pull = usePullToRefresh(refresh);
  const shopOf = (id: string) => butchers.find((b) => b.id === id);
  // "12 נתחים עלו היום, משתי קצביות": what went live today (Israel time) and from how many shops
  const today = (() => {
    const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) : "");
    const d = day(new Date(now).toISOString());
    const list = items.filter((i) => !i.gone && day(i.cut.published_at) === d).map((i) => i.cut);
    return { cuts: list.length, shops: new Set(list.map((c) => c.butcher_id)).size };
  })();

  if (error && !cuts) return <main className="min-h-dvh pt-10"><ErrorState dark onRetry={reload} /></main>;

  return (
    <main className="relative min-h-dvh pt-2 pb-28">
      {pull > 0 && (
        <p className="pb-2 text-center text-xs text-stone" style={{ opacity: Math.min(1, pull / PULL) }} aria-live="polite">
          {pull >= PULL ? he.feed.refreshing : he.feed.pullToRefresh}
        </p>
      )}

      {pending > 0 && (
        // design system: NewCutsPill — ivory, the new cuts' photos, waits until tapped; the feed never moves by itself
        <button type="button" onClick={takeNew}
          className="sr-newpill animate-toast-in fixed top-[calc(4.25rem+env(safe-area-inset-top))] left-1/2 z-30 -translate-x-1/2">
          <span className="sr-newpill__dots">
            {waiting.slice(0, 3).map((c) => {
              const cover = coverOf(c.cut_media);
              // eslint-disable-next-line @next/next/no-img-element
              return cover ? <img key={c.id} src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" /> : null;
            })}
          </span>
          <span>{he.feed.newPosts(pending)}</span>
        </button>
      )}

      <div className="wash pointer-events-none absolute inset-x-0 top-0 h-[360px]" aria-hidden />
      <header className="relative px-4 pt-2 pb-5 text-start lg:px-8 lg:pt-6">
        <p className="sr-eyebrow">
          {he.feed.greeting(Math.floor(israelClock(new Date(now)).minutes / 60))}{firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-8 text-ivory">
          {today.cuts > 0 ? he.feed.todaySummary(today.cuts, today.shops) : he.feed.greetingSub}
        </h1>
      </header>

      {!ready ? (
        <div className="relative grid gap-6 px-4 lg:grid-cols-3 lg:px-8">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[520px] rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <FeedEnd title={he.feed.emptyToday} butchers={butchers} />
      ) : (
        <>
          <ul className="relative grid items-start gap-6 px-4 lg:grid-cols-3 lg:px-8">
            {items.slice(0, limit).map(({ cut, gone }, i) => (
              <li key={cut.id}>
                <CutPost cut={cut} media={cut.cut_media} breeds={breeds} shop={shopOf(cut.butcher_id)} now={now} gone={gone}
                  reserved={!gone && isReserved(cut, held.get(cut.id))} eager={i === 0} />
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
    <section className="mt-10 px-4 text-center">
      <div aria-hidden className="mx-auto mb-7 h-px w-28 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
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
