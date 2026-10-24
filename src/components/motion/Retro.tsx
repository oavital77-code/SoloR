// The retro illustrations (design: נייר קצבים × אפליקציה, original drawings): a steak, a sausage, ribs and bacon in
// orange with cream outlines, for the teal bands of the loader and the shop page.
export type RetroKind = "steak" | "sausage" | "ribs" | "bacon";

export function RetroIcon({ kind, className, style }: { kind: RetroKind; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 70" className={className} style={style} aria-hidden>
      {kind === "steak" && <>
        <path d="M10 36 C10 14 40 6 62 10 C86 14 94 26 92 42 C90 58 74 66 52 64 C30 62 10 56 10 36 Z" fill="#E8562A" stroke="#F7D8C4" strokeWidth="5" />
        <path d="M24 34 C34 28 44 44 58 38" fill="none" stroke="#F7D8C4" strokeWidth="3" strokeLinecap="round" />
        <circle cx="74" cy="34" r="6" fill="#F7D8C4" />
      </>}
      {kind === "sausage" && <>
        <rect x="8" y="24" width="84" height="22" rx="11" fill="#E8562A" stroke="#F7D8C4" strokeWidth="4" />
        <path d="M24 30 L36 30 M50 30 L62 30" stroke="#F7D8C4" strokeWidth="3" strokeLinecap="round" />
      </>}
      {kind === "ribs" && <>
        <rect x="8" y="14" width="84" height="38" rx="8" fill="#E8562A" />
        <path d="M24 14 L24 60 M42 14 L42 60 M60 14 L60 60 M78 14 L78 60" stroke="#F7D8C4" strokeWidth="5" strokeLinecap="round" />
      </>}
      {kind === "bacon" && (
        <path d="M6 30 C20 18 30 42 46 30 C62 18 72 42 94 30 L94 44 C72 56 62 32 46 44 C30 56 20 32 6 44 Z" fill="#E8562A" stroke="#F7D8C4" strokeWidth="3" />
      )}
    </svg>
  );
}

const KINDS: RetroKind[] = ["steak", "sausage", "ribs", "bacon"];
const TILT = [-14, 10, -4, 18, -20];
/** n icons in a fixed, mixed order with their tilts */
export const retroSet = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ kind: KINDS[(i * 3 + Math.floor(i / 4)) % 4], tilt: TILT[i % 5] }));
