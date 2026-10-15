"use client";
// All shops — a plain, scalable list (live count, city). Real shops first, test shops last.
import Link from "next/link";
import { ChevronLeft, ChevronRight, Store } from "lucide-react";
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
    <main className="min-h-dvh px-4 pb-28">
      <header className="flex items-center gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <Link href="/" aria-label={he.market.backToMarket} className="grid size-11 place-items-center rounded-full bg-white/10"><ChevronRight className="size-5" /></Link>
        <h1 className="text-2xl font-extrabold">{he.market.shops}</h1>
      </header>
      <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
        {shops.length === 0
          ? [0, 1, 2].map((i) => <li key={i} className="p-3"><Skeleton className="h-11" /></li>)
          : shops.map((b) => {
            const n = countFor(b.id);
            return (
              <li key={b.id}>
                <Link href={shopPath(b)} className="flex min-h-16 items-center gap-3 px-3 py-2.5 active:bg-white/[0.06]">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-white/70"><Store className="size-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-bold">{b.name}</span>
                      {b.is_test && <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">{he.market.testBadge}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-white/55">
                      {n > 0 && <span className="animate-live size-1.5 rounded-full bg-live" aria-hidden />}
                      {cuts ? he.market.liveCount(n) : "…"}{b.city && ` · ${b.city}`}
                    </span>
                  </span>
                  <ChevronLeft className="size-5 shrink-0 text-white/30" aria-hidden />
                </Link>
              </li>
            );
          })}
      </ul>
    </main>
  );
}
