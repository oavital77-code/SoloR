import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, activeFilterCount, filterFromParams, filterToParams, matchesFilter } from "./feed-filter";
import type { SaleItem } from "./types";

const base = {
  id: "1", code: "SOL-1", label: "1", parent_id: "p", parent_code: 1, kind: "remainder", unit_no: null, split: false,
  butcher_id: "b", status: "published", cut_type: "picanha", breed_key: "black_angus", breed_other: null,
  origin_country: "AR", is_aged: true, aging_days: 28, aging_method: "dry", butcher_marbling: null, description: null,
  steak_count: null, weight_g: 2400, price_per_kg_agorot: 22000, weight_source: null, video_published: true,
  published_at: new Date().toISOString(), sold_out_at: null, created_at: "", cut_media: [],
} as SaleItem;

describe("search filters", () => {
  it("cut type + origin", () => {
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
  it("aging ranges in days, several together; a cut that is not aged is 0", () => {
    expect(matchesFilter(base, { ...EMPTY_FILTER, aging: ["15-30"] })).toBe(true);
    expect(matchesFilter(base, { ...EMPTY_FILTER, aging: ["31+"] })).toBe(false);
    expect(matchesFilter(base, { ...EMPTY_FILTER, aging: ["none", "15-30"] })).toBe(true);
    expect(matchesFilter({ ...base, is_aged: false, aging_days: null }, { ...EMPTY_FILTER, aging: ["none", "31+"] })).toBe(true);
    expect(matchesFilter(base, { ...EMPTY_FILTER, aging: ["none"] })).toBe(false);
  });
  it("several values of one kind match any of them", () => {
    expect(matchesFilter(base, { ...EMPTY_FILTER, cutTypes: ["sinta", "picanha"] })).toBe(true);
    expect(matchesFilter(base, { ...EMPTY_FILTER, cutTypes: ["sinta", "denver"] })).toBe(false);
  });
  it("price range and ready units / by weight, alone and combined", () => {
    expect(matchesFilter(base, { ...EMPTY_FILTER, priceMax: 20000 })).toBe(false);
    expect(matchesFilter(base, { ...EMPTY_FILTER, priceMin: 20000, priceMax: 30000 })).toBe(true);
    expect(matchesFilter(base, { ...EMPTY_FILTER, units: true })).toBe(false);
    expect(matchesFilter({ ...base, kind: "unit" }, { ...EMPTY_FILTER, units: true })).toBe(true);
    expect(matchesFilter({ ...base, weight_g: 0 }, { ...EMPTY_FILTER, byWeight: true })).toBe(false);
    expect(matchesFilter(base, { ...EMPTY_FILTER, byWeight: true, aging: ["15-30"], cutTypes: ["picanha"] })).toBe(true);
    expect(matchesFilter({ ...base, kind: "unit" }, { ...EMPTY_FILTER, units: true, byWeight: true })).toBe(true);
  });
  it("round-trips through the URL", () => {
    const f = { ...EMPTY_FILTER, cutTypes: ["picanha" as const], breeds: ["wagyu"], origins: ["AR" as const],
      aging: ["none", "31+"], priceMin: 10000, priceMax: 30000, units: false, byWeight: true };
    const sp = filterToParams(f, " ואגיו ");
    expect(sp.get("age")).toBe("none,31+");
    expect(sp.get("q")).toBe("ואגיו");
    expect(filterFromParams(sp)).toEqual(f);
    expect(filterToParams(EMPTY_FILTER, "").toString()).toBe("");
  });
  it("reads old single-range aging links", () => {
    expect(filterFromParams(new URLSearchParams("age=31-")).aging).toEqual(["31+"]);
    expect(filterFromParams(new URLSearchParams("age=15-30")).aging).toEqual(["15-30"]);
  });
  it("reads old sale-mode links", () => {
    expect(filterFromParams(new URLSearchParams("m=whole,steaks"))).toMatchObject({ units: true, byWeight: true });
  });
  it("reads old ?cat= links as a cut type", () => {
    expect(filterFromParams(new URLSearchParams("cat=sinta")).cutTypes).toEqual(["sinta"]);
  });
});
