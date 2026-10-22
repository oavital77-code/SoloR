import { describe, expect, it } from "vitest";
import { canBuyAll, canBuyUnit, canSlice, defaultLine, isReserved, linePrice, sliceCapG, sliceMaxG, validSlice } from "./items";
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
