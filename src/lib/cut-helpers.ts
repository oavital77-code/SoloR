// Display helpers shared by feed, cut page, butcher screens.
import { he } from "./i18n/he";
import { agingMethodLabel, cutTypeLabel, originLabel } from "./labels";
import { formatWeight } from "./pricing";
import type { Breed, CutMedia, CutType, Item, OrderItem, Parent, SaleItem } from "./types";

type Details = Pick<Parent, "cut_type" | "breed_key" | "breed_other" | "origin_country" | "is_aged" | "aging_days" | "aging_method">;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const MEDIA_BUCKET = "cut-media";

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("/")) return path; // demo media shipped with the app (public/demo)
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

export function breedLabel(cut: Pick<Details, "breed_key" | "breed_other">, breeds: Breed[]): string {
  if (cut.breed_key) return breeds.find((b) => b.key === cut.breed_key)?.label_he ?? cut.breed_key;
  return cut.breed_other?.trim() ?? "";
}

/** "אנטריקוט · בלאק אנגוס" */
export function cutTitle(cut: { cut_type: CutType | null } & Pick<Details, "breed_key" | "breed_other">, breeds: Breed[]): string {
  return [cutTypeLabel(cut.cut_type), breedLabel(cut, breeds)].filter(Boolean).join(" · ");
}

/** "ארגנטינה · יושן 28 יום (יבש)" */
export function originAgingLine(cut: Details): string {
  const parts: string[] = [];
  if (cut.origin_country) parts.push(originLabel(cut.origin_country));
  if (cut.is_aged && cut.aging_days) {
    const m = agingMethodLabel(cut.aging_method);
    parts.push(`${he.feed.agedDays(cut.aging_days)}${m ? ` (${m})` : ""}`);
  }
  return parts.join(" · ");
}

export function sortedMedia(media: CutMedia[]): CutMedia[] {
  return [...media].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export function photosOf(media: CutMedia[]): CutMedia[] {
  const photos = sortedMedia(media).filter((m) => m.type === "photo");
  const cover = photos.find((p) => p.is_cover);
  return cover ? [cover, ...photos.filter((p) => p.id !== cover.id)] : photos;
}

export function videoOf(media: CutMedia[]): CutMedia | undefined {
  return media.find((m) => m.type === "video");
}

export function coverOf(media: CutMedia[]): CutMedia | undefined {
  return photosOf(media)[0];
}

export function isNew(cut: Pick<SaleItem, "published_at">, now = Date.now()): boolean {
  return !!cut.published_at && now - new Date(cut.published_at).getTime() < 24 * 3600 * 1000;
}

export const SOLD_OUT_TAIL_MS = 6 * 3600 * 1000;

/** Client mirror of SQL parent_missing_fields (R9): what the parent still misses before its items can go live. */
export function parentMissing(p: Details): string[] {
  const m: string[] = [];
  if (!p.cut_type) m.push("cut_type");
  if (!p.breed_key && !p.breed_other?.trim()) m.push("breed");
  if (!p.origin_country) m.push("origin_country");
  if (p.is_aged == null) m.push("is_aged");
  if (p.is_aged && !p.aging_days) m.push("aging_days");
  return m;
}

/** Client mirror of SQL item_missing_fields: the parent's, then the item's own (photo, weight, price, steaks). */
export function itemMissing(item: Pick<Item, "kind" | "weight_g" | "price_per_kg_agorot" | "steak_count">,
                            parent: Details & Pick<Parent, "price_per_kg_agorot">, photoCount: number): string[] {
  const m = parentMissing(parent);
  if (photoCount < 1) m.push("photos");
  if (!item.weight_g) m.push("weight_g");
  if (!(item.price_per_kg_agorot ?? parent.price_per_kg_agorot)) m.push("price_per_kg");
  if (item.kind === "unit" && !item.steak_count) m.push("steak_count");
  return m;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return he.time.justNow;
  if (s < 3600) return he.time.minutesAgo(Math.floor(s / 60));
  if (s < 86400) return he.time.hoursAgo(Math.floor(s / 3600));
  return he.time.daysAgo(Math.floor(s / 86400));
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** "יחידה 523-1 · 3 סטייקים · 1.24 ק״ג" / "כל השארית · 1.1 ק״ג" / "פרוס לי 600 גר׳ · עובי 2 ס״מ" */
export function orderWhat(o: Pick<OrderItem, "mode" | "requested_g" | "slice_thickness_cm" | "est_weight_g">,
                          item?: Pick<Item, "label" | "steak_count"> | null): string {
  const w = formatWeight(o.est_weight_g);
  if (o.mode === "unit") return he.orders.whatUnit(item?.label ?? "", item?.steak_count ?? null, w);
  if (o.mode === "remainder_all") return he.orders.whatAll(w);
  return he.orders.whatSlice(formatWeight(o.requested_g ?? o.est_weight_g), o.slice_thickness_cm);
}
