import { describe, expect, it } from "vitest";
import { liveEvents } from "./live";
import type { SaleItem } from "./types";

const cut = (o: Partial<SaleItem>): SaleItem => ({ id: "c", code: "SOL-1-01", label: "1-01", parent_code: 1, parent_id: "p1", butcher_id: "b1", cut_type: "picanha",
  breed_key: null, breed_other: null, status: "published", published_at: null, sold_out_at: null, ...o } as SaleItem);

describe("liveEvents", () => {
  it("lists postings (once per parent cut) and sell-outs newest first, with the shop's name", () => {
    const ev = liveEvents([
      cut({ id: "a", parent_code: 2, parent_id: "p2", published_at: "2026-10-22T08:00:00Z" }),
      cut({ id: "a2", parent_code: 2, parent_id: "p2", label: "2", published_at: "2026-10-22T08:05:00Z" }),
      cut({ id: "b", published_at: "2026-10-22T07:00:00Z", status: "sold_out", sold_out_at: "2026-10-22T09:00:00Z" }),
    ], [{ id: "b1", name: "חדיף" }], []);
    expect(ev.map((e) => e.id)).toEqual(["s-b", "p-p2", "p-p1"]);
    expect(ev[1].text).toContain("חדיף");
  });
  it("keeps only the latest few", () => {
    const many = Array.from({ length: 12 }, (_, i) => cut({ id: String(i), parent_code: i, parent_id: `p${i}`, published_at: `2026-10-22T0${i % 10}:00:00Z` }));
    expect(liveEvents(many, [], [], 5)).toHaveLength(5);
  });
});
