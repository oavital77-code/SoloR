import { he } from "./i18n/he";

// Price calculations — identical to the SQL helpers price_for_weight / max_steaks (SPEC §6.3).
// All amounts are integer agorot. Rounding: half up (inputs are always positive).

export function priceForWeight(weightG: number, pricePerKgAgorot: number): number {
  return Math.floor((weightG * pricePerKgAgorot + 500) / 1000);
}

export function wholePrice(weightG: number, pricePerKgAgorot: number): number {
  return priceForWeight(weightG, pricePerKgAgorot);
}

/**
 * The weight rule (spec §9.3), same as the SQL weight_refund: up to 5% either way changes nothing; supplied more
 * than 5% under → the whole missing weight is refunded at the order's price per kg; over is never charged.
 */
export function weightOutcome(orderedG: number, deliveredG: number, pricePerKgAgorot: number):
  { kind: "within" } | { kind: "under"; refund: number } | { kind: "over" } {
  if (deliveredG * 100 < orderedG * 95) return { kind: "under", refund: priceForWeight(orderedG - deliveredG, pricePerKgAgorot) };
  if (deliveredG * 100 > orderedG * 105) return { kind: "over" };
  return { kind: "within" };
}

export function steakPrice(steakWeightG: number, pricePerKgAgorot: number): number {
  return priceForWeight(steakWeightG, pricePerKgAgorot);
}

export function steaksOrderPrice(steakWeightG: number, pricePerKgAgorot: number, qty: number): number {
  return steakPrice(steakWeightG, pricePerKgAgorot) * qty;
}

export function maxSteaks(weightG: number | null | undefined, steakWeightG: number | null | undefined): number {
  if (!weightG || !steakWeightG) return 0;
  return Math.floor(weightG / steakWeightG);
}

/** Steaks offered: the butcher's choice (can only lower), else the max. */
export function plannedSteaks(
  weightG: number | null | undefined,
  steakWeightG: number | null | undefined,
  planned: number | null | undefined,
): number {
  const mx = maxSteaks(weightG, steakWeightG);
  return planned == null ? mx : Math.min(planned, mx);
}

/** 52800 → "528.00" */
export function formatAgorot(agorot: number): string {
  return (agorot / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A price as the design writes it: "₪132", with agorot only when there are any ("₪132.50"). */
export function money(agorot: number): string {
  return `₪${formatAgorot(agorot).replace(/\.00$/, "")}`;
}

/** "220" / "219.9" → 22000 / 21990; invalid → null */
export function shekelsToAgorot(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function agorotToShekelsInput(agorot: number | null | undefined): string {
  if (agorot == null) return "";
  return agorot % 100 === 0 ? String(agorot / 100) : (agorot / 100).toFixed(2);
}

/** 2400 → "2.4 ק״ג", 900 → "900 גר׳" */
export function formatWeight(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    return he.units.kg(String(Number.isInteger(kg) ? kg : kg.toFixed(kg * 100 % 10 === 0 ? 1 : 2)));
  }
  return he.units.g(g);
}
