"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Package, Store } from "lucide-react";
import { he } from "@/lib/i18n/he";

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/cut/")) return null;
  const items = [
    { href: "/", label: he.nav.market, active: path === "/" || path.startsWith("/b/") || path === "/search" || path === "/categories", icon: <Store className="size-5" aria-hidden /> },
    { href: "/discover", label: he.nav.live, active: path === "/discover", icon: <span className={clsx("size-2.5 rounded-full bg-live", path === "/discover" && "animate-live")} aria-hidden /> },
    { href: "/orders", label: he.nav.myOrders, active: path.startsWith("/orders"), icon: <Package className="size-5" aria-hidden /> },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-white/10 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="grid h-16 grid-cols-3">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} aria-current={it.active ? "page" : undefined}
              className={clsx("flex h-full items-center justify-center gap-2 text-[16px] font-bold", it.active ? "text-white" : "text-white/50")}>
              {it.icon}{it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
