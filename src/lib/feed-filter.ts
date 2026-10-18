// Search filters (customer spec §8.1): cut type, aging range, whole / steaks, price per kg, breed and origin.
// Applied client-side. They live in the search URL, so the search tab keeps them and links can share them.
import { canBuySteaks, canBuyWhole } from "./cut-helpers";
import type { Cut, CutType, OriginCountry } from "./types";

export interface FeedFilter {
  cutTypes: CutType[];
  breeds: string[];          // breed keys, or "other" for free-text breeds
  origins: OriginCountry[];
  agingMin: number | null;   // days; a cut that is not aged counts as 0
  agingMax: number | null;
  priceMin: number | null;   // agorot per kg
  priceMax: number | null;
  canWhole: boolean;
  canSteaks: boolean;
}

export const EMPTY_FILTER: FeedFilter = {
  cutTypes: [], breeds: [], origins: [], agingMin: null, agingMax: null, priceMin: null, priceMax: null, canWhole: false, canSteaks: false,
};

export const PRICE_SLIDER = { min: 0, max: 100000, step: 1000 }; // ₪0–₪1,000 per kg, in agorot

/** The aging ranges offered as one tap each. */
export const AGING_PRESETS: { key: string; min: number | null; max: number | null }[] = [
  { key: "none", min: 0, max: 0 },
  { key: "1-14", min: 1, max: 14 },
  { key: "15-30", min: 15, max: 30 },
  { key: "31+", min: 31, max: null },
];

export function agingDays(cut: Pick<Cut, "is_aged" | "aging_days">): number {
  return cut.is_aged ? cut.aging_days ?? 0 : 0;
}

export function activeFilterCount(f: FeedFilter): number {
  return (f.cutTypes.length ? 1 : 0) + (f.breeds.length ? 1 : 0) + (f.origins.length ? 1 : 0)
    + (f.agingMin != null || f.agingMax != null ? 1 : 0) + (f.priceMin != null || f.priceMax != null ? 1 : 0)
    + (f.canWhole ? 1 : 0) + (f.canSteaks ? 1 : 0);
}

export function matchesFilter(cut: Cut, f: FeedFilter): boolean {
  if (f.cutTypes.length && (!cut.cut_type || !f.cutTypes.includes(cut.cut_type))) return false;
  if (f.breeds.length) {
    const key = cut.breed_key ?? "other";
    if (!f.breeds.includes(key)) return false;
  }
  if (f.origins.length && (!cut.origin_country || !f.origins.includes(cut.origin_country))) return false;
  const days = agingDays(cut);
  if (f.agingMin != null && days < f.agingMin) return false;
  if (f.agingMax != null && days > f.agingMax) return false;
  const p = cut.price_per_kg_agorot ?? 0;
  if (f.priceMin != null && p < f.priceMin) return false;
  if (f.priceMax != null && f.priceMax < PRICE_SLIDER.max && p > f.priceMax) return false;
  if (f.canWhole && !canBuyWhole(cut)) return false;
  if (f.canSteaks && !canBuySteaks(cut)) return false;
  return true;
}

// ───────── URL form: ?q=…&t=picanha,sinta&br=wagyu&o=AR&age=15-30&p=100-300&m=whole,steaks ─────────

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const range = (v: string | null): [number | null, number | null] => {
  const m = v?.match(/^(\d*)-(\d*)$/);
  if (!m) return [null, null];
  return [m[1] === "" ? null : Number(m[1]), m[2] === "" ? null : Number(m[2])];
};

export function filterFromParams(sp: URLSearchParams): FeedFilter {
  const [agingMin, agingMax] = range(sp.get("age"));
  const [pMin, pMax] = range(sp.get("p"));                       // shekels in the URL, agorot inside
  const modes = list(sp.get("m"));
  return {
    cutTypes: [...list(sp.get("t")), ...list(sp.get("cat"))] as CutType[],   // ?cat= — old category links
    breeds: list(sp.get("br")),
    origins: list(sp.get("o")) as OriginCountry[],
    agingMin, agingMax,
    priceMin: pMin == null ? null : pMin * 100,
    priceMax: pMax == null ? null : pMax * 100,
    canWhole: modes.includes("whole"),
    canSteaks: modes.includes("steaks"),
  };
}

export function filterToParams(f: FeedFilter, q: string): URLSearchParams {
  const sp = new URLSearchParams();
  const put = (k: string, v: string) => { if (v) sp.set(k, v); };
  const rng = (a: number | null, b: number | null) => (a == null && b == null ? "" : `${a ?? ""}-${b ?? ""}`);
  put("q", q.trim());
  put("t", f.cutTypes.join(","));
  put("br", f.breeds.join(","));
  put("o", f.origins.join(","));
  put("age", rng(f.agingMin, f.agingMax));
  put("p", rng(f.priceMin == null ? null : f.priceMin / 100, f.priceMax == null ? null : f.priceMax / 100));
  put("m", [f.canWhole && "whole", f.canSteaks && "steaks"].filter(Boolean).join(","));
  return sp;
}
