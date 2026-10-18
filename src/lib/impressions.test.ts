import { beforeEach, describe, expect, it } from "vitest";
import { SOLD_OUT_DWELL_MS, isReserved } from "./feed";
import { impressionOf, markSoldNotice, recordView, resetImpressions, soldOutFate } from "./impressions";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) } },
  configurable: true,
});

describe("personal sold-out rule (§13)", () => {
  beforeEach(() => { memory.clear(); resetImpressions(); });

  it("does not show a cut as sold to someone who never saw it", () => {
    expect(soldOutFate(undefined, false)).toBe("drop");
  });
  it("does not count a glance", () => {
    recordView("c", SOLD_OUT_DWELL_MS - 1);
    expect(soldOutFate(impressionOf("c"), false)).toBe("drop");
  });
  it("stamps once for someone who stopped on it, then lets it go", () => {
    recordView("c", 1200);
    recordView("c", SOLD_OUT_DWELL_MS + 300);
    recordView("c", 800);
    expect(impressionOf("c")?.d).toBe(SOLD_OUT_DWELL_MS + 300);
    expect(soldOutFate(impressionOf("c"), false)).toBe("stamp");
    markSoldNotice("c");
    expect(soldOutFate(impressionOf("c"), false)).toBe("drop");
  });
  it("never lets a post vanish while it is looked at", () => {
    expect(soldOutFate(undefined, true)).toBe("stamp");
  });
});

describe("reserved (§13)", () => {
  it("is reserved only when nothing can be bought now", () => {
    expect(isReserved({ sale_mode: "steaks", steaks_available: 3 }, undefined)).toBe(false);
    expect(isReserved({ sale_mode: "steaks", steaks_available: 3 }, { steaks_held: 2, whole_held: false })).toBe(false);
    expect(isReserved({ sale_mode: "steaks", steaks_available: 3 }, { steaks_held: 3, whole_held: false })).toBe(true);
    expect(isReserved({ sale_mode: "both", steaks_available: 4 }, { steaks_held: 0, whole_held: true })).toBe(true);
    expect(isReserved({ sale_mode: "whole", steaks_available: 0 }, { steaks_held: 0, whole_held: false })).toBe(true);
  });
});
