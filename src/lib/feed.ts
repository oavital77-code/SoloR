// Feed ordering (customer spec §4.2) — one replaceable function. POC: newest first by published_at.
// TODO(spec 18.2): the "smart" order agreed earlier (new cuts mixed with ones that have waited long) replaces this.
import type { Cut } from "./types";

export function rankFeed<T extends Pick<Cut, "published_at" | "created_at">>(cuts: T[]): T[] {
  const at = (c: T) => new Date(c.published_at ?? c.created_at).getTime();
  return [...cuts].sort((a, b) => at(b) - at(a));
}
