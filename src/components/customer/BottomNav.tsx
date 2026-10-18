"use client";
// Tab bar (spec 3.2): two hand-drawn line marks, home (the feed) and search. The cart and the account live in
// the header. Thin strokes in the luxury palette; a hairline above the active one. Names stay for screen readers.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function HomeMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path {...stroke} d="M4 10.6 12 4l8 6.6V19a1.2 1.2 0 0 1-1.2 1.2H14.6v-5.4H9.4v5.4H5.2A1.2 1.2 0 0 1 4 19v-8.4Z" />
    </svg>
  );
}

function SearchMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <circle {...stroke} cx="10.8" cy="10.8" r="6.3" />
      <path {...stroke} d="m15.6 15.6 4.6 4.6" />
    </svg>
  );
}

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
  if (path.startsWith("/cut/")) return null;
  const items = [
    { href: "/", label: he.nav.home, Mark: HomeMark, active: path === "/" || path.startsWith("/b/") || path === "/shops" },
    { href: searchHref, label: he.nav.search, Mark: SearchMark, active: path === "/search" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-ivory/10 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <ul className="grid h-14 grid-cols-2">
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
