"use client";
// Shown above the tab bar whenever the cart has something in it: how many lines, the estimate, and the way in.
// It also leaves room at the end of the page so nothing hides behind it.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { useCart } from "@/lib/cart";
import { formatAgorot } from "@/lib/pricing";

const HIDDEN = ["/cart", "/discover", "/profile"];

export function CartBar() {
  const path = usePathname();
  const lines = useCart();
  if (lines.length === 0 || HIDDEN.includes(path) || path.startsWith("/cut/")) return null;
  const est = lines.reduce((s, l) => s + l.estAgorot, 0);
  return (
    <>
      <div className="h-16" aria-hidden />
      <Link href="/cart"
        className="animate-toast-in fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex h-12 w-[calc(100%-1.5rem)] max-w-[456px] items-center justify-center gap-3 rounded-xl bg-ivory text-[15px] font-semibold text-ink shadow-lg shadow-black/40">
        <span>{he.cart.bar(lines.length)}</span>
        <span className="text-ink/40" aria-hidden>·</span>
        <Ltr>₪{formatAgorot(est).replace(/\.00$/, "")}</Ltr>
        <span className="text-ink/40" aria-hidden>·</span>
        <span className="underline underline-offset-4">{he.cart.toCart}</span>
      </Link>
    </>
  );
}
