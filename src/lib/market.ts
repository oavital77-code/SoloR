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

/** Every word of the query must appear in the cut's searchable text (type, breed, origin, code, shop). */
export function matchesQuery(cut: Cut, query: string, breeds: Breed[], butcher?: Butcher | null): boolean {
  const q = norm(query);
  if (!q) return true;
  const hay = norm([
    cutTypeLabel(cut.cut_type), breedLabel(cut, breeds), originLabel(cut.origin_country),
    cut.code, butcher?.name ?? "", cut.description ?? "", cut.is_aged ? "מיושן יושן" : "",
  ].join(" "));
  return q.split(" ").every((w) => hay.includes(w));
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
