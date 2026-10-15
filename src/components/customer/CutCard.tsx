"use client";
// The main unit of the marketplace: one physical cut, big. Swipe through its real photos inside the card,
// the key facts at a glance, price per kg up front, and the shop as a label — not the other way around.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Store, Video } from "lucide-react";
import { clsx } from "clsx";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { agingMethodLabel, originFlag, originLabel } from "@/lib/labels";
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
    cut.origin_country && `${originFlag(cut.origin_country)} ${originLabel(cut.origin_country)}`,
    cut.is_aged && cut.aging_days ? he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method)) : null,
    cut.weight_g ? formatWeight(cut.weight_g) : null,
  ].filter(Boolean) as string[];

  const stock = canBuySteaks(cut) ? he.feed.steaksLeft(cut.steaks_available) : canBuyWhole(cut) ? he.feed.wholeAvailable : null;

  return (
    <article className="overflow-hidden rounded-3xl bg-white/[0.04] ring-1 ring-white/10">
      <div className="relative">
        <Link href={href} aria-label={`${title} ${cut.code}`} tabIndex={-1}>
          <div ref={track} className="no-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto bg-ink-3">
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

        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {isNew(cut, now) && <span className="rounded-full bg-live px-2.5 py-1 text-xs font-extrabold">{he.feed.newBadge}</span>}
            {stock && <span className="rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold backdrop-blur">{stock}</span>}
          </div>
          {hasVideo && (
            <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold backdrop-blur">
              <Video className="size-3.5" aria-hidden />{he.cut.videoBadge}
            </span>
          )}
        </div>
        {photos.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((p, i) => <span key={p.id} className={clsx("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-white" : "w-1.5 bg-white/55")} />)}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={href} className="min-w-0">
            <h3 className="text-xl font-extrabold leading-tight">{title}</h3>
          </Link>
          {cut.price_per_kg_agorot && (
            <p className="shrink-0 text-end leading-tight">
              <span className="block text-xl font-extrabold"><Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr></span>
              <span className="text-xs text-white/55">{he.feed.perKg}</span>
            </p>
          )}
        </div>
        {facts.length > 0 && <p className="text-[15px] text-white/70">{facts.join(" · ")}</p>}
        <div className="mt-1 flex items-center justify-between gap-2">
          {shop ? (
            <Link href={shopPath(shop)} className="flex min-h-9 min-w-0 items-center gap-1.5 text-sm text-white/55">
              <Store className="size-4 shrink-0" aria-hidden /><span className="truncate">{shop.name}</span>
            </Link>
          ) : <span />}
          {cut.butcher_marbling && <span className="shrink-0 text-xs font-semibold text-white/50">★ {he.feed.butcherScore(cut.butcher_marbling)}</span>}
        </div>
      </div>
    </article>
  );
}
