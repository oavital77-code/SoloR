"use client";
// Fixed customer header (spec 3.1, design system: AppChrome): the wordmark at the start takes you to the top of the
// feed; at the end the cart with its bordeaux count and the account menu (spec 12). The full post has its own overlay.
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconBag, IconUser } from "../icons";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/hooks";
import { forgetScroll } from "@/lib/scroll";

export function AppHeader() {
  const path = usePathname();
  const router = useRouter();
  const lines = useCart();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  if (path.startsWith("/cut/")) return null;

  const toTop = (e: React.MouseEvent) => {
    forgetScroll("feed");
    if (path === "/") { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-ink/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="sr-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Link href="/" onClick={toTop} aria-label="SoloR"><img src="/brand/wordmark-on-dark.svg" alt="SoloR" className="sr-header__logo" /></Link>
          <div className="sr-header__actions">
            <Link href="/cart" aria-label={he.nav.cart(lines.length)} className="sr-iconbtn">
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
          <nav className="sr-sheet animate-slide-up absolute inset-x-0 bottom-0 mx-auto max-w-[480px] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center"
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
