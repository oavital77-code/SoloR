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
    const rem = { kind: "remainder", status: "published", weight_g: 1000 } as const;
    expect(isReserved(rem, undefined)).toBe(false);
    expect(isReserved(rem, { held_g: 400, whole_held: false })).toBe(false);   // 600 free: a slice can still be asked
    expect(isReserved(rem, { held_g: 850, whole_held: false })).toBe(true);
    expect(isReserved(rem, { held_g: 0, whole_held: true })).toBe(true);
    expect(isReserved({ ...rem, kind: "unit" }, { held_g: 0, whole_held: true })).toBe(true);
  });
});
