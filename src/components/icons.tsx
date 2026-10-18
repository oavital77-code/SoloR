// SoloR's own thin-line icon set (design system: Icons): 24px, stroke 1.5, round caps, no fill — coloured with
// currentColor. "back" points right because Hebrew reads right to left; "play" is the only filled one.
import { clsx } from "clsx";

type IconProps = { className?: string };
const base = (className?: string) => clsx("inline-block size-5 shrink-0", className);
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconHome = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></svg>
);
export const IconSearch = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
);
export const IconBag = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><path d="M5.5 8.5h13l-1 11.5h-11z" /><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" /></svg>
);
export const IconUser = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.7-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>
);
export const IconPlus = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} strokeWidth={2} aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} strokeWidth={2} aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconClock = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconClose = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><path d="m6.5 6.5 11 11M17.5 6.5l-11 11" /></svg>
);
export const IconBack = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} strokeWidth={1.8} aria-hidden><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></svg>
);
export const IconPlay = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} fill="currentColor" aria-hidden><path d="M8.5 6v12l9.5-6z" /></svg>
);
export const IconAging = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><path d="M7 4h10M7 20h10M8 4c0 4 8 4.5 8 8s-8 4-8 8M16 4c0 4-8 4.5-8 8" /></svg>
);
export const IconStore = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><path d="M4 9.5 5.5 5h13L20 9.5" /><path d="M4 9.5h16v1a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 10.5z" /><path d="M5.5 13.5V20h13v-6.5M10 20v-4h4v4" /></svg>
);
export const IconTruck = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><path d="M3 6.5h11v10H3zM14 10h3.5l3 3.5v3H14" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
);
export const IconCamera = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={base(className)} {...line} aria-hidden><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
);
