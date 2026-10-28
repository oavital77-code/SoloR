"use client";
// The opening loader (founders' pick, 28.10.2026, "חותמת"): the logo comes down on the paper like a butcher's stamp —
// the paper gives a little, the ink spreads — first in bordeaux ink, then it dries into the logo's own colours, and
// the wordmark rises under it. Once the page has loaded the paper wipes up and the logo settles into the header's
// emblem. Only on the first entry of a session (the inline script in the root layout marks a repeat visit before
// anything paints); never with reduced motion; a tap skips it. Rendered on the server so it is the very first thing on
// screen; if scripts never run, CSS hides it after a few seconds.
import { useRef, useState } from "react";
import { he } from "@/lib/i18n/he";
import { loaderDone, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

export const SEEN_KEY = "bp.seen";
/** runs before the loader is parsed: a repeat visit in this session hides it at once */
export const seenScript = `try{if(sessionStorage.getItem("${SEEN_KEY}"))document.documentElement.dataset.bpSeen="1"}catch(e){}`;

const MAX_WAIT = 5000;

export function Loader() {
  const root = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(true);

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el || document.documentElement.dataset.bpSeen || reducedMotion()) {
      setOn(false);
      loaderDone();
      return;
    }
    const { gsap } = motion();
    const q = gsap.utils.selector(el);
    let leaving = false;
    let exit = () => {};
    const ctx = gsap.context(() => {
      const man = q(".bp-loader__butcher");
      const intro = gsap.timeline({ delay: 0.1 });
      // the stamp comes down, a little turned
      intro.fromTo(man, { autoAlpha: 0, scale: 1.7, rotate: -9, y: -30 }, { autoAlpha: 1, scale: 1, rotate: -2, y: 0, duration: 0.42, ease: "power3.in" }, 0.15)
        .addLabel("thump")
        // the thump: the logo presses into the paper a hair, the ink spreads in a ring
        .fromTo(man, { scaleX: 1, scaleY: 1 }, { scaleX: 1.02, scaleY: 0.96, y: 3, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.out", immediateRender: false }, "thump")
        .fromTo(q(".bp-loader__spread"), { scale: 1, autoAlpha: 1 }, { scale: 16, autoAlpha: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, "thump")
        .to(man, { rotate: 0, duration: 0.6, ease: "elastic.out(1, 0.5)" }, "thump+=0.13")
        // the ink dries into the logo's colours
        .to(q(".bp-loader__ink"), { autoAlpha: 0, duration: 0.9, ease: "sine.inOut" }, "thump+=0.38")
        .to(q(".bp-word"), { y: 0, autoAlpha: 1, stagger: 0.1, duration: 0.5, ease: "power3.out" }, "thump+=0.93");

      exit = () => {
        if (leaving) return;
        leaving = true;
        try { window.sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
        intro.progress(1);
        const logo = man[0] as HTMLElement;
        const target = document.querySelector<HTMLElement>("[data-bp-header] img");
        const a = logo.getBoundingClientRect();
        const b = target?.getBoundingClientRect();
        const tl = gsap.timeline({ onComplete: () => setOn(false) });
        tl.to(q(".bp-word"), { y: -10, autoAlpha: 0, stagger: 0.04, duration: 0.3, ease: "power2.in" }, 0)
          .call(loaderDone, undefined, 0.35)
          .to(q(".bp-loader__paper"), { clipPath: "inset(0% 0% 100% 0%)", duration: 0.8, ease: "power4.inOut" }, 0.35);
        if (b && b.width > 0 && b.top >= 0 && b.bottom <= window.innerHeight) {
          const s = gsap.getProperty(logo, "scale") as number;
          tl.to(logo, {
            x: `+=${b.left + b.width / 2 - (a.left + a.width / 2)}`, y: `+=${b.top + b.height / 2 - (a.top + a.height / 2)}`,
            scale: (s * b.height) / a.height, rotate: 0, duration: 0.8, ease: "power4.inOut",
          }, 0.35).to(logo, { autoAlpha: 0, duration: 0.2 }, ">-0.15");
        } else {
          tl.to(logo, { y: "-=80", autoAlpha: 0, duration: 0.6, ease: "power2.in" }, 0.35);
        }
      };

      const loaded = new Promise<void>((res) => {
        if (document.readyState === "complete") res();
        else window.addEventListener("load", () => res(), { once: true });
      });
      const cap = new Promise<void>((res) => window.setTimeout(res, MAX_WAIT));
      Promise.all([intro.then(() => undefined), Promise.race([loaded, cap])]).then(() => exit());
    }, el);
    const skip = () => exit();
    el.addEventListener("click", skip);
    return () => { el.removeEventListener("click", skip); ctx.revert(); if (!leaving) loaderDone(); };
  }, []);

  if (!on) return null;
  return (
    <div ref={root} data-bp-loader aria-hidden className="bp-loader fixed inset-0 z-[200] cursor-pointer select-none">
      <div className="bp-loader__paper absolute inset-0 flex flex-col items-center overflow-hidden bg-kraft pt-[calc(18vh+env(safe-area-inset-top))]">
        <span className="bp-loader__spread absolute top-[calc(18vh+env(safe-area-inset-top)+130px)] left-1/2 -ml-2.5 size-5 rounded-full border-[3px] border-[#7a1020]/35" />
        <div className="h-[230px] shrink-0" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/bp-wordmark.webp" alt="" width={640} height={158} className="bp-word mt-10 h-[50px] w-auto" />
        <span className="bp-word mt-3 font-mono text-[11px] tracking-[0.12em] text-[#5e5e5e]">BUTCHERPLACE · {he.live.fromCounter}</span>
      </div>
      {/* the logo is above the paper, so it can fly into the header as the paper lifts */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(18vh+env(safe-area-inset-top))] flex justify-center">
        <div className="bp-loader__butcher relative h-[230px] w-[196px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bp-butcher-body.webp" alt="" width={392} height={460} className="size-full" />
          {/* the same logo in bordeaux ink, fading as it dries */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bp-butcher-body.webp" alt="" width={392} height={460} className="bp-loader__ink absolute inset-0 size-full [filter:url(#bp-red-ink)_contrast(1.25)]" />
        </div>
      </div>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="bp-red-ink" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values=".157 .308 .057 0 .478  .281 .553 .103 0 .063  .263 .516 .096 0 .125  0 0 0 1 0" />
        </filter>
      </svg>
    </div>
  );
}
