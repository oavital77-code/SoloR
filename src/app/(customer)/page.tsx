"use client";
// Home = the feed (customer spec §4): every available cut from every shop as a post, newest first (rankFeed).
// Live without jumping: new posts wait behind a pill; a sold cut is stamped only for whoever is looking at it or had
// stopped on it (useLiveFeed); a cut held at someone's checkout shows "שוריין" until it is free again (useHeldItems).
// Rendered in pages as the customer scrolls; pull down at the top to refresh; an honest end of the feed.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CutPost } from "@/components/CutPost";
import { useCatalog } from "@/components/customer/useCatalog";
import { useHeldItems } from "@/components/customer/useHeldItems";
import { useLiveFeed } from "@/components/customer/useLiveFeed";
import { ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { isReserved } from "@/lib/feed";
import { onePerParent, parentPath } from "@/lib/items";
import { clsx } from "clsx";
import { ShopMark } from "@/components/ShopMark";
import { Ltr } from "@/components/ui";
import { closesAt, isOpenNow, israelClock } from "@/lib/hours";
import { liveEvents, type LiveEvent } from "@/lib/live";
import { useBreeds, useButchers, useNow, useSession } from "@/lib/hooks";
import { isAvailable, shopPath } from "@/lib/market";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { useScrollMemory } from "@/lib/scroll";
import { track } from "@/lib/track";
import type { Butcher, SaleItem } from "@/lib/types";

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
  // one post per parent cut, its other trays under it (v2 Q6)
  const posts = onePerParent(items);

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
  }, [posts.length, limit]);

  useScrollMemory("feed", ready);
  const held = useHeldItems(posts.slice(0, limit).filter((i) => !i.gone).map((i) => i.cut.id));

  const refresh = () => { showNew(); reload(); };
  const takeNew = () => { track("new_posts_pill_click", { count: pending }); showNew(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const pull = usePullToRefresh(refresh);
  const shopOf = (id: string) => butchers.find((b) => b.id === id);
  // "12 נתחים עלו היום, משתי קצביות": what went live today (Israel time) and from how many shops
  const today = (() => {
    const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) : "");
    const d = day(new Date(now).toISOString());
    const list = items.filter((i) => !i.gone && day(i.cut.published_at) === d).map((i) => i.cut);
    return { cuts: new Set(list.map((c) => c.parent_id)).size, shops: new Set(list.map((c) => c.butcher_id)).size };
  })();

  if (error && !cuts) return <main className="min-h-dvh pt-10"><ErrorState dark onRetry={reload} /></main>;

  const events = liveEvents(cuts ?? [], butchers, breeds);
  // more from the same counter, under each post: what that shop still has, newest first
  const relatedOf = (cut: SaleItem) => posts
    .filter((i) => !i.gone && i.cut.butcher_id === cut.butcher_id && i.cut.parent_id !== cut.parent_id && isAvailable(i.cut))
    .slice(0, 4).map((i) => i.cut);

  return (
    <main className="relative min-h-dvh pb-28">
      {pull > 0 && (
        <p className="pt-2 text-center text-xs text-stone" style={{ opacity: Math.min(1, pull / PULL) }} aria-live="polite">
          {pull >= PULL ? he.feed.refreshing : he.feed.pullToRefresh}
        </p>
      )}

      {pending > 0 && (
        // design system: NewCutsPill — the new cuts' photos, waits until tapped; the feed never moves by itself
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

      <LiveTicker events={events} />

      <div className="lg:grid lg:grid-cols-[270px_minmax(0,660px)_290px] lg:justify-center lg:gap-8 lg:px-8 lg:pt-7">
        <ShopsAside butchers={butchers} now={now} />

        <div className="min-w-0">
          <header className="px-4 pt-5 pb-4 text-start lg:px-0 lg:pt-0">
            <p className="sr-eyebrow">
              {he.feed.greeting(Math.floor(israelClock(new Date(now)).minutes / 60))}{firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="m-0 mt-1 text-[28px] font-black leading-9 lg:text-[34px] lg:leading-10">
              {today.cuts > 0 ? he.feed.todaySummary(today.cuts, today.shops) : he.feed.onCounter}
            </h1>
          </header>

          {!ready ? (
            <div className="flex flex-col gap-5 px-4 lg:px-0">{[0, 1].map((i) => <Skeleton key={i} className="h-[560px] rounded-[22px]" />)}</div>
          ) : posts.length === 0 ? (
            <FeedEnd title={he.feed.emptyToday} butchers={butchers} />
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-5 p-0 px-3 lg:px-0">
                {posts.slice(0, limit).map(({ cut, gone, trays }, i) => (
                  <li key={cut.id}>
                    <CutPost cut={cut} breeds={breeds} shop={shopOf(cut.butcher_id)} now={now} gone={gone}
                      reserved={!gone && isReserved(cut, held.get(cut.id))} held={held.get(cut.id)} eager={i === 0} related={relatedOf(cut)} trays={trays} />
                  </li>
                ))}
              </ul>
              {posts.length > limit ? <div ref={sentinel} className="h-10" aria-hidden />
                : <FeedEnd title={he.feed.end} hint={he.feed.endHint} butchers={butchers} />}
            </>
          )}
        </div>

        <LiveLog events={events} />
      </div>
    </main>
  );
}

/** The red "עכשיו" strip under the header (design: V3): the latest few things that happened at the counters. */
function LiveTicker({ events }: { events: LiveEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="no-scrollbar flex h-10 items-center gap-6 overflow-x-auto bg-brand px-4 text-sm whitespace-nowrap text-on-brand lg:px-10" role="status" aria-live="polite">
      <b>{he.live.ticker}</b>
      {events.slice(0, 4).map((e, i) => (
        <span key={e.id} className="flex items-center gap-6">{i > 0 && <span aria-hidden className="opacity-60">|</span>}{e.text}</span>
      ))}
    </div>
  );
}

/** The shops, beside the feed on a wide screen (design: V3): mark, name, open until when. */
function ShopsAside({ butchers, now }: { butchers: Butcher[]; now: number }) {
  const shops = butchers.filter((b) => b.status !== "inactive");
  return (
    <aside aria-label={he.live.shops} className="hidden flex-col gap-3 text-start lg:flex">
      <h2 className="m-0 text-lg font-bold">{he.live.shops}</h2>
      {shops.map((b) => {
        const open = isOpenNow(b.opening_hours, new Date(now));
        const until = open ? closesAt(b.opening_hours, new Date(now)) : null;
        return (
          <Link key={b.id} href={shopPath(b)} className="flex items-center gap-2.5 rounded-2xl bg-ink-2 px-3 py-2.5">
            <ShopMark shop={b} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{b.name}</span>
              <span className={clsx("text-xs", open ? "text-success" : "text-stone")}>
                {open ? <>● {he.live.openUntil} {until && <Ltr>{until}</Ltr>}</> : he.live.closed}
              </span>
            </span>
          </Link>
        );
      })}
    </aside>
  );
}

/** "מה קורה בדלפקים" (design: V3): the dark live panel beside the feed, with the time of each thing. */
function LiveLog({ events }: { events: LiveEvent[] }) {
  return (
    <aside aria-label={he.live.log} className="hidden lg:block">
      <div data-theme="night" className="sticky top-24 flex flex-col gap-3 rounded-[20px] bg-ink p-[18px] text-start text-ivory">
        <h2 className="m-0 flex items-center gap-2 text-[17px] font-bold"><span className="live-dot" aria-hidden />{he.live.log}</h2>
        {events.length === 0 ? <p className="m-0 text-sm text-stone">{he.feed.emptyToday}</p> : events.map((e) => (
          <Link key={e.id} href={parentPath(e.parentId)} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 text-[13px] leading-[19px]">
            <span className={clsx(e.kind === "sold" ? "text-stone" : "text-brand")}><Ltr>{clock(e.at)}</Ltr></span>
            <span>{e.text}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

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
