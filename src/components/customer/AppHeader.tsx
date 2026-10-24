"use client";
// Fixed customer header (spec 3.1, design system: AppChrome): the wordmark at the start takes you to the top of the
// feed; at the end the cart with its bordeaux count and the account menu (spec 12).
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { IconBag, IconHome, IconSearch, IconUser } from "../icons";
import { Ltr } from "../ui";
import { Emblem, Logo } from "../Logo";
import { he } from "@/lib/i18n/he";
import { useCart } from "@/lib/cart";
import { isOpenNow } from "@/lib/hours";
import { money } from "@/lib/pricing";
import { useButchers, useNow, useSession } from "@/lib/hooks";
import { forgetScroll } from "@/lib/scroll";

export function AppHeader() {
  const path = usePathname();
  const router = useRouter();
  const lines = useCart();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  // the full post has its own overlay on phones and tablets; a wide screen keeps the header above it
  const onCut = path.startsWith("/cut/");

  const toTop = (e: React.MouseEvent) => {
    forgetScroll("feed");
    if (path === "/") { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };

  return (
    <>
      <header data-theme="night" data-bp-header className={clsx("sticky top-0 z-40 rounded-b-[22px] bg-ink pt-[env(safe-area-inset-top)] text-ivory", onCut && "hidden lg:block")}>
        <div className="sr-header">
          <Link href="/" onClick={toTop} aria-label={he.app.name} className="flex items-center gap-2">
            <Emblem size={42} className="-my-1" />
            <Logo height={20} />
          </Link>
          <DesktopNav path={path} />
          <LiveNow />
          <div className="sr-header__actions">
            {lines.length > 0 && (
              <Link href="/cart" className="hidden min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-bold text-on-brand lg:flex">
                {he.cart.pill(lines.length, money(lines.reduce((t, l) => t + l.estAgorot, 0)))}
              </Link>
            )}
            <Link href="/cart" aria-label={he.nav.cart(lines.length)} className={clsx("sr-iconbtn", lines.length > 0 && "lg:hidden")}>
              <IconBag />
              {lines.length > 0 && <span className="sr-iconbtn__count"><Ltr>{lines.length}</Ltr></span>}
            </Link>
            <button type="button" onClick={() => setOpen(true)} aria-label={he.nav.account} aria-haspopup="menu" className="sr-iconbtn">
              <IconUser />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={he.nav.account}>
          <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <nav className="sr-sheet animate-slide-up absolute inset-x-0 bottom-0 mx-auto max-w-[480px] lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2 lg:!rounded-[28px] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
            role="menu">
            <div className="sr-sheet__grab" />
            {user ? (
              <ul className="flex flex-col divide-y divide-ivory/10 font-display text-xl">
                {[
                  ["/orders", he.nav.myOrders],
                  ["/orders?view=history", he.nav.history],
                  ["/settings", he.nav.settings],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} role="menuitem" onClick={() => setOpen(false)} className="block py-4 text-ivory">{label}</Link>
                  </li>
                ))}
                <li>
                  <form action="/auth/signout" method="post">
                    <button type="submit" role="menuitem" className="w-full py-4 text-ivory/60">{he.profile.logout}</button>
                  </form>
                </li>
              </ul>
            ) : (
              <button type="button" role="menuitem" onClick={() => { setOpen(false); router.push(`/login?next=${encodeURIComponent(path)}`); }}
                className="w-full py-4 font-display text-xl text-ivory">
                {he.nav.login}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="mt-2 min-h-11 text-sm text-stone">{he.nav.close}</button>
          </nav>
        </div>
      )}
    </>
  );
}

/** On a wide screen the feed and search sit in the header (the tab bar is for phones and tablets). */
function DesktopNav({ path }: { path: string }) {
  const items = [
    { href: "/", label: he.nav.home, Mark: IconHome, active: path === "/" || path.startsWith("/b/") || path === "/shops" },
    { href: "/search", label: he.nav.search, Mark: IconSearch, active: path === "/search" },
  ];
  return (
    <nav className="hidden flex-1 justify-center gap-2 lg:flex" aria-label={he.nav.main}>
      {items.map(({ href, label, Mark, active }) => (
        <Link key={href} href={href} aria-current={active ? "page" : undefined}
          className={clsx("flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors",
            active ? "bg-ivory text-ink" : "text-ivory/80 hover:text-ivory")}>
          <Mark />{label}
        </Link>
      ))}
    </nav>
  );
}

/** The live dot (design: Meat2Me-style band): how many counters are open right now — the page is alive. */
function LiveNow() {
  const butchers = useButchers();
  const now = useNow(60000);
  const open = butchers.filter((b) => b.status !== "inactive" && isOpenNow(b.opening_hours, new Date(now))).length;
  return (
    <span className="ms-auto me-4 hidden items-center gap-2.5 text-sm lg:flex">
      <span className="live-dot" aria-hidden />
      <b>{he.live.now}</b>
      <span className="text-stone">· {he.live.openCounters(open)}</span>
    </span>
  );
}
