"use client";
// Fixed customer header (spec 3.1): the logo on the right takes you to the top of the feed; on the left the cart
// with its count and the account menu (spec 12). The full post page has its own overlay instead.
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "../Logo";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/hooks";
import { forgetScroll } from "@/lib/scroll";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function BagMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path {...stroke} d="M5.5 8.5h13l-1 11.2a1.4 1.4 0 0 1-1.4 1.3H7.9a1.4 1.4 0 0 1-1.4-1.3l-1-11.2Z" />
      <path {...stroke} d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </svg>
  );
}

function PersonMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <circle {...stroke} cx="12" cy="8.5" r="3.6" />
      <path {...stroke} d="M4.8 20.2c.9-3.6 3.8-5.6 7.2-5.6s6.3 2 7.2 5.6" />
    </svg>
  );
}

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
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" onClick={toTop} aria-label="SoloR"><Logo className="text-[28px] leading-none" /></Link>
          <div className="flex items-center gap-1">
            <Link href="/cart" aria-label={he.nav.cart(lines.length)} className="relative grid size-11 place-items-center text-ivory">
              <BagMark />
              {lines.length > 0 && (
                <span className="absolute top-1.5 end-1 grid min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[11px] font-bold leading-[18px] text-white">
                  <Ltr>{lines.length}</Ltr>
                </span>
              )}
            </Link>
            <button type="button" onClick={() => setOpen(true)} aria-label={he.nav.account} aria-haspopup="menu"
              className="grid size-11 place-items-center text-ivory">
              <PersonMark />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={he.nav.account}>
          <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <nav className="animate-slide-up absolute inset-x-0 bottom-0 mx-auto max-w-[480px] rounded-t-3xl bg-ink-2 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center ring-1 ring-ivory/10"
            role="menu">
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
