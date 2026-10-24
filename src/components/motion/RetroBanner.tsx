"use client";
// The shop page's banner (design: נייר קצבים × אפליקציה, sketch 5): the retro meat pattern on teal, tilted; the
// drawings pop in at random and drift slower than the page as it scrolls.
import { useRef } from "react";
import { RetroIcon, retroSet } from "./Retro";
import { afterLoader, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

const ICONS = retroSet(40);

export function RetroBanner({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const { gsap } = motion();
    const pat = el.querySelector("[data-pat]");
    const icons = el.querySelectorAll("[data-pat] svg");
    gsap.set(icons, { scale: 0 });
    const drift = gsap.to(pat, { y: 70, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true } });
    let pop: gsap.core.Tween | null = null;
    const off = afterLoader(() => {
      pop = gsap.to(icons, { scale: 1, stagger: { each: 0.02, from: "random" }, duration: 0.6, ease: "back.out(2)" });
    });
    return () => { off(); pop?.kill(); drift.scrollTrigger?.kill(); drift.kill(); gsap.set([pat, ...icons], { clearProps: "transform" }); };
  }, []);
  return (
    <div ref={ref} className="relative h-[220px] overflow-hidden border-b-[3px] border-[#1b1712] bg-teal lg:h-[260px]">
      <div data-pat aria-hidden className="absolute -inset-x-10 -inset-y-16 grid -rotate-[8deg] grid-cols-4 content-start gap-[18px] p-2.5 sm:grid-cols-6 lg:grid-cols-10">
        {ICONS.map((i, n) => (
          <span key={n} className="grid place-items-center" style={{ transform: `rotate(${i.tilt}deg)` }}>
            <RetroIcon kind={i.kind} className="h-[63px] w-[90px]" />
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}
