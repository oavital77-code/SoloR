"use client";
// The feed's headline as a sign hanging over the counter (founders' pick of three sketches, 25.10.2026; text and colours
// 26.10.2026): a white enamel sign on two chains, "עכשיו נחתך / על הבוצ׳ר" in the middle, an "open" sticker, and under
// it the black counter with a bell. It swings in once the loader is gone and settles into a slow sway; the bell rings
// then, and again whenever new cuts come in. With reduced motion it simply hangs there.
import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { afterLoader, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

export function HangingSign({ eyebrow, open, ring }: {
  eyebrow: React.ReactNode;
  /** a counter is open right now: the sticker says so, with a blinking dot */
  open: boolean;
  /** new cuts waiting: each rise rings the bell */
  ring: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const bell = useRef<(() => void) | null>(null);

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el || reducedMotion()) return;
    const { gsap } = motion();
    const q = gsap.utils.selector(el);
    const ctx = gsap.context(() => {
      gsap.set(q("[data-line]"), { yPercent: 110 });
      gsap.set(q("[data-swing]"), { rotate: -9, transformOrigin: "50% 0%" });
      gsap.set(q("[data-ding]"), { opacity: 0, scale: 0.4 });
      bell.current = () => {
        gsap.timeline()
          .to(q("[data-bell]"), { rotate: 16, transformOrigin: "50% 15%", duration: 0.07, yoyo: true, repeat: 7, ease: "none" })
          .fromTo(q("[data-ding]"), { opacity: 0, scale: 0.4, x: 0 }, { opacity: 1, scale: 1, x: -4, duration: 0.25, ease: "back.out(3)" }, 0)
          .to(q("[data-ding]"), { opacity: 0, x: -12, duration: 0.4, delay: 0.5 });
      };
    }, el);
    const off = afterLoader(() => ctx.add(() => {
      gsap.to(q("[data-swing]"), { rotate: 0, duration: 2.6, ease: "elastic.out(1, 0.25)" });
      gsap.to(q("[data-swing]"), { rotate: 0.9, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 2.6 });
      gsap.to(q("[data-line]"), { yPercent: 0, duration: 0.9, stagger: 0.12, ease: "power4.out", delay: 0.3 });
      gsap.delayedCall(2, () => bell.current?.());
    }));
    return () => { off(); bell.current = null; ctx.revert(); };
  }, []);

  const last = useRef(ring);
  useEffect(() => {
    if (ring > last.current) bell.current?.();
    last.current = ring;
  }, [ring]);

  return (
    <div ref={root} className="relative mx-auto w-full max-w-[360px] pb-1">
      <div data-swing className="relative pt-[52px]">
        <svg viewBox="0 0 300 54" className="absolute inset-x-0 top-0 mx-auto h-[54px] w-[300px]" aria-hidden>
          <path d="M60 0 L60 48 M240 0 L240 48" stroke="var(--color-ivory)" strokeWidth="3" strokeDasharray="7 4" />
          <circle cx="60" cy="49" r="5" fill="none" stroke="var(--color-ivory)" strokeWidth="3" />
          <circle cx="240" cy="49" r="5" fill="none" stroke="var(--color-ivory)" strokeWidth="3" />
        </svg>
        <div className="relative rounded-[24px] border-4 border-ivory bg-sticker p-2 text-[#111111] shadow-[0_14px_0_-6px_rgba(17,17,17,0.25)]">
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-[#cfcfcf] px-3 pt-3 pb-2 text-center">
            <p className="m-0 font-mono text-[11px] leading-4 tracking-[0.04em] text-[#5e5e5e]">{eyebrow}</p>
            <h1 className="m-0 mt-1 text-[48px] leading-[48px] font-black lg:text-[56px] lg:leading-[56px]">
              <span className="block overflow-hidden pb-1"><span data-line className="block">{he.feed.headline[0]}</span></span>
              <span className="block overflow-hidden pb-1"><span data-line className="block text-[#7a1020]">{he.feed.headline[1]}</span></span>
            </h1>
          </div>
          <span className={clsx("absolute -top-3.5 left-3.5 flex -rotate-[8deg] items-center gap-1.5 rounded-full border-2 border-[#111111] px-3 py-0.5 text-[13px] font-extrabold",
            open ? "bg-[#7a1020] text-sticker" : "bg-kraft text-[#5e5e5e]")}>
            {open && <span className="size-2 animate-pulse rounded-full bg-sticker" aria-hidden />}
            {open ? he.feed.signOpen : he.feed.signClosed}
          </span>
        </div>
      </div>
      {/* the counter under the sign, and its bell */}
      <div aria-hidden className="relative mt-10 h-[30px] bg-[#111111] max-lg:-mx-4">
        <svg data-bell viewBox="0 0 40 36" className="absolute -top-[33px] right-6 h-9 w-10">
          <path d="M6 30 C6 14 12 8 20 8 C28 8 34 14 34 30 Z" fill="#ffffff" stroke="#111111" strokeWidth="2.5" />
          <rect x="2" y="29" width="36" height="5" rx="2" fill="#111111" /><circle cx="20" cy="6" r="3" fill="#111111" />
        </svg>
        <span data-ding className="absolute -top-[22px] right-[72px] font-mono text-[13px] font-semibold text-[#7a1020] opacity-0">{he.feed.ding}</span>
      </div>
    </div>
  );
}
