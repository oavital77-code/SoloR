"use client";
// Lists that slide in (design: נייר קצבים × אפליקציה, sketch 5): the rows of a list come in one after the other the
// first time they are there — the cart's cuts, the orders, the butcher's open orders. Rows added later just appear.
import { useRef } from "react";
import { afterLoader, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

export function useStagger<T extends HTMLElement>(ready: boolean) {
  const ref = useRef<T>(null);
  const done = useRef(false);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!ready || !el || done.current) return;
    done.current = true;
    if (reducedMotion()) return;
    const rows = Array.from(el.children) as HTMLElement[];
    if (!rows.length) return;
    const { gsap } = motion();
    gsap.set(rows, { x: (i: number) => (i % 2 ? -48 : 48), opacity: 0 });
    let t: gsap.core.Tween | null = null;
    const off = afterLoader(() => {
      t = gsap.to(rows, { x: 0, opacity: 1, duration: 0.55, stagger: 0.07, ease: "power3.out", clearProps: "transform,opacity" });
    });
    return () => { off(); t?.progress(1).kill(); gsap.set(rows, { clearProps: "transform,opacity" }); };
  }, [ready]);
  return ref;
}
