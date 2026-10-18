import { describe, expect, it } from "vitest";
import { deliveryArea, deliveryFee, formatCountdown, receiveOptions } from "./checkout";

describe("checkout rules", () => {
  it("offers only what the shop turned on", () => {
    expect(receiveOptions({ pickup_enabled: true, delivery_enabled: false })).toEqual(["pickup"]);
    expect(receiveOptions({ pickup_enabled: true, delivery_enabled: true })).toEqual(["pickup", "delivery"]);
    expect(receiveOptions({ pickup_enabled: false, delivery_enabled: false })).toEqual([]);
  });
  it("matches the destination to the shop's areas", () => {
    const shop = { delivery_areas: ["תל אביב", "Ramat Gan"] };
    expect(deliveryArea(shop, " תל אביב ")).toBe("תל אביב");
    expect(deliveryArea(shop, "ramat gan")).toBe("Ramat Gan");
    expect(deliveryArea(shop, "חיפה")).toBeNull();
    expect(deliveryArea(shop, "")).toBeNull();
  });
  it("prices delivery by area, then the default, else free", () => {
    expect(deliveryFee({ delivery_pricing: { "רמת גן": 3500, "*": 2500 } }, "רמת גן")).toBe(3500);
    expect(deliveryFee({ delivery_pricing: { "*": 2500 } }, "תל אביב")).toBe(2500);
    expect(deliveryFee({ delivery_pricing: {} }, "תל אביב")).toBe(0);
  });
  it("counts the hold down", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(65_400)).toBe("1:06");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
