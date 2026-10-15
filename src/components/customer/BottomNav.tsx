"use client";
// Tab bar of three hand-drawn line marks (founders' request): cart = Market, steak = Live, receipt = Orders.
// Thin strokes in the luxury palette; a hairline above the active one. Names stay for screen readers.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function CartMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path {...stroke} d="M2.8 4.2h2.1l2.3 10.3a1.4 1.4 0 0 0 1.4 1.1h8.5a1.4 1.4 0 0 0 1.4-1l1.9-6.4H6" />
      <circle {...stroke} cx="9.6" cy="19.4" r="1.2" />
      <circle {...stroke} cx="16.6" cy="19.4" r="1.2" />
    </svg>
  );
}

function SteakMark() {
  // a tomahawk: the cut with its bone, so it reads as meat at a glance
  return (
    <svg viewBox="2 2 20 20" className="size-6" aria-hidden>
      <path {...stroke} d="M14.2 9.8c1.9 1.9 1.6 5.8-1.2 8.5-2.8 2.8-6.9 3.4-8.8 1.4-1.9-1.9-1.4-6 1.4-8.7 2.7-2.7 6.7-3.1 8.6-1.2Z" />
      <path {...stroke} d="M6.3 18.4c-1-1.1-.6-3.5 1.1-5.1 1.6-1.6 3.8-2.1 4.9-1.1" />
      <path {...stroke} d="M14.2 9.8l4.6-4.6" />
      <circle {...stroke} cx="19.4" cy="3.7" r="1.1" />
      <circle {...stroke} cx="20.3" cy="5.6" r="1.1" />
    </svg>
  );
}

function ReceiptMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path {...stroke} d="M6 3.2h12v17.6l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4V3.2Z" />
      <path {...stroke} d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  );
}

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/cut/")) return null;
  const items = [
    { href: "/", label: he.nav.market, Mark: CartMark,
      active: path === "/" || path.startsWith("/b/") || path === "/search" || path === "/categories" || path === "/shops" },
    { href: "/discover", label: he.nav.live, Mark: SteakMark, active: path === "/discover" },
    { href: "/orders", label: he.nav.myOrders, Mark: ReceiptMark, active: path.startsWith("/orders") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-ivory/10 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="grid h-14 grid-cols-3">
        {items.map(({ href, label, Mark, active }) => (
          <li key={href}>
            <Link href={href} aria-label={label} aria-current={active ? "page" : undefined}
              className={clsx("relative flex h-full items-center justify-center transition-colors", active ? "text-ivory" : "text-stone")}>
              <Mark />
              {active && <span className="absolute top-0 h-px w-10 bg-gold" aria-hidden />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
