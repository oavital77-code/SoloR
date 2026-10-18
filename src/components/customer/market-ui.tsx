"use client";
// Shared building blocks of the customer screens — typography and hairlines, no icon set.
import Link from "next/link";

/** Text-only back link ("חזרה" / "לפיד"). */
export function BackLink({ href, label, onClick }: { href?: string; label: string; onClick?: () => void }) {
  const cls = "inline-flex min-h-11 items-center text-sm font-medium text-ivory/70 underline-offset-4 hover:underline";
  return onClick
    ? <button type="button" onClick={onClick} className={cls}>{label}</button>
    : <Link href={href ?? "/"} className={cls}>{label}</Link>;
}
