"use client";
// The opening loader (founders 28.10.2026): the butcher of the logo lands in his ring, then reaches out of it with his
// arm and the cleaver from his shoulder, winds up and cuts the screen — a slash across it, the screen shakes — and puts
// the cleaver back on his shoulder; once the page has loaded the paper wipes up and the butcher flies into the
// header's emblem. Only on the first entry of a session (the inline script in the root
// layout marks a repeat visit before anything paints); never with reduced motion; a tap skips it. Rendered on the
// server so it is the very first thing on screen; if scripts never run, CSS hides it after a few seconds.
import { useRef, useState } from "react";
import { loaderDone, motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";

export const SEEN_KEY = "bp.seen";
/** runs before the loader is parsed: a repeat visit in this session hides it at once */
export const seenScript = `try{if(sessionStorage.getItem("${SEEN_KEY}"))document.documentElement.dataset.bpSeen="1"}catch(e){}`;

const MAX_WAIT = 5000;
/** the logo without its cleaver (465×492); the arm turns about his shoulder */
const SHOULDER = "120 440";
const INK = "#151515";
const PAPER = "#fdf9ee";

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
      // the slash runs along the cleaver's edge where it hit, across the whole screen, with a jag where it bit
      const slashAlongEdge = () => {
        const m = (q(".bp-arm__edge")[0] as unknown as SVGGraphicsElement | undefined)?.getScreenCTM();
        if (!m) return;
        const a = new DOMPoint(-2, -2).matrixTransform(m), b = new DOMPoint(-2, 114).matrixTransform(m);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
        // the point of the line nearest the middle of the screen, the jag there
        const t = (window.innerWidth / 2 - a.x) * dx + (window.innerHeight / 2 - a.y) * dy;
        const c = { x: a.x + dx * t, y: a.y + dy * t };
        const far = 2 * (window.innerWidth + window.innerHeight);
        const j = 16;
        const d = `M${a.x - dx * far} ${a.y - dy * far} L${c.x} ${c.y} L${c.x - dy * j} ${c.y + dx * j} L${b.x + dx * far - dy * j} ${b.y + dy * far + dx * j}`;
        q(".bp-slash path").forEach((p) => p.setAttribute("d", d));
      };
      const man = q(".bp-loader__butcher");
      const arm = q(".bp-arm");
      gsap.set(arm, { svgOrigin: SHOULDER });
      const intro = gsap.timeline({ delay: 0.15 });
      // the logo lands, framed by its ring
      intro.to(man, { autoAlpha: 1, scale: 1, transformOrigin: "50% 80%", duration: 0.6, ease: "back.out(1.8)" })
        // his hand comes out from behind the shoulder with the cleaver, out of the ring
        .to(q(".bp-arm__flesh"), { opacity: 1, duration: 0.12 }, "+=0.1")
        .to(q(".bp-arm__reach"), { y: -46, duration: 0.4, ease: "power2.out" }, "<")
        .to(arm, { rotate: -30, scale: 1.5, duration: 0.4, ease: "power2.out" }, "<")
        // the wind-up, the cleaver cocked back over his head
        .to(arm, { rotate: -40, scale: 1.8, duration: 0.3, ease: "power2.inOut" })
        // the cut: over the top and down across the screen
        .to(arm, { rotate: 172, scale: 2.4, duration: 0.2, ease: "power3.in" })
        .addLabel("hit")
        .call(slashAlongEdge, undefined, "hit")
        .to(q(".bp-slash path"), { strokeDashoffset: 0, duration: 0.16, ease: "power3.out", stagger: 0.03 }, "hit")
        .fromTo(q(".bp-flash"), { opacity: 0.7 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, "hit")
        .fromTo(el, { x: 0 }, { x: 9, duration: 0.05, yoyo: true, repeat: 5, ease: "none", clearProps: "transform", immediateRender: false }, "hit")
        .to(arm, { rotate: 178, duration: 0.1, ease: "power2.out" }, "hit")
        // back on his shoulder
        .to(arm, { rotate: 0, scale: 1, duration: 0.55, ease: "power3.inOut" }, "hit+=0.3")
        .to(q(".bp-arm__reach"), { y: 0, duration: 0.55, ease: "power3.inOut" }, "<")
        .to(q(".bp-arm__flesh"), { opacity: 0, duration: 0.15 }, ">-0.15")
        .to(q(".bp-word"), { y: 0, autoAlpha: 1, stagger: 0.08, duration: 0.45, ease: "power3.out" }, "hit+=0.15");

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
      </div>
      {/* the logo's ring stays on the paper; the butcher is above it (so he can fly to the header), his arm reaches out */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(16vh+env(safe-area-inset-top))] flex justify-center">
        <div className="relative grid size-[230px] place-items-center">
          <span className="bp-loader__ring absolute inset-[10px] rounded-full border-[6px] border-[#7a1020]" />
          <svg viewBox="0 0 465 492" className="bp-loader__butcher relative z-[1] h-[230px] w-[217px] overflow-visible">
            <image href="/brand/bp-butcher-body.webp" width="465" height="492" />
            <g className="bp-arm">
              <g transform="translate(30 248) rotate(-24)">
                <g className="bp-arm__reach">
                  <g className="bp-arm__flesh">
                    <path d="M50 146 L86 146 L96 244 L42 244 Z" fill="#f3e3cb" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
                    <path d="M80 160 l5 50 M86 172 l4 44 M74 200 l3 30" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M34 236 Q68 226 104 236 L108 266 Q70 256 30 266 Z" fill={PAPER} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
                    <path d="M44 246 q24 -6 50 0 M40 256 q30 -6 62 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
                    <rect x="57" y="108" width="18" height="56" rx="7" fill={INK} />
                    <circle cx="66" cy="157" r="2.6" fill={PAPER} />
                  </g>
                  <rect x="-2" y="-2" width="83" height="116" rx="3" fill={INK} />
                  <line className="bp-arm__edge" x1="-2" y1="-2" x2="-2" y2="114" stroke="none" />
                  <path d="M2 3 H37 V110 H2 Z" fill={PAPER} />
                  <path d="M7 6 V108 M12 6 V104 M17 6 V98 M22 6 V88 M27 6 V74 M32 6 V56" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
                  <path d="M41 4 H75 V112" fill="none" stroke={PAPER} strokeWidth="1.8" />
                  <circle cx="60" cy="17" r="5.5" fill={PAPER} />
                  <g className="bp-arm__flesh">
                    <rect x="49" y="114" width="36" height="36" rx="12" fill="#f3e3cb" stroke={INK} strokeWidth="3" />
                    <path d="M51 123 h18 M51 132 h18 M51 141 h18" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M76 115 q10 8 2 22" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
                  </g>
                </g>
              </g>
            </g>
          </svg>
        </div>
      </div>
      {/* the strike: a slash across the screen and a flash */}
      <svg className="bp-slash pointer-events-none absolute inset-0 size-full">
        <path d="M0 0" pathLength={1} fill="none" stroke="#111111" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M0 0" pathLength={1} fill="none" stroke="#7a1020" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="bp-flash pointer-events-none absolute inset-0 bg-white" />
    </div>
  );
}
