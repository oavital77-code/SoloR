"use client";
// Grid tile for search results, categories and shop pages. Always says which shop the cut belongs to.
import Link from "next/link";
import { Store } from "lucide-react";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { canBuySteaks, canBuyWhole, coverOf, cutTitle, isNew, mediaUrl } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import type { Breed, Butcher, CutWithMedia } from "@/lib/types";

export function CutTile({ cut, breeds, shop, now }: { cut: CutWithMedia; breeds: Breed[]; shop?: Butcher | null; now: number }) {
  const cover = coverOf(cut.cut_media);
  const title = cutTitle(cut, breeds);
  return (
    <li>
      <Link href={`/cut/${cut.code}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-ink-3">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} loading="lazy" className="h-full w-full object-cover" />
          )}
          {isNew(cut, now) && <span className="absolute top-2 start-2 rounded-full bg-live px-2 py-0.5 text-xs font-extrabold">{he.feed.newBadge}</span>}
          <span className="absolute bottom-2 start-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold">
            {canBuySteaks(cut) ? he.feed.steaksLeft(cut.steaks_available) : canBuyWhole(cut) ? he.feed.wholeAvailable : ""}
          </span>
        </div>
        <p className="mt-1.5 truncate font-bold leading-tight">{title}</p>
        <p className="text-sm text-white/70">
          {cut.weight_g && <Ltr>{formatWeight(cut.weight_g)}</Ltr>} · {cut.price_per_kg_agorot && <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr>} {he.feed.perKg}
        </p>
        {shop && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/55"><Store className="size-3.5 shrink-0" aria-hidden />{shop.name}</p>
        )}
      </Link>
    </li>
  );
}
