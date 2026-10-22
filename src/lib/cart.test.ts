import { describe, expect, it } from "vitest";
import { mergeCarts, removeLine, sanitizeCart, upsertLine, type CartLine } from "./cart";

const line = (itemId: string, over: Partial<CartLine> = {}): CartLine => ({
  itemId, code: "SOL-1", parentCode: 1, butcherId: "b1", mode: "remainder_slice", grams: 600, thicknessCm: null,
  estAgorot: 1000, addedAt: 1, ...over,
});

describe("cart", () => {
  it("keeps one line per item: adding again replaces mode/grams but keeps its place", () => {
    const a = upsertLine(upsertLine([], line("a")), line("b"));
    const b = upsertLine(a, line("a", { mode: "remainder_all", grams: null, addedAt: 99 }));
    expect(b.map((l) => l.itemId)).toEqual(["a", "b"]);
    expect(b[0]).toMatchObject({ mode: "remainder_all", grams: null, addedAt: 1 });
  });

  it("removes a line", () => {
    expect(removeLine([line("a"), line("b")], "a").map((l) => l.itemId)).toEqual(["b"]);
  });

  it("sanitizes whatever is in storage (old cut lines are dropped)", () => {
    const out = sanitizeCart([
      line("a"), line("a"), { itemId: "c", mode: "bogus" }, null, 5, { cutId: "x", mode: "steaks", qty: 2 },
      { itemId: "d", mode: "remainder_slice", grams: 120, thicknessCm: 20 }, { itemId: "e", mode: "unit", grams: 400 },
    ]);
    expect(out.map((l) => l.itemId)).toEqual(["a", "d", "e"]);
    expect(out[1]).toMatchObject({ grams: 200, thicknessCm: null });
    expect(out[2].grams).toBeNull();
    expect(sanitizeCart("x")).toEqual([]);
  });
});

describe("cart and account", () => {
  it("merges this device's cart into the account's, this device winning for an item in both", () => {
    const account = [line("a", { grams: 800, addedAt: 1 }), line("b", { addedAt: 2 })];
    const local = [line("a", { grams: 300, addedAt: 3 }), line("c", { addedAt: 4 })];
    const m = mergeCarts(local, account);
    expect(m.map((l) => l.itemId)).toEqual(["b", "a", "c"]);
    expect(m.find((l) => l.itemId === "a")?.grams).toBe(300);
  });
  it("an empty device keeps the account's cart", () => {
    expect(mergeCarts([], [line("a")]).map((l) => l.itemId)).toEqual(["a"]);
  });
});
