// Feed ordering (customer spec §4.2) — one replaceable function. POC: newest first by published_at.
// TODO(spec 18.2): the "smart" order agreed earlier (new cuts mixed with ones that have waited long) replaces this.
import type { Cut } from "./types";

export function rankFeed<T extends Pick<Cut, "published_at" | "created_at">>(cuts: T[]): T[] {
  const at = (c: T) => new Date(c.published_at ?? c.created_at).getTime();
  return [...cuts].sort((a, b) => at(b) - at(a));
}

/**
 * How long a post must stay in view for the customer to count as having stopped on it (personal sold-out rule,
 * §13). "5 seconds" came up but is not decided (§18.6) — the one place to change it.
 */
export const SOLD_OUT_DWELL_MS = 5000;

/** Longest a post may show a stale state (§4.3: open, default 30 seconds) — holds are polled at this pace. */
export const LIVE_UPDATE_MS = 30_000;

/** What other customers hold at checkout right now (from cut_holds). */
export interface Held { steaks_held: number; whole_held: boolean }

/** Held so fully that nothing of the cut can be bought now — the post shows "שוריין" (§13) and may come back. */
export function isReserved(cut: Pick<Cut, "sale_mode" | "steaks_available">, held: Held | undefined): boolean {
  if (!held) return false;
  if (held.whole_held) return true;
  const steaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  // a whole cut cannot be bought while any of it is held; steaks only while some are free
  return !steaks || cut.steaks_available - held.steaks_held <= 0;
}
