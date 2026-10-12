// Maps RPC / PostgREST errors to Hebrew text. RPCs raise a stable code in `message` (extra data in `details`).
import { he } from "./i18n/he";

export interface DbError {
  message?: string;
  details?: string | null;
  code?: string;
}

export const ERROR_CODES = [
  "CUT_NOT_AVAILABLE", "WHOLE_NOT_AVAILABLE", "NOT_ENOUGH_STEAKS", "INVALID_QTY", "MISSING_FIELDS",
  "NOT_ALLOWED", "INVALID_TRANSITION", "HAS_ACTIVE_ORDERS", "STOCK_CHANGED", "REASON_REQUIRED",
  "NOTE_TOO_LONG", "LAST_PHOTO",
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
  if (code === "NOT_ENOUGH_STEAKS") return he.errors.NOT_ENOUGH_STEAKS(Number(err?.details ?? 0));
  if (code === "MISSING_FIELDS" && err?.details) {
    const list = err.details.split(",").map((f) => he.missingFields[f] ?? f);
    return `${he.errors.MISSING_FIELDS}: ${list.join(", ")}`;
  }
  return he.errors[code] as string;
}

export function missingFieldsOf(err: DbError | null | undefined): string[] {
  return errorCode(err) === "MISSING_FIELDS" && err?.details ? err.details.split(",") : [];
}
