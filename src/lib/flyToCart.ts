"use client";
// Added to the cart (design: נייר קצבים × אפליקציה, sketch 5): the cut's picture flies from the finger to the cart in
// the header, which bumps. Without a visible cart (the cut's page on a phone hides the header) or with reduced motion,
// only the toast says so.
import { motion, reducedMotion } from "./motion";

let last: { x: number; y: number; at: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => { last = { x: e.clientX, y: e.clientY, at: Date.now() }; }, { capture: true, passive: true });
}

export function flyToCart(src?: string | null) {
  if (typeof window === "undefined" || reducedMotion()) return;
  const target = Array.from(document.querySelectorAll<HTMLElement>("[data-cart-target]"))
    .find((t) => { const r = t.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; });
  if (!target) return;
  const { gsap } = motion();
  const to = target.getBoundingClientRect();
  const from = last && Date.now() - last.at < 3000 ? last : { x: window.innerWidth / 2, y: window.innerHeight * 0.6 };
  const dot = document.createElement(src ? "img" : "span");
  if (dot instanceof HTMLImageElement && src) { dot.src = src; dot.alt = ""; }
  Object.assign(dot.style, {
    position: "fixed", left: `${from.x - 28}px`, top: `${from.y - 28}px`, width: "56px", height: "56px", borderRadius: "50%",
    objectFit: "cover", border: "3px solid #ffffff", background: "#7a1020", zIndex: "300", pointerEvents: "none",
    boxShadow: "0 8px 20px -8px rgba(17,17,17,.6)",
  });
  document.body.appendChild(dot);
  gsap.timeline({ onComplete: () => dot.remove() })
    .to(dot, { x: to.left + to.width / 2 - from.x, y: to.top + to.height / 2 - from.y, scale: 0.3, duration: 0.7, ease: "power2.in" })
    .to(dot, { opacity: 0, duration: 0.1 })
    .fromTo(target, { scale: 1 }, { scale: 1.25, duration: 0.15, yoyo: true, repeat: 1, ease: "power1.out", clearProps: "transform" }, "-=0.1");
}
