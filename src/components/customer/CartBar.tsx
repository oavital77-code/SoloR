"use client";
// Shown above the tab bar whenever the cart has something in it (design system: CartBar): the bordeaux pill with the
// number of lines, how many shops, and the estimate.
// It also leaves room at the end of the page so nothing hides behind it.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { useCart } from "@/lib/cart";
import { formatAgorot } from "@/lib/pricing";

const HIDDEN = ["/cart", "/checkout", "/settings"];

export function CartBar() {
  const path = usePathname();
  const lines = useCart();
  if (lines.length === 0 || HIDDEN.includes(path) || path.startsWith("/cut/")) return null;
  const est = lines.reduce((s, l) => s + l.estAgorot, 0);
  const shops = new Set(lines.map((l) => l.butcherId)).size;
  return (
    <>
      <div className="h-20" aria-hidden />
      <Link href="/cart" aria-label={he.cart.bar(lines.length)}
        className="sr-cartbar animate-toast-in fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto w-[calc(100%-1.5rem)] max-w-[456px] lg:bottom-6">
        <span className="sr-cartbar__count"><Ltr>{lines.length}</Ltr></span>
        <span className="sr-cartbar__label">{he.cart.toCart}{shops > 1 ? ` · ${he.cart.shopsShort(shops)}` : ""}</span>
        <span className="sr-cartbar__sum"><Ltr>₪{formatAgorot(est).replace(/\.00$/, "")}</Ltr></span>
      </Link>
    </>
  );
}
