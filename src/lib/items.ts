// Sale items (BUTCHER_FLOW §2, §4.4): a unit is sold whole at its weight; a remainder by weight — all of it, or a
// slice ("פרוס לי") in steps of 50 g from 200 g, up to 95% of what is free (R13/R14). The same rules as the SQL
// helpers slice_min_g / slice_step_g / slice_max_g and checkout_problems (0016).
import { priceForWeight } from "./pricing";
import type { CutMedia, Item, LineMode, Parent, SaleItem } from "./types";

/** how long a cart (and a checkout) is held — as checkout_hold_minutes() in the database */
export const HOLD_MINUTES = 10;
export const SLICE_MIN_G = 200;
export const SLICE_STEP_G = 50;
/** the thinnest steak "פרוס לי" cuts (founders 28.10.2026) */
export const SLICE_MIN_CM = 1.5;
/** the usual steak, for reading the trays' steaks and for the first count offered */
export const DEFAULT_STEAK_CM = 2.5;

// grams per centimetre of thickness of one steak across the cut — typical cross-sections, used when the cut's own
// trays don't tell (founders 25.10.2026: "how many steaks is that?")
const G_PER_CM: Record<string, number> = { entrecote: 115, ontrib: 140, sinta: 90, asado: 120, picanha: 90, shaitel: 100, denver: 70 };

/** grams per cm of one steak of this cut: from the trays cut from it (their steaks, at the usual thickness) when they
 * say something believable (a steak of 125–450 g at 2.5 cm), else the cut type's typical figure */
export function steakGPerCm(item: { cut_type: string | null }, trays: { steak_count: number | null; weight_g: number | null }[] = []): number {
  const known = trays.filter((t) => t.steak_count && t.weight_g);
  const steaks = known.reduce((n, t) => n + (t.steak_count ?? 0), 0);
  const fromTrays = steaks > 0 ? known.reduce((g, t) => g + (t.weight_g ?? 0), 0) / steaks / DEFAULT_STEAK_CM : 0;
  if (fromTrays >= 50 && fromTrays <= 180) return fromTrays;
  return G_PER_CM[item.cut_type ?? ""] ?? 100;
}

/** how many steaks a slice of `grams` makes at `cm`, and about how much each weighs */
export function sliceSteaks(grams: number, cm: number, gPerCm: number): { count: number; each: number } {
  const each = Math.max(1, gPerCm * cm);
  const count = Math.max(1, Math.round(grams / each));
  return { count, each: Math.round(grams / count / 10) * 10 };
}

/** "פרוס לי" by steaks: how thick each of `count` steaks of `grams` comes out (to a millimetre), never under 1.5 cm */
export function sliceThickness(grams: number, count: number, gPerCm: number): number {
  return Math.max(SLICE_MIN_CM, Math.round((grams / Math.max(1, count) / gPerCm) * 10) / 10);
}

/** the most steaks `grams` makes without going under 1.5 cm */
export function maxSliceSteaks(grams: number, gPerCm: number): number {
  return Math.max(1, Math.floor(grams / (gPerCm * SLICE_MIN_CM)));
}

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

/** a cut's number as written on the clip and the labels: two digits at least ("09", "15", "123") */
export const clipNo = (code: number | string | null | undefined) => (code == null || code === "" ? "" : String(code).padStart(2, "0"));

/** "SOL-09-01" / "SOL-09" */
export const displayCode = (label: string) => `SOL-${label}`;

/** A parent's page, by its id (clip numbers come back, v2 R1); a sale item opens it scrolled to the item. */
export function parentPath(parentId: string, label?: string): string {
  return `/cut/${parentId}${label ? `#i-${label}` : ""}`;
}

export type ItemRow = Item & { parent: (Parent & { cut_media?: CutMedia[] }) | null; cut_media?: CutMedia[] };
export const SALE_ITEM_SELECT = "*, parent:parents(*, cut_media(*)), cut_media(*)";

/**
 * Flattens an item row with its parent. The block has no photos of its own: it shows the parent's (v2 §3). The
 * parent's video joins the media as a "video" entry when it is published to the feed (R12) or when `video` is
 * "always" (the parent's own page).
 */
export function toSaleItem(row: ItemRow, video: "feed" | "always" = "feed"): SaleItem | null {
  const p = row.parent;
  if (!p || p.code == null) return null;
  const own = (row.cut_media ?? []).filter((m) => m.type === "photo");
  const media = own.length ? [...(row.cut_media ?? [])] : (p.cut_media ?? []).map((m) => ({ ...m, item_id: row.id }));
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
    parent_media: p.cut_media ?? [],
  };
}

/**
 * One post per parent (v2 Q6), in the list's order (where its newest item stands): the block leads when it is on sale
 * (the cut itself, founders 22.10.2026), else the newest item still on sale; `trays` are all the parent's trays on
 * sale, by their number — the lead too when it is one.
 */
export function onePerParent<T extends { cut: SaleItem; gone?: boolean }>(list: T[]): (T & { trays: SaleItem[] })[] {
  const byParent = new Map<string, T[]>();
  for (const x of list) byParent.set(x.cut.parent_id, [...(byParent.get(x.cut.parent_id) ?? []), x]);
  const out: (T & { trays: SaleItem[] })[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x.cut.parent_id)) continue;
    seen.add(x.cut.parent_id);
    const all = byParent.get(x.cut.parent_id)!;
    const onSale = all.filter((y) => !y.gone && isAvailable(y.cut));
    const lead = onSale.find((y) => y.cut.kind === "remainder") ?? onSale[0] ?? x;
    const trays = onSale.filter((y) => y.cut.kind === "unit").map((y) => y.cut).sort((a, b) => (a.unit_no ?? 0) - (b.unit_no ?? 0));
    out.push({ ...lead, trays });
  }
  return out;
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
