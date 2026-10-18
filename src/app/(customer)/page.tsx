"use client";
// Home = the feed (customer spec §4): every available cut from every shop, newest first. The header and the
// tab bar come from the layout; search and filters live on their own tab.
import { useEffect, useMemo, useRef, useState } from "react";
import { CutCard } from "@/components/customer/CutCard";
import { useCatalog } from "@/components/customer/useCatalog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
import { isAvailable } from "@/lib/market";
import { useScrollMemory } from "@/lib/scroll";

const PAGE = 10;
const LIMIT_KEY = "solor.feed.limit";

export default function FeedPage() {
  const breeds = useBreeds();
  const butchers = useButchers();
  const now = useNow(60000);
  const { cuts, error, reload } = useCatalog();
  const shown = useMemo(() => (cuts ?? []).filter(isAvailable), [cuts]);

  // incremental rendering; how far the customer got is kept for the session, so "back" lands on the same post
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
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown.length]);

  useScrollMemory("feed", cuts !== null);
  const shopOf = (id: string) => butchers.find((b) => b.id === id);

  if (error && !cuts) return <main className="min-h-dvh pt-10"><ErrorState dark onRetry={reload} /></main>;

  return (
    <main className="min-h-dvh px-4 pt-2 pb-28">
      {!cuts ? (
        <div className="flex flex-col gap-4">{[0, 1].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState text={he.feed.empty} />
      ) : (
        <ul className="flex flex-col gap-12">
          {shown.slice(0, limit).map((c, i) => (
            <li key={c.id}><CutCard cut={c} breeds={breeds} shop={shopOf(c.butcher_id)} now={now} eager={i === 0} /></li>
          ))}
        </ul>
      )}
      {shown.length > limit && <div ref={sentinel} className="h-10" aria-hidden />}
    </main>
  );
}
