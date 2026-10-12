"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";

export const BOTTOM_NAV_H = "4rem";

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/cut/")) return null;
  const items = [
    { href: "/", label: he.nav.live, active: path === "/", live: true },
    { href: "/orders", label: he.nav.myOrders, active: path.startsWith("/orders") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-white/10 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="grid h-16 grid-cols-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} aria-current={it.active ? "page" : undefined}
              className={clsx("flex h-full items-center justify-center gap-2 text-[17px] font-bold", it.active ? "text-white" : "text-white/50")}>
              {it.live && <span className={clsx("size-2.5 rounded-full bg-live", it.active && "animate-live")} aria-hidden />}
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
