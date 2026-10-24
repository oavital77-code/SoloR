"use client";
// The opening loader (design: נייר קצבים × אפליקציה, sketch 1 + the combined journey): the logo lands, a knife cuts
// the steak into three, and once the page has loaded the slices fall away, the paper wipes up and the logo flies into
// the header's emblem. Only on the first entry of a session (the inline script in the root layout marks a repeat
// visit before anything paints); never with reduced motion; a tap skips it. Rendered on the server so it is the very
// first thing on screen; if scripts never run, CSS hides it after a few seconds.
import { useRef, useState } from "react";
import { FullLogo } from "../Logo";
import { RetroIcon, retroSet } from "./Retro";
import { SteakSlices } from "./Steak";
import { loaderDone, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

export const SEEN_KEY = "bp.seen";
/** runs before the loader is parsed: a repeat visit in this session hides it at once */
export const seenScript = `try{if(sessionStorage.getItem("${SEEN_KEY}"))document.documentElement.dataset.bpSeen="1"}catch(e){}`;

const MAX_WAIT = 5000;
const band = retroSet(16);

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
      const intro = gsap.timeline({ delay: 0.15 });
      intro.to(q(".bp-loader__logo"), { y: 0, autoAlpha: 1, scale: 1, duration: 0.8, ease: "back.out(1.8)" })
        .to(q(".bp-steak"), { scale: 1, rotate: 0, autoAlpha: 1, duration: 0.6, ease: "back.out(2.2)" }, "-=0.4")
        .to(q(".bp-word"), { y: 0, autoAlpha: 1, stagger: 0.1, duration: 0.5, ease: "power3.out" }, "<0.1")
        .fromTo(q(".bp-crumb"), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.05, duration: 0.25 }, "<0.2")
        .to(q(".bp-crumb"), { y: -18, opacity: 0, duration: 0.5 })
        .fromTo(q(".bp-knife"), { y: -60, opacity: 0 }, { y: 10, opacity: 1, duration: 0.35, ease: "power2.in" }, "-=0.2")
        .to(q(".bp-knife"), { y: 60, opacity: 0, duration: 0.25, ease: "power2.out" })
        .to(q(".bp-sl1"), { x: 30, rotate: 9, duration: 0.55, ease: "power3.out" }, "<")
        .to(q(".bp-sl3"), { x: -30, rotate: -9, duration: 0.55, ease: "power3.out" }, "<")
        .to(q(".bp-sl2"), { y: -12, rotate: 3, duration: 0.55, ease: "power3.out" }, "<");
      gsap.to(q(".bp-band"), { xPercent: 50, duration: 16, ease: "none", repeat: -1 });

      exit = () => {
        if (leaving) return;
        leaving = true;
        try { window.sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
        intro.progress(1);
        const logo = q(".bp-loader__logo")[0] as HTMLElement;
        const target = document.querySelector<HTMLElement>("[data-bp-header] img");
        const a = logo.getBoundingClientRect();
        const b = target?.getBoundingClientRect();
        const tl = gsap.timeline({ onComplete: () => setOn(false) });
        tl.to(q(".bp-sl"), { y: 620, rotate: (i: number) => [40, -25, -45][i], duration: 0.8, ease: "power2.in", stagger: 0.07 })
          .to(q(".bp-word"), { y: 40, autoAlpha: 0, stagger: 0.03, duration: 0.4, ease: "power2.in" }, 0)
          .to(q(".bp-loader__band"), { yPercent: 100, duration: 0.5, ease: "power2.in" }, 0)
          .call(loaderDone, undefined, 0.45)
          .to(q(".bp-loader__paper"), { clipPath: "inset(0% 0% 100% 0%)", duration: 0.8, ease: "power4.inOut" }, 0.45);
        if (b && b.width > 0 && b.top >= 0 && b.bottom <= window.innerHeight) {
          tl.to(logo, {
            x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2),
            scale: b.height / a.height, duration: 0.8, ease: "power4.inOut",
          }, 0.45).to(logo, { autoAlpha: 0, duration: 0.2 }, ">-0.15");
        } else {
          tl.to(logo, { y: -60, autoAlpha: 0, duration: 0.6, ease: "power2.in" }, 0.45);
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
      <div className="bp-loader__paper absolute inset-0 flex flex-col items-center overflow-hidden bg-kraft text-[#1b1712]">
        <div className="h-[calc(236px+env(safe-area-inset-top))] shrink-0" />
        <div className="relative mt-6 h-[170px] w-[240px]">
          <SteakSlices className="size-full" />
          <span className="bp-crumb absolute top-[10px] left-[30px] size-2.5 rounded-full bg-[#c8202c]" />
          <span className="bp-crumb absolute top-[140px] left-3 size-[7px] rounded-full bg-pink" />
          <span className="bp-crumb absolute top-1 right-9 size-2 rounded-full bg-pink" />
          <span className="bp-crumb absolute top-[150px] right-5 size-[11px] rounded-full bg-[#c8202c]" />
          <span className="bp-knife absolute -top-5 left-1/2 -ml-px h-[210px] w-[3px] rounded-sm bg-[#1b1712]" />
        </div>
        <div className="mt-7 flex gap-2 text-[22px] font-extrabold">
          <span className="bp-word">פורסים</span><span className="bp-word">לך</span><span className="bp-word">את</span>
          <span className="bp-word text-[#c8202c]">הנתח</span>
        </div>
        <span className="bp-word mt-2 font-mono text-xs tracking-[0.1em] text-[#5c5244]">BUTCHERPLACE · חי מהדלפק</span>
        <div className="bp-loader__band absolute inset-x-0 bottom-0 h-[120px] overflow-hidden border-t-[3px] border-[#1b1712] bg-teal">
          <div className="bp-band absolute right-0 flex h-full w-max items-center gap-[26px]">
            {[...band, ...band].map((b, i) => (
              <RetroIcon key={i} kind={b.kind} className="h-[62px] w-[88px] shrink-0" style={{ transform: `rotate(${b.tilt}deg)` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[calc(46px+env(safe-area-inset-top))] flex justify-center">
        <FullLogo size={190} className="bp-loader__logo" />
      </div>
    </div>
  );
}
