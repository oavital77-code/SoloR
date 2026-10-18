// Checkout rules shared by the screen and its tests — the same as the server's (checkout_receive, 0013).
import type { Butcher, ReceiveMethod } from "./types";

/** The ways this shop lets a customer receive an order (delivery stays hidden while it is off). */
export function receiveOptions(shop: Pick<Butcher, "pickup_enabled" | "delivery_enabled">): ReceiveMethod[] {
  return [shop.pickup_enabled && "pickup", shop.delivery_enabled && "delivery"].filter(Boolean) as ReceiveMethod[];
}

/** The shop's delivery area matching what the customer typed, or null when the shop does not deliver there. */
export function deliveryArea(shop: Pick<Butcher, "delivery_areas">, city: string): string | null {
  const c = city.trim().toLowerCase();
  if (!c) return null;
  return shop.delivery_areas.find((a) => a.trim().toLowerCase() === c) ?? null;
}

/** Delivery fee to an area: the area's own price, else the shop's "*" price, else free. */
export function deliveryFee(shop: Pick<Butcher, "delivery_pricing">, area: string): number {
  const p = shop.delivery_pricing ?? {};
  return Math.max(0, Number(p[area] ?? p["*"] ?? 0) || 0);
}

/** "9:05" — minutes and seconds left on a hold (0:00 once it ran out). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
