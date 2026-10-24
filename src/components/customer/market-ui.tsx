"use client";
// Shared building blocks of the customer screens.
import Link from "next/link";
import { IconBack } from "../icons";
import { Rise } from "../motion/Rise";

/** Text-only back link ("חזרה" / "לפיד"). */
export function BackLink({ href, label, onClick }: { href?: string; label: string; onClick?: () => void }) {
  const cls = "inline-flex min-h-11 items-center text-sm font-medium text-ivory/70 underline-offset-4 hover:underline";
  return onClick
    ? <button type="button" onClick={onClick} className={cls}>{label}</button>
    : <Link href={href ?? "/"} className={cls}>{label}</Link>;
}

/** A screen's head (design: Cart, Checkout, Tracking): the round back arrow, then the title in the display serif. */
export function ScreenHead({ title, back, backLabel, sub, children }: {
  title: React.ReactNode; back: string | (() => void); backLabel: string; sub?: React.ReactNode; children?: React.ReactNode;
}) {
  const icon = <IconBack />;
  return (
    <header className="flex items-center gap-2 pt-3 text-start">
      {typeof back === "string"
        ? <Link href={back} aria-label={backLabel} className="sr-backbtn !bg-transparent">{icon}</Link>
        : <button type="button" onClick={back} aria-label={backLabel} className="sr-backbtn !bg-transparent">{icon}</button>}
      <div className="min-w-0 flex-1">
        <Rise lines={[title]} className="sr-screen-title" />
        {sub}
      </div>
      {children}
    </header>
  );
}
