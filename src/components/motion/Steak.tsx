// The illustrated steak of the loader, drawn once and shown as three slices (each clips the same drawing), so it can
// be cut apart: the right part, the middle and the left part.
const Drawing = () => (
  <svg viewBox="0 0 240 170" width="100%" height="100%" aria-hidden>
    <path d="M36 86 C34 40 92 22 140 30 C188 38 214 58 210 92 C206 124 172 146 124 144 C78 142 38 132 36 86 Z" fill="#C8202C" stroke="#F4A3A8" strokeWidth="9" />
    <path d="M62 74 C84 60 104 96 140 84" fill="none" stroke="#F4A3A8" strokeWidth="5" strokeLinecap="round" />
    <path d="M70 108 C96 98 116 124 150 112" fill="none" stroke="#F4A3A8" strokeWidth="5" strokeLinecap="round" />
    <circle cx="172" cy="76" r="13" fill="#FFF3EA" stroke="#F4A3A8" strokeWidth="6" />
  </svg>
);

export function SteakSlices({ className }: { className?: string }) {
  return (
    <div className={`bp-steak ${className ?? ""}`} aria-hidden>
      <div className="bp-sl bp-sl1" style={{ clipPath: "inset(0 0 0 64%)" }}><Drawing /></div>
      <div className="bp-sl bp-sl2" style={{ clipPath: "inset(0 36% 0 36%)" }}><Drawing /></div>
      <div className="bp-sl bp-sl3" style={{ clipPath: "inset(0 64% 0 0)" }}><Drawing /></div>
    </div>
  );
}

/** A page still loading (a slow navigation): the small steak, cutting itself apart and closing again. */
export function PageLoader({ label = "טוען…" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label={label}>
      <div className="flex flex-col items-center gap-3">
        <SteakSlices className="bp-steak--loop h-[68px] w-24" />
        <span className="font-mono text-[11px] tracking-[0.12em] text-stone">{label}</span>
      </div>
    </div>
  );
}
