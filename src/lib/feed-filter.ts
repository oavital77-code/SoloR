// Customer feed filters (SPEC C3). Applied client-side; persisted to localStorage.
import { canBuySteaks, canBuyWhole } from "./cut-helpers";
import type { Cut, CutType, OriginCountry } from "./types";

export interface FeedFilter {
  cutTypes: CutType[];
  breeds: string[];          // breed keys, or "other" for free-text breeds
  origins: OriginCountry[];
  agedOnly: boolean;
  priceMin: number | null;   // agorot per kg
  priceMax: number | null;
  canWhole: boolean;
  canSteaks: boolean;
}

export const EMPTY_FILTER: FeedFilter = {
  cutTypes: [], breeds: [], origins: [], agedOnly: false, priceMin: null, priceMax: null, canWhole: false, canSteaks: false,
};

export const PRICE_SLIDER = { min: 0, max: 100000, step: 1000 }; // ₪0–₪1,000 per kg, in agorot

export const FILTER_STORAGE_KEY = "solor.feed.filter";

export function activeFilterCount(f: FeedFilter): number {
  return (f.cutTypes.length ? 1 : 0) + (f.breeds.length ? 1 : 0) + (f.origins.length ? 1 : 0)
    + (f.agedOnly ? 1 : 0) + (f.priceMin != null || f.priceMax != null ? 1 : 0)
    + (f.canWhole ? 1 : 0) + (f.canSteaks ? 1 : 0);
}

export function matchesFilter(cut: Cut, f: FeedFilter): boolean {
  if (f.cutTypes.length && (!cut.cut_type || !f.cutTypes.includes(cut.cut_type))) return false;
  if (f.breeds.length) {
    const key = cut.breed_key ?? "other";
    if (!f.breeds.includes(key)) return false;
  }
  if (f.origins.length && (!cut.origin_country || !f.origins.includes(cut.origin_country))) return false;
  if (f.agedOnly && !cut.is_aged) return false;
  const p = cut.price_per_kg_agorot ?? 0;
  if (f.priceMin != null && p < f.priceMin) return false;
  if (f.priceMax != null && f.priceMax < PRICE_SLIDER.max && p > f.priceMax) return false;
  // sale-mode filters: "can buy" — sold-out cuts still pass on sale_mode so the 6h tail stays visible
  if (f.canWhole && !(cut.status === "sold_out" ? cut.sale_mode !== "steaks" : canBuyWhole(cut))) return false;
  if (f.canSteaks && !(cut.status === "sold_out" ? cut.sale_mode !== "whole" : canBuySteaks(cut))) return false;
  return true;
}

export function sanitizeFilter(raw: unknown): FeedFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<FeedFilter>;
  const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    cutTypes: arr<CutType>(r.cutTypes),
    breeds: arr<string>(r.breeds),
    origins: arr<OriginCountry>(r.origins),
    agedOnly: !!r.agedOnly,
    priceMin: num(r.priceMin),
    priceMax: num(r.priceMax),
    canWhole: !!r.canWhole,
    canSteaks: !!r.canSteaks,
  };
}
