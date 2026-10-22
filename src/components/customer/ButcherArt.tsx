// The page's background art (design: backgrounds B+C, 22.10.2026): on the butcher-paper ground, big black
// silhouettes of a cleaver and a knife cropped at the edges, a few red line drawings (a steak, a meat hook) and the
// round red stamp. Purely decorative, behind everything, never taking a tap; smaller on a phone.
export function ButcherArt() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <svg viewBox="0 0 120 120" className="absolute top-[38%] -left-24 size-72 -rotate-[22deg] fill-ivory opacity-[.07] lg:-left-20 lg:size-[520px]">
        <path d="M10 30h70a8 8 0 0 1 8 8v26a10 10 0 0 1-10 10H18a8 8 0 0 1-8-8z" /><path d="M88 46h22a6 6 0 0 1 0 12H88z" />
      </svg>
      <svg viewBox="0 0 120 120" className="absolute -right-28 bottom-[-6%] size-80 rotate-[18deg] fill-ivory opacity-[.07] lg:size-[560px]">
        <path d="M8 72C34 54 70 40 96 36l2 8L18 78z" /><path d="M96 36l18-4 2 8-18 4z" />
      </svg>
      <svg viewBox="0 0 120 120" className="absolute bottom-[12%] left-[6%] hidden size-32 rotate-[10deg] opacity-30 lg:block"
        fill="none" stroke="var(--bordeaux)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 44c10-24 64-30 82-8 15 19-4 50-38 52-32 2-54-20-44-44z" /><path d="M34 46c12-12 40-14 52-2" /><circle cx="56" cy="62" r="6" />
      </svg>
      <svg viewBox="0 0 120 120" className="absolute top-[42%] right-[6%] hidden size-28 opacity-30 lg:block"
        fill="none" stroke="var(--bordeaux)" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="60" cy="16" r="7" /><path d="M60 23v42a16 16 0 1 1-16 16" />
      </svg>
      <div className="absolute top-[56%] left-[7%] hidden size-32 -rotate-12 place-items-center rounded-full border-2 border-brand text-center text-xs leading-4 text-brand opacity-45 lg:grid">
        <span>קצביות<br /><b className="text-xl">SoloR</b><br />שכונתיות</span>
      </div>
    </div>
  );
}
