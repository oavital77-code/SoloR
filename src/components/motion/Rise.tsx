"use client";
// Headlines that rise (design: נייר קצבים × אפליקציה): each line slides up out of its own mask, one after the other,
// once the opening loader is out of the way. With reduced motion the lines are simply there.
import { useRef } from "react";
import { clsx } from "clsx";
import { afterLoader, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

type Line = React.ReactNode | { text: React.ReactNode; className?: string };

export function Rise({ as: Tag = "h1", lines, className, delay = 0.1 }: {
  as?: "h1" | "h2" | "p" | "div"; lines: Line[]; className?: string; delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const key = lines.map((l) => (l && typeof l === "object" && "text" in l ? String(l.text) : String(l))).join("|");
  useRise(ref, delay, key);
  return (
    <Tag ref={ref as React.Ref<never>} className={className}>
      {lines.map((l, i) => {
        const line = l && typeof l === "object" && "text" in l ? l : { text: l };
        return (
          <span key={i} className="block overflow-hidden pb-[0.08em]">
            <span data-rise className={clsx("block", line.className)}>{line.text}</span>
          </span>
        );
      })}
    </Tag>
  );
}

/** rise the [data-rise] lines inside ref; again whenever `key` changes */
export function useRise(ref: React.RefObject<HTMLElement | null>, delay = 0.1, key?: string) {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lines = el.querySelectorAll("[data-rise]");
    if (!lines.length) return;
    const { gsap } = motion();
    if (reducedMotion()) { gsap.set(lines, { yPercent: 0 }); return; }
    gsap.set(lines, { yPercent: 110 });
    let tween: gsap.core.Tween | null = null;
    const off = afterLoader(() => {
      tween = gsap.to(lines, { yPercent: 0, duration: 0.9, stagger: 0.12, ease: "power4.out", delay });
    });
    return () => { off(); tween?.kill(); };
  }, [key]);
}

/** a page's big headline shrinks and fades as the page scrolls away from it (scrubbed with the scroll) */
export function useShrinkOnScroll(ref: React.RefObject<HTMLElement | null>) {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const { gsap } = motion();
    const t = gsap.to(el, { scale: 0.8, opacity: 0.6, ease: "none",
      scrollTrigger: { trigger: el, start: "top 64px", end: "bottom top", scrub: true } });
    return () => { t.scrollTrigger?.kill(); t.kill(); gsap.set(el, { clearProps: "transform,opacity" }); };
  }, []);
}
