import { describe, expect, it } from "vitest";
import { mergeCarts, removeLine, sanitizeCart, upsertLine, type CartLine } from "./cart";

const line = (cutId: string, over: Partial<CartLine> = {}): CartLine => ({
  cutId, code: "SOL-1", butcherId: "b1", mode: "steaks", qty: 2, estAgorot: 1000, addedAt: 1, ...over,
});

describe("cart", () => {
  it("keeps one line per cut: adding again replaces mode/qty but keeps its place", () => {
    const a = upsertLine(upsertLine([], line("a")), line("b"));
    const b = upsertLine(a, line("a", { mode: "whole", qty: null, addedAt: 99 }));
    expect(b.map((l) => l.cutId)).toEqual(["a", "b"]);
    expect(b[0]).toMatchObject({ mode: "whole", qty: null, addedAt: 1 });
  });

  it("removes a line", () => {
    expect(removeLine([line("a"), line("b")], "a").map((l) => l.cutId)).toEqual(["b"]);
  });

  it("sanitizes whatever is in storage", () => {
    const out = sanitizeCart([
      line("a"), line("a"), { cutId: "c", mode: "bogus" }, null, 5,
      { cutId: "d", mode: "steaks", qty: -3 }, { cutId: "e", mode: "whole", qty: 4 },
    ]);
    expect(out.map((l) => l.cutId)).toEqual(["a", "d", "e"]);
    expect(out[1].qty).toBe(1);
    expect(out[2].qty).toBeNull();
    expect(sanitizeCart("x")).toEqual([]);
  });
});

describe("cart and account", () => {
  it("merges this device's cart into the account's, this device winning for a cut in both", () => {
    const account = [line("a", { qty: 5, addedAt: 1 }), line("b", { addedAt: 2 })];
    const local = [line("a", { qty: 1, addedAt: 3 }), line("c", { addedAt: 4 })];
    const m = mergeCarts(local, account);
    expect(m.map((l) => l.cutId)).toEqual(["b", "a", "c"]);
    expect(m.find((l) => l.cutId === "a")?.qty).toBe(1);
  });
  it("an empty device keeps the account's cart", () => {
    expect(mergeCarts([], [line("a")]).map((l) => l.cutId)).toEqual(["a"]);
  });
});
