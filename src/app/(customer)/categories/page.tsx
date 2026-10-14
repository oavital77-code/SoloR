"use client";
// Categories — browse by cut type, across the market or inside one shop (`?b=<slug>`).
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useCatalog } from "@/components/customer/useCatalog";
import { ErrorState, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { useButchers } from "@/lib/hooks";
import { categoryCounts, isAvailable, shopPath } from "@/lib/market";

export default function CategoriesPage() {
  return <Suspense><Categories /></Suspense>;
}

function Categories() {
  const slug = useSearchParams().get("b");
  const butchers = useButchers();
  const shop = slug ? butchers.find((b) => b.slug === slug) ?? null : null;
  const { cuts, error, reload } = useCatalog(shop?.id ?? null, !slug || !!shop);
  const available = (cuts ?? []).filter(isAvailable);
  const counts = categoryCounts(available);
  const scope = slug ? `&b=${encodeURIComponent(slug)}` : "";

  return (
    <main className="min-h-dvh px-4 pb-24">
      <header className="flex items-center gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link href={shop ? shopPath(shop) : "/"} aria-label={shop ? he.market.backToShop : he.market.backToMarket}
          className="grid size-11 place-items-center rounded-full bg-white/10"><ChevronRight className="size-5" /></Link>
        <div>
          <h1 className="text-2xl font-extrabold">{he.market.categories}</h1>
          <p className="text-sm text-white/60">{shop ? he.market.inShop(shop.name) : he.market.inMarket}</p>
        </div>
      </header>

      {error && !cuts ? <ErrorState dark onRetry={reload} /> : (
        <ul className="grid grid-cols-2 gap-3">
          {counts.map((c) => {
            const sample = available.find((x) => x.cut_type === c.key);
            const cover = sample ? coverOf(sample.cut_media) : undefined;
            const body = (
              <>
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-ink-3">
                  {!cuts ? <Skeleton className="h-full w-full rounded-none" /> : cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={c.label} className="h-full w-full object-cover" loading="lazy" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute inset-x-3 bottom-3">
                    <p className="text-xl font-extrabold">{c.label}</p>
                    <p className="text-sm text-white/75">{cuts ? (c.count > 0 ? he.market.results(c.count) : he.market.categoryEmpty) : "…"}</p>
                  </div>
                </div>
              </>
            );
            return (
              <li key={c.key}>
                {c.count > 0
                  ? <Link href={`/search?cat=${c.key}${scope}`} className="block">{body}</Link>
                  : <div className="opacity-45" aria-disabled>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
