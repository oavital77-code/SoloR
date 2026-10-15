"use client";
// Shared building blocks of the customer screens — typography and hairlines, no icon set.
import Link from "next/link";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { categoryCounts } from "@/lib/market";
import type { Cut, CutType } from "@/lib/types";

/** The single search entry: looks like a field, opens the search screen (scoped to a shop when given). */
export function SearchLink({ href, placeholder }: { href: string; placeholder: string }) {
  return (
    <Link href={href} role="search"
      className="flex min-h-12 items-center justify-center rounded-xl px-4 text-[15px] text-stone ring-1 ring-ivory/15 transition-colors active:bg-ivory/[0.04]">
      <span className="truncate">{placeholder}</span>
    </Link>
  );
}

/** Text-only back link ("חזרה" / "חזרה למרקט"). */
export function BackLink({ href, label, onClick }: { href?: string; label: string; onClick?: () => void }) {
  const cls = "inline-flex min-h-11 items-center text-sm font-medium text-ivory/70 underline-offset-4 hover:underline";
  return onClick
    ? <button type="button" onClick={onClick} className={cls}>{label}</button>
    : <Link href={href ?? "/"} className={cls}>{label}</Link>;
}

export function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-col items-center px-4">
      <h2 className="font-display text-xl font-bold text-ivory">{title}</h2>
      {href && (
        <Link href={href} className="min-h-11 py-2 text-sm text-ivory/60 underline-offset-4 hover:underline">
          {linkLabel ?? he.market.seeAll}
        </Link>
      )}
    </div>
  );
}

/** Category filter as a quiet text row; empty categories are hidden. */
export function CategoryChips({ cuts, hrefFor, active, onSelect }: {
  cuts: Cut[]; hrefFor?: (key: CutType) => string; active?: CutType | null; onSelect?: (key: CutType | null) => void;
}) {
  const cats = categoryCounts(cuts).filter((c) => c.count > 0 || c.key === active);
  if (cats.length === 0) return null;
  const cls = (on: boolean) => clsx(
    "relative min-h-10 shrink-0 px-1 text-[15px] transition-colors",
    on ? "font-semibold text-ivory after:absolute after:inset-x-1 after:bottom-1 after:h-px after:bg-gold" : "text-stone",
  );
  return (
    <div className="no-scrollbar overflow-x-auto px-4">
     <div className="mx-auto flex w-max gap-5">
      {onSelect && (
        <button type="button" className={cls(!active)} onClick={() => onSelect(null)}>{he.market.allCategories}</button>
      )}
      {cats.map((c) => {
        const body = <>{c.label}<span className="ltr ms-1.5 align-super text-[10px] opacity-60">{c.count}</span></>;
        return onSelect
          ? <button key={c.key} type="button" aria-pressed={active === c.key} className={cls(active === c.key)} onClick={() => onSelect(active === c.key ? null : c.key)}>{body}</button>
          : <Link key={c.key} href={hrefFor!(c.key)} className={cls(false)}>{body}</Link>;
      })}
     </div>
    </div>
  );
}
