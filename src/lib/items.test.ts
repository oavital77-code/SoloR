import { describe, expect, it } from "vitest";
import { canBuyAll, canBuyUnit, canSlice, defaultLine, isReserved, linePrice, sliceCapG, sliceMaxG, validSlice, onePerParent } from "./items";
import type { SaleItem } from "./types";

const item = (o: Partial<SaleItem>) => ({ kind: "remainder", status: "published", weight_g: 1100, price_per_kg_agorot: 22000, ...o }) as SaleItem;

describe("remainder slices (R13/R14)", () => {
  it("95% of what is left, in steps of 50 from 200", () => {
    expect(sliceMaxG(1100)).toBe(1045);
    expect(sliceCapG(1100)).toBe(1000);
    expect(validSlice(600, 1100)).toBe(true);
    expect(validSlice(1100, 1100)).toBe(false);   // T9
    expect(validSlice(150, 1100)).toBe(false);
    expect(validSlice(625, 1100)).toBe(false);
  });
  it("prices a slice by its grams and all of it by the balance", () => {
    expect(linePrice(item({}), "remainder_slice", 600)).toBe(13200);
    expect(linePrice(item({ weight_g: 500 }), "remainder_all")).toBe(11000);
  });
  it("holds: all of it needs nobody holding any; a slice what is free", () => {
    const r = item({});
    expect(canBuyAll(r)).toBe(true);
    expect(canBuyAll(r, { held_g: 200, whole_held: false })).toBe(false);
    expect(canSlice(r, { held_g: 800, whole_held: false })).toBe(true);    // 300 free → up to 250
    expect(canSlice(r, { held_g: 900, whole_held: false })).toBe(false);
    expect(isReserved(r, { held_g: 900, whole_held: false })).toBe(true);
    expect(isReserved(r, { held_g: 0, whole_held: true })).toBe(true);
  });
  it("a unit is held or free", () => {
    const u = item({ kind: "unit", weight_g: 1240 });
    expect(canBuyUnit(u)).toBe(true);
    expect(isReserved(u, { held_g: 0, whole_held: true })).toBe(true);
    expect(defaultLine(u)).toEqual({ mode: "unit", grams: null });
    expect(canBuyUnit({ ...u, status: "sold_out" })).toBe(false);
  });
  it("a quick add takes all of a free remainder, else the default slice", () => {
    expect(defaultLine(item({}))).toEqual({ mode: "remainder_all", grams: null });
    expect(defaultLine(item({}), { held_g: 100, whole_held: false })).toEqual({ mode: "remainder_slice", grams: 600 });
  });
});

const it_ = (id: string, parent_id: string, o: Partial<SaleItem> = {}): SaleItem =>
  ({ id, parent_id, kind: "unit", unit_no: 1, status: "published", weight_g: 500, ...o } as SaleItem);

describe("onePerParent", () => {
  it("leads with the block when on sale, else the first on sale; carries every tray on sale", () => {
    const list = [
      { cut: it_("t2", "p15", { unit_no: 2 }) },
      { cut: it_("x", "p7", { kind: "remainder", unit_no: null }) },
      { cut: it_("b", "p15", { kind: "remainder", unit_no: null }) },
      { cut: it_("t1", "p15", { unit_no: 1 }) },
      { cut: it_("t3", "p15", { unit_no: 3, status: "sold_out", weight_g: 0 }) },
    ];
    const posts = onePerParent(list);
    expect(posts.map((p) => p.cut.id)).toEqual(["b", "x"]);
    expect(posts[0].trays.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
  it("does not lead with an item that sold while on screen when another is on sale", () => {
    const posts = onePerParent([{ cut: it_("a", "p1"), gone: true }, { cut: it_("b", "p1", { unit_no: 2 }) }]);
    expect(posts.map((p) => p.cut.id)).toEqual(["b"]);
    expect(posts[0].trays.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("steaks in a slice", () => {
  it("weighs a steak from the cut's own trays when they say", async () => {
    const { steakGPerCm } = await import("./items");
    // 2 steaks in 520 g → 260 g a steak at 2.5 cm → 104 g/cm
    expect(steakGPerCm({ cut_type: "entrecote" }, [{ steak_count: 2, weight_g: 520 }, { steak_count: null, weight_g: 300 }])).toBeCloseTo(104);
  });
  it("falls back to the cut type's typical steak", async () => {
    const { steakGPerCm } = await import("./items");
    expect(steakGPerCm({ cut_type: "entrecote" })).toBe(115);
    expect(steakGPerCm({ cut_type: null })).toBe(100);
    // 2 "steaks" in 1.24 kg is not a steak: the typical figure wins
    expect(steakGPerCm({ cut_type: "entrecote" }, [{ steak_count: 2, weight_g: 1240 }])).toBe(115);
  });
  it("counts the steaks and their weight", async () => {
    const { sliceSteaks } = await import("./items");
    expect(sliceSteaks(700, 2, 115)).toEqual({ count: 3, each: 230 });
    expect(sliceSteaks(200, 4, 115)).toEqual({ count: 1, each: 200 });
  });
});

describe("upload content type", () => {
  it("drops the codecs Safari adds to a recording", async () => {
    const { bareType } = await import("./upload");
    expect(bareType("video/mp4; codecs=avc1.4d401f,mp4a.40.2")).toBe("video/mp4");
    expect(bareType("video/webm;codecs=vp8")).toBe("video/webm");
    expect(bareType("image/jpeg")).toBe("image/jpeg");
  });
  it("פרוס לי: the thickness follows from the grams and the steaks, never under 1.5 cm", async () => {
    const { sliceThickness, maxSliceSteaks } = await import("./items");
    expect(sliceThickness(600, 3, 100)).toBe(2);
    expect(sliceThickness(700, 3, 115)).toBe(2);
    expect(sliceThickness(300, 4, 100)).toBe(1.5);
    expect(maxSliceSteaks(600, 100)).toBe(4);
    expect(maxSliceSteaks(200, 140)).toBe(1);
  });
});
