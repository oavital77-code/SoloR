// The Butcherplace marks (24.10.2026): the wordmark (black letters; turned cream on a dark band), the emblem (the
// butcher in the top hat inside the red ring) and the full logo (the emblem over the wordmark), for light grounds.
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";

export function Logo({ height = 28, light, className }: { height?: number; light?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/bp-wordmark.webp" alt={he.app.name} width={598} height={153}
      style={{ height }} className={clsx("inline-block w-auto", !light && "invert", className)} />
  );
}

export function Emblem({ size = 44, className, alt = "" }: { size?: number; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/bp-emblem.webp" alt={alt} width={256} height={271}
      style={{ height: size, width: "auto" }} className={clsx("inline-block object-contain", className)} />
  );
}

export function FullLogo({ size = 190, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/bp-full.webp" alt={he.app.name} width={478} height={497}
      style={{ height: size, width: "auto" }} className={clsx("inline-block object-contain", className)} />
  );
}
