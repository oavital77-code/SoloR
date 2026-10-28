// The Butcherplace marks (founders' files, 28.10.2026): the wordmark (black letters; turned cream on a dark band), the
// emblem (the butcher in the top hat inside the red ring, no cleaver) and the full logo (the emblem over the wordmark).
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";

export function Logo({ height = 28, light, className }: { height?: number; light?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/bp-wordmark.webp" alt={he.app.name} width={640} height={158}
      style={{ height }} className={clsx("inline-block w-auto", !light && "invert", className)} />
  );
}

export function Emblem({ size = 44, className, alt = "" }: { size?: number; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/bp-emblem.webp" alt={alt} width={320} height={376}
      style={{ height: size, width: "auto" }} className={clsx("inline-block object-contain", className)} />
  );
}

export function FullLogo({ size = 190, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/bp-full.webp" alt={he.app.name} width={520} height={520}
      style={{ height: size, width: "auto" }} className={clsx("inline-block object-contain", className)} />
  );
}
