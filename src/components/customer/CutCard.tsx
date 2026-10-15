"use client";
// The main unit of the marketplace: one physical cut, presented like a piece in a catalogue.
// Real photos (swipe inside the card), serif name, price per kg, the facts in one quiet line,
// and the shop as a credit line. No icons — typography and hairlines only.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { agingMethodLabel, originLabel } from "@/lib/labels";
import { canBuySteaks, canBuyWhole, cutTitle, isNew, mediaUrl, photosOf, videoOf } from "@/lib/cut-helpers";
import { shopPath } from "@/lib/market";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import type { Breed, Butcher, CutWithMedia } from "@/lib/types";

export function CutCard({ cut, breeds, shop, now, eager }: {
  cut: CutWithMedia; breeds: Breed[]; shop?: Butcher | null; now: number; eager?: boolean;
}) {
  const title = cutTitle(cut, breeds);
  const photos = photosOf(cut.cut_media);
  const hasVideo = !!videoOf(cut.cut_media);
  const href = `/cut/${cut.code}`;
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el || photos.length < 2) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { root: el, threshold: 0.6 },
    );
    el.querySelectorAll("[data-i]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [photos.length]);

  const facts = [
    cut.origin_country && originLabel(cut.origin_country),
    cut.is_aged && cut.aging_days ? he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method)) : null,
    cut.weight_g ? formatWeight(cut.weight_g) : null,
    cut.butcher_marbling ? he.feed.butcherScore(cut.butcher_marbling) : null,
  ].filter(Boolean) as string[];

  const stock = canBuySteaks(cut) ? he.feed.steaksLeft(cut.steaks_available) : canBuyWhole(cut) ? he.feed.wholeAvailable : null;

  return (
    <article>
      <div className="relative overflow-hidden rounded-2xl bg-ink-3">
        <Link href={href} aria-label={`${title} ${cut.code}`} tabIndex={-1}>
          <div ref={track} className="no-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto">
            {photos.map((p, i) => (
              <div key={p.id} data-i={i} className="h-full w-full shrink-0 snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(p.storage_path)}
                  srcSet={p.thumb_path ? `${mediaUrl(p.thumb_path)} 640w, ${mediaUrl(p.storage_path)} 2000w` : undefined}
                  sizes="(max-width: 480px) 100vw, 480px"
                  alt={he.cut.mediaAlt(title, cut.code, i + 1)}
                  loading={eager && i === 0 ? "eager" : "lazy"}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </Link>
        {isNew(cut, now) && (
          <span className="pointer-events-none absolute top-3 start-3 bg-ink/70 px-2.5 py-1 text-xs font-medium tracking-wide text-ivory backdrop-blur-sm">
            {he.feed.newBadge}
          </span>
        )}
        {photos.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1">
            {photos.map((p, i) => <span key={p.id} className={clsx("h-px w-5 transition-colors", i === active ? "bg-ivory" : "bg-ivory/35")} />)}
          </div>
        )}
      </div>

      <div className="pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <Link href={href} className="min-w-0">
            <h3 className="font-display text-[26px] font-bold leading-[1.15] text-ivory">{title}</h3>
          </Link>
          {cut.price_per_kg_agorot && (
            <p className="shrink-0 text-end">
              <span className="font-display text-[22px] font-bold text-ivory"><Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr></span>
              <span className="ms-1 text-xs text-stone">{he.feed.perKg}</span>
            </p>
          )}
        </div>
        {facts.length > 0 && <p className="mt-1.5 text-[15px] leading-relaxed text-stone">{facts.join("  ·  ")}</p>}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-ivory/10 pt-3 text-sm">
          {shop ? (
            <Link href={shopPath(shop)} className="min-h-9 truncate py-2 text-ivory/70">{shop.name}</Link>
          ) : <span className="text-ivory/50">{stock}</span>}
          <span className="flex shrink-0 items-center gap-4">
            {shop && stock && <span className="text-stone">{stock}</span>}
            {hasVideo && (
              <Link href={`/discover?c=${encodeURIComponent(cut.code)}`} className="min-h-9 py-2 font-medium text-gold underline-offset-4 hover:underline">
                {he.reels.watchCut}
              </Link>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}
