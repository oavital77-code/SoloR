"use client";
// Search result tile (customer spec §8.2): the final photo, the cut, its price, its aging and the shop's small mark.
// A tap opens the full post.
import Link from "next/link";
import { ShopMark } from "../ShopMark";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { agingMethodLabel } from "@/lib/labels";
import { formatAgorot } from "@/lib/pricing";
import type { Breed, Butcher, CutWithMedia } from "@/lib/types";

export function CutTile({ cut, breeds, shop, onOpen }: {
  cut: CutWithMedia; breeds: Breed[]; shop?: Butcher | null; onOpen?: () => void;
}) {
  const cover = coverOf(cut.cut_media);
  const title = cutTitle(cut, breeds);
  return (
    <li>
      <Link href={`/cut/${cut.code}`} onClick={onOpen} className="block text-center">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-ink-3">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} loading="lazy" className="h-full w-full object-cover" />
          )}
          {shop && (
            <span className="absolute bottom-2 start-2" title={shop.name}>
              <ShopMark shop={shop} size="sm" />
            </span>
          )}
        </div>
        <p className="mt-2 truncate font-display text-[17px] font-bold leading-tight text-ivory">{title}</p>
        {cut.price_per_kg_agorot ? (
          <p className="mt-0.5 text-[15px] text-ivory/90">
            <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr> <span className="text-xs text-stone">{he.feed.perKg}</span>
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-xs text-stone">
          {cut.is_aged && cut.aging_days ? he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method)) : he.feed.notAged}
          {shop ? `  ·  ${shop.name}` : ""}
        </p>
      </Link>
    </li>
  );
}
