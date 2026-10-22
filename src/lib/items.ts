// Sale items (BUTCHER_FLOW §2, §4.4): a unit is sold whole at its weight; a remainder by weight — all of it, or a
// slice ("פרוס לי") in steps of 50 g from 200 g, up to 95% of what is free (R13/R14). The same rules as the SQL
// helpers slice_min_g / slice_step_g / slice_max_g and checkout_problems (0016).
import { priceForWeight } from "./pricing";
import type { CutMedia, Item, LineMode, Parent, SaleItem } from "./types";

export const SLICE_MIN_G = 200;
export const SLICE_STEP_G = 50;
export const SLICE_THICKNESS_CM = [1.5, 2, 2.5, 3, 4];

/** the most of a balance a slice may take (95%) */
export function sliceMaxG(freeG: number): number {
  return Math.max(0, Math.floor((freeG * 95) / 100));
}

/** the largest slice that can be asked for, in steps */
export function sliceCapG(freeG: number): number {
  const max = sliceMaxG(freeG);
  return max - (max % SLICE_STEP_G);
}

export function validSlice(g: number, freeG: number): boolean {
  return g >= SLICE_MIN_G && g % SLICE_STEP_G === 0 && g <= sliceMaxG(freeG);
}

/** "SOL-523-1" / "SOL-523" */
export const displayCode = (label: string) => `SOL-${label}`;

/** A parent's page; a sale item opens it scrolled to the item (§6). */
export function parentPath(parentCode: number | string, label?: string): string {
  return `/cut/${parentCode}${label ? `#i-${label}` : ""}`;
}

export type ItemRow = Item & { parent: Parent | null; cut_media?: CutMedia[] };
export const SALE_ITEM_SELECT = "*, parent:parents(*), cut_media(*)";

/**
 * Flattens an item row with its parent. The parent's video joins the media as a "video" entry when it is published
 * to the feed (R12) or when `video` is "always" (the parent's own page).
 */
export function toSaleItem(row: ItemRow, video: "feed" | "always" = "feed"): SaleItem | null {
  const p = row.parent;
  if (!p || p.code == null) return null;
  const media = [...(row.cut_media ?? [])];
  if (p.video_path && (p.video_published || video === "always")) {
    media.push({
      id: `${p.id}-video`, item_id: row.id, type: "video", storage_path: p.video_path, thumb_path: null,
      poster_path: p.video_poster_path, is_cover: false, sort_order: 99, width: null, height: null, duration_s: null,
      created_at: p.created_at,
    });
  }
  const { parent: _parent, cut_media: _media, updated_at: _u, ...item } = row;
  return {
    ...item,
    label: row.label ?? "",
    price_per_kg_agorot: row.price_per_kg_agorot ?? p.price_per_kg_agorot,
    code: displayCode(row.label ?? ""),
    parent_code: p.code,
    split: !!p.split,
    cut_type: p.cut_type,
    breed_key: p.breed_key,
    breed_other: p.breed_other,
    origin_country: p.origin_country,
    is_aged: p.is_aged,
    aging_days: p.aging_days,
    aging_method: p.aging_method,
    butcher_marbling: p.butcher_marbling,
    description: p.description,
    video_published: p.video_published,
    cut_media: media,
  };
}

export function toSaleItems(rows: ItemRow[] | null | undefined, video: "feed" | "always" = "feed"): SaleItem[] {
  return (rows ?? []).map((r) => toSaleItem(r, video)).filter((x): x is SaleItem => !!x);
}

/** What other customers hold at checkout right now (item_holds). */
export interface Held { held_g: number; whole_held: boolean }

/** grams of a remainder that are not held by someone else */
export function freeG(item: Pick<SaleItem, "weight_g">, held?: Held): number {
  if (held?.whole_held) return 0;
  return Math.max(0, (item.weight_g ?? 0) - (held?.held_g ?? 0));
}

/** Can be bought right now at all (the feed, search and categories show only these). */
export function isAvailable(item: Pick<SaleItem, "status" | "weight_g">): boolean {
  return item.status === "published" && (item.weight_g ?? 0) > 0;
}

export function canBuyAll(item: Pick<SaleItem, "kind" | "status" | "weight_g">, held?: Held): boolean {
  return item.kind === "remainder" && isAvailable(item) && !held?.whole_held && !(held && held.held_g > 0);
}

export function canSlice(item: Pick<SaleItem, "kind" | "status" | "weight_g">, held?: Held): boolean {
  return item.kind === "remainder" && isAvailable(item) && sliceCapG(freeG(item, held)) >= SLICE_MIN_G;
}

export function canBuyUnit(item: Pick<SaleItem, "kind" | "status" | "weight_g">, held?: Held): boolean {
  return item.kind === "unit" && isAvailable(item) && !held;
}

/** Held so fully that nothing of it can be bought now — "שוריין" (§13); it may come back. */
export function isReserved(item: Pick<SaleItem, "kind" | "status" | "weight_g">, held: Held | undefined): boolean {
  if (!held || !isAvailable(item)) return false;
  return item.kind === "unit" ? true : !canBuyAll(item, held) && !canSlice(item, held);
}

/** The price of a line: a unit and "all" at the item's weight, a slice at the grams asked for. */
export function linePrice(item: Pick<SaleItem, "weight_g" | "price_per_kg_agorot">, mode: LineMode, grams?: number | null): number {
  const w = mode === "remainder_slice" ? grams ?? 0 : item.weight_g ?? 0;
  return item.price_per_kg_agorot ? priceForWeight(w, item.price_per_kg_agorot) : 0;
}

/** The mode a quick "add" uses: a unit, or all of a remainder when nobody holds part of it, else the default slice. */
export function defaultLine(item: SaleItem, held?: Held): { mode: LineMode; grams: number | null } | null {
  if (canBuyUnit(item, held)) return { mode: "unit", grams: null };
  if (canBuyAll(item, held)) return { mode: "remainder_all", grams: null };
  if (canSlice(item, held)) return { mode: "remainder_slice", grams: Math.min(sliceCapG(freeG(item, held)), 600) };
  return null;
}
