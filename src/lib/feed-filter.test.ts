import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, activeFilterCount, matchesFilter, sanitizeFilter } from "./feed-filter";
import type { Cut } from "./types";

const base: Cut = {
  id: "1", code: "SOL-0001", butcher_id: "b", status: "published", cut_type: "picanha", breed_key: "black_angus",
  breed_other: null, origin_country: "AR", is_aged: true, aging_days: 28, aging_method: "dry", butcher_marbling: null,
  description: null, weight_g: 2400, price_per_kg_agorot: 22000, sale_mode: "both", steak_weight_g: 300,
  steak_thickness_cm: null, steaks_planned: null, steaks_total: 8, steaks_available: 8, whole_available: true,
  published_at: new Date().toISOString(), sold_out_at: null, archived_at: null, created_at: "", updated_at: "",
};

describe("feed filter", () => {
  it("matches Argentina + picanha (acceptance stage 4)", () => {
    const f = { ...EMPTY_FILTER, origins: ["AR" as const], cutTypes: ["picanha" as const] };
    expect(matchesFilter(base, f)).toBe(true);
    expect(matchesFilter({ ...base, origin_country: "IL" }, f)).toBe(false);
    expect(matchesFilter({ ...base, cut_type: "sinta" }, f)).toBe(false);
    expect(activeFilterCount(f)).toBe(2);
  });
  it("breed 'other' matches free-text breeds", () => {
    const f = { ...EMPTY_FILTER, breeds: ["other"] };
    expect(matchesFilter({ ...base, breed_key: null, breed_other: "מקומי" }, f)).toBe(true);
    expect(matchesFilter(base, f)).toBe(false);
  });
  it("price range and sale mode", () => {
    expect(matchesFilter(base, { ...EMPTY_FILTER, priceMax: 20000 })).toBe(false);
    expect(matchesFilter(base, { ...EMPTY_FILTER, priceMin: 20000, priceMax: 30000 })).toBe(true);
    expect(matchesFilter({ ...base, whole_available: false }, { ...EMPTY_FILTER, canWhole: true })).toBe(false);
    expect(matchesFilter({ ...base, sale_mode: "whole", steaks_total: 0, steaks_available: 0 }, { ...EMPTY_FILTER, canSteaks: true })).toBe(false);
  });
  it("sanitizes garbage from storage", () => {
    expect(sanitizeFilter("x")).toEqual(EMPTY_FILTER);
    expect(sanitizeFilter({ origins: ["AR"], priceMin: "a" }).origins).toEqual(["AR"]);
  });
});
