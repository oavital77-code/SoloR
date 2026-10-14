import { describe, expect, it } from "vitest";
import { categoryCounts, isAvailable, matchesQuery, safeNext } from "./market";
import type { Breed, Butcher, Cut } from "./types";

const breeds: Breed[] = [{ key: "black_angus", label_he: "בלאק אנגוס", applies_to: [], sort_order: 1, active: true }];
const shop = { name: "הקצבייה של משה" } as Butcher;
const base = {
  id: "1", code: "SOL-0012", status: "published", cut_type: "entrecote", breed_key: "black_angus", breed_other: null,
  origin_country: "AR", is_aged: true, sale_mode: "both", steaks_available: 3, steaks_total: 8, whole_available: false,
  description: null,
} as unknown as Cut;

describe("marketplace search", () => {
  it("matches Hebrew labels, code and shop", () => {
    expect(matchesQuery(base, "אנטריקוט", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "אנטריקוט אנגוס", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "sol-0012", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "ארגנטינה", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "משה", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "פיקניה", breeds, shop)).toBe(false);
  });
  it("search only shows stock that can be bought", () => {
    expect(isAvailable(base)).toBe(true);
    expect(isAvailable({ ...base, steaks_available: 0 })).toBe(false);
    expect(isAvailable({ ...base, status: "sold_out" })).toBe(false);
    expect(isAvailable({ ...base, sale_mode: "whole", whole_available: true, steaks_available: 0 })).toBe(true);
  });
  it("counts categories from available stock", () => {
    const counts = categoryCounts([base, { ...base, id: "2", steaks_available: 0 }]);
    expect(counts.find((c) => c.key === "entrecote")?.count).toBe(1);
    expect(counts.find((c) => c.key === "sinta")?.count).toBe(0);
  });
  it("only allows relative next paths", () => {
    expect(safeNext("/cut/SOL-0001")).toBe("/cut/SOL-0001");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
