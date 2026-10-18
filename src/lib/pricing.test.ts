import { describe, expect, it } from "vitest";
import {
  agorotToShekelsInput, formatAgorot, weightOutcome, formatWeight, maxSteaks, plannedSteaks,
  priceForWeight, shekelsToAgorot, steakPrice, steaksOrderPrice, wholePrice,
} from "./pricing";

describe("pricing — SPEC §6.3 example", () => {
  // אנטריקוט 2,400 גרם, 220 ₪ לק"ג, סטייק 300 גרם
  const weight = 2400, ppk = 22000, steak = 300;
  it("8 steaks available", () => expect(maxSteaks(weight, steak)).toBe(8));
  it("whole price 528.00", () => expect(wholePrice(weight, ppk)).toBe(52800));
  it("steak price 66.00", () => expect(steakPrice(steak, ppk)).toBe(6600));
  it("3 steaks 198.00", () => expect(steaksOrderPrice(steak, ppk, 3)).toBe(19800));
  it("formats", () => {
    expect(formatAgorot(52800)).toBe("528.00");
    expect(formatAgorot(19800)).toBe("198.00");
  });
});

describe("pricing — rounding and helpers", () => {
  it("rounds half up to the agora", () => {
    expect(priceForWeight(1, 500)).toBe(1);      // 0.5 → 1
    expect(priceForWeight(1, 499)).toBe(0);      // 0.499 → 0
    expect(priceForWeight(333, 21990)).toBe(7323); // 7322.67 → 7323
  });
  it("handles the max range without overflow", () => {
    expect(priceForWeight(20000, 500000)).toBe(10000000);
  });
  it("planned steaks can only lower the max", () => {
    expect(plannedSteaks(2400, 300, null)).toBe(8);
    expect(plannedSteaks(2400, 300, 5)).toBe(5);
    expect(plannedSteaks(2400, 300, 12)).toBe(8);
    expect(maxSteaks(100, 300)).toBe(0);
  });
  it("parses shekel input", () => {
    expect(shekelsToAgorot("220")).toBe(22000);
    expect(shekelsToAgorot("219.9")).toBe(21990);
    expect(shekelsToAgorot("219,95")).toBe(21995);
    expect(shekelsToAgorot("1.005")).toBeNull();
    expect(shekelsToAgorot("abc")).toBeNull();
    expect(agorotToShekelsInput(22000)).toBe("220");
    expect(agorotToShekelsInput(21995)).toBe("219.95");
  });
  it("formats weight", () => {
    expect(formatWeight(2400)).toBe("2.4 ק״ג");
    expect(formatWeight(2000)).toBe("2 ק״ג");
    expect(formatWeight(2450)).toBe("2.45 ק״ג");
    expect(formatWeight(900)).toBe("900 גר׳");
  });
});

describe("weight rule (§9.3)", () => {
  it("changes nothing within 5% either way", () => {
    expect(weightOutcome(1000, 950, 20000)).toEqual({ kind: "within" });
    expect(weightOutcome(1000, 1050, 20000)).toEqual({ kind: "within" });
  });
  it("refunds the whole missing weight when more than 5% under, like the server", () => {
    expect(weightOutcome(1000, 949, 20000)).toEqual({ kind: "under", refund: 1020 });
    expect(weightOutcome(900, 820, 22000)).toEqual({ kind: "under", refund: 1760 });
  });
  it("never charges for more", () => {
    expect(weightOutcome(1000, 1200, 20000)).toEqual({ kind: "over" });
  });
});
