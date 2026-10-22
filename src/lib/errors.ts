// Maps RPC / PostgREST errors to Hebrew text. RPCs raise a stable code in `message` (extra data in `details`).
import { he } from "./i18n/he";

export interface DbError {
  message?: string;
  details?: string | null;
  code?: string;
}

export const ERROR_CODES = [
  "ITEM_NOT_AVAILABLE", "NOT_ENOUGH_WEIGHT", "INVALID_QTY", "MISSING_FIELDS",
  "NOT_ALLOWED", "INVALID_TRANSITION", "HAS_ACTIVE_ORDERS", "HAS_UNITS", "HAS_DRAFTS", "PARENT_IN_PROGRESS", "CODE_IN_USE", "CODE_LOCKED", "INVALID_CODE",
  "REASON_REQUIRED", "NOTE_TOO_LONG", "LAST_PHOTO", "CART_UNAVAILABLE", "INVALID_CART", "ITEM_RESERVED",
  "RECEIVE_NOT_AVAILABLE", "DELIVERY_NOT_ELIGIBLE", "INVALID_ADDRESS", "INVALID_WINDOW", "INVALID_CONTACT",
  "HOLD_RELEASED", "PRICE_CHANGED", "INVALID_WEIGHT",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function errorCode(err: DbError | null | undefined): ErrorCode | "PERMISSION" | "NETWORK" | "UNKNOWN" {
  if (!err) return "UNKNOWN";
  const msg = err.message ?? "";
  if ((ERROR_CODES as readonly string[]).includes(msg)) return msg as ErrorCode;
  if (err.code === "42501") return "PERMISSION";
  if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) return "NETWORK";
  return "UNKNOWN";
}

export function errorText(err: DbError | null | undefined): string {
  const code = errorCode(err);
  if (code === "NOT_ENOUGH_WEIGHT") return he.errors.NOT_ENOUGH_WEIGHT(Number(err?.details ?? 0));
  if (code === "MISSING_FIELDS" && err?.details) {
    const list = err.details.split(",").map((f) => he.missingFields[f] ?? f);
    return `${he.errors.MISSING_FIELDS}: ${list.join(", ")}`;
  }
  return he.errors[code] as string;
}

/** One line of the cart that could not be bought (reserve / pay → CART_UNAVAILABLE, details = JSON list). */
export interface CartProblem {
  item_id: string;
  label?: string;
  reason: "ITEM_NOT_AVAILABLE" | "NOT_ENOUGH_WEIGHT" | "ITEM_RESERVED";
  /** NOT_ENOUGH_WEIGHT: the largest slice that can be asked for now */
  available_g?: number;
}

export function cartProblemsOf(err: DbError | null | undefined): CartProblem[] {
  if (errorCode(err) !== "CART_UNAVAILABLE" || !err?.details) return [];
  try {
    const list = JSON.parse(err.details);
    return Array.isArray(list) ? (list as CartProblem[]) : [];
  } catch {
    return [];
  }
}

export function cartProblemText(p: Pick<CartProblem, "reason" | "available_g">): string {
  if (p.reason === "NOT_ENOUGH_WEIGHT") return he.errors.NOT_ENOUGH_WEIGHT(p.available_g ?? 0);
  return he.errors[p.reason];
}

export function missingFieldsOf(err: DbError | null | undefined): string[] {
  return errorCode(err) === "MISSING_FIELDS" && err?.details ? err.details.split(",") : [];
}
