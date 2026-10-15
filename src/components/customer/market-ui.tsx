"use client";
// Shared building blocks of the customer marketplace screens (one visual language across market / shop / search).
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { categoryCounts } from "@/lib/market";
import type { Cut, CutType } from "@/lib/types";

/** The single search entry: looks like a field, opens the search screen (scoped to a shop when given). */
export function SearchLink({ href, placeholder }: { href: string; placeholder: string }) {
  return (
    <Link href={href} role="search"
      className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.08] px-4 text-[15px] text-white/55 ring-1 ring-white/10 transition-colors active:bg-white/[0.12]">
      <Search className="size-5 shrink-0" aria-hidden />
      <span className="truncate">{placeholder}</span>
    </Link>
  );
}

export function SectionHeader({ title, href, linkLabel, live }: { title: string; href?: string; linkLabel?: string; live?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        {live && <span className="animate-live size-2 rounded-full bg-live" aria-hidden />}
        {title}
      </h2>
      {href && (
        <Link href={href} className="flex min-h-11 items-center gap-0.5 text-sm font-semibold text-white/60">
          {linkLabel ?? he.market.seeAll}<ChevronLeft className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Horizontal category pills with live counts; empty categories are hidden. */
export function CategoryChips({ cuts, hrefFor, active, onSelect }: {
  cuts: Cut[]; hrefFor?: (key: CutType) => string; active?: CutType | null; onSelect?: (key: CutType | null) => void;
}) {
  const cats = categoryCounts(cuts).filter((c) => c.count > 0 || c.key === active);
  if (cats.length === 0) return null;
  const cls = (on: boolean) => clsx(
    "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-colors",
    on ? "bg-white text-neutral-900" : "bg-white/[0.08] text-white ring-1 ring-white/10",
  );
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
      {onSelect && (
        <button type="button" className={cls(!active)} onClick={() => onSelect(null)}>{he.market.allCategories}</button>
      )}
      {cats.map((c) => {
        const body = <>{c.label}<span className="ltr text-xs opacity-60">{c.count}</span></>;
        return onSelect
          ? <button key={c.key} type="button" aria-pressed={active === c.key} className={cls(active === c.key)} onClick={() => onSelect(active === c.key ? null : c.key)}>{body}</button>
          : <Link key={c.key} href={hrefFor!(c.key)} className={cls(false)}>{body}</Link>;
      })}
    </div>
  );
}
