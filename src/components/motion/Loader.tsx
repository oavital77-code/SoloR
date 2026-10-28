"use client";
// The opening loader (founders 28.10.2026): the butcher of the logo leans out of the logo's ring, swings his cleaver and
// strikes the screen — a slash across it, the screen shakes — then, once the page has loaded, the paper wipes up and
// the butcher flies into the header's emblem. Only on the first entry of a session (the inline script in the root
// layout marks a repeat visit before anything paints); never with reduced motion; a tap skips it. Rendered on the
// server so it is the very first thing on screen; if scripts never run, CSS hides it after a few seconds.
import { useRef, useState } from "react";
import { RetroIcon, retroSet } from "./Retro";
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
      const man = q(".bp-loader__butcher");
      const intro = gsap.timeline({ delay: 0.15 });
      // the logo lands, framed by its ring
      intro.to(man, { autoAlpha: 1, scale: 1, transformOrigin: "50% 80%", duration: 0.6, ease: "back.out(1.8)" })
        // he leans out of the ring: it no longer holds him, he grows toward us
        .to(man, { clipPath: "circle(75% at 50% 50%)", scale: 1.35, y: -24, duration: 0.55, ease: "power2.out" }, "+=0.15")
        // the wind-up, the cleaver back over his shoulder
        .to(man, { rotate: -14, x: 18, duration: 0.35, ease: "power2.inOut" })
        // the strike
        .to(man, { rotate: 12, x: -14, y: 26, scale: 1.55, duration: 0.13, ease: "power4.in" })
        .addLabel("hit")
        .to(q(".bp-slash path"), { strokeDashoffset: 0, duration: 0.14, ease: "power3.out", stagger: 0.03 }, "hit")
        .fromTo(q(".bp-flash"), { opacity: 0.7 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, "hit")
        .fromTo(el, { x: 0 }, { x: 9, duration: 0.05, yoyo: true, repeat: 5, ease: "none", clearProps: "transform", immediateRender: false }, "hit")
        .to(man, { rotate: 4, x: 0, y: 6, scale: 1.4, duration: 0.5, ease: "elastic.out(1, 0.5)" }, "hit+=0.08")
        .to(q(".bp-word"), { y: 0, autoAlpha: 1, stagger: 0.08, duration: 0.45, ease: "power3.out" }, "hit+=0.15");
      gsap.to(q(".bp-band"), { xPercent: 50, duration: 16, ease: "none", repeat: -1 });

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
        tl.to(q(".bp-slash, .bp-loader__ring"), { autoAlpha: 0, duration: 0.3 }, 0)
          .to(q(".bp-word"), { y: 40, autoAlpha: 0, stagger: 0.03, duration: 0.4, ease: "power2.in" }, 0)
          .to(q(".bp-loader__band"), { yPercent: 100, duration: 0.5, ease: "power2.in" }, 0)
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
      <div className="bp-loader__paper absolute inset-0 flex flex-col items-center overflow-hidden bg-kraft pt-[calc(16vh+env(safe-area-inset-top))] text-[#111111]">
        <div className="h-[230px] shrink-0" />
        <div className="mt-16 flex gap-2 text-[22px] font-extrabold">
          <span className="bp-word">פורסים</span><span className="bp-word">לך</span><span className="bp-word">את</span>
          <span className="bp-word text-[#7a1020]">הנתח</span>
        </div>
        <span className="bp-word mt-2 font-mono text-xs tracking-[0.1em] text-[#5e5e5e]">BUTCHERPLACE · חי מהדלפק</span>
        <div className="bp-loader__band absolute inset-x-0 bottom-0 h-[120px] overflow-hidden border-t-[3px] border-[#111111] bg-teal">
          <div className="bp-band absolute right-0 flex h-full w-max items-center gap-[26px]">
            {[...band, ...band].map((b, i) => (
              <RetroIcon key={i} kind={b.kind} className="h-[62px] w-[88px] shrink-0" style={{ transform: `rotate(${b.tilt}deg)` }} />
            ))}
          </div>
        </div>
      </div>
      {/* the logo's ring stays on the paper; the butcher leans out of it (above the paper, so he can fly to the header) */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(16vh+env(safe-area-inset-top))] flex justify-center">
        <div className="relative grid size-[230px] place-items-center">
          <span className="bp-loader__ring absolute inset-[10px] rounded-full border-[6px] border-[#7a1020]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bp-emblem.webp" alt="" width={256} height={271} className="bp-loader__butcher relative z-[1] h-[230px] w-auto" />
        </div>
      </div>
      {/* the strike: a slash across the screen and a flash */}
      <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" className="bp-slash pointer-events-none absolute inset-0 size-full">
        <path d="M30 150 L180 400 L160 420 L360 740" pathLength={1} fill="none" stroke="#111111" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M30 150 L180 400 L160 420 L360 740" pathLength={1} fill="none" stroke="#7a1020" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="bp-flash pointer-events-none absolute inset-0 bg-white" />
    </div>
  );
}
