"use client";
// Grid tile for search results. Always says which shop the cut belongs to.
import Link from "next/link";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { canBuySteaks, canBuyWhole, coverOf, cutTitle, isNew, mediaUrl } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import type { Breed, Butcher, CutWithMedia } from "@/lib/types";

export function CutTile({ cut, breeds, shop, now }: { cut: CutWithMedia; breeds: Breed[]; shop?: Butcher | null; now: number }) {
  const cover = coverOf(cut.cut_media);
  const title = cutTitle(cut, breeds);
  const stock = canBuySteaks(cut) ? he.feed.steaksLeft(cut.steaks_available) : canBuyWhole(cut) ? he.feed.wholeAvailable : "";
  return (
    <li>
      <Link href={`/cut/${cut.code}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-ink-3">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} loading="lazy" className="h-full w-full object-cover" />
          )}
          {isNew(cut, now) && (
            <span className="absolute top-2 start-2 bg-ink/70 px-2 py-0.5 text-[11px] tracking-wide text-ivory backdrop-blur-sm">{he.feed.newBadge}</span>
          )}
        </div>
        <p className="mt-2 truncate font-display text-[17px] font-bold leading-tight text-ivory">{title}</p>
        <p className="mt-0.5 text-[13px] text-stone">
          {cut.weight_g && <Ltr>{formatWeight(cut.weight_g)}</Ltr>}
          {cut.price_per_kg_agorot && <> · <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr> {he.feed.perKg}</>}
        </p>
        <p className="mt-0.5 truncate text-xs text-ivory/55">{[shop?.name, stock].filter(Boolean).join("  ·  ")}</p>
      </Link>
    </li>
  );
}
