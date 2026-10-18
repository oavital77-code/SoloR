import { describe, expect, it } from "vitest";
import { rankFeed } from "./feed";

describe("rankFeed", () => {
  it("puts the newest post first, by when it went live", () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 18, h)).toISOString();
    const cuts = [
      { id: "a", published_at: at(8), created_at: at(1) },
      { id: "b", published_at: at(10), created_at: at(1) },
      { id: "c", published_at: null, created_at: at(9) },
    ];
    expect(rankFeed(cuts).map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});
