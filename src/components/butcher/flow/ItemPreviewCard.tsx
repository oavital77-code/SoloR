"use client";
// ItemPreviewCard (BUTCHER_FLOW §9.4): the customer's post for an item, before it goes live — the same component
// the feed uses, in the customer's colours, with nothing to act on (tapping the price can change it, R11).
import { CutPost } from "../../CutPost";
import { useBreeds, useNow } from "@/lib/hooks";
import { displayCode } from "@/lib/items";
import type { Butcher, CutMedia, Item, Parent, SaleItem } from "@/lib/types";

export function asSaleItem(item: Item & { cut_media: CutMedia[] }, parent: Parent): SaleItem {
  const { updated_at: _u, ...rest } = item;
  const media = [...item.cut_media];
  if (parent.video_path && parent.video_published) {
    media.push({ id: `${parent.id}-video`, item_id: item.id, type: "video", storage_path: parent.video_path, thumb_path: null,
      poster_path: parent.video_poster_path, is_cover: false, sort_order: 99, width: null, height: null, duration_s: null, created_at: parent.created_at });
  }
  return {
    ...rest, label: item.label ?? "", status: "published", published_at: item.published_at ?? new Date().toISOString(),
    price_per_kg_agorot: item.price_per_kg_agorot ?? parent.price_per_kg_agorot,
    code: displayCode(item.label ?? ""), parent_code: parent.code ?? 0, split: !!parent.split,
    cut_type: parent.cut_type, breed_key: parent.breed_key, breed_other: parent.breed_other, origin_country: parent.origin_country,
    is_aged: parent.is_aged, aging_days: parent.aging_days, aging_method: parent.aging_method, butcher_marbling: parent.butcher_marbling,
    description: parent.description, video_published: parent.video_published, cut_media: media,
  };
}

export function ItemPreviewCard({ item, parent, shop, onPriceTap }: {
  item: Item & { cut_media: CutMedia[] }; parent: Parent; shop: Butcher; onPriceTap?: () => void;
}) {
  const breeds = useBreeds();
  const now = useNow(60000);
  return (
    <div data-theme="customer" className="rounded-[26px] bg-ink p-2 text-ivory">
      <CutPost cut={asSaleItem(item, parent)} breeds={breeds} shop={shop} now={now} preview onPriceTap={onPriceTap} eager />
    </div>
  );
}
