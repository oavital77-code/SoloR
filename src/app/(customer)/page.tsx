"use client";
// MARKETPLACE — cut-first (founders' decision 15.10.2026): the main business is the cuts themselves.
// Home is the live catalogue of real cuts from every shop; shops are a label on each cut and a separate screen.
// The page stays the same shape at any scale: one filterable list, rendered incrementally.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gavel, LogIn, Store, UserRound } from "lucide-react";
import { CutCard } from "@/components/customer/CutCard";
import { CategoryChips, SearchLink } from "@/components/customer/market-ui";
import { useCatalog } from "@/components/customer/useCatalog";
import { Logo } from "@/components/Logo";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { useBreeds, useButchers, useNow, useSession } from "@/lib/hooks";
import { isAvailable } from "@/lib/market";
import type { CutType } from "@/lib/types";

const PAGE = 10;

export default function MarketPage() {
  return <Suspense><Market /></Suspense>;
}

function Market() {
  const params = useSearchParams();
  const router = useRouter();
  const cat = params.get("cat") as CutType | null;
  const breeds = useBreeds();
  const butchers = useButchers();
  const { user } = useSession();
  const now = useNow(60000);
  const { cuts, error, reload } = useCatalog();
  const available = useMemo(() => (cuts ?? []).filter(isAvailable), [cuts]);
  const shown = useMemo(() => available.filter((c) => !cat || c.cut_type === cat), [available, cat]);

  // incremental rendering: the list can grow to hundreds without a heavy first paint
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => { setLimit(PAGE); }, [cat]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown.length]);

  const setCat = (k: CutType | null) => router.replace(k ? `/?cat=${k}` : "/", { scroll: false });
  const shopOf = (id: string) => butchers.find((b) => b.id === id);

  return (
    <main className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 bg-ink/90 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 px-4">
          <div className="flex items-baseline gap-2">
            <Logo className="text-2xl" />
            <span className="text-[10px] font-extrabold tracking-[0.3em] text-white/40" dir="ltr">{he.market.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/shops" aria-label={he.market.shops}
              className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-sm font-semibold ring-1 ring-white/10">
              <Store className="size-4" aria-hidden />{he.market.shops}
            </Link>
            <Link href={user ? "/profile" : "/login"} aria-label={user ? he.nav.profile : he.nav.login}
              className="grid size-10 place-items-center rounded-full bg-white/[0.08] ring-1 ring-white/10">
              {user ? <UserRound className="size-5" /> : <LogIn className="size-4" />}
            </Link>
          </div>
        </div>
        <div className="mt-3 px-4"><SearchLink href="/search" placeholder={he.market.searchPlaceholder} /></div>
        {available.length > 0 && (
          <div className="mt-3"><CategoryChips cuts={available} active={cat} onSelect={setCat} /></div>
        )}
      </header>

      {error && !cuts ? <ErrorState dark onRetry={reload} /> : (
        <section className="px-4">
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-white/55">
              {cuts ? he.market.results(shown.length) : "…"} · {he.market.newestFirst}
            </p>
            <Link href="/discover" className="flex min-h-10 items-center gap-1.5 rounded-full bg-live/15 px-3 text-sm font-bold text-[#ff6b7f]">
              <span className="animate-live size-2 rounded-full bg-live" aria-hidden />{he.market.watchLive}
            </Link>
          </div>

          {!cuts ? (
            <div className="flex flex-col gap-4">{[0, 1].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
          ) : shown.length === 0 ? (
            <EmptyState text={cat ? he.feed.emptyFiltered : he.feed.empty}>
              {cat && <Button variant="dark" onClick={() => setCat(null)}>{he.feed.clearFilter}</Button>}
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-4">
              {shown.slice(0, limit).map((c, i) => (
                <li key={c.id}><CutCard cut={c} breeds={breeds} shop={shopOf(c.butcher_id)} now={now} eager={i === 0} /></li>
              ))}
            </ul>
          )}
          {shown.length > limit && <div ref={sentinel} className="h-10" aria-hidden />}

          {cuts && (
            <p className="mt-8 flex items-center justify-center gap-2 text-sm text-white/35" aria-disabled>
              <Gavel className="size-4" aria-hidden /><span dir="ltr">{he.market.auctions}</span> · {he.market.soon}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
