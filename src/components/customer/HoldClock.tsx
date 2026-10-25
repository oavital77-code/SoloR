"use client";
// The cart's hold clock (founders 26.10.2026): how long the cuts in the cart stay held, counting down; at zero it says
// the hold ran out and offers to hold them again. The cart bar carries it on every screen, the cart page at its top.
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { markHoldExpired, syncCartHold, useCartHold } from "@/lib/cartHold";
import { HOLD_MINUTES } from "@/lib/items";

/** seconds left on the hold, ticking; null when nothing is held */
export function useHoldClock(): { left: number | null; status: ReturnType<typeof useCartHold>["status"] } {
  const hold = useCartHold();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (hold.status !== "held") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hold.status]);
  const left = hold.status === "held" && hold.expiresAt ? Math.max(0, Math.ceil((hold.expiresAt - now) / 1000)) : null;
  useEffect(() => { if (left === 0) markHoldExpired(); }, [left]);
  return { left, status: hold.status };
}

export const clockText = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** the ring around the cart's count: full at ten minutes, empty at zero */
export function HoldRing({ left, children, className }: { left: number | null; children: React.ReactNode; className?: string }) {
  const c = 2 * Math.PI * 20;
  const part = left == null ? 0 : Math.min(1, left / (HOLD_MINUTES * 60));
  return (
    <span className={clsx("relative grid size-11 shrink-0 place-items-center rounded-full bg-black/25 font-bold", className)}>
      {left != null && (
        <svg viewBox="0 0 46 46" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="23" cy="23" r="20" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="4" />
          <circle cx="23" cy="23" r="20" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - part)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
        </svg>
      )}
      <span className="relative">{children}</span>
    </span>
  );
}

/** a line about the hold for the cart page and the bar: held · ran out (+ hold again) · a guest */
export function HoldLine({ count, signedIn, onBar }: { count: number; signedIn: boolean; onBar?: boolean }) {
  const { left, status } = useHoldClock();
  const [busy, setBusy] = useState(false);
  if (status === "held" && left != null) {
    return (
      <span className="flex min-w-0 flex-col leading-[18px]">
        <b className="text-[15px]">{he.hold.held(count)}</b>
        <span className={clsx("text-[12px]", onBar ? "opacity-85" : "text-stone")}>{he.hold.left} <Ltr className="font-mono text-[13px] font-bold">{clockText(left)}</Ltr> · {he.hold.thenFree}</span>
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-col leading-[18px]">
          <b className="text-[15px]">{he.hold.expired}</b>
          {!onBar && <span className="text-[12px] text-stone">{he.hold.expiredNote}</span>}
        </span>
        <button type="button" disabled={busy}
          onClick={async (e) => { e.preventDefault(); e.stopPropagation(); setBusy(true); await syncCartHold(true); setBusy(false); }}
          className={clsx("min-h-9 shrink-0 rounded-full px-3 text-[13px] font-bold", onBar ? "bg-white text-[#7a1020]" : "bg-brand text-on-brand")}>
          {he.hold.again}
        </button>
      </span>
    );
  }
  if (!signedIn && count > 0) return <span className={clsx("text-[12px] leading-4", onBar ? "opacity-85" : "text-stone")}>{he.hold.guest}</span>;
  return null;
}

/** the cart page's strip at the top */
export function HoldBanner({ count, signedIn }: { count: number; signedIn: boolean }) {
  const { left, status } = useHoldClock();
  if (status !== "held" && status !== "expired" && signedIn) return null;
  return (
    <div className={clsx("mt-3 flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5",
      status === "expired" ? "border-line bg-ink-3" : "border-brand")}>
      {status === "held" && <HoldRing left={left} className="!bg-brand text-on-brand">{count}</HoldRing>}
      <HoldLine count={count} signedIn={signedIn} />
      {!signedIn && <Link href="/login?next=%2Fcart" className="ms-auto shrink-0 text-sm font-bold text-brand">{he.nav.login}</Link>}
    </div>
  );
}
