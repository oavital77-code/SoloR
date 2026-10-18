// The SoloR wordmark (design system: Logos): "Solo" in ivory, "R" in bordeaux, Frank Ruhl Libre 700 in outlines.
// Never tilted, recoloured or shadowed; at least 20px tall. The light version (dark ink) sits on the counter screens.
import { clsx } from "clsx";

export function Logo({ height = 28, light, className }: { height?: number; light?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={light ? "/brand/wordmark-on-light.svg" : "/brand/wordmark-on-dark.svg"} alt="SoloR"
      style={{ height }} className={clsx("inline-block w-auto", className)} />
  );
}
