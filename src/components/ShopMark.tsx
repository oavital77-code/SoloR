// A shop's mark: its logo when it has one, otherwise the first letter of its name in a quiet circle.
import { clsx } from "clsx";
import { mediaUrl } from "@/lib/cut-helpers";
import type { Butcher } from "@/lib/types";

export function ShopMark({ shop, className }: { shop: Pick<Butcher, "name" | "logo_path">; className?: string }) {
  return shop.logo_path ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaUrl(shop.logo_path)} alt="" className={clsx("shrink-0 rounded-full object-cover ring-1 ring-ivory/15", className ?? "size-8")} />
  ) : (
    <span aria-hidden className={clsx("grid shrink-0 place-items-center rounded-full bg-ink-3 font-display font-bold text-gold ring-1 ring-ivory/15", className ?? "size-8 text-sm")}>
      {shop.name.trim().charAt(0)}
    </span>
  );
}
