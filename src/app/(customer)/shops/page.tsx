"use client";
// All shops — a plain, scalable list (live count, city). Real shops first, test shops last.
import Link from "next/link";
import { BackLink } from "@/components/customer/market-ui";
import { useCatalog } from "@/components/customer/useCatalog";
import { Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { useButchers } from "@/lib/hooks";
import { isAvailable, shopPath } from "@/lib/market";

export default function ShopsPage() {
  const butchers = useButchers();
  const { cuts } = useCatalog();
  const available = (cuts ?? []).filter(isAvailable);
  const countFor = (id: string) => available.filter((c) => c.butcher_id === id).length;
  const shops = [...butchers].sort((a, b) =>
    Number(a.is_test) - Number(b.is_test) || countFor(b.id) - countFor(a.id) || a.name.localeCompare(b.name, "he"));

  return (
    <main className="min-h-dvh px-5 pb-28 lg:mx-auto lg:w-full lg:max-w-[760px]">
      <header className="pt-3 pb-5">
        <BackLink href="/" label={he.market.backToMarket} />
        <h1 className="mt-2 font-display text-3xl font-bold text-ivory">{he.market.shops}</h1>
      </header>
      <ul className="divide-y divide-ivory/10 border-y border-ivory/10">
        {shops.length === 0
          ? [0, 1, 2].map((i) => <li key={i} className="py-4"><Skeleton className="h-11" /></li>)
          : shops.map((b) => {
            const n = countFor(b.id);
            return (
              <li key={b.id}>
                <Link href={shopPath(b)} className="block min-h-16 py-4 active:bg-ivory/[0.03]">
                  <span className="flex items-baseline justify-center gap-3">
                    <span className="truncate font-display text-xl font-bold text-ivory">{b.name}</span>
                    {b.is_test && <span className="shrink-0 text-xs text-gold">{he.market.testBadge}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-stone">
                    {cuts ? he.market.liveCount(n) : "…"}{b.city && `  ·  ${b.city}`}
                  </span>
                </Link>
              </li>
            );
          })}
      </ul>
    </main>
  );
}
