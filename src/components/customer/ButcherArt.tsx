// The page's background art (founders 28.10.2026): our butcher (the logo's emblem) and our cleaver, big and faint,
// cropped at the edges of the screen, with a couple of red line drawings (a steak, a meat hook) on a wide screen.
// Purely decorative, behind everything, never taking a tap; smaller on a phone.
export function ButcherArt() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* the butcher of the logo, in grey */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/bp-emblem.webp" alt="" width={320} height={376}
        className="absolute -bottom-10 -left-16 h-[340px] w-auto -rotate-[8deg] opacity-[.07] grayscale lg:-left-10 lg:h-[620px]" />
      {/* our cleaver: a broad blade with its hole, the wooden handle and its rivets */}
      <svg viewBox="0 0 200 90" className="absolute top-[30%] -right-24 w-[300px] rotate-[24deg] opacity-[.08] lg:-right-16 lg:w-[540px]">
        <path d="M4 10 h118 a6 6 0 0 1 6 6 v50 a10 10 0 0 1 -10 10 H14 a10 10 0 0 1 -10 -10 z" fill="#111111" />
        <circle cx="108" cy="26" r="7" fill="#ffffff" />
        <path d="M128 34 h62 a8 8 0 0 1 0 22 h-62 z" fill="#111111" />
        <circle cx="150" cy="45" r="3.2" fill="#ffffff" /><circle cx="172" cy="45" r="3.2" fill="#ffffff" />
      </svg>
      <svg viewBox="0 0 120 120" className="absolute bottom-[12%] right-[8%] hidden size-32 rotate-[10deg] opacity-30 lg:block"
        fill="none" stroke="var(--bordeaux)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 44c10-24 64-30 82-8 15 19-4 50-38 52-32 2-54-20-44-44z" /><path d="M34 46c12-12 40-14 52-2" /><circle cx="56" cy="62" r="6" />
      </svg>
      <svg viewBox="0 0 120 120" className="absolute top-[12%] left-[6%] hidden size-28 opacity-30 lg:block"
        fill="none" stroke="var(--bordeaux)" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="60" cy="16" r="7" /><path d="M60 23v42a16 16 0 1 1-16 16" />
      </svg>
    </div>
  );
}
