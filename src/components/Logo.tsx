import { clsx } from "clsx";

export function Logo({ className }: { className?: string }) {
  return (
    <span dir="ltr" className={clsx("inline-block font-display font-bold tracking-tight", className)}>
      Solo<span className="text-brand">R</span>
    </span>
  );
}
