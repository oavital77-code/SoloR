// A shop's mark (design system: ShopMark): its logo, or the first letter of the meaningful part of its name in the
// display serif, gold on the raised surface — always inside the gold→bordeaux ring that is also the SoloR symbol's,
// so every shop lives inside the brand. Sizes: sm 28 (cart rows, tiles), md 40 (post header), lg 72 (shop page).
import { clsx } from "clsx";
import { mediaUrl } from "@/lib/cut-helpers";
import type { Butcher } from "@/lib/types";

const SIZE = { sm: "size-7 text-[12px]", md: "size-10 text-[18px]", lg: "size-[72px] text-[32px]", xl: "size-16 text-[28px]" } as const;

// words that name the trade, not the shop ("קצביית האחים חדיף" → ח, "מעדני בן עזרא" → ב)
const GENERIC = new Set(["קצביית", "קצבייה", "קצביה", "הקצבייה", "אטליז", "האטליז", "מעדני", "האחים", "של"]);

export function monogram(name: string): string {
  const words = name.trim().split(/\s+/);
  const word = words.find((w) => !GENERIC.has(w)) ?? words[0] ?? "";
  return word.charAt(0);
}

export function ShopMark({ shop, size = "md", className }: {
  shop: Pick<Butcher, "name" | "logo_path">; size?: keyof typeof SIZE; className?: string;
}) {
  return (
    <span aria-hidden className={clsx("block shrink-0 rounded-full p-[2px] [background:conic-gradient(from_200deg,var(--gold),var(--bordeaux),var(--gold))]", SIZE[size], className)}>
      {shop.logo_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(shop.logo_path)} alt="" className="h-full w-full rounded-full border-2 border-ink-2 bg-ink-3 object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full border-2 border-ink-2 bg-ink-3 font-display font-bold leading-none text-gold">
          {monogram(shop.name)}
        </span>
      )}
    </span>
  );
}
