"use client";
// A post revealed as it scrolls into view (design: נייר קצבים × אפליקציה, sketch 3): the card rises, its photo opens
// from the bottom, the title slides in and the trays follow one by one. Once per post; whatever is already on screen
// waits for the opening loader. An IntersectionObserver decides, so new posts above or a late image never leave a
// post hidden.
import { afterLoader, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

export function useReveal(ref: React.RefObject<HTMLElement | null>, enabled = true) {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled || reducedMotion()) return;
    const { gsap } = motion();
    const all = (k: string) => el.querySelectorAll(`[data-reveal="${k}"]`);
    const tl = gsap.timeline({ paused: true });
    tl.from(el, { y: 50, opacity: 0, duration: 0.6, ease: "power3.out", clearProps: "transform,opacity" })
      .fromTo(all("photo"), { clipPath: "inset(100% 0% 0% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "power4.inOut", clearProps: "clipPath" }, "<0.1")
      .from(all("title"), { x: 30, opacity: 0, duration: 0.5, clearProps: "transform,opacity" }, "<0.2")
      .from(all("sticker"), { scale: 0, rotate: -40, duration: 0.5, ease: "back.out(3)", clearProps: "transform" }, "-=0.3")
      .from(all("tray"), { x: 40, opacity: 0, stagger: 0.1, duration: 0.45, ease: "power3.out", clearProps: "transform,opacity" }, "-=0.4");
    let io: IntersectionObserver | null = null;
    const off = afterLoader(() => {
      io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io?.disconnect();
        tl.play();
      }, { rootMargin: "0px 0px -8% 0px" });
      io.observe(el);
    });
    return () => { off(); io?.disconnect(); tl.progress(1).kill(); };
  }, [enabled]);
}
