// Display helpers shared by feed, cut page, butcher screens.
import { he } from "./i18n/he";
import { agingMethodLabel, cutTypeLabel, originLabel } from "./labels";
import { formatWeight, maxSteaks, plannedSteaks } from "./pricing";
import type { Breed, Cut, CutMedia, Order } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const MEDIA_BUCKET = "cut-media";

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("/")) return path; // demo media shipped with the app (public/demo)
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

export function breedLabel(cut: Pick<Cut, "breed_key" | "breed_other">, breeds: Breed[]): string {
  if (cut.breed_key) return breeds.find((b) => b.key === cut.breed_key)?.label_he ?? cut.breed_key;
  return cut.breed_other?.trim() ?? "";
}

/** "אנטריקוט · בלאק אנגוס" */
export function cutTitle(cut: Pick<Cut, "cut_type" | "breed_key" | "breed_other">, breeds: Breed[]): string {
  return [cutTypeLabel(cut.cut_type), breedLabel(cut, breeds)].filter(Boolean).join(" · ");
}

/** "ארגנטינה · יושן 28 יום (יבש)" */
export function originAgingLine(cut: Cut): string {
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

export function isNew(cut: Cut, now = Date.now()): boolean {
  return !!cut.published_at && now - new Date(cut.published_at).getTime() < 24 * 3600 * 1000;
}

export const SOLD_OUT_TAIL_MS = 6 * 3600 * 1000;

export function canBuyWhole(cut: Cut): boolean {
  return cut.status === "published" && (cut.sale_mode === "whole" || cut.sale_mode === "both") && cut.whole_available;
}

export function canBuySteaks(cut: Cut): boolean {
  return cut.status === "published" && (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steaks_available > 0;
}

/** Client-side mirror of SQL cut_missing_fields (for the wizard's preview list). */
export function missingFields(cut: Cut, photoCount: number): string[] {
  const m: string[] = [];
  if (photoCount < 1) m.push("photos");
  if (!cut.cut_type) m.push("cut_type");
  if (!cut.breed_key && !cut.breed_other?.trim()) m.push("breed");
  if (!cut.origin_country) m.push("origin_country");
  if (cut.is_aged == null) m.push("is_aged");
  if (cut.is_aged && !cut.aging_days) m.push("aging_days");
  if (!cut.weight_g) m.push("weight_g");
  if (!cut.price_per_kg_agorot) m.push("price_per_kg");
  if (!cut.sale_mode) m.push("sale_mode");
  if (cut.sale_mode === "steaks" || cut.sale_mode === "both") {
    if (!cut.steak_weight_g) m.push("steak_weight_g");
    else if (maxSteaks(cut.weight_g, cut.steak_weight_g) < 1) m.push("steaks_count");
  }
  return m;
}

/** Which wizard step (1-based) edits a given missing field */
export const FIELD_STEP: Record<string, number> = {
  photos: 1, cut_type: 2, breed: 2, origin_country: 2, is_aged: 3, aging_days: 3,
  weight_g: 4, price_per_kg: 4, sale_mode: 4, steak_weight_g: 4, steaks_count: 4,
};

/** Steaks the cut would offer if published now (preview) or what it has (live). */
export function displaySteaks(cut: Cut): { available: number; total: number } {
  if (cut.status === "draft") {
    const n = cut.sale_mode === "steaks" || cut.sale_mode === "both"
      ? plannedSteaks(cut.weight_g, cut.steak_weight_g, cut.steaks_planned) : 0;
    return { available: n, total: n };
  }
  return { available: cut.steaks_available, total: cut.steaks_total };
}

/** For preview: a draft is shown as if it were published. */
export function asLive(cut: Cut): Cut {
  if (cut.status !== "draft") return cut;
  const { total } = displaySteaks(cut);
  return {
    ...cut,
    status: "published",
    steaks_total: total,
    steaks_available: total,
    whole_available: cut.sale_mode === "whole" || cut.sale_mode === "both",
    published_at: cut.published_at ?? new Date().toISOString(),
  };
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

/** "3 סטייקים × 300 גר׳" / "נתח שלם 2.4 ק״ג" — the snapshot weight per steak is derived from the order itself */
export function orderWhat(o: Pick<Order, "mode" | "steaks_qty" | "est_weight_g">): string {
  const perSteak = o.steaks_qty ? Math.round(o.est_weight_g / o.steaks_qty) : null;
  return he.orders.whatOrdered(o.mode, o.steaks_qty, perSteak, formatWeight(o.est_weight_g));
}
