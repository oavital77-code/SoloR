// Marketplace catalogue: available cuts across shops, text search and categories (review stage 1).
import { breedLabel } from "./cut-helpers";
import { CUT_TYPES, cutTypeLabel, originLabel } from "./labels";
import type { Breed, Butcher, Cut, CutType } from "./types";

/** A cut can be bought right now (search / categories never show sold-out stock). */
export function isAvailable(cut: Cut): boolean {
  if (cut.status !== "published") return false;
  const whole = (cut.sale_mode === "whole" || cut.sale_mode === "both") && cut.whole_available;
  const steaks = (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steaks_available > 0;
  return whole || steaks;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[֑-ׇ]/g, "").replace(/["'״׳\-_.]/g, " ").replace(/\s+/g, " ").trim();
}

// Where each word may be found and how much a hit there counts (customer spec §8: type, shop, breed, origin,
// words from the butcher's note). The cut must contain every word; the score orders the results.
function fields(cut: Cut, breeds: Breed[], butcher?: Butcher | null): [string, number][] {
  return [
    [norm(cutTypeLabel(cut.cut_type)), 5],
    [norm(breedLabel(cut, breeds)), 4],
    [norm(butcher?.name ?? ""), 3],
    [norm(originLabel(cut.origin_country)), 3],
    [norm(cut.code), 3],
    [cut.is_aged ? "מיושן יושן" : "", 2],
    [norm(cut.description ?? ""), 1],
  ];
}

/** Relevance of a cut for a query: 0 when some word is missing, higher for hits in more telling fields. */
export function searchScore(cut: Cut, query: string, breeds: Breed[], butcher?: Butcher | null): number {
  const words = norm(query).split(" ").filter(Boolean);
  if (!words.length) return 1;
  const f = fields(cut, breeds, butcher);
  let score = 0;
  for (const w of words) {
    const best = Math.max(0, ...f.filter(([text]) => text.includes(w)).map(([, weight]) => weight));
    if (!best) return 0;
    score += best;
  }
  return score;
}

/** Every word of the query must appear in the cut's searchable text. */
export function matchesQuery(cut: Cut, query: string, breeds: Breed[], butcher?: Butcher | null): boolean {
  return searchScore(cut, query, breeds, butcher) > 0;
}

export function categoryCounts(cuts: Cut[]): { key: CutType; label: string; count: number }[] {
  return CUT_TYPES.map((c) => ({ ...c, count: cuts.filter((x) => x.cut_type === c.key && isAvailable(x)).length }));
}

export function shopPath(b: Pick<Butcher, "slug">): string {
  return `/b/${b.slug}`;
}

/** Only relative in-app paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
