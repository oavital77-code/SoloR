"use client";
// The cut page's end of the hand-off: the post's picture, from where it was in the feed, grows into the page's big
// square frame at the top while the page loads, then fades into the real frame. Phones and tablets only (a wide
// screen lays the page out differently); never with reduced motion.
import { useEffect, useRef } from "react";
import { takeHandoff } from "@/lib/handoff";
import { motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

export function useGrowFromPost(ready: boolean) {
  const ghost = useRef<HTMLImageElement | null>(null);

  useIsoLayoutEffect(() => {
    const h = takeHandoff();
    if (!h || reducedMotion() || window.innerWidth >= 1024) return;
    const { gsap } = motion();
    const img = document.createElement("img");
    img.src = h.src;
    img.alt = "";
    // in the document, not fixed: if the page then scrolls to a tray, the picture goes up with the frame
    Object.assign(img.style, {
      position: "absolute", zIndex: "45", objectFit: "cover", pointerEvents: "none", margin: "0",
      left: `${h.rect.left + window.scrollX}px`, top: `${h.rect.top + window.scrollY}px`,
      width: `${h.rect.width}px`, height: `${h.rect.height}px`, borderRadius: "18px",
    });
    document.body.appendChild(img);
    ghost.current = img;
    const w = Math.min(window.innerWidth, 480);
    gsap.to(img, { left: (window.innerWidth - w) / 2, top: 0, width: w, height: w, borderRadius: 0, duration: 0.65, ease: "power3.inOut" });
    const bail = window.setTimeout(() => fade(img, 0), 4000);
    return () => { window.clearTimeout(bail); gsap.killTweensOf(img); img.remove(); ghost.current = null; };
  }, []);

  useEffect(() => {
    const img = ghost.current;
    if (!ready || !img) return;
    fade(img, 0.55);
  }, [ready]);
}

function fade(img: HTMLImageElement, delay: number) {
  const { gsap } = motion();
  gsap.to(img, { opacity: 0, duration: 0.35, delay, onComplete: () => img.remove() });
}
