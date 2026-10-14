"use client";
// iOS-style tab bar: icon over label, clear active state, sits above the home indicator.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Package, Radio, Store } from "lucide-react";
import { he } from "@/lib/i18n/he";

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/cut/")) return null;
  const items = [
    { href: "/", label: he.nav.market, Icon: Store,
      active: path === "/" || path.startsWith("/b/") || path === "/search" || path === "/categories" },
    { href: "/discover", label: he.nav.live, Icon: Radio, active: path === "/discover", live: true },
    { href: "/orders", label: he.nav.myOrders, Icon: Package, active: path.startsWith("/orders") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-white/[0.08] bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="grid h-[58px] grid-cols-3">
        {items.map(({ href, label, Icon, active, live }) => (
          <li key={href}>
            <Link href={href} aria-current={active ? "page" : undefined}
              className={clsx("relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors",
                active ? "text-white" : "text-white/45")}>
              <span className="relative">
                <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {live && <span className={clsx("absolute -top-0.5 -end-1 size-2 rounded-full bg-live ring-2 ring-ink", active && "animate-live")} aria-hidden />}
              </span>
              {label}
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" aria-hidden />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
