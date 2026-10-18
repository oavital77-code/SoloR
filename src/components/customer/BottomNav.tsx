"use client";
// Tab bar (spec 3.2, design system: AppChrome): the feed and search, icon over a short label. The active tab in ink
// with a small bordeaux dot, the other muted. The cart and the account live in the header.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { IconHome, IconSearch } from "../icons";
import { he } from "@/lib/i18n/he";

// each tab reopens where it was left: the search tab keeps its query and filters (they live in its URL)
const LAST = "solor.tab.search";
const lastSearch = () => { try { return window.sessionStorage.getItem(LAST) ?? "/search"; } catch { return "/search"; } };

export function BottomNav() {
  const path = usePathname();
  const params = useSearchParams();
  const [searchHref, setSearchHref] = useState("/search");
  useEffect(() => {
    if (path === "/search") {
      const href = `/search${params.size ? `?${params}` : ""}`;
      try { window.sessionStorage.setItem(LAST, href); } catch { /* ignore */ }
    }
    setSearchHref(lastSearch());
  }, [path, params]);
  // the cut page has its own buying bar; the cart, checkout and orders end in their own bottom bar (design: Cart, Checkout)
  if (path.startsWith("/cut/") || path === "/cart" || path === "/checkout" || path.startsWith("/orders")) return null;
  const items = [
    { href: "/", label: he.nav.home, Mark: IconHome, active: path === "/" || path.startsWith("/b/") || path === "/shops" },
    { href: searchHref, label: he.nav.search, Mark: IconSearch, active: path === "/search" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="grid h-16 grid-cols-2">
        {items.map(({ href, label, Mark, active }) => (
          <li key={href}>
            <Link href={href} aria-current={active ? "page" : undefined}
              className={clsx("sr-tab h-full transition-colors", active && "sr-tab--on")}>
              <Mark />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
