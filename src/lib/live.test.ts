import { describe, expect, it } from "vitest";
import { liveEvents } from "./live";
import type { Cut } from "./types";

const cut = (o: Partial<Cut>): Cut => ({ id: "c", code: "SOL-1", butcher_id: "b1", cut_type: "picanha", breed_key: null, breed_other: null,
  status: "published", published_at: null, sold_out_at: null, ...o } as Cut);

describe("liveEvents", () => {
  it("lists postings and sell-outs newest first, with the shop's name", () => {
    const ev = liveEvents([
      cut({ id: "a", published_at: "2026-10-22T08:00:00Z" }),
      cut({ id: "b", published_at: "2026-10-22T07:00:00Z", status: "sold_out", sold_out_at: "2026-10-22T09:00:00Z" }),
    ], [{ id: "b1", name: "חדיף" }], []);
    expect(ev.map((e) => e.id)).toEqual(["s-b", "p-a", "p-b"]);
    expect(ev[1].text).toContain("חדיף");
  });
  it("keeps only the latest few", () => {
    const many = Array.from({ length: 12 }, (_, i) => cut({ id: String(i), published_at: `2026-10-22T0${i % 10}:00:00Z` }));
    expect(liveEvents(many, [], [], 5)).toHaveLength(5);
  });
});
