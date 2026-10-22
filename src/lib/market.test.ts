import { describe, expect, it } from "vitest";
import { categoryCounts, isAvailable, matchesQuery, safeNext, searchScore } from "./market";
import type { Breed, Butcher, SaleItem } from "./types";

const breeds: Breed[] = [{ key: "black_angus", label_he: "בלאק אנגוס", applies_to: [], sort_order: 1, active: true }];
const shop = { name: "הקצבייה של משה" } as Butcher;
const base = {
  id: "1", code: "SOL-12-1", label: "12-1", kind: "unit", status: "published", cut_type: "entrecote", breed_key: "black_angus",
  breed_other: null, origin_country: "AR", is_aged: true, weight_g: 1240, description: null,
} as unknown as SaleItem;

describe("marketplace search", () => {
  it("matches Hebrew labels, code and shop", () => {
    expect(matchesQuery(base, "אנטריקוט", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "אנטריקוט אנגוס", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "sol-12-1", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "12-1", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "ארגנטינה", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "משה", breeds, shop)).toBe(true);
    expect(matchesQuery(base, "פיקניה", breeds, shop)).toBe(false);
  });
  it("search only shows stock that can be bought", () => {
    expect(isAvailable(base)).toBe(true);
    expect(isAvailable({ ...base, status: "sold_out" })).toBe(false);
    expect(isAvailable({ ...base, weight_g: 0 })).toBe(false);
    expect(isAvailable({ ...base, weight_g: 500 })).toBe(true);
  });
  it("counts categories from available stock", () => {
    const counts = categoryCounts([base, { ...base, id: "2", status: "sold_out" }]);
    expect(counts.find((c) => c.key === "entrecote")?.count).toBe(1);
    expect(counts.find((c) => c.key === "sinta")?.count).toBe(0);
  });
  it("only allows relative next paths", () => {
    expect(safeNext("/cut/523")).toBe("/cut/523");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("search relevance", () => {
  const shop = { name: "מעדני בן עזרא" } as never;
  const breeds = [{ key: "wagyu", label_he: "ואגיו" }] as never;
  const cut = (over: object) => ({
    code: "SOL-0001", cut_type: "entrecote", breed_key: null, breed_other: null, origin_country: "AR",
    is_aged: false, aging_days: null, description: null, ...over,
  }) as never;

  it("ranks a hit in the cut type above a hit in the butcher's note", () => {
    const typed = searchScore(cut({ cut_type: "entrecote" }), "אנטריקוט", breeds, shop);
    const noted = searchScore(cut({ cut_type: "sinta", description: "דומה לאנטריקוט" }), "אנטריקוט", breeds, shop);
    expect(typed).toBeGreaterThan(noted);
    expect(noted).toBeGreaterThan(0);
  });
  it("needs every word", () => {
    expect(searchScore(cut({ breed_key: "wagyu" }), "אנטריקוט ואגיו", breeds, shop)).toBeGreaterThan(0);
    expect(searchScore(cut({}), "אנטריקוט ואגיו", breeds, shop)).toBe(0);
  });
});
