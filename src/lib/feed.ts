// Feed ordering (customer spec §4.2) — one replaceable function. POC: newest first by published_at.
// TODO(spec 18.2): the "smart" order agreed earlier (new cuts mixed with ones that have waited long) replaces this.
import type { SaleItem } from "./types";

export function rankFeed<T extends Pick<SaleItem, "published_at" | "created_at">>(cuts: T[]): T[] {
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

/** What other customers hold at checkout right now, and when an item counts as "שוריין": see lib/items. */
export { isReserved, type Held } from "./items";
