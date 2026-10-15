"use client";
// Text-only tab bar: three English words in spaced capitals, a hairline above the active one.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/cut/")) return null;
  const items = [
    { href: "/", label: he.nav.market,
      active: path === "/" || path.startsWith("/b/") || path === "/search" || path === "/categories" || path === "/shops" },
    { href: "/discover", label: he.nav.live, active: path === "/discover" },
    { href: "/orders", label: he.nav.myOrders, active: path.startsWith("/orders") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-ivory/10 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="grid h-14 grid-cols-3">
        {items.map(({ href, label, active }) => (
          <li key={href}>
            <Link href={href} aria-current={active ? "page" : undefined}
              dir="ltr" className={clsx("relative flex h-full items-center justify-center text-xs uppercase tracking-[0.22em] transition-colors",
                active ? "font-semibold text-ivory" : "text-stone")}>
              {label}
              {active && <span className="absolute top-0 h-px w-10 bg-gold" aria-hidden />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
